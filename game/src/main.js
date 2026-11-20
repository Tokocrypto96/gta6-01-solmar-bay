// Solmar Bay — bootstrap and game loop (v2).
//
// Builds the world at golden hour — a gradient sunset sky, warm fog and
// low amber sun — wires every system together, and runs the loop: input,
// the steal-a-car interaction, combat, traffic, crowd, police, missions,
// shells, the camera, and the full HUD (now with the mission tracker,
// rank bar, district readout and side panel). The screens — title, pause,
// busted, wasted — and the autosave live here too.
import * as THREE from 'three';
import { AUTOSAVE_SECONDS, CAR_NAMES, CITY_HALF, DEFAULT_SEED, START_CASH, rankFor } from './config.js';
import { mulberry32, pick } from './rng.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { City } from './city.js';
import { Car, Traffic, drivePlayerCar, makeCarMesh } from './vehicles.js';
import { Pedestrians } from './pedestrians.js';
import { Player } from './player.js';
import { Police } from './police.js';
import { Missions, Shells, shopPrompt, useShop } from './missions.js';
import { Hud, districtFor } from './hud.js';
import { clearSave, hasSave, loadSave, saveGame } from './save.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') ?? DEFAULT_SEED) || DEFAULT_SEED;
const shotName = params.get('shot');
const rng = mulberry32(seed);

/* ---------------- Renderer, scene, golden-hour light ---------------- */

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
document.getElementById('app').appendChild(renderer.domElement);
renderer.domElement.classList.add('webgl');

const scene = new THREE.Scene();
// The sky is a painted gradient: dusk blue up top melting through gold
// to a hot horizon — the Vice City hour, all day long.
{
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#3f6ea6');
  grad.addColorStop(0.42, '#8fb6d9');
  grad.addColorStop(0.68, '#f7c873');
  grad.addColorStop(0.85, '#ff9d5c');
  grad.addColorStop(1, '#ff7e47');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 512);
  const sky = new THREE.CanvasTexture(c);
  sky.colorSpace = THREE.SRGBColorSpace;
  scene.background = sky;
}
scene.fog = new THREE.Fog(0xf2c49b, 250, 780);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1200);

const hemi = new THREE.HemisphereLight(0xffd9b0, 0x7a5a48, 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffb36b, 2.0);
sun.position.set(150, 130, 110);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -260;
sun.shadow.camera.right = 260;
sun.shadow.camera.top = 260;
sun.shadow.camera.bottom = -260;
sun.shadow.camera.far = 700;
sun.shadow.bias = -0.0004;
scene.add(sun);
scene.add(sun.target);

/* ---------------- World ---------------- */

const G = {
  seed,
  rng,
  scene,
  camera,
  renderer,
  totalEarned: 0,
  state: 'title', // title | play | paused | busted | wasted
  camYaw: Math.PI * 0.75,
  camPitch: 0.32,
  camDist: 10,
  lastDrag: 0,
  autosaveTimer: 0,
  shotMode: !!shotName,
  frozen: false,
};
G.city = new City(scene, rng);
G.traffic = new Traffic(scene, G.city, rng);
G.peds = new Pedestrians(scene, G.city, rng, 30);
G.police = new Police(scene, G.city, rng);
G.player = new Player(scene);
G.shells = new Shells(scene, G.city, rng);
G.hud = new Hud();
G.input = new Input(renderer.domElement);
G.audio = new AudioEngine();
G.parkedCars = [];
G.tracers = [];

// Parked cars along the kerbs, in mixed styles, waiting to be stolen.
const PARKED_STYLES = ['sedan', 'hatch', 'pickup', 'van', 'sport', 'sedan'];
for (let i = 0; i < 11; i += 1) {
  const road = G.city.roads[Math.floor(rng() * G.city.roads.length)];
  const along = (rng() * 2 - 1) * (CITY_HALF - 20);
  const alongRoad = rng() < 0.5;
  const x = alongRoad ? along : road + (rng() < 0.5 ? 5.4 : -5.4);
  const z = alongRoad ? road + (rng() < 0.5 ? 5.4 : -5.4) : along;
  const heading = alongRoad ? (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rng() < 0.5 ? 0 : Math.PI);
  const mesh = makeCarMesh(pick(rng, [0xc0392b, 0x2471a3, 0xf1c40f, 0x2e4053, 0x17a589, 0xd35400]), { style: pick(rng, PARKED_STYLES) });
  const car = new Car(mesh, { x, z, heading, name: pick(rng, CAR_NAMES), ai: null });
  scene.add(mesh);
  G.parkedCars.push(car);
}

// The missions' view of the world: callbacks into the HUD and the wallet.
G.missions = new Missions({
  city: G.city,
  player: G.player,
  police: G.police,
  peds: G.peds,
  audio: G.audio,
  toast: (t, s) => G.hud.toast(t, s),
  feed: (t) => G.hud.feed(t),
  addCash: (n) => addCash(n),
});
function addCash(n) {
  G.player.cash += n;
  G.totalEarned += n;
}
G.toast = (t, s) => G.hud.toast(t, s);
G.feed = (t) => G.hud.feed(t);
G.addCash = addCash;

/* ---------------- Screens ---------------- */

const titleScreen = document.getElementById('titleScreen');
const pausedScreen = document.getElementById('pausedScreen');
const endScreen = document.getElementById('endScreen');
const btnContinue = document.getElementById('btnContinue');
const btnNew = document.getElementById('btnNew');
const btnHow = document.getElementById('btnHow');
const howKeys = document.getElementById('howKeys');

function showScreen(which) {
  titleScreen.classList.toggle('hidden', which !== 'title');
  pausedScreen.classList.toggle('hidden', which !== 'paused');
  endScreen.classList.toggle('hidden', which !== 'busted' && which !== 'wasted');
  if (which === 'play') G.hud.show();
  else if (which === 'title') G.hud.hide();
}

function applySave(data) {
  G.player.cash = data.cash;
  G.player.health = data.health;
  G.player.pistol = data.pistol;
  G.missions.index = data.missionIndex;
  G.missions.done = data.missionDone;
  // Resume the mission where it stopped, not from its first step: the save
  // carries the step, the active flag and the countdown, and beginStep
  // re-spawns whatever the step needs (a fare customer, the heat).
  G.missions.stepIndex = data.missionStep ?? 0;
  G.missions.active = !!data.missionActive;
  G.missions.timer = data.missionTimer ?? (G.missions.def?.timer ?? 0);
  if (G.missions.active) G.missions.beginStep();
  G.shells.setCollected(data.shells);
  G.totalEarned = data.totalEarned ?? 0;
  G.player.pos.set(data.player.x, 0, data.player.z);
  G.player.mesh.position.copy(G.player.pos);
}

function resetNewGame() {
  clearSave();
  G.player.cash = START_CASH;
  G.player.health = G.player.maxHealth;
  G.player.pistol = false;
  G.player.pos.set(-160, 0, 160);
  G.player.heading = Math.PI * 0.75;
  G.player.mesh.position.copy(G.player.pos);
  G.missions.index = 0;
  G.missions.done = false;
  G.missions.active = false;
  G.missions.stepIndex = 0;
  G.missions.timer = 0;
  G.police.clear();
  G.totalEarned = 0;
  for (const item of G.shells.items) {
    item.taken = false;
    item.mesh.visible = true;
  }
  G.shells.collected = 0;
}

function startPlaying() {
  G.audio.start();
  G.state = 'play';
  showScreen('play');
  G.hud.toast('SOLMAR BAY', 'Press Enter to start your first job for Rico.');
}

/** One blip for every menu button (audio starts on the gesture, so it plays). */
function menuClick() {
  G.audio.start();
  G.audio.click();
}

/** Pause: shared by the P key and the tab-hidden auto-pause. */
function pauseGame() {
  if (G.state !== 'play') return;
  G.state = 'paused';
  G.audio.setEngine(false, 0); // never leave the engine humming in the menu
  const rank = rankFor(G.totalEarned);
  document.getElementById('pauseStats').textContent =
    `Cash $${Math.floor(G.player.cash)} · Rank ${rank.level} ${rank.name} · Jobs done ${G.missions.index}/6 · Shells ${G.shells.collected}/20 · Wanted ${G.police.stars}★`;
  showScreen('paused');
}

/** The title screen's save line: what CONTINUE would load, if anything. */
function updateSaveInfo() {
  const el = document.getElementById('saveInfo');
  const data = loadSave();
  el.textContent = data
    ? `Saved game: $${Math.floor(data.cash)} · Job ${Math.min(data.missionIndex + 1, 6)}/6 · ${data.shells}/20 shells`
    : 'No saved game yet — start a new one.';
}
updateSaveInfo();

// Enter on the title screen starts (Continue when a save exists).
addEventListener('keydown', (e) => {
  if (G.state === 'title' && e.code === 'Enter') {
    if (!btnContinue.disabled) btnContinue.click();
    else btnNew.click();
  }
});

// Alt-tabbing away pauses instead of letting the wanted level run.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseGame();
});

btnContinue.disabled = !hasSave();
btnContinue.addEventListener('click', () => {
  menuClick();
  const data = loadSave();
  if (data) applySave(data);
  startPlaying();
});
btnNew.addEventListener('click', () => {
  menuClick();
  resetNewGame();
  startPlaying();
});
btnHow.addEventListener('click', () => {
  menuClick();
  howKeys.style.display = howKeys.style.display === 'none' ? 'block' : 'none';
});
document.getElementById('btnResume').addEventListener('click', () => {
  menuClick();
  G.state = 'play';
  showScreen('play');
});
document.getElementById('btnRestartMission').addEventListener('click', () => {
  menuClick();
  if (G.missions.def) {
    G.missions.fail('Mission restarted.');
    G.missions.start();
  }
  G.state = 'play';
  showScreen('play');
});
document.getElementById('btnSaveQuit').addEventListener('click', () => {
  menuClick();
  saveGame(G);
  G.state = 'title';
  btnContinue.disabled = !hasSave();
  updateSaveInfo();
  showScreen('title');
});
document.getElementById('btnRespawn').addEventListener('click', () => {
  menuClick();
  const place = G.city.places[G.state === 'busted' ? 'policeHQ' : 'hospital'];
  G.player.pos.set(place.x, 0, place.z);
  G.player.health = G.player.maxHealth;
  G.player.mesh.position.copy(G.player.pos);
  G.state = 'play';
  showScreen('play');
  G.hud.toast('BACK ON THE STREETS', 'Rico is still waiting. Press Enter for the next job.');
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ---------------- Interaction: cars, shops, combat ---------------- */

function nearestStealableCar(maxDist = 4) {
  const p = G.player;
  let best = null;
  let bestD = maxDist;
  const consider = (car) => {
    const d = Math.hypot(car.x - p.x, car.z - p.z);
    if (d < bestD) { best = car; bestD = d; }
  };
  for (const car of G.traffic.cars) consider(car);
  for (const car of G.parkedCars) consider(car);
  return best;
}

function enterCar(car) {
  const trafficIndex = G.traffic.cars.indexOf(car);
  if (trafficIndex >= 0) G.traffic.cars.splice(trafficIndex, 1);
  const parkedIndex = G.parkedCars.indexOf(car);
  if (parkedIndex >= 0) G.parkedCars.splice(parkedIndex, 1);
  car.ai = null;
  G.player.inCar = car;
  G.player.mesh.visible = false;
  G.camDist = 13;
  G.audio.door();
  G.police.addHeat(25);
  G.peds.scare(G.player.x, G.player.z, 18);
  G.hud.toast('CAR STOLEN', `${car.name} — the PD noticed. Drive!`);
  G.hud.feed('You stole a car (+1 wanted heat)');
}

function exitCar() {
  const car = G.player.inCar;
  if (!car) return;
  car.speed = 0;
  const side = car.heading + Math.PI / 2;
  G.player.pos.set(car.x + Math.sin(side) * 2.6, 0, car.z + Math.cos(side) * 2.6);
  G.player.heading = car.heading;
  G.player.mesh.position.copy(G.player.pos);
  G.player.mesh.visible = true;
  G.player.inCar = null;
  G.parkedCars.push(car);
  G.camDist = 10;
  G.audio.door();
}

function fireTracer(from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.9 }));
  scene.add(line);
  G.tracers.push({ line, life: 0.09 });
}

/* ---------------- Busted / wasted ---------------- */

function onBusted() {
  if (G.state !== 'play') return;
  const lost = Math.floor(G.player.cash * 0.25);
  G.player.cash -= lost;
  if (G.missions.active) G.missions.fail('Busted by the Solmar PD.');
  if (G.player.inCar) {
    const car = G.player.inCar;
    G.player.inCar = null;
    G.player.mesh.visible = true;
    G.parkedCars.push(car);
  }
  G.police.clear();
  G.audio.busted();
  G.state = 'busted';
  document.getElementById('endTitle').textContent = 'BUSTED';
  document.getElementById('endText').textContent = `The Solmar PD caught you. They took $${lost} as a "fine" and let you walk. Rico is not impressed.`;
  showScreen('busted');
  saveGame(G);
}

function onWasted() {
  if (G.state !== 'play') return;
  const lost = Math.floor(G.player.cash * 0.1);
  G.player.cash -= lost;
  if (G.missions.active) G.missions.fail('You got wasted.');
  if (G.player.inCar) {
    const car = G.player.inCar;
    G.player.inCar = null;
    G.player.mesh.visible = true;
    G.parkedCars.push(car);
  }
  G.police.clear();
  G.audio.busted();
  G.state = 'wasted';
  document.getElementById('endTitle').textContent = 'WASTED';
  document.getElementById('endText').textContent = `You woke up at Solmar General, $${lost} lighter. The Bay does not wait for anyone.`;
  showScreen('wasted');
  saveGame(G);
}

/* ---------------- Camera ---------------- */

function updateCamera(dt) {
  const input = G.input;
  const { dx, dy } = input.consumeMouse();
  if (dx !== 0 || dy !== 0) {
    G.camYaw += dx * 0.0042;
    G.camPitch = Math.max(0.06, Math.min(1.05, G.camPitch - dy * 0.0038));
    G.lastDrag = performance.now();
  }
  const target = G.player.inCar
    ? new THREE.Vector3(G.player.inCar.x, 1.8, G.player.inCar.z)
    : new THREE.Vector3(G.player.x, 1.7, G.player.z);
  // Driving with an idle mouse: the camera settles in behind the car.
  if (G.player.inCar && performance.now() - G.lastDrag > 1600) {
    let err = G.player.inCar.heading - G.camYaw;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    G.camYaw += err * Math.min(1, dt * 1.4);
  }
  const dist = G.camDist;
  const cx = target.x - Math.sin(G.camYaw) * Math.cos(G.camPitch) * dist;
  const cz = target.z - Math.cos(G.camYaw) * Math.cos(G.camPitch) * dist;
  const cy = target.y + Math.sin(G.camPitch) * dist + 1.2;
  const desired = new THREE.Vector3(cx, Math.max(1.2, cy), cz);
  camera.position.lerp(desired, Math.min(1, dt * 7));
  camera.lookAt(target.x + Math.sin(G.camYaw) * 4, target.y + 0.4, target.z + Math.cos(G.camYaw) * 4);
}

/* ---------------- The HUD's per-frame refresh ---------------- */

function refreshHud(dt) {
  const obj = G.missions.objective();
  const px = G.player.inCar ? G.player.inCar.x : G.player.x;
  const pz = G.player.inCar ? G.player.inCar.z : G.player.z;
  const dist = obj.target ? Math.hypot(px - obj.target.x, pz - obj.target.z) : null;
  G.hud.setObjective(obj.title, obj.text, dist);
  G.hud.setCash(G.player.cash, G.missions.done ? 'KING OF SOLMAR BAY' : `Job ${Math.min(G.missions.index + 1, 6)}/6 · Shells ${G.shells.collected}/20`);
  G.hud.setHealth(G.player.health, G.player.maxHealth);
  G.hud.setWanted(G.police.stars);
  G.hud.setDriving(G.player.inCar);
  G.hud.setArmed(G.player.pistol && !G.player.inCar);
  // v2 panels: tracker, rank, district + radio, car/weapon card.
  const def = G.missions.def;
  G.hud.setTracker(def && !G.missions.done ? def.title : '', def ? def.reward : 0, G.missions.stepStates());
  G.hud.setRank(rankFor(G.totalEarned));
  if (G.player.inCar) {
    const car = G.player.inCar;
    G.hud.setArea(districtFor(px, pz), `♪ ${G.hud.stationFor(car.name)}`);
    G.hud.setSidePanel('Vehicle', `${car.name} · ${car.speed < -0.5 ? 'Reverse' : 'Drive'} · top ${Math.round(car.maxSpeed * 3.6)} km/h`);
  } else {
    G.hud.setArea(districtFor(px, pz), '');
    G.hud.setSidePanel('Weapon', G.player.pistol ? 'Pistol · unlimited ammo' : 'Fists · a pistol costs $400 at Ironworks');
  }
  const prompt = shopPrompt(G);
  const nearCar = !G.player.inCar && nearestStealableCar(4);
  G.hud.setHint(prompt ?? (nearCar ? `Press E to steal the ${nearCar.name}` : (G.player.inCar ? '' : 'WASD move · E steal car · Enter start job')));
  G.hud.update(dt);
  G.hud.drawMinimap(G);
}

/* ---------------- Main loop ---------------- */

const clock = new THREE.Clock();
let firstFrame = true;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  const input = G.input;

  if (G.state === 'play' && !G.frozen) {
    if (input.wasPressed('KeyP') || input.wasPressed('Escape')) pauseGame();
    if (input.wasPressed('KeyM')) G.audio.setMuted(!G.audio.muted);
    if (input.wasPressed('KeyH')) G.hud.toggleHidden();
    if (input.wasPressed('Enter') && !G.missions.active && !G.missions.done) G.missions.start();
    if (input.wasPressed('KeyR') && G.missions.active) {
      G.missions.fail('Mission restarted.');
      G.missions.start();
    }

    // Enter / exit cars, and the shops on the E key.
    if (input.wasPressed('KeyE')) {
      if (G.player.inCar) exitCar();
      else if (!useShop(G)) {
        const car = nearestStealableCar();
        if (car) enterCar(car);
      }
    }

    // Combat on foot: the punch, and the pistol once bought.
    const clicked = input.consumeClick();
    if (!G.player.inCar) {
      if (input.wasPressed('KeyF')) {
        const victim = G.player.tryPunch(G.peds.peds, G.police.cops);
        G.audio.punch();
        if (victim) {
          const isCop = victim.isCop;
          G.police.addHeat(isCop ? 30 : 15);
          G.peds.scare(G.player.x, G.player.z, 22);
          G.hud.feed(isCop ? 'You punched a cop! (+heat)' : 'You punched a pedestrian! (+heat)');
        }
      }
      if (clicked && G.player.pistol) {
        G.audio.shoot();
        const hit = G.player.tryShoot(camera, G.peds.peds, G.police.cops, [...G.traffic.cars, ...G.parkedCars, ...G.police.cars], scene);
        const from = new THREE.Vector3(G.player.x, 1.5, G.player.z);
        if (hit && hit.kind !== 'miss') {
          fireTracer(from, hit.point.clone());
          if (hit.kind === 'ped') {
            hit.ref.knockDown(3);
            G.police.addHeat(30);
            G.peds.scare(G.player.x, G.player.z, 30);
          } else if (hit.kind === 'cop') {
            hit.ref.knockDown(3);
            G.police.addHeat(40);
          } else if (hit.kind === 'car') {
            G.police.addHeat(10);
          }
        } else {
          const fwd = new THREE.Vector3();
          camera.getWorldDirection(fwd);
          fireTracer(from, from.clone().add(fwd.multiplyScalar(60)));
          G.police.addHeat(8);
        }
      }
    }

    // Movement: driving, or on foot.
    if (G.player.inCar) {
      drivePlayerCar(G.player.inCar, input, dt, G.city, [...G.traffic.cars, ...G.parkedCars, ...G.police.cars], G.audio);
      G.audio.setEngine(true, Math.abs(G.player.inCar.speed) / G.player.inCar.maxSpeed);
      // Running a pedestrian down is loud, messy and very illegal.
      for (const ped of G.peds.peds) {
        if (ped.down) continue;
        const d = Math.hypot(ped.x - G.player.inCar.x, ped.z - G.player.inCar.z);
        if (d < 2.1 && Math.abs(G.player.inCar.speed) > 3) {
          ped.knockDown(3);
          G.police.addHeat(ped.isCop ? 40 : 25);
          G.peds.scare(ped.x, ped.z, 26);
          G.audio.crash();
          G.hud.feed(ped.isCop ? 'You ran over a cop!' : 'You ran over a pedestrian!');
        }
      }
    } else {
      G.player.updateOnFoot(input, dt, G.city, G.camYaw, [...G.traffic.cars, ...G.parkedCars, ...G.police.cars]);
      G.audio.setEngine(false, 0);
    }

    // The world's own systems.
    G.traffic.update(dt, G.player.inCar, G.peds.peds);
    const dangerCar = G.player.inCar && Math.abs(G.player.inCar.speed) > 5
      ? { x: G.player.inCar.x, z: G.player.inCar.z }
      : null;
    G.peds.update(dt, G.player.pos, dangerCar);
    G.police.update(dt, G.player, G.player.inCar, G.traffic.cars, G.audio, onBusted, onWasted);
    G.police.placeForceNear(G.player.x, G.player.z);
    G.missions.update(dt, G);
    G.shells.update(dt, G.player.inCar ? G.player.inCar.mesh.position : G.player.pos, (reward, count) => {
      addCash(reward);
      G.audio.pickup();
      G.hud.feed(`Golden shell ${count}/20 — +$${reward}`);
    });

    if (G.player.hurtTimer > 0.3) G.hud.flashDamage();
    refreshHud(dt);

    G.autosaveTimer += dt;
    if (G.autosaveTimer > AUTOSAVE_SECONDS) {
      G.autosaveTimer = 0;
      saveGame(G);
    }
  }

  // Tracers burn out fast.
  for (let i = G.tracers.length - 1; i >= 0; i -= 1) {
    const t = G.tracers[i];
    t.life -= dt;
    t.line.material.opacity = Math.max(0, t.life / 0.09);
    if (t.life <= 0) {
      scene.remove(t.line);
      G.tracers.splice(i, 1);
    }
  }

  // The sea breathes; the yacht rides at anchor.
  if (G.city.ocean) G.city.ocean.position.y = -0.15 + Math.sin(performance.now() / 1400) * 0.08;
  if (G.city.yacht) G.city.yacht.position.y = Math.sin(performance.now() / 1200) * 0.15;

  updateCamera(dt);
  renderer.render(scene, camera);
  if (firstFrame) {
    firstFrame = false;
    if (G.shotMode) document.title = 'SOLMAR-READY';
  }
  input.endFrame();
}

/* ---------------- Shot mode ---------------- */

if (shotName) {
  G.state = 'play';
  showScreen('play');
  stageShot(shotName, G);
  G.frozen = true;
  document.title = 'SOLMAR-STAGED';
}

animate();
