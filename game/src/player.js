// Solmar Bay — the player on foot: Jay Marlin, a third-person walker with a run,
// a jump, a punch, and a pistol (once bought). Also the enter/exit-car logic and
// the camera-relative movement the on-foot controls share with the driving camera.
import * as THREE from 'three';
import { CITY_HALF } from './config.js';
import { makePedMesh } from './pedestrians.js';

/** The player's character: mesh + movement + combat state. */
export class Player {
  constructor(scene) {
    this.mesh = makePedMesh(0x1f6f4a); // Jay's green dock jacket
    this.mesh.scale.setScalar(1.04);
    scene.add(this.mesh);
    this.pos = new THREE.Vector3(-160, 0, 160);
    this.heading = Math.PI * 0.75;
    this.vy = 0;
    this.grounded = true;
    this.speed = 0;
    this.health = 100;
    this.maxHealth = 100;
    this.cash = 120;
    this.pistol = false;
    this.walkPhase = 0;
    this.punchTimer = 0;
    this.punchCooldown = 0;
    this.hurtTimer = 0;
    this.inCar = null; // the Car the player is driving, or null
    this.mesh.position.copy(this.pos);
  }

  get x() { return this.pos.x; }
  get z() { return this.pos.z; }

  /** Hurt the player; returns true when this kills them. */
  damage(amount) {
    if (this.hurtTimer > 0) return false;
    this.health -= amount;
    this.hurtTimer = 0.5;
    return this.health <= 0;
  }

  /** Heal up to the max. */
  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  /** On-foot movement, camera-relative. Returns the planar speed for the HUD.
   *  `cars` is every car in the world: Jay must not walk through them. */
  updateOnFoot(input, dt, city, camYaw, cars = []) {
    const run = input.down('ShiftLeft', 'ShiftRight');
    const fwd = (input.down('KeyW', 'ArrowUp') ? 1 : 0) - (input.down('KeyS', 'ArrowDown') ? 1 : 0);
    const strafe = (input.down('KeyD', 'ArrowRight') ? 1 : 0) - (input.down('KeyA', 'ArrowLeft') ? 1 : 0);
    const moving = fwd !== 0 || strafe !== 0;
    const targetSpeed = moving ? (run ? 7.2 : 4.2) : 0;
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 10);
    if (moving) {
      // Camera-relative: forward is where the camera looks on the ground plane.
      const sin = Math.sin(camYaw);
      const cos = Math.cos(camYaw);
      let mx = sin * fwd - cos * strafe;
      let mz = cos * fwd + sin * strafe;
      const len = Math.hypot(mx, mz) || 1;
      mx /= len;
      mz /= len;
      this.pos.x += mx * this.speed * dt;
      this.pos.z += mz * this.speed * dt;
      const targetHeading = Math.atan2(mx, mz);
      let err = targetHeading - this.heading;
      while (err > Math.PI) err -= Math.PI * 2;
      while (err < -Math.PI) err += Math.PI * 2;
      this.heading += Math.max(-10 * dt, Math.min(10 * dt, err * 12 * dt));
    }
    // Jump + gravity.
    if (input.wasPressed('Space') && this.grounded) {
      this.vy = 6.5;
      this.grounded = false;
    }
    if (!this.grounded) {
      this.vy -= 18 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= 0) {
        this.pos.y = 0;
        this.vy = 0;
        this.grounded = true;
      }
    }
    this.pos.x = Math.max(-CITY_HALF - 24, Math.min(CITY_HALF + 24, this.pos.x));
    this.pos.z = Math.max(-CITY_HALF - 4, Math.min(CITY_HALF + 30, this.pos.z));
    city.resolveCircle(this.pos, 0.55);
    // Don't walk through cars: push out of a 2.5 m circle around each one.
    // (Buildings already push via resolveCircle above; cars did not, so Jay
    // used to clip straight through a parked sedan.)
    for (const car of cars) {
      const dx = this.pos.x - car.x;
      const dz = this.pos.z - car.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 6.25 && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        this.pos.x = car.x + (dx / d) * 2.5;
        this.pos.z = car.z + (dz / d) * 2.5;
      }
    }
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    // Walk-cycle swing.
    this.walkPhase += dt * this.speed * 2.4;
    const swing = Math.sin(this.walkPhase) * 0.5 * Math.min(1, this.speed / 4);
    const u = this.mesh.userData;
    if (this.punchTimer > 0) {
      this.punchTimer -= dt;
      u.armR.rotation.x = -1.9 + Math.sin(this.punchTimer * 20) * 0.3;
      u.armL.rotation.x = 0.3;
    } else {
      u.armL.rotation.x = swing;
      u.armR.rotation.x = -swing;
    }
    u.legL.rotation.x = -swing;
    u.legR.rotation.x = swing;
    if (this.punchCooldown > 0) this.punchCooldown -= dt;
    if (this.hurtTimer > 0) this.hurtTimer -= dt;
    return this.speed;
  }

  /** Punch: hits the nearest ped/cop in front within 2.2 m. Returns the victim or null. */
  tryPunch(peds, cops) {
    if (this.punchCooldown > 0 || this.inCar) return null;
    this.punchTimer = 0.28;
    this.punchCooldown = 0.45;
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    let best = null;
    let bestD = 2.2;
    const consider = (list) => {
      for (const p of list) {
        if (p.down) continue;
        const dx = p.x - this.x;
        const dz = p.z - this.z;
        const d = Math.hypot(dx, dz);
        if (d < bestD && (dx * fx + dz * fz) / Math.max(0.01, d) > 0.5) {
          best = p;
          bestD = d;
        }
      }
    };
    consider(peds);
    consider(cops);
    if (best) best.knockDown(2.5);
    return best;
  }

  /** Shoot a hitscan ray from the camera through the crosshair. Returns a hit record. */
  tryShoot(camera, peds, cops, cars, scene) {
    if (!this.pistol || this.inCar) return null;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, 0), camera);
    ray.far = 90;
    const targets = [];
    for (const p of peds) if (!p.down) targets.push({ obj: p.mesh, kind: 'ped', ref: p });
    for (const c of cops) if (!c.down) targets.push({ obj: c.mesh, kind: 'cop', ref: c });
    for (const car of cars) targets.push({ obj: car.mesh, kind: 'car', ref: car });
    const meshes = targets.map((t) => t.obj);
    const hits = ray.intersectObjects(meshes, true);
    if (!hits.length) return { kind: 'miss' };
    let hitObj = hits[0].object;
    while (hitObj.parent && !targets.some((t) => t.obj === hitObj)) hitObj = hitObj.parent;
    const found = targets.find((t) => t.obj === hitObj);
    if (!found) return { kind: 'miss' };
    return { kind: found.kind, ref: found.ref, point: hits[0].point };
  }
}
