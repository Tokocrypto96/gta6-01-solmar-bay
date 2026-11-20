// Solmar Bay — the city (v2).
//
// A sun-soaked coastal grid dealt from a seed: a 7x7 street lattice with
// painted asphalt, a boardwalk, a beach and the ocean to the south. The v2
// pass is all about surface richness — buildings wear canvas-painted
// facades in three styles (art-deco pastel, glass tower, seafront motel)
// with lit windows, balconies, awnings and named shopfronts at street
// level; rooftops carry water towers, AC plant and the odd billboard; the
// beach gains umbrellas, a lifeguard tower and a pier. The collision boxes
// and the road graph the traffic drives on are unchanged in spirit: if it
// looks solid, it is solid.
import * as THREE from 'three';
import { BEACH_Z, CITY_HALF, OCEAN_Z, PITCH, ROAD_HALF, WALK_HALF } from './config.js';
import { chance, pick, randInt, randRange } from './rng.js';

const BLOCK = PITCH - 2 * WALK_HALF; // 36 m of buildable block between sidewalks

/* ------------------------------------------------------------------ */
/* Facades                                                             */
/* ------------------------------------------------------------------ */

/** Facade palettes: sun-soaked pastels with a darker trim and glass tone. */
const FACADES = [
  { base: '#f2d8a7', trim: '#c98f4e', glass: '#7fb7d9' },
  { base: '#f7c6c6', trim: '#b06a6a', glass: '#8fc3e8' },
  { base: '#bfe3c6', trim: '#5f9e6e', glass: '#a8d4e6' },
  { base: '#cfd8f5', trim: '#6a7fc0', glass: '#9fd0e8' },
  { base: '#f9e29c', trim: '#c9a13b', glass: '#86c5dd' },
  { base: '#e8b4d9', trim: '#a85f96', glass: '#93c9e0' },
  { base: '#fdeed3', trim: '#b08954', glass: '#7fb7d9' },
  { base: '#cfe8ef', trim: '#5f8e9e', glass: '#a8d4e6' },
];

/** Names painted over the shopfronts — the bay's little high street. */
const SHOP_NAMES = [
  'CAFÉ SOLMAR', 'HOTEL PALMA', 'PIZZA MIA', 'BANCO DEL SUR', 'BAR CORAL',
  'FARMACIA', 'TALLER RICO', 'HELADERÍA', 'CINE MAR', 'LIBROS', 'SURF SHOP',
  'PANADERÍA', 'JOYERÍA', 'FLORISTERÍA', 'TACOS EL FARO', 'VINOS MAR',
];

/** One window: frame, glass (lit warm at dusk or reflecting the sky), sill. */
function paintWindow(g, x, y, w, h, palette, rng, style) {
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.fillRect(x - 3, y - 3, w + 6, h + 6);
  const lit = rng() < (style === 'glass' ? 0.42 : 0.3);
  if (lit) {
    const grad = g.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, '#ffeeb0');
    grad.addColorStop(1, '#ffc46b');
    g.fillStyle = grad;
  } else {
    const grad = g.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, palette.glass);
    grad.addColorStop(0.55, '#5d87a8');
    grad.addColorStop(1, palette.glass);
    g.fillStyle = grad;
  }
  g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(x, y, w, 3);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(x + w / 2 - 1, y, 2, h);
  // A wall AC box hangs under some windows.
  if (rng() < 0.16) {
    g.fillStyle = '#9aa0a8';
    g.fillRect(x + w - 14, y + h + 4, 14, 9);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(x + w - 14, y + h + 7, 14, 2);
  }
}

/** The ground floor: shopfront glass, a striped awning and a named sign. */
function paintShopfront(g, width, height, palette, rng) {
  const bandH = Math.min(64, height * 0.22);
  const top = height - bandH;
  // Sign band with the shop's name.
  g.fillStyle = palette.trim;
  g.fillRect(0, top, width, 16);
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.font = 'bold 11px sans-serif';
  g.textAlign = 'center';
  g.fillText(pick(rng, SHOP_NAMES), width / 2, top + 12);
  // Glass storefront panes.
  g.fillStyle = '#37505f';
  g.fillRect(6, top + 20, width - 12, bandH - 24);
  g.fillStyle = 'rgba(160,220,255,0.5)';
  const panes = Math.max(2, Math.floor(width / 42));
  for (let i = 0; i < panes; i += 1) {
    const px = 10 + i * ((width - 20) / panes);
    g.fillRect(px, top + 24, (width - 20) / panes - 6, bandH - 32);
  }
  // Striped awning over the pavement.
  const awnY = top + 16;
  for (let x = 0; x < width; x += 12) {
    g.fillStyle = (x / 12) % 2 === 0 ? '#e4572e' : '#f7f3e8';
    g.beginPath();
    g.moveTo(x, awnY);
    g.lineTo(x + 12, awnY);
    g.lineTo(x + 9, awnY + 9);
    g.lineTo(x + 3, awnY + 9);
    g.closePath();
    g.fill();
  }
}

/**
 * Paint one building's facade onto a canvas. Three styles share the same
 * bones (cornice, window grid, ground floor) but dress differently:
 * 'deco' gets balconies and shutters, 'glass' is a full curtain wall,
 * 'motel' runs a railing along every floor.
 */
function makeFacadeTexture(rng, palette, floors, cols, style) {
  const cell = 46;
  const w = Math.max(64, cols * cell);
  const h = Math.max(64, floors * cell);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');

  // Wall: flat base for deco/motel, dark curtain for the glass towers.
  if (style === 'glass') {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#33566b');
    grad.addColorStop(1, '#22394c');
    g.fillStyle = grad;
  } else {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, palette.base);
    grad.addColorStop(1, shade(palette.base, -14));
    g.fillStyle = grad;
  }
  g.fillRect(0, 0, w, h);

  // Cornice and base trim.
  g.fillStyle = palette.trim;
  g.fillRect(0, 0, w, 7);
  g.fillRect(0, h - 6, w, 6);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(0, 7, w, 2);

  // Window grid, floor by floor (the top row of the canvas is the top floor).
  for (let f = 0; f < floors; f += 1) {
    const y = 14 + f * cell;
    if (style === 'motel') {
      // A railed walkway runs the width of every floor.
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.fillRect(0, y + cell - 12, w, 3);
      g.fillStyle = palette.trim;
      for (let x = 4; x < w; x += 10) g.fillRect(x, y + cell - 20, 2, 9);
      g.fillRect(0, y + cell - 21, w, 2);
    }
    for (let col = 0; col < cols; col += 1) {
      const x = 9 + col * cell;
      const isDoor = style === 'motel' && col % 2 === 1;
      if (isDoor) {
        g.fillStyle = palette.trim;
        g.fillRect(x + 4, y + 4, 20, cell - 14);
        g.fillStyle = 'rgba(255,255,255,0.5)';
        g.fillRect(x + 19, y + cell / 2, 3, 3);
      } else {
        paintWindow(g, x, y, 30, cell - 16, palette, rng, style);
        // Deco balconies: a slab and rails under the window.
        if (style === 'deco' && f > 0 && rng() < 0.4) {
          g.fillStyle = 'rgba(0,0,0,0.3)';
          g.fillRect(x - 4, y + cell - 14, 38, 3);
          g.fillStyle = palette.trim;
          for (let bx = x - 4; bx < x + 32; bx += 6) g.fillRect(bx, y + cell - 24, 2, 10);
        }
      }
    }
  }

  // Street level gets a shopfront on most buildings.
  if (rng() < 0.72) paintShopfront(g, w, h, palette, rng);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Darken/lighten a #rrggbb colour by amt (-100..100). */
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v) => Math.max(0, Math.min(255, v));
  const r = clamp((n >> 16) + amt);
  const gg = clamp(((n >> 8) & 0xff) + amt);
  const b = clamp((n & 0xff) + amt);
  return `rgb(${r},${gg},${b})`;
}

/* ------------------------------------------------------------------ */
/* Ground                                                              */
/* ------------------------------------------------------------------ */

/**
 * Paint the whole ground plane: warm concrete, the asphalt grid with lane
 * dashes and zebra crossings, plaza tiles in a few blocks, the wooden
 * boardwalk, the sand and the waterline foam.
 */
function makeGroundTexture(rng) {
  const S = 2048;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  const world = CITY_HALF * 2 + 60;
  const px = (m) => ((m + world / 2) / world) * S;
  const scale = S / world;

  // Warm sidewalk concrete, with a speckle of grunge so it is not a flat fill.
  g.fillStyle = '#b3a184';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i += 1) {
    g.fillStyle = `rgba(${90 + Math.floor(rng() * 60)},${75 + Math.floor(rng() * 45)},${50 + Math.floor(rng() * 30)},0.08)`;
    g.fillRect(rng() * S, rng() * S, 3 + rng() * 9, 3 + rng() * 9);
  }

  // Block interiors: varied concrete, and a chequered plaza in two blocks.
  for (let bx = -3; bx <= 2; bx += 1) {
    for (let bz = -3; bz <= 2; bz += 1) {
      const cx = (bx + 0.5) * PITCH;
      const cz = (bz + 0.5) * PITCH;
      const x0 = px(cx - BLOCK / 2);
      const y0 = px(cz - BLOCK / 2);
      const size = BLOCK * scale;
      g.fillStyle = `rgba(${118 + Math.floor(rng() * 42)},${103 + Math.floor(rng() * 30)},${78 + Math.floor(rng() * 26)},0.4)`;
      g.fillRect(x0, y0, size, size);
      if ((bx + bz) % 5 === 0) {
        const tile = size / 6;
        for (let tx = 0; tx < 6; tx += 1) {
          for (let tz = 0; tz < 6; tz += 1) {
            if ((tx + tz) % 2 === 0) continue;
            g.fillStyle = 'rgba(255,244,214,0.13)';
            g.fillRect(x0 + tx * tile, y0 + tz * tile, tile, tile);
          }
        }
      }
    }
  }

  // Sand, then the boardwalk planks along the promenade, then the sea.
  g.fillStyle = '#e6cf95';
  g.fillRect(0, px(BEACH_Z - 4), S, S - px(BEACH_Z - 4));
  for (let i = 0; i < 900; i += 1) {
    g.fillStyle = `rgba(160,130,70,${0.05 + rng() * 0.08})`;
    g.fillRect(rng() * S, px(BEACH_Z) + rng() * (S - px(BEACH_Z)), 2 + rng() * 5, 2 + rng() * 5);
  }
  const bwTop = px(BEACH_Z - 5);
  const bwH = 10 * scale;
  g.fillStyle = '#8a6b46';
  g.fillRect(0, bwTop, S, bwH);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  for (let x = 0; x < S; x += 14) g.fillRect(x, bwTop, 2, bwH);
  g.fillStyle = 'rgba(255,235,190,0.18)';
  g.fillRect(0, bwTop, S, 3);
  const ocean = g.createLinearGradient(0, px(OCEAN_Z), 0, S);
  ocean.addColorStop(0, '#35aed2');
  ocean.addColorStop(1, '#0d6f9e');
  g.fillStyle = ocean;
  g.fillRect(0, px(OCEAN_Z), S, S - px(OCEAN_Z));
  g.fillStyle = 'rgba(255,255,255,0.8)';
  for (let x = 0; x < S; x += 80) {
    g.beginPath();
    g.ellipse(x + rng() * 44, px(OCEAN_Z) + 4, 44, 5, 0, 0, Math.PI * 2);
    g.fill();
  }

  // Roads: asphalt strips on every grid line, each with its own tone.
  const roads = [];
  for (let k = -3; k <= 3; k += 1) roads.push(k * PITCH);
  for (const r of roads) {
    g.fillStyle = `rgb(${52 + Math.floor(rng() * 8)},${56 + Math.floor(rng() * 8)},${62 + Math.floor(rng() * 8)})`;
    g.fillRect(px(r - ROAD_HALF), 0, ROAD_HALF * 2 * scale, px(BEACH_Z - 5));
    g.fillRect(0, px(r - ROAD_HALF), S, ROAD_HALF * 2 * scale);
  }
  // Sidewalk edges.
  g.strokeStyle = 'rgba(0,0,0,0.28)';
  g.lineWidth = 2;
  for (const r of roads) {
    g.strokeRect(px(r - WALK_HALF), 0, WALK_HALF * 2 * scale, S);
    g.strokeRect(0, px(r - WALK_HALF), S, WALK_HALF * 2 * scale);
  }
  // Centre dashes.
  g.fillStyle = '#e8d44d';
  for (const r of roads) {
    for (let d = -CITY_HALF; d < CITY_HALF; d += 8) {
      g.fillRect(px(r) - 1.5, px(d), 3, 4 * scale);
      g.fillRect(px(d), px(r) - 1.5, 4 * scale, 3);
    }
  }
  // Zebra crossings on all four arms of every intersection.
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
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { tex, world };
}

/* ------------------------------------------------------------------ */
/* Street furniture                                                    */
/* ------------------------------------------------------------------ */

/** A palm: a gently leaning trunk in two segments and two rings of fronds. */
function makePalm(rng) {
  const group = new THREE.Group();
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b46 });
  const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.36, 3.1, 6), trunkMat);
  lower.position.y = 1.55;
  lower.rotation.z = 0.05;
  group.add(lower);
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 2.6, 6), trunkMat);
  upper.position.set(0.22, 4.2, 0);
  upper.rotation.z = 0.14;
  group.add(upper);
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x2f9e44, side: THREE.DoubleSide });
  const frondMatDry = new THREE.MeshLambertMaterial({ color: 0x77a83c, side: THREE.DoubleSide });
  for (let ring = 0; ring < 2; ring += 1) {
    const n = ring === 0 ? 7 : 5;
    for (let i = 0; i < n; i += 1) {
      const frond = new THREE.Mesh(
        new THREE.PlaneGeometry(0.85, ring === 0 ? 3.5 : 2.6),
        ring === 0 ? frondMat : frondMatDry,
      );
      const a = ((i + ring * 0.5) / n) * Math.PI * 2;
      frond.position.set(0.4 + Math.cos(a) * 1.05, 5.55 - ring * 0.28, Math.sin(a) * 1.05);
      frond.rotation.set(Math.sin(a) * 0.95 - 0.55, -a, Math.cos(a) * 0.95 + 0.2);
      group.add(frond);
    }
  }
  const nutMat = new THREE.MeshLambertMaterial({ color: 0x6b4a1f });
  for (let i = 0; i < 3; i += 1) {
    const nut = new THREE.Mesh(new THREE.SphereGeometry(0.24, 6, 5), nutMat);
    nut.position.set(0.4 + Math.cos(i * 2.1) * 0.3, 5.25, Math.sin(i * 2.1) * 0.3);
    group.add(nut);
  }
  void rng;
  return group;
}

/** A street lamp: pole, curved arm and a warm head that glows at dusk. */
function makeLamp() {
  const group = new THREE.Group();
  const ironMat = new THREE.MeshLambertMaterial({ color: 0x27313d });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 6.4, 6), ironMat);
  pole.position.y = 3.2;
  pole.castShadow = true;
  group.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 0.1), ironMat);
  arm.position.set(0.75, 6.32, 0);
  group.add(arm);
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 0.16, 0.34),
    new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffc46b, emissiveIntensity: 0.9 }),
  );
  head.position.set(1.5, 6.22, 0);
  group.add(head);
  return group;
}

/** A beach umbrella: striped cone canopy on a tilted pole. */
function makeUmbrella(rng) {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 2.6, 5),
    new THREE.MeshLambertMaterial({ color: 0xd8d3c3 }),
  );
  pole.position.y = 1.3;
  pole.rotation.z = 0.12;
  group.add(pole);
  const colors = [0xe4572e, 0x2fa8c9, 0xf2c14e, 0xef6f9c, 0x37d67a];
  const canopy = new THREE.Mesh(
    new THREE.ConeGeometry(1.9, 0.7, 8),
    new THREE.MeshLambertMaterial({ color: pick(rng, colors) }),
  );
  canopy.position.set(0.3, 2.6, 0);
  canopy.castShadow = true;
  group.add(canopy);
  return group;
}

/* ------------------------------------------------------------------ */
/* The city                                                            */
/* ------------------------------------------------------------------ */

export class City {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    /** Building + prop colliders: { minX, maxX, minZ, maxZ }. */
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
    // The ground texture is painted in world coordinates and the plane is
    // centred on the origin: any offset would shift every painted road
    // away from the road the game logic drives on.
    ground.position.z = 0;
    ground.receiveShadow = true;
    scene.add(ground);

    // The open water beyond the painted shoreline, bobbing in main.js.
    const ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 320),
      new THREE.MeshLambertMaterial({ color: 0x1b7fa8, transparent: true, opacity: 0.92 }),
    );
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(0, -0.15, OCEAN_Z + 150);
    scene.add(ocean);
    this.ocean = ocean;

    this.buildYacht();
    this.definePlaces();
    this.buildBlocks();
    this.buildPalms();
    this.buildLamps();
    this.buildSignage();
    this.buildBeach();
    this.buildPier();
    this.buildStreetProps();
  }

  /** Rico's yacht at anchor — the m6 rendezvous, visible from the shore. */
  buildYacht() {
    const { scene } = this;
    const yacht = new THREE.Group();
    const hullMat = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(14, 2.2, 4.5), hullMat);
    hull.position.y = 0.8;
    yacht.add(hull);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(14.1, 0.5, 4.6), new THREE.MeshLambertMaterial({ color: 0xe4572e }));
    stripe.position.y = 1.5;
    yacht.add(stripe);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(8, 2.4, 3.6), new THREE.MeshLambertMaterial({ color: 0x2c3e50 }));
    cabin.position.y = 2.9;
    yacht.add(cabin);
    const fly = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.4, 3), hullMat);
    fly.position.y = 4.7;
    yacht.add(fly);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 9, 6), new THREE.MeshLambertMaterial({ color: 0x8a6b46 }));
    mast.position.y = 7;
    yacht.add(mast);
    yacht.position.set(48, 0, OCEAN_Z + 22);
    yacht.rotation.y = -0.5;
    scene.add(yacht);
    this.yacht = yacht;
  }

  /**
   * Named places, defined before the buildings so no tower is ever raised
   * on a beacon. Markers sit just inside the block corner beside their
   * intersection, clear of the road so traffic flows past.
   */
  definePlaces() {
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
  }

  /** True when a footprint would swallow a named place's beacon. */
  coversPlace(x, z, w, d) {
    for (const p of Object.values(this.places)) {
      if (Math.abs(x - p.x) < w / 2 + 3 && Math.abs(z - p.z) < d / 2 + 3) return true;
    }
    return false;
  }

  /**
   * The towers: 1-3 per block, in the blocks BETWEEN the roads (centred on
   * (bx + 0.5) * PITCH — centring them on the intersections, as an earlier
   * build did, parked a building in the middle of every crossroads).
   * Each gets a painted facade, a parapet, and rooftop furniture on the
   * tall ones: AC plant, water towers, and billboards on a lucky few.
   */
  buildBlocks() {
    const { scene, rng } = this;
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x596068 });
    for (let bx = -3; bx <= 2; bx += 1) {
      for (let bz = -3; bz <= 2; bz += 1) {
        const cx = (bx + 0.5) * PITCH;
        const cz = (bz + 0.5) * PITCH;
        const count = randInt(rng, 1, 3);
        const palette = pick(rng, FACADES);
        for (let i = 0; i < count; i += 1) {
          const w = randRange(rng, 12, 20);
          const d = randRange(rng, 12, 20);
          const floors = randInt(rng, 2, 10);
          const h = floors * 3.4 + 1.2;
          const ox = randRange(rng, -8, 8);
          const oz = randRange(rng, -8, 8);
          const x = cx + ox;
          const z = cz + oz;
          if (Math.abs(ox) + w / 2 > BLOCK / 2 - 1 || Math.abs(oz) + d / 2 > BLOCK / 2 - 1) continue;
          if (this.coversPlace(x, z, w, d)) continue;
          const roll = rng();
          const style = roll < 0.45 ? 'deco' : roll < 0.72 ? 'motel' : 'glass';
          const texFacade = makeFacadeTexture(rng, palette, floors, Math.max(2, Math.round(w / 6)), style);
          const side = new THREE.MeshLambertMaterial({ map: texFacade });
          const top = new THREE.MeshLambertMaterial({ color: 0x646a75 });
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, top, roofMat, side, side]);
          mesh.position.set(x, h / 2, z);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          scene.add(mesh);
          // Parapet lip in the facade's trim colour.
          const trimMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(palette.trim) });
          const parapet = new THREE.Mesh(new THREE.BoxGeometry(w + 0.7, 0.55, d + 0.7), trimMat);
          parapet.position.set(x, h + 0.27, z);
          scene.add(parapet);
          if (floors >= 4) this.buildRooftop(x, z, w, d, h, roofMat);
          this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
        }
      }
    }
  }

  /** Rooftop furniture: AC plant always, sometimes a water tower or a billboard. */
  buildRooftop(x, z, w, d, h, roofMat) {
    const { scene, rng } = this;
    const ac = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 2.4), roofMat);
    ac.position.set(x + w / 5, h + 1, z - d / 5);
    ac.castShadow = true;
    scene.add(ac);
    const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.3, 8), roofMat);
    vent.position.set(x - w / 4, h + 0.9, z + d / 4);
    scene.add(vent);
    const roll = rng();
    if (roll < 0.3) {
      // Water tower: legs, tank and a cone cap.
      const tower = new THREE.Group();
      const legMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
      for (const [lx, lz] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 5), legMat);
        leg.position.set(lx, 1.3, lz);
        tower.add(leg);
      }
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 2.8, 10), new THREE.MeshLambertMaterial({ color: 0x9a6a42 }));
      tank.position.y = 4;
      tank.castShadow = true;
      tower.add(tank);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(1.95, 1.1, 10), new THREE.MeshLambertMaterial({ color: 0x5d4028 }));
      cap.position.y = 5.95;
      tower.add(cap);
      tower.position.set(x - w / 5, h + 0.5, z - d / 6);
      scene.add(tower);
    } else if (roll < 0.52) {
      // Billboard facing a random street, painted on canvas.
      const texts = ['SOLMAR BAY', 'VIVE LA BAHÍA', 'CAFÉ SOLMAR', 'HOTEL PALMA', 'RADIO MAR FM'];
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 96;
      const g = c.getContext('2d');
      g.fillStyle = '#1d2a3d';
      g.fillRect(0, 0, 256, 96);
      g.strokeStyle = '#ffd21f';
      g.lineWidth = 5;
      g.strokeRect(5, 5, 246, 86);
      g.fillStyle = '#ffd21f';
      g.font = 'bold 30px sans-serif';
      g.textAlign = 'center';
      g.fillText(pick(rng, texts), 128, 60);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(7.5, 2.8, 0.3),
        new THREE.MeshLambertMaterial({ map: tex }),
      );
      board.position.set(x, h + 2.6, z);
      board.rotation.y = pick(rng, [0, Math.PI / 2, Math.PI, -Math.PI / 2]);
      board.castShadow = true;
      scene.add(board);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.4, 0.4), roofMat);
      post.position.set(x, h + 1.2, z);
      scene.add(post);
    }
  }

  /**
   * Palms everywhere the pavement allows: intersection corners, mid-block
   * sidewalk spots, a double row along the boardwalk and a loose grove on
   * the sand itself.
   */
  buildPalms() {
    const { scene, rng } = this;
    const palm = makePalm(rng);
    const spots = [];
    for (const r of this.roads) {
      for (const s of this.roads) {
        if (chance(rng, 0.55)) spots.push([r + WALK_HALF - 1.2, s + WALK_HALF - 1.2]);
        if (chance(rng, 0.4)) spots.push([r - WALK_HALF + 1.2, s - WALK_HALF + 1.2]);
        if (chance(rng, 0.3)) spots.push([r + WALK_HALF - 1.2, s - WALK_HALF + 1.2]);
      }
      // Mid-block palms between intersections.
      for (let m = -2; m <= 2; m += 1) {
        if (chance(rng, 0.4)) spots.push([r + WALK_HALF - 1.2, m * PITCH + 29]);
        if (chance(rng, 0.4)) spots.push([m * PITCH + 29, r - WALK_HALF + 1.2]);
      }
    }
    for (let x = -CITY_HALF; x <= CITY_HALF; x += 15) {
      spots.push([x, BEACH_Z - 2]);
      if (chance(rng, 0.6)) spots.push([x + 7, BEACH_Z + 9]);
    }
    for (let i = 0; i < 10; i += 1) spots.push([randRange(rng, -CITY_HALF, CITY_HALF), randRange(rng, BEACH_Z + 12, OCEAN_Z - 6)]);
    for (const [x, z] of spots) {
      const p = palm.clone();
      p.position.set(x, 0, z);
      p.rotation.y = rng() * Math.PI * 2;
      p.scale.setScalar(randRange(rng, 0.85, 1.3));
      scene.add(p);
    }
  }

  /**
   * Lamps on a checkerboard of intersections plus mid-block lamps down the
   * long avenues. (The checkerboard indexes the roads by position in the
   * array — testing (r + s) % 2 on coordinates that are all multiples of
   * 58 is always 0 and lit every corner at once.)
   */
  buildLamps() {
    const { scene } = this;
    for (let ri = 0; ri < this.roads.length; ri += 1) {
      for (let si = 0; si < this.roads.length; si += 1) {
        if ((ri + si) % 2 === 0) {
          const lamp = makeLamp();
          lamp.position.set(this.roads[ri] + ROAD_HALF + 1.4, 0, this.roads[si] + ROAD_HALF + 1.4);
          lamp.rotation.y = Math.PI;
          scene.add(lamp);
        }
        // Mid-block lamp halfway to the next intersection.
        if (si < this.roads.length - 1 && ri % 2 === 0) {
          const lamp = makeLamp();
          lamp.position.set(this.roads[ri] - ROAD_HALF - 1.4, 0, this.roads[si] + PITCH / 2);
          lamp.rotation.y = 0;
          scene.add(lamp);
        }
      }
    }
  }

  /** A glowing beacon pillar + plinth marks each named place from afar. */
  buildSignage() {
    const { scene } = this;
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
  }

  /**
   * The beach dressed for the evening: umbrella + towel pairs scattered on
   * the sand and a lifeguard tower watching the water.
   */
  buildBeach() {
    const { scene, rng } = this;
    const towelColors = [0xef6f9c, 0x2fa8c9, 0xf2c14e, 0x37d67a, 0xe4572e, 0xecf0f1];
    for (let i = 0; i < 16; i += 1) {
      const x = randRange(rng, -CITY_HALF + 8, CITY_HALF - 8);
      const z = randRange(rng, BEACH_Z + 8, OCEAN_Z - 5);
      const umb = makeUmbrella(rng);
      umb.position.set(x, 0, z);
      umb.rotation.y = rng() * Math.PI * 2;
      scene.add(umb);
      const towel = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 0.06, 2.1),
        new THREE.MeshLambertMaterial({ color: pick(rng, towelColors) }),
      );
      towel.position.set(x + randRange(rng, -1.6, 1.6), 0.05, z + randRange(rng, 1, 2.2));
      towel.rotation.y = rng() * Math.PI;
      scene.add(towel);
    }
    // Lifeguard tower: four legs, a cabin, a pitched roof and a ramp.
    const tower = new THREE.Group();
    const woodMat = new THREE.MeshLambertMaterial({ color: 0xd8d3c3 });
    for (const [lx, lz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 3.4, 6), woodMat);
      leg.position.set(lx, 1.7, lz);
      tower.add(leg);
    }
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2, 3), new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
    cabin.position.y = 4.3;
    cabin.castShadow = true;
    tower.add(cabin);
    const band = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.5, 3.1), new THREE.MeshLambertMaterial({ color: 0xe4572e }));
    band.position.y = 4.9;
    tower.add(band);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.9, 1.1, 4), new THREE.MeshLambertMaterial({ color: 0xc0392b }));
    roof.position.y = 5.85;
    roof.rotation.y = Math.PI / 4;
    tower.add(roof);
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 5.4), woodMat);
    ramp.position.set(0, 1.8, -3.4);
    ramp.rotation.x = 0.62;
    tower.add(ramp);
    tower.position.set(-26, 0, BEACH_Z + 13);
    tower.rotation.y = Math.PI; // face the water
    scene.add(tower);
    this.colliders.push({ minX: -27.6, maxX: -24.4, minZ: BEACH_Z + 11.4, maxZ: BEACH_Z + 14.6 });
  }

  /** A wooden pier reaching into the bay, with posts, lamps and a bait hut. */
  buildPier() {
    const { scene, rng } = this;
    const pier = new THREE.Group();
    const deckMat = new THREE.MeshLambertMaterial({ color: 0x8a6b46 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(5, 0.5, 46), deckMat);
    deck.position.set(0, 1.1, 23);
    pier.add(deck);
    const postMat = new THREE.MeshLambertMaterial({ color: 0x5d4028 });
    for (let z = 2; z <= 44; z += 6) {
      for (const sx of [-2.1, 2.1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.6, 6), postMat);
        post.position.set(sx, 0, z);
        pier.add(post);
      }
    }
    for (let z = 6; z <= 42; z += 12) {
      const lamp = makeLamp();
      lamp.position.set(2.2, 1.35, z);
      lamp.scale.setScalar(0.8);
      pier.add(lamp);
    }
    const hut = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.4, 3.2), new THREE.MeshLambertMaterial({ color: 0x7fb7d9 }));
    hut.position.set(0, 2.6, 43);
    hut.castShadow = true;
    pier.add(hut);
    const hutRoof = new THREE.Mesh(new THREE.ConeGeometry(3, 1, 4), new THREE.MeshLambertMaterial({ color: 0xc0392b }));
    hutRoof.position.set(0, 4.3, 43);
    hutRoof.rotation.y = Math.PI / 4;
    pier.add(hutRoof);
    pier.position.set(64, 0, OCEAN_Z - 2);
    scene.add(pier);
    void rng;
  }

  /** Benches, hydrants, bins and planters — the small clutter of a lived-in street. */
  buildStreetProps() {
    const { scene, rng } = this;
    const benchMat = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
    const ironMat = new THREE.MeshLambertMaterial({ color: 0x27313d });
    for (let i = 0; i < 20; i += 1) {
      const r = pick(rng, this.roads);
      const s = pick(rng, this.roads);
      const bench = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.8), benchMat);
      bench.position.set(r + (rng() < 0.5 ? WALK_HALF - 1 : -WALK_HALF + 1), 0.45, s + randRange(rng, -20, 20));
      bench.castShadow = true;
      scene.add(bench);
    }
    const hydrantMat = new THREE.MeshLambertMaterial({ color: 0xd23b2e });
    for (let i = 0; i < 16; i += 1) {
      const r = pick(rng, this.roads);
      const s = randRange(rng, -CITY_HALF, CITY_HALF);
      const hydrant = new THREE.Group();
      const bodyH = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.75, 7), hydrantMat);
      bodyH.position.y = 0.38;
      hydrant.add(bodyH);
      const capH = new THREE.Mesh(new THREE.SphereGeometry(0.2, 7, 6), hydrantMat);
      capH.position.y = 0.8;
      hydrant.add(capH);
      hydrant.position.set(r + (rng() < 0.5 ? WALK_HALF - 0.8 : -WALK_HALF + 0.8), 0, s);
      scene.add(hydrant);
    }
    for (let i = 0; i < 18; i += 1) {
      const r = pick(rng, this.roads);
      const s = pick(rng, this.roads);
      const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.95, 8), ironMat);
      bin.position.set(r + (rng() < 0.5 ? ROAD_HALF + 1 : -ROAD_HALF - 1), 0.48, s + randRange(rng, -16, 16));
      scene.add(bin);
    }
    const planterMat = new THREE.MeshLambertMaterial({ color: 0xa85f96 });
    const bushMat = new THREE.MeshLambertMaterial({ color: 0x2f9e44 });
    for (let i = 0; i < 12; i += 1) {
      const r = pick(rng, this.roads);
      const s = pick(rng, this.roads);
      const planter = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 1.7), planterMat);
      box.position.y = 0.28;
      planter.add(box);
      const bush = new THREE.Mesh(new THREE.SphereGeometry(0.85, 8, 6), bushMat);
      bush.position.y = 0.95;
      bush.castShadow = true;
      planter.add(bush);
      planter.position.set(r + (rng() < 0.5 ? WALK_HALF - 1.4 : -WALK_HALF + 1.4), 0, s + randRange(rng, -18, 18));
      scene.add(planter);
    }
  }

  /** Is the point on a road (asphalt)? Used by traffic and the minimap. */
  onRoad(x, z) {
    for (const r of this.roads) {
      if (Math.abs(x - r) < ROAD_HALF || Math.abs(z - r) < ROAD_HALF) return true;
    }
    return false;
  }

  /** Nearest road centreline coordinate to a value (snaps cars to lanes). */
  nearestRoad(v) {
    let best = this.roads[0];
    let bestD = Math.abs(v - best);
    for (const r of this.roads) {
      const d = Math.abs(v - r);
      if (d < bestD) { best = r; bestD = d; }
    }
    return best;
  }

  /** Push a circle (x, z, radius) out of every collider it overlaps. */
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

  /** True when a circle overlaps any collider. */
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
