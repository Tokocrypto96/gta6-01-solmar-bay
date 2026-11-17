// Solmar Bay — pedestrians: low-poly walkers who stroll the sidewalks, cross at
// corners, and flee when a gun goes off or a car comes at them. Some wait at the
// kerb as taxi customers; a few are off-duty cops who only show up when wanted.
import * as THREE from 'three';
import { CITY_HALF, PED_COLORS, PITCH, WALK_HALF } from './config.js';
import { pick, randRange } from './rng.js';

/** Build one pedestrian mesh (body, head, arms, legs). userData holds the limbs. */
export function makePedMesh(shirtColor, skinColor = 0xc98d64) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const skin = new THREE.MeshLambertMaterial({ color: skinColor });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), shirt);
  body.position.y = 1.12;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skin);
  head.position.y = 1.72;
  head.castShadow = true;
  group.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 6, 0, Math.PI * 2, 0, 1.1), new THREE.MeshLambertMaterial({ color: 0x2d1a0e }));
  hair.position.y = 1.78;
  group.add(hair);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.16), shirt);
  armL.position.set(-0.42, 1.12, 0);
  group.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.42;
  group.add(armR);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.68, 0.2), pants);
  legL.position.set(-0.16, 0.4, 0);
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.16;
  group.add(legR);
  group.userData = { armL, armR, legL, legR, head };
  return group;
}

/** One pedestrian: position, heading, walk state, flee state. */
export class Ped {
  constructor(mesh, x, z) {
    this.mesh = mesh;
    this.mesh.position.set(x, 0, z);
    this.heading = 0;
    this.speed = 0;
    this.target = null;
    this.waitTimer = 0;
    this.fleeing = false;
    this.fleeTimer = 0;
    this.down = false;
    this.downTimer = 0;
    this.isCop = false;
    this.isCustomer = false;
    this.walkPhase = Math.random() * 6;
  }

  get x() { return this.mesh.position.x; }
  get z() { return this.mesh.position.z; }

  /** Knock the ped down for a few seconds (punch / car hit). */
  knockDown(seconds = 2.5) {
    if (this.down) return;
    this.down = true;
    this.downTimer = seconds;
    this.mesh.rotation.z = Math.PI / 2;
    this.mesh.position.y = 0.3;
  }

  /** Swing limbs while walking; lie still while down. */
  animate(dt) {
    const u = this.mesh.userData;
    if (this.down) return;
    this.walkPhase += dt * this.speed * 4.2;
    const swing = Math.sin(this.walkPhase) * 0.55 * Math.min(1, this.speed / 2);
    u.armL.rotation.x = swing;
    u.armR.rotation.x = -swing;
    u.legL.rotation.x = -swing;
    u.legR.rotation.x = swing;
  }
}

/** The crowd: spawns, wanders and flees. */
export class Pedestrians {
  constructor(scene, city, rng, count = 24) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.peds = [];
    for (let i = 0; i < count; i += 1) this.spawnPed();
  }

  /** A random sidewalk point: beside a road, inside the walk band. */
  randomSidewalkPoint() {
    const road = this.city.roads[Math.floor(this.rng() * this.city.roads.length)];
    const along = randRange(this.rng, -CITY_HALF, CITY_HALF);
    const side = this.rng() < 0.5 ? 1 : -1;
    if (this.rng() < 0.5) return { x: road + side * (WALK_HALF - 1.5), z: along };
    return { x: along, z: road + side * (WALK_HALF - 1.5) };
  }

  spawnPed() {
    const p = this.randomSidewalkPoint();
    const mesh = makePedMesh(pick(this.rng, PED_COLORS));
    const ped = new Ped(mesh, p.x, p.z);
    ped.heading = this.rng() * Math.PI * 2;
    ped.speed = randRange(this.rng, 1.1, 1.9);
    ped.target = this.randomSidewalkPoint();
    this.scene.add(mesh);
    this.peds.push(ped);
    return ped;
  }

  /** Spawn a taxi customer waiting at the kerb near (x, z). */
  spawnCustomer(x, z) {
    const mesh = makePedMesh(0xffd21f);
    const ped = new Ped(mesh, x, z);
    ped.isCustomer = true;
    ped.speed = 0;
    this.scene.add(mesh);
    this.peds.push(ped);
    return ped;
  }

  removePed(ped) {
    this.scene.remove(ped.mesh);
    const i = this.peds.indexOf(ped);
    if (i >= 0) this.peds.splice(i, 1);
  }

  /** Everyone within `radius` of (x, z) runs away from it. */
  scare(x, z, radius = 26) {
    for (const ped of this.peds) {
      const dx = ped.x - x;
      const dz = ped.z - z;
      if (dx * dx + dz * dz < radius * radius) {
        ped.fleeing = true;
        ped.fleeTimer = 3 + this.rng() * 2;
      }
    }
  }

  update(dt, playerPos, danger) {
    for (const ped of this.peds) {
      if (ped.down) {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0) {
          ped.down = false;
          ped.mesh.rotation.z = 0;
          ped.mesh.position.y = 0;
        }
        continue;
      }
      if (ped.isCustomer) { ped.animate(dt); continue; }
      let tx;
      let tz;
      let speed = ped.speed;
      if (ped.fleeing) {
        ped.fleeTimer -= dt;
        if (ped.fleeTimer <= 0) ped.fleeing = false;
        const dx = ped.x - playerPos.x;
        const dz = ped.z - playerPos.z;
        const d = Math.max(1, Math.hypot(dx, dz));
        tx = ped.x + (dx / d) * 20;
        tz = ped.z + (dz / d) * 20;
        speed = 4.6;
      } else {
        if (!ped.target) ped.target = this.randomSidewalkPoint();
        tx = ped.target.x;
        tz = ped.target.z;
        const dx = tx - ped.x;
        const dz = tz - ped.z;
        if (dx * dx + dz * dz < 2) {
          ped.waitTimer = randRange(this.rng, 0, 3);
          ped.target = null;
        }
      }
      if (ped.waitTimer > 0) {
        ped.waitTimer -= dt;
        ped.speed = 0;
        ped.animate(dt);
        continue;
      }
      const dx = tx - ped.x;
      const dz = tz - ped.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.05) {
        const targetHeading = Math.atan2(dx, dz);
        let err = targetHeading - ped.heading;
        while (err > Math.PI) err -= Math.PI * 2;
        while (err < -Math.PI) err += Math.PI * 2;
        ped.heading += Math.max(-3 * dt, Math.min(3 * dt, err * 5 * dt));
        ped.mesh.position.x += Math.sin(ped.heading) * speed * dt;
        ped.mesh.position.z += Math.cos(ped.heading) * speed * dt;
        ped.mesh.position.x = Math.max(-CITY_HALF, Math.min(CITY_HALF, ped.mesh.position.x));
        ped.mesh.position.z = Math.max(-CITY_HALF, Math.min(CITY_HALF + 24, ped.mesh.position.z));
        ped.speed = speed;
        this.city.resolveCircle(ped.mesh.position, 0.5);
      } else {
        ped.speed = 0;
      }
      ped.mesh.rotation.y = ped.heading;
      ped.animate(dt);
    }
    // Keep the crowd topped up.
    while (this.peds.length < 24) this.spawnPed();
  }
}
