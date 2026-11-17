// Solmar Bay — the city itself: a sun-soaked coastal grid built procedurally from a
// seed. Ground texture (roads, lanes, crosswalks, beach, ocean) painted on one canvas,
// pastel art-deco buildings with canvas facades, palms, lamps and props, plus the
// collision boxes and the road graph the traffic and the missions drive on.
import * as THREE from 'three';
import { BEACH_Z, CAR_COLORS, CITY_HALF, OCEAN_Z, PITCH, ROAD_HALF, WALK_HALF } from './config.js';
import { chance, pick, randInt, randRange } from './rng.js';

const BLOCK = PITCH - 2 * WALK_HALF; // 36 m of buildable block

/** Facade palettes: sun-soaked pastels with darker trim. */
const FACADES = [
  { base: '#f2d8a7', trim: '#c98f4e', glass: '#7fb7d9' },
  { base: '#f7c6c6', trim: '#b06a6a', glass: '#8fc3e8' },
  { base: '#bfe3c6', trim: '#5f9e6e', glass: '#a8d4e6' },
  { base: '#cfd8f5', trim: '#6a7fc0', glass: '#9fd0e8' },
  { base: '#f9e29c', trim: '#c9a13b', glass: '#86c5dd' },
  { base: '#e8b4d9', trim: '#a85f96', glass: '#93c9e0' },
];

/** Paint one building facade (windows + trim) onto a small canvas. */
function makeFacadeTexture(rng, palette, floors, cols) {
  const w = 64 * cols;
  const h = 64 * floors;
  const c = document.createElement('canvas');
  c.width = Math.max(64, w);
  c.height = Math.max(64, h);
  const g = c.getContext('2d');
  g.fillStyle = palette.base;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = palette.trim;
  g.fillRect(0, 0, c.width, 6);
  g.fillRect(0, h - 8, c.width, 8);
  for (let f = 0; f < floors; f += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = 10 + col * 64;
      const y = 12 + f * 64;
      const lit = rng() < 0.28;
      g.fillStyle = lit ? '#ffe9a8' : palette.glass;
      g.fillRect(x, y, 40, 44);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(x, y + 20, 40, 3);
      g.fillStyle = palette.trim;
      g.fillRect(x - 3, y - 3, 46, 3);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Paint the whole ground: asphalt grid, lane dashes, crosswalks, sidewalks, beach. */
function makeGroundTexture(rng) {
  const S = 2048;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  const world = CITY_HALF * 2 + 60; // metres the texture spans
  const px = (m) => ((m + world / 2) / world) * S;
  const scale = S / world;

  // Base: warm sidewalk concrete.
  g.fillStyle = '#b8a88f';
  g.fillRect(0, 0, S, S);
  // Beach sand along the south edge.
  g.fillStyle = '#e8d29a';
  g.fillRect(0, px(BEACH_Z - 4), S, S - px(BEACH_Z - 4));
  // Ocean.
  const ocean = g.createLinearGradient(0, px(OCEAN_Z), 0, S);
  ocean.addColorStop(0, '#2fa8c9');
  ocean.addColorStop(1, '#0d6f9e');
  g.fillStyle = ocean;
  g.fillRect(0, px(OCEAN_Z), S, S - px(OCEAN_Z));
  // Foam line where the waves meet the sand.
  g.fillStyle = 'rgba(255,255,255,0.75)';
  for (let x = 0; x < S; x += 90) {
    g.beginPath();
    g.ellipse(x + rng() * 40, px(OCEAN_Z) + 4, 42, 5, 0, 0, Math.PI * 2);
    g.fill();
  }

  // Roads: asphalt strips on every grid line.
  g.fillStyle = '#3a3f46';
  const roads = [];
  for (let k = -3; k <= 3; k += 1) roads.push(k * PITCH);
  for (const r of roads) {
    g.fillRect(px(r - ROAD_HALF), 0, ROAD_HALF * 2 * scale, S);
    g.fillRect(0, px(r - ROAD_HALF), S, ROAD_HALF * 2 * scale);
  }
  // Sidewalk border lines.
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 2;
  for (const r of roads) {
    g.strokeRect(px(r - WALK_HALF), 0, WALK_HALF * 2 * scale, S);
    g.strokeRect(0, px(r - WALK_HALF), S, WALK_HALF * 2 * scale);
  }
  // Lane dashes down every road centre.
  g.fillStyle = '#e8d44d';
  for (const r of roads) {
    for (let d = -CITY_HALF; d < CITY_HALF; d += 8) {
      g.fillRect(px(r) - 1.5, px(d), 3, 4 * scale);
      g.fillRect(px(d), px(r) - 1.5, 4 * scale, 3);
    }
  }
  // Crosswalks at every intersection.
  g.fillStyle = 'rgba(255,255,255,0.85)';
  for (const rx of roads) {
    for (const rz of roads) {
      for (let i = -2; i <= 2; i += 1) {
        g.fillRect(px(rx + i * 2.4) - 3, px(rz - ROAD_HALF + 1), 6, (ROAD_HALF - 1) * scale);
        g.fillRect(px(rx + i * 2.4) - 3, px(rz + 1), 6, (ROAD_HALF - 1) * scale);
        g.fillRect(px(rx - ROAD_HALF + 1), px(rz + i * 2.4) - 3, (ROAD_HALF - 1) * scale, 6);
        g.fillRect(px(rx + 1), px(rz + i * 2.4) - 3, (ROAD_HALF - 1) * scale, 6);
      }
    }
  }
  // Block interiors: slightly varied concrete + a few plaza tiles. Blocks sit
  // BETWEEN the roads, centred on (bx + 0.5) * PITCH.
  for (let bx = -3; bx <= 2; bx += 1) {
    for (let bz = -3; bz <= 2; bz += 1) {
      const cx = (bx + 0.5) * PITCH;
      const cz = (bz + 0.5) * PITCH;
      g.fillStyle = `rgba(${120 + Math.floor(rng() * 40)},${105 + Math.floor(rng() * 30)},${80 + Math.floor(rng() * 25)},0.35)`;
      g.fillRect(px(cx - BLOCK / 2), px(cz - BLOCK / 2), BLOCK * scale, BLOCK * scale);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { tex, world };
}

/** One palm tree: trunk + a fan of fronds, cheap enough to instance by cloning. */
function makePalm() {
  const group = new THREE.Group();
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b46 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, 5.2, 6), trunkMat);
  trunk.position.y = 2.6;
  trunk.rotation.z = 0.08;
  group.add(trunk);
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x2f9e44, side: THREE.DoubleSide });
  for (let i = 0; i < 7; i += 1) {
    const frond = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 3.4), frondMat);
    const a = (i / 7) * Math.PI * 2;
    frond.position.set(Math.cos(a) * 1.1, 5.4, Math.sin(a) * 1.1);
    frond.rotation.set(Math.sin(a) * 0.9 - 0.5, 0, Math.cos(a) * 0.9 + 0.2);
    frond.rotation.y = -a;
    group.add(frond);
  }
  const coconuts = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 6, 5),
    new THREE.MeshLambertMaterial({ color: 0x6b4a1f }),
  );
  coconuts.position.y = 5.1;
  group.add(coconuts);
  return group;
}

/** A street lamp with a warm emissive head (unlit in daylight, glows at dusk). */
function makeLamp() {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.12, 6.4, 6),
    new THREE.MeshLambertMaterial({ color: 0x2c3e50 }),
  );
  pole.position.y = 3.2;
  group.add(pole);
  const arm = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.1, 0.1),
    new THREE.MeshLambertMaterial({ color: 0x2c3e50 }),
  );
  arm.position.set(0.7, 6.3, 0);
  group.add(arm);
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.18, 0.32),
    new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffdf8a, emissiveIntensity: 0.7 }),
  );
  head.position.set(1.4, 6.2, 0);
  group.add(head);
  return group;
}

export class City {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    /** { minX, maxX, minZ, maxZ } building + prop colliders. */
    this.colliders = [];
    /** Named places the missions and HUD use: { name, x, z, kind }. */
    this.places = {};
    /** Road centrelines, for traffic + minimap. */
    this.roads = [];
    for (let k = -3; k <= 3; k += 1) this.roads.push(k * PITCH);
    this.build();
  }

  build() {
    const { scene, rng } = this;
    const { tex, world } = makeGroundTexture(rng);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(world, world),
      new THREE.MeshLambertMaterial({ map: tex }),
    );
    ground.rotation.x = -Math.PI / 2;
    // Centred on the world origin: the ground texture is painted in world
    // coordinates, so any offset here shifts every painted road away from
    // where the game thinks it is (the old +12 m offset put the visual
    // asphalt 12 m south of the road the cars drive on).
    ground.position.z = 0;
    ground.receiveShadow = true;
    scene.add(ground);

    // Ocean plane beyond the beach, slightly animated in main.js via material offset.
    const ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 320),
      new THREE.MeshLambertMaterial({ color: 0x1b7fa8, transparent: true, opacity: 0.92 }),
    );
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(0, -0.15, OCEAN_Z + 150);
    scene.add(ocean);
    this.ocean = ocean;

    // Rico's yacht, anchored off the beach — the m6 rendezvous, visible
    // from the shore so the story's last meeting point reads on the skyline.
    const yacht = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(14, 2.2, 4.5), new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
    hull.position.y = 0.8;
    yacht.add(hull);
    const yachtCabin = new THREE.Mesh(new THREE.BoxGeometry(8, 2.4, 3.6), new THREE.MeshLambertMaterial({ color: 0x2c3e50 }));
    yachtCabin.position.y = 2.9;
    yacht.add(yachtCabin);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 9, 6), new THREE.MeshLambertMaterial({ color: 0x8a6b46 }));
    mast.position.y = 7;
    yacht.add(mast);
    yacht.position.set(48, 0, OCEAN_Z + 22);
    yacht.rotation.y = -0.5;
    scene.add(yacht);
    this.yacht = yacht;

    // Named places (missions, shops, safehouse). Markers sit just inside the block
    // corner beside their intersection, clear of the road so traffic flows past.
    // Defined BEFORE the buildings so no building is ever raised on a marker.
    const place = (name, x, z, kind) => {
      const ox = x >= 0 ? -14 : 14;
      const oz = z >= 0 ? -14 : 14;
      this.places[name] = { name, x: x + ox, z: z + oz, kind };
    };
    place('docks', -174, 174, 'start');
    place('paintShop', -116, -58, 'shop');
    place('gunShop', 58, -116, 'shop');
    place('fixer', 116, 58, 'shop');
    place('safehouse', 174, -174, 'safehouse');
    place('bank', 0, -58, 'bank');
    place('pizzaria', -58, 116, 'food');
    place('beach', 0, BEACH_Z + 8, 'beach');
    place('hospital', -58, -174, 'hospital');
    place('policeHQ', 174, 116, 'police');

    // Buildings: 1-3 per block, varied height and facade, rooftops with trim.
    // Blocks sit BETWEEN the roads, centred on (bx + 0.5) * PITCH — the old code
    // centred them on (bx * PITCH), i.e. on the intersections, so a building
    // stood in the middle of every crossroads and blocked every road.
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x5a5f6a });
    const trimMat = new THREE.MeshLambertMaterial({ color: 0x8a6d3b });
    for (let bx = -3; bx <= 2; bx += 1) {
      for (let bz = -3; bz <= 2; bz += 1) {
        const cx = (bx + 0.5) * PITCH;
        const cz = (bz + 0.5) * PITCH;
        const count = randInt(rng, 1, 3);
        const palette = pick(rng, FACADES);
        for (let i = 0; i < count; i += 1) {
          const w = randRange(rng, 12, 20);
          const d = randRange(rng, 12, 20);
          const floors = randInt(rng, 2, 9);
          const h = floors * 3.4 + 1.2;
          const ox = randRange(rng, -8, 8);
          const oz = randRange(rng, -8, 8);
          const x = cx + ox;
          const z = cz + oz;
          // Keep buildings inside the block so roads stay clear.
          if (Math.abs(ox) + w / 2 > BLOCK / 2 - 1 || Math.abs(oz) + d / 2 > BLOCK / 2 - 1) continue;
          // Never raise a building over a named place's beacon.
          let onPlace = false;
          for (const p of Object.values(this.places)) {
            if (Math.abs(x - p.x) < w / 2 + 3 && Math.abs(z - p.z) < d / 2 + 3) { onPlace = true; break; }
          }
          if (onPlace) continue;
          const texFacade = makeFacadeTexture(rng, palette, floors, Math.max(2, Math.round(w / 6)));
          const side = new THREE.MeshLambertMaterial({ map: texFacade });
          const top = new THREE.MeshLambertMaterial({ color: 0x6a6f7a });
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, top, roofMat, side, side]);
          mesh.position.set(x, h / 2, z);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          scene.add(mesh);
          const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6), trimMat);
          roof.position.set(x, h + 0.25, z);
          scene.add(roof);
          // Rooftop AC box on taller buildings.
          if (floors >= 5) {
            const ac = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 2.4), roofMat);
            ac.position.set(x + w / 5, h + 1, z - d / 5);
            scene.add(ac);
          }
          this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
        }
      }
    }

    // Palms along every sidewalk corner and down the beach boardwalk.
    const palm = makePalm();
    const palmSpots = [];
    for (const r of this.roads) {
      for (const s of this.roads) {
        if (chance(rng, 0.5)) palmSpots.push([r + WALK_HALF - 1.2, s + WALK_HALF - 1.2]);
        if (chance(rng, 0.35)) palmSpots.push([r - WALK_HALF + 1.2, s - WALK_HALF + 1.2]);
      }
    }
    for (let x = -CITY_HALF; x <= CITY_HALF; x += 18) palmSpots.push([x, BEACH_Z - 2]);
    for (const [x, z] of palmSpots) {
      const p = palm.clone();
      p.position.set(x, 0, z);
      p.rotation.y = rng() * Math.PI * 2;
      const s = randRange(rng, 0.85, 1.25);
      p.scale.setScalar(s);
      scene.add(p);
    }

    // Lamps at every other intersection (checkerboard). The old test used
    // (r + s) % 2 on road coordinates that are all multiples of 58, so it
    // was always 0 and a lamp landed on ALL 49 intersections.
    for (let ri = 0; ri < this.roads.length; ri += 1) {
      for (let si = 0; si < this.roads.length; si += 1) {
        if ((ri + si) % 2 !== 0) continue;
        const r = this.roads[ri];
        const s = this.roads[si];
        const lamp = makeLamp();
        lamp.position.set(r + ROAD_HALF + 1.4, 0, s + ROAD_HALF + 1.4);
        lamp.rotation.y = Math.PI;
        scene.add(lamp);
      }
    }

    // Signage: a coloured beacon pillar marks each named place from afar.
    const signColors = { shop: 0xffd21f, safehouse: 0x37d67a, bank: 0x9fd8ff, food: 0xff9d2e, beach: 0x2fa8c9, hospital: 0xffffff, police: 0x4d7cff, start: 0xff5f6d };
    for (const p of Object.values(this.places)) {
      const beacon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 16, 8),
        new THREE.MeshBasicMaterial({ color: signColors[p.kind] ?? 0xffffff, transparent: true, opacity: 0.28 }),
      );
      beacon.position.set(p.x, 8, p.z);
      scene.add(beacon);
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(3.4, 1.1, 3.4),
        new THREE.MeshLambertMaterial({ color: 0x2c3e50 }),
      );
      base.position.set(p.x, 0.55, p.z);
      base.castShadow = true;
      scene.add(base);
      this.colliders.push({ minX: p.x - 1.7, maxX: p.x + 1.7, minZ: p.z - 1.7, maxZ: p.z + 1.7 });
    }

    // A few parked benches + hydrants for street life.
    const benchMat = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
    for (let i = 0; i < 14; i += 1) {
      const r = pick(rng, this.roads);
      const s = pick(rng, this.roads);
      const bench = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.8), benchMat);
      bench.position.set(r + (rng() < 0.5 ? WALK_HALF - 1 : -WALK_HALF + 1), 0.45, s + randRange(rng, -20, 20));
      scene.add(bench);
    }
  }

  /** Is the point on a road (asphalt)? Used by traffic and the minimap. */
  onRoad(x, z) {
    for (const r of this.roads) {
      if (Math.abs(x - r) < ROAD_HALF || Math.abs(z - r) < ROAD_HALF) return true;
    }
    return false;
  }

  /** Nearest road centreline coordinate to a value (for snapping cars to lanes). */
  nearestRoad(v) {
    let best = this.roads[0];
    let bestD = Math.abs(v - best);
    for (const r of this.roads) {
      const d = Math.abs(v - r);
      if (d < bestD) { best = r; bestD = d; }
    }
    return best;
  }

  /** Push a circle (x, z, radius) out of every building collider it overlaps. */
  resolveCircle(pos, radius) {
    for (const c of this.colliders) {
      const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        if (d2 < 0.0001) {
          pos.x = c.maxX + radius;
          continue;
        }
        const d = Math.sqrt(d2);
        const push = (radius - d) / d;
        pos.x += dx * push;
        pos.z += dz * push;
      }
    }
  }

  /** True when a circle overlaps any building collider. */
  hitsBuilding(x, z, radius) {
    for (const c of this.colliders) {
      const cx = Math.max(c.minX, Math.min(x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < radius * radius) return true;
    }
    return false;
  }
}
