// Solmar Bay — cars: the low-poly car factory, the player's arcade driving, the
// traffic that fills the roads, and the police cruisers that chase the player.
// All traffic drives on the right, follows the road grid, and turns at intersections.
import * as THREE from 'three';
import { CAR_COLORS, CAR_NAMES, CITY_HALF, PITCH, ROAD_HALF } from './config.js';
import { pick, randInt, randRange } from './rng.js';

/** Build one low-poly car. Returns a Group; userData holds the wheels and lights. */
export function makeCarMesh(color, opts = {}) {
  const group = new THREE.Group();
  const bodyColor = opts.police ? 0x14181f : color;
  const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x18242e });
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.72, 2.0), bodyMat);
  body.position.y = 0.62;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(2.3, 0.62, 1.8),
    opts.police ? new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }) : glassMat,
  );
  cabin.position.set(-0.2, 1.28, 0);
  cabin.castShadow = true;
  group.add(cabin);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 1.9), bodyMat);
  nose.position.set(2.2, 0.55, 0);
  group.add(nose);
  // Headlights + taillights.
  const lightMat = new THREE.MeshLambertMaterial({ color: 0xfff6c9, emissive: 0xffe27a, emissiveIntensity: 0.9 });
  for (const z of [-0.7, 0.7]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.3), lightMat);
    hl.position.set(2.46, 0.62, z);
    group.add(hl);
  }
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xff2a2a, emissive: 0xaa1111, emissiveIntensity: 0.8 });
  for (const z of [-0.7, 0.7]) {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.3), tailMat);
    tl.position.set(-2.24, 0.62, z);
    group.add(tl);
  }
  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const hubMat = new THREE.MeshLambertMaterial({ color: 0x9aa0a8 });
  const wheels = [];
  const frontWheels = [];
  for (const [x, z] of [[1.45, 0.95], [1.45, -0.95], [-1.45, 0.95], [-1.45, -0.95]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.38, z);
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.x = Math.PI / 2;
    wheel.castShadow = true;
    pivot.add(wheel);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.32, 8), hubMat);
    hub.rotation.x = Math.PI / 2;
    pivot.add(hub);
    group.add(pivot);
    wheels.push(pivot);
    if (x > 0) frontWheels.push(pivot);
  }
  if (opts.police) {
    // Light bar: red left, blue right, flashed by the police system.
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 1.3), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    barBase.position.set(-0.2, 1.68, 0);
    group.add(barBase);
    const red = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.16, 0.55),
      new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 1 }),
    );
    red.position.set(-0.2, 1.78, 0.32);
    group.add(red);
    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.16, 0.55),
      new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x0022ff, emissiveIntensity: 1 }),
    );
    blue.position.set(-0.2, 1.78, -0.32);
    group.add(blue);
    group.userData.lightRed = red;
    group.userData.lightBlue = blue;
  }
  if (opts.taxi) {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.3, 0.5),
      new THREE.MeshLambertMaterial({ color: 0xffd21f, emissive: 0xcc9900, emissiveIntensity: 0.6 }),
    );
    sign.position.set(-0.2, 1.75, 0);
    group.add(sign);
  }
  group.userData.wheels = wheels;
  group.userData.frontWheels = frontWheels;
  group.userData.bodyMat = bodyMat;
  group.userData.noseMat = bodyMat;
  return group;
}

/** One car in the world: mesh + arcade physics state. */
export class Car {
  constructor(mesh, opts = {}) {
    this.mesh = mesh;
    this.heading = opts.heading ?? 0;
    this.speed = 0;
    this.steer = 0;
    this.maxSpeed = opts.maxSpeed ?? 26;
    this.isPolice = !!opts.police;
    this.isTaxi = !!opts.taxi;
    this.name = opts.name ?? 'Sedan';
    this.color = opts.color ?? 0x888888;
    this.ai = opts.ai ?? null; // 'traffic' | 'police' | null (player-driven)
    this.stuckTimer = 0;
    this.damage = 0;
    this.flash = 0;
    this.mesh.position.set(opts.x ?? 0, 0, opts.z ?? 0);
    // The mesh is built facing +x (nose at +x), while forward() is
    // (sin h, cos h): rotation.y = h - PI/2 turns the nose onto forward.
    // (rotation.y = -h, as written before, drove every car 90 degrees
    // sideways to its direction of travel.)
    this.mesh.rotation.y = this.heading - Math.PI / 2;
  }

  get x() { return this.mesh.position.x; }
  get z() { return this.mesh.position.z; }
  set x(v) { this.mesh.position.x = v; }
  set z(v) { this.mesh.position.z = v; }

  /** Forward unit vector for the current heading. */
  forward() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }

  /** Spin the wheels and yaw the front wheels to match the steering. */
  animateWheels(dt) {
    const spin = (this.speed * dt) / 0.38;
    for (const w of this.mesh.userData.wheels) {
      w.children[0].rotation.z += spin;
      w.children[1].rotation.z += spin;
    }
    // Front wheels yaw toward the turn: in car-local space forward is +x and
    // left is -z, so a left turn (steer > 0) needs a positive pivot rotation.
    for (const w of this.mesh.userData.frontWheels) w.rotation.y = this.steer * 0.55;
  }
}

/** Player driving: arcade model with speed-sensitive steering and drift feel. */
export function drivePlayerCar(car, input, dt, city, cars, audio) {
  const fwd = input.down('KeyW', 'ArrowUp') ? 1 : 0;
  const back = input.down('KeyS', 'ArrowDown') ? 1 : 0;
  const left = input.down('KeyA', 'ArrowLeft') ? 1 : 0;
  const right = input.down('KeyD', 'ArrowRight') ? 1 : 0;
  const accel = 14;
  const brake = 26;
  const maxReverse = -9;
  if (fwd) {
    car.speed += (car.speed < 0 ? brake : accel) * dt;
  } else if (back) {
    car.speed -= (car.speed > 0 ? brake : accel * 0.7) * dt;
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
  }
  car.speed = Math.max(maxReverse, Math.min(car.maxSpeed, car.speed));
  const speedFactor = Math.min(1, Math.abs(car.speed) / 10);
  const steerTarget = (left ? 1 : 0) - (right ? 1 : 0);
  car.steer += (steerTarget * 0.62 - car.steer) * Math.min(1, dt * 8);
  const dir = car.speed >= 0 ? 1 : -1;
  car.heading += car.steer * speedFactor * dir * dt * 1.9;
  const f = car.forward();
  const prevX = car.x;
  const prevZ = car.z;
  car.x += f.x * car.speed * dt;
  car.z += f.z * car.speed * dt;
  // Stay inside the drivable city (beach counts as drivable sand).
  car.x = Math.max(-CITY_HALF - 20, Math.min(CITY_HALF + 20, car.x));
  car.z = Math.max(-CITY_HALF - 2, Math.min(CITY_HALF + 30, car.z));
  city.resolveCircle(car.mesh.position, 1.6);
  // Bumping a building at speed hurts and slows the car.
  if ((car.x !== prevX + f.x * car.speed * dt || car.z !== prevZ + f.z * car.speed * dt) && Math.abs(car.speed) > 6) {
    if (Math.abs(car.speed) > 10) audio?.crash();
    car.speed *= 0.45;
  }
  // Car-to-car bumps: push apart, trade a little speed, crash sound on hard hits.
  for (const other of cars) {
    if (other === car) continue;
    const dx = car.x - other.x;
    const dz = car.z - other.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 12.5 && d2 > 0.0001) {
      const d = Math.sqrt(d2);
      const push = (3.55 - d) / 2;
      car.x += (dx / d) * push;
      car.z += (dz / d) * push;
      other.x -= (dx / d) * push;
      other.z -= (dz / d) * push;
      const impact = Math.abs(car.speed - other.speed);
      if (impact > 7) {
        audio?.crash();
        car.speed *= 0.6;
        other.speed *= 0.7;
      }
    }
  }
  car.mesh.rotation.y = car.heading - Math.PI / 2;
  car.animateWheels(dt);
  if (input.wasPressed('KeyQ')) audio?.horn();
}

/** Traffic: a dozen AI cars cruising the grid on the right-hand lane. */
export class Traffic {
  constructor(scene, city, rng) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.cars = [];
    for (let i = 0; i < 14; i += 1) this.spawnCar(true);
  }

  /** A random road leg: axis, direction, road centreline, start position. */
  randomLeg() {
    const axis = this.rng() < 0.5 ? 'x' : 'z';
    const dir = this.rng() < 0.5 ? 1 : -1;
    const road = this.city.roads[Math.floor(this.rng() * this.city.roads.length)];
    const along = randRange(this.rng, -CITY_HALF, CITY_HALF);
    return { axis, dir, road, along };
  }

  spawnCar(initial = false) {
    const leg = this.randomLeg();
    const color = pick(this.rng, CAR_COLORS);
    const mesh = makeCarMesh(color);
    const car = new Car(mesh, {
      x: leg.axis === 'x' ? leg.along : leg.road + (leg.dir > 0 ? -3.5 : 3.5),
      z: leg.axis === 'z' ? leg.along : leg.road + (leg.dir > 0 ? 3.5 : -3.5),
      heading: leg.axis === 'x' ? (leg.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (leg.dir > 0 ? 0 : Math.PI),
      maxSpeed: randRange(this.rng, 8, 13),
      name: pick(this.rng, CAR_NAMES),
      color,
      ai: 'traffic',
    });
    car.leg = leg;
    car.cruise = randRange(this.rng, 8, 13);
    car.waitTimer = 0;
    this.scene.add(mesh);
    this.cars.push(car);
    if (!initial) car.mesh.position.y = 0;
    return car;
  }

  /** Is another car (or the player) right in front of this one? */
  blockedBy(car, allCars, playerCar) {
    const f = car.forward();
    const aheadX = car.x + f.x * 7;
    const aheadZ = car.z + f.z * 7;
    for (const other of allCars) {
      if (other === car) continue;
      const dx = other.x - aheadX;
      const dz = other.z - aheadZ;
      if (dx * dx + dz * dz < 20) return true;
    }
    if (playerCar) {
      const dx = playerCar.x - aheadX;
      const dz = playerCar.z - aheadZ;
      if (dx * dx + dz * dz < 20) return true;
    }
    return false;
  }

  update(dt, playerCar, peds) {
    for (const car of this.cars) {
      const leg = car.leg;
      // Lane target: right-hand lane of the current road.
      const lane = leg.dir > 0 ? 3.5 : -3.5;
      const lateral = leg.axis === 'x' ? car.z - (leg.road + lane) : car.x - (leg.road + (leg.axis === 'z' ? (leg.dir > 0 ? -lane : -lane) : lane));
      // Desired heading: along the road, corrected toward the lane line.
      // The correction's sign depends on the leg: steering toward the lane
      // needs +lateral on eastbound x-legs and northbound z-legs, -lateral
      // on the other two (a plain -lateral steers eastbound and northbound
      // cars AWAY from their lane until they leave the road).
      let targetHeading;
      if (leg.axis === 'x') targetHeading = leg.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      else targetHeading = leg.dir > 0 ? 0 : Math.PI;
      const laneSign = leg.axis === 'x' ? leg.dir : -leg.dir;
      targetHeading += Math.max(-0.5, Math.min(0.5, lateral * 0.06 * laneSign));
      // Wrap heading error to [-PI, PI].
      let err = targetHeading - car.heading;
      while (err > Math.PI) err -= Math.PI * 2;
      while (err < -Math.PI) err += Math.PI * 2;
      car.heading += Math.max(-1.6 * dt, Math.min(1.6 * dt, err * 2.2 * dt));
      // Slow for traffic ahead, for peds crossing, and near intersections sometimes.
      let targetSpeed = car.cruise;
      if (this.blockedBy(car, this.cars, playerCar)) targetSpeed = 0;
      const along = leg.axis === 'x' ? car.x : car.z;
      const nextRoad = this.city.nearestRoad(along + leg.dir * 10);
      if (Math.abs(along + leg.dir * 10 - nextRoad) < 4 && this.rng() < 0.004) targetSpeed = Math.min(targetSpeed, 3);
      car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.4);
      const f = car.forward();
      car.x += f.x * car.speed * dt;
      car.z += f.z * car.speed * dt;
      car.mesh.rotation.y = car.heading - Math.PI / 2;
      car.animateWheels(dt);
      // Reached an intersection: maybe turn onto the cross road.
      const cross = leg.axis === 'x' ? car.z : car.x;
      const crossRoad = this.city.nearestRoad(cross);
      const alongNow = leg.axis === 'x' ? car.x : car.z;
      if (Math.abs(alongNow - this.city.nearestRoad(alongNow)) < 2.5 && this.rng() < 0.5) {
        const turn = this.rng();
        if (turn < 0.3) {
          // Turn onto the cross road.
          const newDir = this.rng() < 0.5 ? 1 : -1;
          car.leg = { axis: leg.axis === 'x' ? 'z' : 'x', dir: newDir, road: this.city.nearestRoad(alongNow), along: crossRoad };
        }
      }
      // Wrap back into the city if it drove off the edge.
      if (Math.abs(car.x) > CITY_HALF + 6 || Math.abs(car.z) > CITY_HALF + 6) {
        const leg2 = this.randomLeg();
        car.leg = leg2;
        car.x = leg2.axis === 'x' ? leg2.along : leg2.road + 3.5;
        car.z = leg2.axis === 'z' ? leg2.along : leg2.road + 3.5;
        car.heading = leg2.axis === 'x' ? (leg2.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (leg2.dir > 0 ? 0 : Math.PI);
        car.speed = car.cruise;
      }
    }
  }
}
