// Solmar Bay — the story (v2).
//
// Six jobs for Rico Vasquez carry Jay from dock rat to king of the Bay:
// steal a car, rush pizzas, run a taxi, drive a getaway, hold a bank,
// survive the manhunt. Around the story sit the free-roam loops — taxi
// fares and twenty golden shells. The mission definitions, step logic,
// shops and shells below are the original design; v2 adds one helper,
// stepStates(), so the HUD's mission tracker can draw the whole job —
// steps done, step current, steps to come — instead of one line of text.
import * as THREE from 'three';
import { BRIBE_PER_STAR, FARE_PAY_MAX, FARE_PAY_MIN, HEAL_PRICE, PISTOL_PRICE, REPAIR_PRICE, SHELL_COUNT, SHELL_REWARD } from './config.js';
import { pick, randRange } from './rng.js';

/** The six story missions, in the order Rico hands them out. */
export const MISSION_DEFS = [
  {
    id: 'm1-first-wheels',
    title: '1 · First Wheels',
    giver: 'Rico Vasquez',
    brief: 'Rico needs a wheelman. Steal any car on the street and bring it to the paint shop so his crew can respray it.',
    reward: 150,
    steps: [
      { type: 'enterCar', text: 'Steal a car — walk up to one and press E' },
      { type: 'goto', place: 'paintShop', radius: 9, text: 'Drive the car to the Paint Shop' },
    ],
  },
  {
    id: 'm2-pizza-rush',
    title: '2 · Pizza Rush',
    giver: 'Rico Vasquez',
    brief: 'Rico owns the pizzaria. Three hungry customers, one very late driver: you. Deliver all three pizzas before the timer runs out.',
    reward: 220,
    steps: [
      { type: 'goto', place: 'pizzaria', radius: 9, text: 'Pick up the pizzas at the Pizzaria' },
      { type: 'deliver', place: 'hospital', radius: 9, text: 'Deliver pizza 1/3 — Hospital' },
      { type: 'deliver', place: 'policeHQ', radius: 9, text: 'Deliver pizza 2/3 — Police HQ (careful!)' },
      { type: 'deliver', place: 'beach', radius: 9, text: 'Deliver pizza 3/3 — the Beach' },
    ],
    timer: 150,
  },
  {
    id: 'm3-taxi-nights',
    title: '3 · Taxi Nights',
    giver: 'Rico Vasquez',
    brief: 'The crew needs clean cash. Run the taxi: pick up three fares waiting at the kerb and drop each where they point.',
    reward: 260,
    steps: [
      { type: 'fare', count: 3, text: 'Pick up a fare — look for the yellow marker' },
    ],
  },
  {
    id: 'm4-getaway',
    title: '4 · Getaway Driver',
    giver: 'Rico Vasquez',
    brief: 'The crew hit a warehouse at the docks. Pick them up, shake the Solmar PD, and get them to the safehouse in one piece.',
    reward: 400,
    steps: [
      { type: 'goto', place: 'docks', radius: 9, text: 'Pick up the crew at the Docks' },
      { type: 'loseHeat', text: 'Lose the cops — stay out of sight until the stars fade' },
      { type: 'goto', place: 'safehouse', radius: 9, text: 'Drive the crew to the Safehouse' },
    ],
  },
  {
    id: 'm5-bank-job',
    title: '5 · The Bank Job',
    giver: 'Rico Vasquez',
    brief: 'The big one. Walk into the Solmar Bay Bank, hold the room while the safe opens, then run — the whole city will be looking for you.',
    reward: 800,
    steps: [
      { type: 'goto', place: 'bank', radius: 9, text: 'Reach the Solmar Bay Bank' },
      { type: 'hold', place: 'bank', seconds: 8, radius: 9, text: 'Hold the bank while the safe opens…' },
      { type: 'goto', place: 'safehouse', radius: 9, text: 'Escape to the Safehouse — 3 stars on you!' },
    ],
  },
  {
    id: 'm6-king',
    title: '6 · King of the Bay',
    giver: 'Rico Vasquez',
    brief: 'Last job. The PD wants you bad tonight — survive the heat for 90 seconds, then meet Rico at the yacht on the beach. Do this and the Bay is yours.',
    reward: 1500,
    steps: [
      { type: 'survive', seconds: 90, text: 'Survive the heat — 90 seconds with the PD on you' },
      { type: 'goto', place: 'beach', radius: 10, text: 'Meet Rico at the yacht on the Beach' },
    ],
  },
];

export class Missions {
  constructor(ctx) {
    this.ctx = ctx; // { city, player, police, peds, audio, toast(), feed(), addCash() }
    this.index = 0; // next mission to play
    this.stepIndex = 0;
    this.active = false;
    this.timer = 0; // mission countdown (m2) / survive countdown (m6)
    this.holdTimer = 0;
    this.faresDone = 0;
    this.fareCustomer = null;
    this.fareTarget = null;
    this.done = false; // the whole story is finished
  }

  get def() { return MISSION_DEFS[this.index] ?? null; }
  get step() { return this.def?.steps[this.stepIndex] ?? null; }

  /** Start the next mission (or restart it after a fail). */
  start() {
    const def = this.def;
    if (!def) return;
    this.active = true;
    this.stepIndex = 0;
    this.timer = def.timer ?? 0;
    this.holdTimer = 0;
    this.faresDone = 0;
    this.fareCustomer = null;
    this.fareTarget = null;
    this.ctx.toast(def.title, `${def.giver}: ${def.brief}`);
    this.ctx.audio?.missionStart();
    this.beginStep();
  }

  /** Per-step setup: a fare customer to spawn, heat to raise, a timer to arm. */
  beginStep() {
    const step = this.step;
    if (!step) return;
    if (step.type === 'fare') this.spawnFareCustomer();
    if (step.type === 'survive') {
      this.timer = step.seconds;
      this.ctx.police.addHeat(200); // straight to four stars
      this.ctx.police.placeForceNear(this.ctx.player.x, this.ctx.player.z);
    }
    if (this.def.id === 'm4-getaway' && step.type === 'loseHeat') {
      this.ctx.police.addHeat(60); // two stars the moment the crew climbs in
      this.ctx.police.placeForceNear(this.ctx.player.x, this.ctx.player.z);
    }
    if (this.def.id === 'm5-bank-job' && step.type === 'hold') {
      this.ctx.police.addHeat(130); // three stars as the safe cracks open
      this.ctx.police.placeForceNear(this.ctx.player.x, this.ctx.player.z);
    }
  }

  /** The current objective for the HUD: title, text, target (or null). */
  objective() {
    if (this.done) return { title: 'King of Solmar Bay', text: 'Story complete. Free roam: fares, shells, and the city is yours.', target: null };
    if (!this.active) {
      const def = this.def;
      if (!def) return { title: 'Free roam', text: 'Explore Solmar Bay. Press Enter to start the next job.', target: null };
      return { title: def.title, text: `${def.giver}: ${def.brief} — press Enter to start.`, target: null };
    }
    const step = this.step;
    const placePos = (name) => {
      const p = this.ctx.city.places[name];
      return p ? { x: p.x, z: p.z } : null;
    };
    switch (step.type) {
      case 'enterCar': return { title: this.def.title, text: step.text, target: null };
      case 'goto': case 'deliver': case 'hold':
        return { title: this.def.title, text: step.text, target: placePos(step.place) };
      case 'fare': {
        if (this.fareCustomer) return { title: this.def.title, text: `Fare ${this.faresDone + 1}/3 — pick up the customer`, target: { x: this.fareCustomer.x, z: this.fareCustomer.z } };
        if (this.fareTarget) return { title: this.def.title, text: `Fare ${this.faresDone + 1}/3 — drop them off`, target: this.fareTarget };
        return { title: this.def.title, text: step.text, target: null };
      }
      case 'loseHeat': return { title: this.def.title, text: step.text, target: null };
      case 'survive': return { title: this.def.title, text: `${step.text} — ${Math.ceil(this.timer)}s left`, target: null };
      default: return { title: this.def.title, text: step.text, target: null };
    }
  }

  /**
   * Every step of the current job with its state — 'done', 'current' or
   * 'todo' — for the HUD's mission tracker. Empty when no job is on offer.
   */
  stepStates() {
    const def = this.def;
    if (!def || this.done) return [];
    return def.steps.map((s, i) => ({
      text: s.text,
      state: !this.active ? 'todo' : i < this.stepIndex ? 'done' : i === this.stepIndex ? 'current' : 'todo',
    }));
  }

  /** A fare customer, waiting at a kerb on the nearest road to the player. */
  spawnFareCustomer() {
    const { player, peds, city } = this.ctx;
    const road = city.nearestRoad(player.x);
    const along = player.z + (Math.random() < 0.5 ? -40 : 40);
    const x = road + 9;
    const z = Math.max(-170, Math.min(170, along));
    this.fareCustomer = peds.spawnCustomer(x, z);
  }

  /** A random named place as a fare's drop-off. */
  randomFareTarget() {
    const names = ['hospital', 'beach', 'bank', 'pizzaria', 'safehouse', 'gunShop', 'paintShop'];
    const name = pick(Math.random, names);
    const p = this.ctx.city.places[name];
    return { x: p.x, z: p.z, name };
  }

  /** Step complete: move on, or close the job out. */
  advance() {
    this.stepIndex += 1;
    if (this.stepIndex >= this.def.steps.length) {
      this.completeMission();
      return;
    }
    this.beginStep();
  }

  completeMission() {
    const def = this.def;
    this.active = false;
    this.ctx.addCash(def.reward);
    this.ctx.toast('JOB DONE', `${def.title} — +$${def.reward}`);
    this.ctx.feed(`Job complete: ${def.title} (+$${def.reward})`);
    this.ctx.audio?.cash();
    this.index += 1;
    if (this.index >= MISSION_DEFS.length) {
      this.done = true;
      this.ctx.toast('KING OF SOLMAR BAY', 'The city is yours, Jay. Free roam forever.');
    }
  }

  fail(reason) {
    this.active = false;
    this.holdTimer = 0;
    this.timer = 0;
    this.ctx.toast('JOB FAILED', reason);
    this.ctx.audio?.missionFail();
    this.ctx.police.clear();
    if (this.fareCustomer) {
      this.ctx.peds.removePed(this.fareCustomer);
      this.fareCustomer = null;
    }
    this.fareTarget = null;
  }

  /** Per-frame mission logic. `G` is the shared world state from main.js. */
  update(dt, G) {
    void G;
    if (!this.active) return;
    const { player } = this.ctx;
    const step = this.step;
    if (!step) return;
    // The pizza clock runs across the whole of m2, whatever the step.
    if (this.def.timer && step.type !== 'survive') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.fail('Out of time — the pizzas went cold.');
        return;
      }
    }
    const px = player.inCar ? player.inCar.x : player.x;
    const pz = player.inCar ? player.inCar.z : player.z;
    const distTo = (t) => Math.hypot(px - t.x, pz - t.z);
    switch (step.type) {
      case 'enterCar':
        if (player.inCar) this.advance();
        break;
      case 'goto': case 'deliver': {
        const p = this.ctx.city.places[step.place];
        if (p && distTo(p) < (step.radius ?? 9)) {
          if (step.type === 'deliver') this.ctx.audio?.pickup();
          this.advance();
        }
        break;
      }
      case 'hold': {
        const p = this.ctx.city.places[step.place];
        if (p && distTo(p) < (step.radius ?? 9)) {
          this.holdTimer += dt;
          if (this.holdTimer >= step.seconds) this.advance();
        } else {
          this.holdTimer = Math.max(0, this.holdTimer - dt);
        }
        break;
      }
      case 'survive': {
        this.timer -= dt;
        if (this.timer <= 0) {
          this.ctx.police.clear();
          this.advance();
        }
        break;
      }
      case 'loseHeat': {
        if (this.ctx.police.stars === 0) this.advance();
        break;
      }
      case 'fare': {
        if (this.fareCustomer) {
          if (distTo(this.fareCustomer) < 4) {
            this.ctx.peds.removePed(this.fareCustomer);
            this.fareCustomer = null;
            this.fareTarget = this.randomFareTarget();
            this.ctx.toast('FARE PICKED UP', `Drop them at ${this.fareTarget.name}`);
          }
        } else if (this.fareTarget) {
          if (distTo(this.fareTarget) < 9) {
            const pay = FARE_PAY_MIN + Math.floor(Math.random() * (FARE_PAY_MAX - FARE_PAY_MIN + 1));
            this.ctx.addCash(pay);
            this.ctx.feed(`Fare paid +$${pay}`);
            this.ctx.audio?.cash();
            this.faresDone += 1;
            this.fareTarget = null;
            if (this.faresDone >= (step.count ?? 3)) this.advance();
            else this.spawnFareCustomer();
          }
        }
        break;
      }
      default:
        break;
    }
  }
}

/** What the E key would do at the place the player is standing in, if any. */
export function shopPrompt(G) {
  const { player, city, police } = G;
  const px = player.inCar ? player.inCar.x : player.x;
  const pz = player.inCar ? player.inCar.z : player.z;
  const near = (name, radius = 10) => {
    const p = city.places[name];
    return p && Math.hypot(px - p.x, pz - p.z) < radius;
  };
  if (!player.inCar && near('gunShop')) {
    return player.pistol ? 'Ironworks — you already own a pistol' : `Ironworks Gun Shop — press E to buy a pistol ($${PISTOL_PRICE})`;
  }
  if (!player.inCar && near('fixer')) {
    return police.stars === 0 ? 'The Fixer — no heat on you right now' : `The Fixer — press E to clear ${police.stars} star${police.stars > 1 ? 's' : ''} ($${police.stars * BRIBE_PER_STAR})`;
  }
  if (!player.inCar && near('hospital')) {
    return player.health >= player.maxHealth ? 'Solmar General — you are in full health' : `Solmar General — press E to heal up ($${HEAL_PRICE})`;
  }
  if (player.inCar && near('paintShop')) {
    return `Paint Shop — press E to respray + repair ($${REPAIR_PRICE})`;
  }
  return null;
}

/** Run the shop under the player's feet. True when the E key was consumed. */
export function useShop(G) {
  const { player, city, police, audio } = G;
  const px = player.inCar ? player.inCar.x : player.x;
  const pz = player.inCar ? player.inCar.z : player.z;
  const near = (name, radius = 10) => {
    const p = city.places[name];
    return p && Math.hypot(px - p.x, pz - p.z) < radius;
  };
  if (!player.inCar && near('gunShop') && !player.pistol) {
    if (player.cash < PISTOL_PRICE) { G.toast('NOT ENOUGH CASH', `A pistol costs $${PISTOL_PRICE}.`); return true; }
    player.cash -= PISTOL_PRICE;
    player.pistol = true;
    G.toast('PISTOL BOUGHT', 'Left click to shoot. Try not to need it.');
    audio?.cash();
    return true;
  }
  if (!player.inCar && near('fixer') && police.stars > 0) {
    const cost = police.stars * BRIBE_PER_STAR;
    if (player.cash < cost) { G.toast('NOT ENOUGH CASH', `The Fixer wants $${cost}.`); return true; }
    player.cash -= cost;
    police.clear();
    G.toast('HEAT CLEARED', 'The Fixer made some calls. You are clean.');
    audio?.cash();
    return true;
  }
  if (!player.inCar && near('hospital') && player.health < player.maxHealth) {
    if (player.cash < HEAL_PRICE) { G.toast('NOT ENOUGH CASH', `Treatment costs $${HEAL_PRICE}.`); return true; }
    player.cash -= HEAL_PRICE;
    player.health = player.maxHealth;
    G.toast('PATCHED UP', 'Full health. Try to keep it.');
    audio?.pickup();
    return true;
  }
  if (player.inCar && near('paintShop')) {
    if (player.cash < REPAIR_PRICE) { G.toast('NOT ENOUGH CASH', `A respray costs $${REPAIR_PRICE}.`); return true; }
    player.cash -= REPAIR_PRICE;
    const car = player.inCar;
    const newColor = 0x100000 + Math.floor(Math.random() * 0xefffff);
    car.mesh.userData.bodyMat.color.setHex(newColor);
    G.toast('RESPRAYED', 'Fresh paint. The PD will never recognise it. (They will.)');
    audio?.cash();
    return true;
  }
  return false;
}

/** Golden shells: twenty pickups tucked along sidewalks and the sand. */
export class Shells {
  constructor(scene, city, rng) {
    this.scene = scene;
    this.items = [];
    const mat = new THREE.MeshLambertMaterial({ color: 0xffd21f, emissive: 0xaa8800, emissiveIntensity: 0.8 });
    const geo = new THREE.TorusGeometry(0.55, 0.22, 8, 14);
    for (let i = 0; i < SHELL_COUNT; i += 1) {
      const onBeach = rng() < 0.3;
      let x;
      let z;
      if (onBeach) {
        x = randRange(rng, -160, 160);
        z = randRange(rng, 192, 208);
      } else {
        const road = city.roads[Math.floor(rng() * city.roads.length)];
        const along = randRange(rng, -170, 170);
        if (rng() < 0.5) { x = road + (rng() < 0.5 ? 9.5 : -9.5); z = along; }
        else { x = along; z = road + (rng() < 0.5 ? 9.5 : -9.5); }
      }
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, 0.9, z);
      mesh.rotation.x = Math.PI / 2.4;
      scene.add(mesh);
      this.items.push({ mesh, x, z, taken: false });
    }
    this.collected = 0;
  }

  update(dt, playerPos, onCollect) {
    for (const item of this.items) {
      if (item.taken) continue;
      item.mesh.rotation.z += dt * 1.2;
      item.mesh.position.y = 0.9 + Math.sin(performance.now() / 500 + item.x) * 0.15;
      const dx = playerPos.x - item.x;
      const dz = playerPos.z - item.z;
      if (dx * dx + dz * dz < 7) {
        item.taken = true;
        item.mesh.visible = false;
        this.collected += 1;
        onCollect(SHELL_REWARD, this.collected);
      }
    }
  }

  /** Mark the first `count` shells as already pocketed (save load). */
  setCollected(count) {
    for (let i = 0; i < Math.min(count, this.items.length); i += 1) {
      this.items[i].taken = true;
      this.items[i].mesh.visible = false;
    }
    this.collected = Math.min(count, this.items.length);
  }
}
