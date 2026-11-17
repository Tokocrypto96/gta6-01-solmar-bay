// Solmar Bay — screenshot staging (?shot=cover|street|chase|mission). Each scene puts
// the real game into a fixed, seeded state — real cars, real police, real HUD —
// then freezes the simulation so the frame the browser captures is exactly this
// moment. Nothing here is faked: the render pipeline, the HUD and the minimap are
// the same ones the player sees.
import * as THREE from 'three';
import { BEACH_Z } from './config.js';

/** Snap the camera to the staged pose (no lerp drift after the freeze). */
function snapCamera(G, targetX, targetY, targetZ) {
  const dist = G.camDist;
  const cx = targetX - Math.sin(G.camYaw) * Math.cos(G.camPitch) * dist;
  const cz = targetZ - Math.cos(G.camYaw) * Math.cos(G.camPitch) * dist;
  const cy = targetY + Math.sin(G.camPitch) * dist + 1.2;
  G.camera.position.set(cx, Math.max(1.2, cy), cz);
  G.camera.lookAt(
    targetX + Math.sin(G.camYaw) * 4,
    targetY + 0.4,
    targetZ + Math.cos(G.camYaw) * 4,
  );
}

/** Put the first N traffic cars on the given road, spread ahead of (x, z). */
function lineUpTraffic(G, roadZ, fromX, count, heading) {
  for (let i = 0; i < Math.min(count, G.traffic.cars.length); i += 1) {
    const car = G.traffic.cars[i];
    car.x = fromX + 26 + i * 24;
    car.z = roadZ + (i % 2 === 0 ? 3.5 : -3.5);
    car.heading = heading;
    car.speed = 9 + i;
    car.mesh.rotation.y = heading - Math.PI / 2;
    car.leg = { axis: 'x', dir: 1, road: roadZ, along: car.x };
  }
}

/** Place police cruisers in a chase formation behind the player. */
function placeChase(G, playerX, playerZ, count) {
  const heading = Math.PI / 2;
  for (let i = 0; i < count; i += 1) {
    const car = G.police.cars[i];
    if (!car) break;
    car.x = playerX - 16 - i * 13;
    car.z = playerZ + (i % 2 === 0 ? 3.5 : -3.5);
    car.heading = heading;
    car.speed = 16;
    car.mesh.rotation.y = heading - Math.PI / 2;
  }
}

/** Put one police cruiser ahead in the oncoming lane, driving at the player. */
function placeInterceptor(G, index, x, z, heading) {
  const car = G.police.cars[index];
  if (!car) return;
  car.x = x;
  car.z = z;
  car.heading = heading;
  car.speed = 14;
  car.mesh.rotation.y = heading - Math.PI / 2;
}
function paintHud(G) {
  const obj = G.missions.objective();
  const px = G.player.inCar ? G.player.inCar.x : G.player.x;
  const pz = G.player.inCar ? G.player.inCar.z : G.player.z;
  const dist = obj.target ? Math.hypot(px - obj.target.x, pz - obj.target.z) : null;
  G.hud.setObjective(obj.title, obj.text, dist);
  G.hud.setCash(G.player.cash, `Job ${Math.min(G.missions.index + 1, 6)}/6 · Shells ${G.shells.collected}/20`);
  G.hud.setHealth(G.player.health, G.player.maxHealth);
  G.hud.setWanted(G.police.stars);
  G.hud.setDriving(G.player.inCar);
  G.hud.setArmed(G.player.pistol && !G.player.inCar);
  G.hud.setHint('');
  G.hud.drawMinimap(G);
}

/** Put the player in a car at (x, z) heading east, using a parked car. */
function stageInCar(G, x, z, heading, speed) {
  const car = G.parkedCars[0] || G.traffic.cars[0];
  const parkedIndex = G.parkedCars.indexOf(car);
  if (parkedIndex >= 0) G.parkedCars.splice(parkedIndex, 1);
  const trafficIndex = G.traffic.cars.indexOf(car);
  if (trafficIndex >= 0) G.traffic.cars.splice(trafficIndex, 1);
  car.x = x;
  car.z = z;
  car.heading = heading;
  car.speed = speed;
  car.mesh.rotation.y = heading - Math.PI / 2;
  car.mesh.position.set(x, 0, z);
  G.player.inCar = car;
  G.player.mesh.visible = false;
  G.camDist = 13;
  return car;
}

/** Put the player on foot at (x, z), facing `heading`. */
function stageOnFoot(G, x, z, heading) {
  G.player.pos.set(x, 0, z);
  G.player.heading = heading;
  G.player.mesh.position.copy(G.player.pos);
  G.player.mesh.visible = true;
  G.camDist = 10;
}

export function stageShot(name, G) {
  G.player.health = 100;
  G.player.pistol = true;
  G.police.clear();

  if (name === 'cover') {
    // Downtown chase: Jay in a stolen Comet, two cruisers on his bumper, traffic
    // ahead, a pizza delivery on the HUD — every system in one frame.
    G.player.cash = 1250;
    stageInCar(G, -40, 3.5, Math.PI / 2, 15); // right-hand lane, not the centre line
    G.police.addHeat(60); // 2 stars
    placeChase(G, -40, 3.5, 1);
    placeInterceptor(G, 1, -6, -3.5, -Math.PI / 2); // cruiser cutting in ahead
    lineUpTraffic(G, 0, -40, 4, Math.PI / 2);
    G.missions.index = 1;
    G.missions.active = true;
    G.missions.stepIndex = 1;
    G.missions.timer = 118;
    G.camYaw = Math.PI / 2 + 0.35;
    G.camPitch = 0.3;
    snapCamera(G, -40, 1.8, 3.5);
  } else if (name === 'chase') {
    // Three stars on the coast road: three cruisers closing in, Jay flat out.
    G.player.cash = 890;
    stageInCar(G, -20, -54.5, Math.PI / 2, 21); // right-hand lane, not the centre line
    G.police.addHeat(110); // 3 stars
    placeChase(G, -20, -54.5, 2);
    placeInterceptor(G, 2, 18, -61.5, -Math.PI / 2); // cruiser cutting in ahead, oncoming lane
    lineUpTraffic(G, -58, -20, 3, Math.PI / 2);
    G.missions.index = 3;
    G.missions.active = true;
    G.missions.stepIndex = 1;
    G.camYaw = Math.PI / 2 + 0.22;
    G.camPitch = 0.24;
    snapCamera(G, -20, 1.8, -54.5);
  } else if (name === 'mission') {
    // The bank job: Jay on foot on the road outside the bank, beacon ahead,
    // PD rolling in. Staged on the road itself (z = -58), not inside the
    // block: the old spot (bank.x - 6, bank.z + 10) is inside a building
    // footprint now that buildings sit in the blocks, and the camera ended
    // up inside a facade — a flat grey frame.
    G.player.cash = 2150;
    const bank = G.city.places.bank;
    stageOnFoot(G, bank.x, -58, Math.PI);
    G.police.addHeat(110); // 3 stars
    placeChase(G, bank.x, -58, 2);
    G.missions.index = 4;
    G.missions.active = true;
    G.missions.stepIndex = 1;
    G.missions.holdTimer = 4.2;
    G.camYaw = Math.PI + 0.3;
    G.camPitch = 0.34;
    snapCamera(G, bank.x, 1.7, -58);
  } else {
    // 'street': golden hour on the boardwalk — Jay on foot, palms, beach, traffic.
    G.player.cash = 340;
    stageOnFoot(G, 6, BEACH_Z - 8, Math.PI);
    // A few pedestrians strolling the boardwalk beside him.
    for (let i = 0; i < 4 && i < G.peds.peds.length; i += 1) {
      const ped = G.peds.peds[i];
      ped.mesh.position.set(-14 + i * 9, 0, BEACH_Z - 6 + (i % 2) * 3);
      ped.heading = Math.PI / 2 + (i % 2 ? 0.4 : -0.4);
      ped.mesh.rotation.y = ped.heading;
    }
    // Two jaywalkers crossing the coast road in front of the camera, so the
    // street shot shows pedestrians in the road as well as on the sidewalk.
    for (let i = 0; i < 2 && 4 + i < G.peds.peds.length; i += 1) {
      const ped = G.peds.peds[4 + i];
      ped.mesh.position.set(-6 + i * 12, 0, 170 + (i % 2) * 4);
      ped.heading = i % 2 ? -Math.PI / 2 : Math.PI / 2;
      ped.mesh.rotation.y = ped.heading;
    }
    lineUpTraffic(G, 174, 6, 3, Math.PI / 2);
    G.missions.index = 0;
    G.missions.active = false;
    // Closer, steeper camera than the default on-foot framing: at camDist 10
    // / pitch 0.3 Jay was cut off at the bottom edge of the frame and only
    // the top of his head showed.
    G.camDist = 8.5;
    G.camPitch = 0.42;
    G.camYaw = Math.PI - 0.25;
    snapCamera(G, 6, 1.7, BEACH_Z - 8);
  }

  // A couple of foot cops on the street for the wanted scenes.
  if (G.police.stars > 0) {
    for (let i = 0; i < Math.min(2, G.police.cops.length); i += 1) {
      const cop = G.police.cops[i];
      cop.mesh.position.set(G.player.x + 14 + i * 6, 0, G.player.z + 8 - i * 10);
    }
  }
  paintHud(G);
}
