// Solmar Bay — cars (v2).
//
// The car factory now builds six body styles — sedan, hatch, pickup, van,
// sports coupe and beach buggy — with bumpers, mirrors, grilles and trim,
// because a street where every car is the same box reads as a prototype.
// Under the paint nothing changed: the arcade driving model, the
// right-hand-lane traffic that turns at intersections, and the cruisers
// are the systems that won their dev matches, kept exactly as they were.
import * as THREE from 'three';
import { CAR_COLORS, CAR_NAMES, CITY_HALF } from './config.js';
import { pick, randRange } from './rng.js';

/** Body styles the factory can build; traffic picks one per car. */
const STYLES = ['sedan', 'sedan', 'hatch', 'pickup', 'van', 'sport', 'buggy'];

/** Small helper: one box on the car, casting a shadow. */
function part(group, mat, w, h, d, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  group.add(m);
  return m;
}

/**
 * Build one car. The mesh faces +x (nose at +x); the Car class turns it
 * onto its heading. userData carries the wheels (spun by Car.animateWheels),
 * bodyMat (the paint shop resprays through it) and, for police cars, the
 * two light-bar halves the police system flashes.
 */
export function makeCarMesh(color, opts = {}) {
  const group = new THREE.Group();
  const style = opts.style ?? 'sedan';
  const bodyColor = opts.police ? 0x14181f : color;
  const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x18242e });
  const chromeMat = new THREE.MeshLambertMaterial({ color: 0xb9c0c7 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1b1e24 });

  // Lower body + cabin, per style. Every style keeps the same footprint
  // (4.4 x 2.0) so collisions and traffic spacing never notice the change.
  if (style === 'van') {
    part(group, bodyMat, 4.3, 1.55, 1.95, 0, 1.12, 0);
    part(group, glassMat, 0.7, 0.62, 1.8, 1.95, 1.42, 0); // windshield block
    part(group, bodyMat, 0.5, 0.5, 1.9, 2.2, 0.55, 0); // nose
  } else if (style === 'pickup') {
    part(group, bodyMat, 4.4, 0.72, 2.0, 0, 0.62, 0);
    part(group, glassMat, 2.0, 0.66, 1.85, 0.75, 1.3, 0); // cab, forward
    part(group, bodyMat, 1.7, 0.5, 1.9, -1.3, 1.12, 0); // bed walls hint
    part(group, darkMat, 1.5, 0.1, 1.7, -1.3, 0.92, 0); // bed floor
    part(group, bodyMat, 0.5, 0.4, 1.9, 2.2, 0.55, 0);
  } else if (style === 'sport') {
    part(group, bodyMat, 4.4, 0.55, 2.05, 0, 0.52, 0);
    part(group, glassMat, 2.0, 0.5, 1.7, -0.3, 1.02, 0);
    part(group, bodyMat, 0.6, 0.3, 1.95, 2.2, 0.48, 0);
    // Rear spoiler on two struts.
    part(group, darkMat, 0.12, 0.3, 0.2, -2.0, 0.95, 0.7);
    part(group, darkMat, 0.12, 0.3, 0.2, -2.0, 0.95, -0.7);
    part(group, bodyMat, 0.45, 0.08, 2.1, -2.0, 1.14, 0);
  } else if (style === 'buggy') {
    part(group, bodyMat, 3.6, 0.5, 1.8, 0, 0.55, 0);
    part(group, bodyMat, 0.8, 0.35, 1.7, 1.9, 0.5, 0);
    // Roll cage: two hoops and a roof bar.
    const cageMat = darkMat;
    for (const cx of [-0.9, 0.5]) {
      part(group, cageMat, 0.09, 0.85, 0.09, cx, 1.15, 0.8);
      part(group, cageMat, 0.09, 0.85, 0.09, cx, 1.15, -0.8);
    }
    part(group, cageMat, 1.5, 0.09, 1.7, -0.2, 1.6, 0);
    part(group, darkMat, 1.1, 0.45, 1.5, -0.2, 0.95, 0); // seats block
  } else if (style === 'hatch') {
    part(group, bodyMat, 4.4, 0.72, 2.0, 0, 0.62, 0);
    part(group, glassMat, 2.5, 0.68, 1.82, -0.45, 1.3, 0);
    part(group, bodyMat, 0.5, 0.42, 1.9, 2.2, 0.55, 0);
    part(group, bodyMat, 0.35, 0.5, 1.9, -2.1, 0.85, 0); // upright tail
  } else {
    // sedan (and the police / taxi base)
    part(group, bodyMat, 4.4, 0.72, 2.0, 0, 0.62, 0);
    const cabinMat = opts.police ? new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }) : glassMat;
    part(group, cabinMat, 2.3, 0.62, 1.8, -0.2, 1.28, 0);
    part(group, bodyMat, 0.5, 0.4, 1.9, 2.2, 0.55, 0);
  }

  // Bumpers, grille and mirrors — the details that sell the shape.
  part(group, chromeMat, 0.18, 0.22, 1.95, 2.32, 0.38, 0);
  part(group, chromeMat, 0.18, 0.22, 1.95, -2.32, 0.38, 0);
  part(group, darkMat, 0.1, 0.3, 1.2, 2.44, 0.62, 0);
  if (style !== 'buggy' && style !== 'van') {
    part(group, bodyMat, 0.22, 0.1, 0.3, 0.95, 1.18, 1.05);
    part(group, bodyMat, 0.22, 0.1, 0.3, 0.95, 1.18, -1.05);
  }

  // Headlights and taillights.
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

  // Wheels on steering pivots at the front.
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
    // Light bar: red one side, blue the other, flashed by the police system.
    part(group, darkMat, 0.5, 0.14, 1.3, -0.2, 1.68, 0);
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
    // Push bar on the nose — a cruiser means business.
    part(group, darkMat, 0.15, 0.5, 1.6, 2.5, 0.55, 0);
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

/** One car in the world: a mesh plus its arcade physics state. */
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
    // The mesh is modelled facing +x while forward() is (sin h, cos h), so
    // rotation.y = h - PI/2 puts the nose on the direction of travel.
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

  /** Roll the wheels with the speed; yaw the front pair with the steering. */
  animateWheels(dt) {
    const spin = (this.speed * dt) / 0.38;
    for (const w of this.mesh.userData.wheels) {
      w.children[0].rotation.z += spin;
      w.children[1].rotation.z += spin;
    }
    for (const w of this.mesh.userData.frontWheels) w.rotation.y = this.steer * 0.55;
  }
}

/** Player driving: an arcade model — grippy, speed-sensitive, forgiving. */
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
  // The drivable world: the city plus the sand to the south.
  car.x = Math.max(-CITY_HALF - 20, Math.min(CITY_HALF + 20, car.x));
  car.z = Math.max(-CITY_HALF - 2, Math.min(CITY_HALF + 30, car.z));
  city.resolveCircle(car.mesh.position, 1.6);
  // If a building stopped the car short of where it meant to go, that was
  // a crash: bleed speed, and make a noise about it when it was fast.
  if ((car.x !== prevX + f.x * car.speed * dt || car.z !== prevZ + f.z * car.speed * dt) && Math.abs(car.speed) > 6) {
    if (Math.abs(car.speed) > 10) audio?.crash();
    car.speed *= 0.45;
  }
  // Car-to-car contact: shove apart, trade speed, crunch on hard hits.
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

/** Traffic: AI cars cruising the grid on the right-hand lane. */
export class Traffic {
  constructor(scene, city, rng) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.cars = [];
    for (let i = 0; i < 16; i += 1) this.spawnCar(true);
  }

  /** A random road leg: which axis, which way, which road, how far along. */
  randomLeg() {
    const axis = this.rng() < 0.5 ? 'x' : 'z';
    const dir = this.rng() < 0.5 ? 1 : -1;
    const road = this.city.roads[Math.floor(this.rng() * this.city.roads.length)];
    const along = randRange(this.rng, -CITY_HALF, CITY_HALF);
    return { axis, dir, road, along };
  }

  spawnCar(initial = false) {
    void initial;
    const leg = this.randomLeg();
    const color = pick(this.rng, CAR_COLORS);
    const style = pick(this.rng, STYLES);
    const mesh = makeCarMesh(color, { style });
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
    car.turnCooldown = 0; // seconds before it may roll to turn again
    this.scene.add(mesh);
    this.cars.push(car);
    return car;
  }

  /** Is another car (or the player's) sitting in this one's braking zone? */
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
    void peds;
    for (const car of this.cars) {
      const leg = car.leg;
      car.turnCooldown = Math.max(0, (car.turnCooldown ?? 0) - dt);
      // The right-hand lane of the current leg: +3.5 on the direction side.
      // For z-legs the offset flips sign (northbound cars hug road - 3.5).
      const lane = leg.dir > 0 ? 3.5 : -3.5;
      const laneLine = leg.axis === 'x' ? leg.road + lane : leg.road - lane;
      const lateral = leg.axis === 'x' ? car.z - laneLine : car.x - laneLine;
      // Steer along the road, corrected toward the lane line. The
      // correction's sign flips with the leg's axis and direction —
      // getting it wrong steers two of the four leg kinds AWAY from their
      // lane until they mount the sidewalk.
      let targetHeading;
      if (leg.axis === 'x') targetHeading = leg.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      else targetHeading = leg.dir > 0 ? 0 : Math.PI;
      const laneSign = leg.axis === 'x' ? leg.dir : -leg.dir;
      targetHeading += Math.max(-0.5, Math.min(0.5, lateral * 0.06 * laneSign));
      let err = targetHeading - car.heading;
      while (err > Math.PI) err -= Math.PI * 2;
      while (err < -Math.PI) err += Math.PI * 2;
      car.heading += Math.max(-1.6 * dt, Math.min(1.6 * dt, err * 2.2 * dt));
      // Speed: cruise, unless something is ahead or the junction is busy.
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
      // At an intersection, decide ONCE whether to turn, then hold a
      // cooldown: rolling every frame near the junction (the old way)
      // meant almost every car turned at the first crossroads it met.
      const cross = leg.axis === 'x' ? car.z : car.x;
      const crossRoad = this.city.nearestRoad(cross);
      const alongNow = leg.axis === 'x' ? car.x : car.z;
      if (Math.abs(alongNow - this.city.nearestRoad(alongNow)) < 2.5 && car.turnCooldown <= 0 && this.rng() < 0.5) {
        const turn = this.rng();
        if (turn < 0.3) {
          const newDir = this.rng() < 0.5 ? 1 : -1;
          car.leg = { axis: leg.axis === 'x' ? 'z' : 'x', dir: newDir, road: this.city.nearestRoad(alongNow), along: crossRoad };
          car.turnCooldown = 3.5;
        } else {
          car.turnCooldown = 1.5; // going straight: don't re-roll here
        }
      }
      // Drove off the edge: wrap onto a fresh leg, on the correct side.
      if (Math.abs(car.x) > CITY_HALF + 6 || Math.abs(car.z) > CITY_HALF + 6) {
        const leg2 = this.randomLeg();
        car.leg = leg2;
        car.turnCooldown = 0;
        car.x = leg2.axis === 'x' ? leg2.along : leg2.road + (leg2.dir > 0 ? -3.5 : 3.5);
        car.z = leg2.axis === 'z' ? leg2.along : leg2.road + (leg2.dir > 0 ? 3.5 : -3.5);
        car.heading = leg2.axis === 'x' ? (leg2.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (leg2.dir > 0 ? 0 : Math.PI);
        car.speed = car.cruise;
      }
    }
  }
}
