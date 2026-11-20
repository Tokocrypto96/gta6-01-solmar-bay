// Solmar Bay — the wanted system (v2).
//
// Crimes add heat, heat cools when nobody is watching, and the star ladder
// turns heat into hardware: more cruisers, more foot cops, and — from
// three stars — cops who shoot back. The chase, ramming, busted and
// wasted logic is the original system's, untouched; v2 only dresses the
// force better (caps, badges, high-vis vests) and gives the cruisers
// push bars (in vehicles.js).
import * as THREE from 'three';
import { CITY_HALF } from './config.js';
import { Car, makeCarMesh } from './vehicles.js';
import { makePedMesh, Ped } from './pedestrians.js';

/** Heat at which each star lights up. */
const STAR_HEAT = [0, 25, 60, 110, 170, 240];
/** Cruisers hunting at each star level. */
const POLICE_CARS = [0, 1, 2, 3, 4, 5];
/** Foot cops hunting at each star level. */
const FOOT_COPS = [0, 1, 1, 2, 3, 4];

export class Police {
  constructor(scene, city, rng) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.heat = 0;
    this.stars = 0;
    this.cars = [];
    this.cops = [];
    this.bustedTimer = 0;
    this.decayTimer = 0;
    this.flashTimer = 0;
    this.shootTimer = 0;
  }

  /** A crime was committed: bank the heat, re-read the stars. */
  addHeat(amount) {
    this.heat = Math.min(260, this.heat + amount);
    this.updateStars();
  }

  updateStars() {
    let stars = 0;
    for (let s = 1; s <= 5; s += 1) if (this.heat >= STAR_HEAT[s]) stars = s;
    if (stars !== this.stars) {
      this.stars = stars;
      this.syncForces();
    }
  }

  /** Keep the force on the street matched to the star level. */
  syncForces() {
    while (this.cars.length < POLICE_CARS[this.stars]) this.spawnPoliceCar();
    while (this.cars.length > POLICE_CARS[this.stars]) {
      const car = this.cars.pop();
      this.scene.remove(car.mesh);
    }
    while (this.cops.length < FOOT_COPS[this.stars]) this.spawnCop();
    while (this.cops.length > FOOT_COPS[this.stars]) {
      const cop = this.cops.pop();
      this.scene.remove(cop.mesh);
    }
  }

  spawnPoliceCar() {
    const mesh = makeCarMesh(0x14181f, { police: true });
    const car = new Car(mesh, {
      x: 0, z: 0, maxSpeed: 24 + this.stars, police: true, ai: 'police',
    });
    car.mesh.position.y = 0;
    this.scene.add(mesh);
    this.cars.push(car);
    return car;
  }

  spawnCop() {
    const mesh = makePedMesh(0x1c2f4a, 0xc98d64, { pants: 0x141c28 });
    // Peaked cap, badge and a high-vis stripe across the chest.
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.26, 0.12, 8),
      new THREE.MeshLambertMaterial({ color: 0x101418 }),
    );
    cap.position.y = 1.95;
    mesh.add(cap);
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.64, 0.12, 0.38),
      new THREE.MeshLambertMaterial({ color: 0xd7e14a, emissive: 0x6a7016, emissiveIntensity: 0.4 }),
    );
    stripe.position.y = 1.28;
    mesh.add(stripe);
    const badge = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.11, 0.02),
      new THREE.MeshLambertMaterial({ color: 0xffd21f, emissive: 0xaa8800, emissiveIntensity: 0.6 }),
    );
    badge.position.set(0.16, 1.32, 0.19);
    mesh.add(badge);
    const cop = new Ped(mesh, 0, 0);
    cop.isCop = true;
    cop.speed = 3.4;
    this.scene.add(mesh);
    this.cops.push(cop);
    return cop;
  }

  /** Teleport any too-close or out-of-bounds force to a road edge nearby. */
  placeForceNear(playerX, playerZ, minDist = 55) {
    for (const car of this.cars) {
      const dx = car.x - playerX;
      const dz = car.z - playerZ;
      if (dx * dx + dz * dz < minDist * minDist || Math.abs(car.x) > CITY_HALF || Math.abs(car.z) > CITY_HALF) {
        const road = this.city.roads[Math.floor(this.rng() * this.city.roads.length)];
        const along = playerX + (this.rng() < 0.5 ? -1 : 1) * (60 + this.rng() * 40);
        if (this.rng() < 0.5) { car.x = along; car.z = road; } else { car.x = road; car.z = along; }
        car.speed = 8;
      }
    }
    for (const cop of this.cops) {
      const dx = cop.x - playerX;
      const dz = cop.z - playerZ;
      if (dx * dx + dz * dz < 30 * 30) {
        cop.mesh.position.x = playerX + (this.rng() < 0.5 ? -1 : 1) * (28 + this.rng() * 12);
        cop.mesh.position.z = playerZ + (this.rng() < 0.5 ? -1 : 1) * (28 + this.rng() * 12);
      }
    }
  }

  /**
   * The chase, per frame: heat decay, cruisers steering onto the player,
   * rams, the busted catch, foot cops running Jay down and — at three
   * stars and up — shooting when he's in the open.
   */
  update(dt, player, playerCar, trafficCars, audio, onBusted, onWasted) {
    this.flashTimer += dt;
    const flashOn = Math.floor(this.flashTimer * 4) % 2 === 0;
    let sirenNear = false;

    // Heat cools once a second: slowly under a cruiser's nose, faster alone.
    this.decayTimer += dt;
    if (this.decayTimer > 1) {
      this.decayTimer = 0;
      let nearest = Infinity;
      for (const car of this.cars) {
        const d = Math.hypot(car.x - player.x, car.z - player.z);
        if (d < nearest) nearest = d;
      }
      if (nearest > 60) this.heat = Math.max(0, this.heat - 4);
      else this.heat = Math.max(0, this.heat - 1);
      this.updateStars();
    }

    const px = playerCar ? playerCar.x : player.x;
    const pz = playerCar ? playerCar.z : player.z;
    for (const car of this.cars) {
      const m = car.mesh.userData;
      if (m.lightRed) m.lightRed.material.emissiveIntensity = flashOn ? 2.2 : 0.15;
      if (m.lightBlue) m.lightBlue.material.emissiveIntensity = flashOn ? 0.15 : 2.2;
      const dx = px - car.x;
      const dz = pz - car.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 120) sirenNear = true;
      const targetHeading = Math.atan2(dx, dz);
      let err = targetHeading - car.heading;
      while (err > Math.PI) err -= Math.PI * 2;
      while (err < -Math.PI) err += Math.PI * 2;
      // Far away the cruiser tracks loosely; up close it commits.
      const steerAuthority = Math.min(1, dist / 30);
      car.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, err * 3 * dt)) * steerAuthority;
      const wantSpeed = dist > 6 ? car.maxSpeed : 6;
      car.speed += (wantSpeed - car.speed) * Math.min(1, dt * 1.2);
      const f = car.forward();
      car.x += f.x * car.speed * dt;
      car.z += f.z * car.speed * dt;
      this.city.resolveCircle(car.mesh.position, 1.6);
      // Cruisers shove through traffic instead of queueing behind it.
      for (const other of trafficCars) {
        const dx = car.x - other.x;
        const dz = car.z - other.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 12.5 && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const push = (3.55 - d) / 2;
          car.x += (dx / d) * push;
          car.z += (dz / d) * push;
        }
      }
      car.mesh.rotation.y = car.heading - Math.PI / 2;
      car.animateWheels(dt);
      // Ramming the player's car: a shove, a slowdown and real damage.
      if (playerCar && dist < 4.2) {
        playerCar.x += (dx / Math.max(1, dist)) * -0.6;
        playerCar.z += (dz / Math.max(1, dist)) * -0.6;
        playerCar.speed *= 0.92;
        if (player.damage(6)) onWasted();
      }
      // Busted: a cruiser on the bumper while the player is barely moving.
      const playerSlow = playerCar ? Math.abs(playerCar.speed) < 2 : player.speed < 1;
      if (dist < (playerCar ? 5 : 3.2) && playerSlow) {
        this.bustedTimer += dt;
        if (this.bustedTimer > 1.6) {
          this.bustedTimer = 0;
          onBusted();
          return;
        }
      } else {
        this.bustedTimer = Math.max(0, this.bustedTimer - dt * 2);
      }
    }

    // Foot cops: chase, shove each other apart, punch at arm's length.
    for (const cop of this.cops) {
      if (cop.down) {
        cop.downTimer -= dt;
        if (cop.downTimer <= 0) {
          cop.down = false;
          cop.mesh.rotation.z = 0;
          cop.mesh.position.y = 0;
        }
        continue;
      }
      const dx = player.x - cop.x;
      const dz = player.z - cop.z;
      const dist = Math.hypot(dx, dz);
      const targetHeading = Math.atan2(dx, dz);
      let err = targetHeading - cop.heading;
      while (err > Math.PI) err -= Math.PI * 2;
      while (err < -Math.PI) err += Math.PI * 2;
      cop.heading += Math.max(-4 * dt, Math.min(4 * dt, err * 6 * dt));
      const chaseSpeed = playerCar ? 5.2 : 4.4;
      cop.mesh.position.x += Math.sin(cop.heading) * chaseSpeed * dt;
      cop.mesh.position.z += Math.cos(cop.heading) * chaseSpeed * dt;
      cop.speed = chaseSpeed;
      this.city.resolveCircle(cop.mesh.position, 0.5);
      for (const other of this.cops) {
        if (other === cop || other.down) continue;
        const dx = cop.x - other.x;
        const dz = cop.z - other.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 1.44 && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          cop.mesh.position.x = other.x + (dx / d) * 1.2;
          cop.mesh.position.z = other.z + (dz / d) * 1.2;
        }
      }
      cop.mesh.rotation.y = cop.heading;
      cop.animate(dt);
      if (dist < 1.8 && !playerCar) {
        if (player.damage(8)) onWasted();
      }
      // Three stars and up, a cop with a clear shot takes it.
      if (this.stars >= 3 && dist < 26 && dist > 6 && !playerCar) {
        this.shootTimer -= dt;
        if (this.shootTimer <= 0) {
          this.shootTimer = 0.9;
          audio?.shoot();
          if (player.damage(5)) onWasted();
        }
      }
    }
    audio?.setSiren(sirenNear && this.stars > 0);
  }

  /** Wipe the slate: no heat, no stars, no force on the street. */
  clear() {
    this.heat = 0;
    this.stars = 0;
    this.bustedTimer = 0;
    this.syncForces();
  }
}
