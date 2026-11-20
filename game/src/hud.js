// Solmar Bay — the HUD (v2).
//
// Everything the player reads at a glance. v1 had cash, stars, health, one
// objective line, a speedometer and the minimap; v2 adds the furniture a
// GTA HUD is expected to have: a mission tracker listing every step of
// the current job, a rank / RP bar that climbs with lifetime earnings, a
// district + radio readout, and a side panel for the car or weapon in
// hand. The minimap's static layer (blocks, roads, beach, pier) is now
// painted once onto an offscreen canvas and blitted each frame, so the
// per-frame cost is only the moving dots.
import { CITY_HALF, PITCH } from './config.js';

/** District names by city quadrant — the area readout under the minimap. */
export function districtFor(x, z) {
  if (z > 178) return 'Kumala Strand';
  if (x < -118 && z > 118) return 'Port of Solmar';
  if (x > 118 && z > 118) return 'East Marina';
  if (x < -118 && z < -118) return 'North Palms';
  if (x > 118 && z < -118) return 'Solmar Heights';
  if (Math.abs(x) < 66 && Math.abs(z) < 66) return 'Downtown';
  if (z > 60) return 'South Solmar';
  if (z < -60) return 'Uptown';
  return 'Midtown';
}

/** The stations Jay's stolen radios are somehow always tuned to. */
const RADIO_STATIONS = ['Radio Mar FM', 'Vice Waves 98.4', 'Bahía Beats', 'K-SOL 104.1', 'Palma Oldies'];

export class Hud {
  constructor() {
    this.root = document.getElementById('hud');
    this.cashEl = document.getElementById('cash');
    this.cashSubEl = document.getElementById('cashSub');
    this.healthFill = document.getElementById('healthfill');
    this.healthBar = document.getElementById('healthbar');
    this.objTitle = document.getElementById('objTitle');
    this.objText = document.getElementById('objText');
    this.speedo = document.getElementById('speedo');
    this.speedNum = document.getElementById('speedNum');
    this.carName = document.getElementById('carName');
    this.crosshair = document.getElementById('crosshair');
    this.hintEl = document.getElementById('hint');
    this.toastEl = document.getElementById('toast');
    this.feedEl = document.getElementById('feed');
    this.damageEl = document.getElementById('damage');
    this.stars = [...document.querySelectorAll('#wanted .star')];
    this.map = document.getElementById('minimap');
    this.mapCtx = this.map.getContext('2d');
    this.staticMap = null; // offscreen canvas with the unmoving map layer
    // v2 panels.
    this.trackerEl = document.getElementById('tracker');
    this.trackerTitle = document.getElementById('trackerTitle');
    this.trackerList = document.getElementById('trackerList');
    this.trackerReward = document.getElementById('trackerReward');
    this.trackerKey = ''; // last rendered tracker, to avoid DOM churn
    this.rankName = document.getElementById('rankName');
    this.rankFill = document.getElementById('rankFill');
    this.rankNext = document.getElementById('rankNext');
    this.areaName = document.getElementById('areaName');
    this.areaSub = document.getElementById('areaSub');
    this.sidePanel = document.getElementById('sidepanel');
    this.sideTitle = document.getElementById('sideTitle');
    this.sideText = document.getElementById('sideText');
    this.toastTimer = 0;
    this.hidden = false;
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  toggleHidden() {
    this.hidden = !this.hidden;
    this.root.style.visibility = this.hidden ? 'hidden' : 'visible';
  }

  setCash(cash, sub = '') {
    this.cashEl.textContent = `$${Math.floor(cash).toLocaleString('en-US')}`;
    this.cashSubEl.textContent = sub;
  }

  setHealth(health, max) {
    const pct = Math.max(0, Math.min(100, (health / max) * 100));
    this.healthFill.style.width = `${pct}%`;
    this.healthBar.classList.toggle('low', pct < 30);
  }

  setWanted(stars) {
    this.stars.forEach((el, i) => {
      const lit = i < stars;
      el.classList.toggle('lit', lit);
      el.classList.toggle('hot', lit && stars >= 3);
    });
  }

  setObjective(title, text, dist) {
    this.objTitle.textContent = title;
    this.objText.innerHTML = dist != null ? `${text} <span class="dist">${Math.round(dist)}m</span>` : text;
  }

  /**
   * The mission tracker: the whole job as a checklist. `states` comes
   * from Missions.stepStates(); the panel hides itself when there is no
   * job to track. Rebuilt only when the checklist actually changes.
   */
  setTracker(title, reward, states) {
    const key = `${title}|${reward}|${states.map((s) => s.state[0]).join('')}`;
    if (key === this.trackerKey) return;
    this.trackerKey = key;
    if (!states.length) {
      this.trackerEl.classList.add('hidden');
      return;
    }
    this.trackerEl.classList.remove('hidden');
    this.trackerTitle.textContent = title;
    this.trackerReward.textContent = reward ? `REWARD $${reward}` : '';
    this.trackerList.innerHTML = '';
    for (const s of states) {
      const li = document.createElement('li');
      li.className = s.state;
      const mark = document.createElement('span');
      mark.className = 'mark';
      mark.textContent = s.state === 'done' ? '✓' : s.state === 'current' ? '▸' : '·';
      const label = document.createElement('span');
      label.textContent = s.text;
      li.append(mark, label);
      this.trackerList.appendChild(li);
    }
  }

  /** The rank bar: current rank, progress through it, and what's next. */
  setRank(info) {
    this.rankName.textContent = `RANK ${info.level} · ${info.name.toUpperCase()}`;
    this.rankFill.style.width = `${Math.round(info.progress * 100)}%`;
    this.rankNext.textContent = info.next ? `${info.into}/${info.span} RP → ${info.next}` : 'MAX RANK';
  }

  /** District readout (+ the radio station while driving). */
  setArea(name, sub = '') {
    this.areaName.textContent = name;
    this.areaSub.textContent = sub;
  }

  /** The side panel: car facts while driving, weapon facts on foot. */
  setSidePanel(title, text) {
    if (!title) {
      this.sidePanel.classList.add('hidden');
      return;
    }
    this.sidePanel.classList.remove('hidden');
    this.sideTitle.textContent = title;
    this.sideText.textContent = text;
  }

  /** Which station a car is tuned to — stable per car name, so it feels real. */
  stationFor(carName) {
    let h = 0;
    for (let i = 0; i < carName.length; i += 1) h = (h * 31 + carName.charCodeAt(i)) >>> 0;
    return RADIO_STATIONS[h % RADIO_STATIONS.length];
  }

  setDriving(car) {
    if (!car) {
      this.speedo.classList.add('hidden');
      return;
    }
    this.speedo.classList.remove('hidden');
    this.speedNum.textContent = Math.round(Math.abs(car.speed) * 3.6);
    this.carName.textContent = car.name;
  }

  setArmed(armed) {
    this.crosshair.classList.toggle('hidden', !armed);
  }

  setHint(text) {
    this.hintEl.textContent = text || '';
  }

  toast(title, sub = '') {
    this.toastEl.innerHTML = `${title}${sub ? `<span class="sub">${sub}</span>` : ''}`;
    this.toastTimer = 3.2;
  }

  feed(text) {
    const div = document.createElement('div');
    div.textContent = text;
    this.feedEl.prepend(div);
    while (this.feedEl.children.length > 4) this.feedEl.removeChild(this.feedEl.lastChild);
    setTimeout(() => div.remove(), 9000);
  }

  flashDamage() {
    this.damageEl.style.opacity = '1';
    setTimeout(() => { this.damageEl.style.opacity = '0'; }, 140);
  }

  update(dt) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.innerHTML = '';
    }
  }

  /* ---------------- minimap ---------------- */

  /** Paint the unmoving layer once: water, sand, blocks, roads, the pier. */
  buildStaticMap(G) {
    const S = 208;
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const ctx = c.getContext('2d');
    const range = CITY_HALF + 34;
    const toMap = (x, z) => [S / 2 + (x / range) * (S / 2), S / 2 + (z / range) * (S / 2)];
    ctx.fillStyle = '#131f36';
    ctx.fillRect(0, 0, S, S);
    // Beach and ocean at the south edge.
    const [, beachY] = toMap(0, 191);
    ctx.fillStyle = '#c9ad6d';
    ctx.fillRect(0, beachY, S, S - beachY);
    const grad = ctx.createLinearGradient(0, beachY + 12, 0, S);
    grad.addColorStop(0, '#2b93b8');
    grad.addColorStop(1, '#14597a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, beachY + 14, S, S - beachY - 14);
    // The pier: a pale line reaching into the water.
    const [pierX] = toMap(64, 0);
    ctx.strokeStyle = 'rgba(230,220,190,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pierX, beachY + 12);
    ctx.lineTo(pierX, beachY + 34);
    ctx.stroke();
    // Blocks, each with its own slight shade so the grid reads as a city.
    for (let bx = -3; bx <= 2; bx += 1) {
      for (let bz = -3; bz <= 2; bz += 1) {
        const shade = 38 + ((bx * 7 + bz * 13 + 60) % 5) * 4;
        ctx.fillStyle = `rgb(${shade - 8},${shade + 4},${shade + 22})`;
        const [x, z] = toMap((bx + 0.5) * PITCH - 17, (bz + 0.5) * PITCH - 17);
        const w = (34 / range) * (S / 2);
        ctx.fillRect(x, z, w, w);
      }
    }
    // Roads.
    ctx.strokeStyle = '#5a6b8a';
    ctx.lineWidth = 7;
    for (let k = -3; k <= 3; k += 1) {
      const [x1] = toMap(k * PITCH, 0);
      ctx.beginPath(); ctx.moveTo(x1, 0); ctx.lineTo(x1, S); ctx.stroke();
      const [, z1] = toMap(0, k * PITCH);
      ctx.beginPath(); ctx.moveTo(0, z1); ctx.lineTo(S, z1); ctx.stroke();
    }
    // Named places as coloured dots.
    for (const p of Object.values(G.city.places)) {
      const [x, z] = toMap(p.x, p.z);
      ctx.fillStyle = p.kind === 'safehouse' ? '#37d67a' : p.kind === 'police' ? '#4d7cff' : '#ffd21f';
      ctx.beginPath(); ctx.arc(x, z, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    this.staticMap = c;
  }

  /** Draw the minimap: static layer, then shells, marker, cars, cops, player. */
  drawMinimap(G) {
    if (!this.staticMap) this.buildStaticMap(G);
    const ctx = this.mapCtx;
    const S = 208;
    const range = CITY_HALF + 34;
    const toMap = (x, z) => [S / 2 + (x / range) * (S / 2), S / 2 + (z / range) * (S / 2)];
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(this.staticMap, 0, 0);
    // Shells: tiny gold dots.
    ctx.fillStyle = '#ffd21f';
    for (const item of G.shells.items) {
      if (item.taken) continue;
      const [x, z] = toMap(item.x, item.z);
      ctx.fillRect(x - 1, z - 1, 2, 2);
    }
    // Mission marker: a pulsing diamond.
    const obj = G.missions.objective();
    if (obj.target) {
      const [x, z] = toMap(obj.target.x, obj.target.z);
      const pulse = 5 + Math.sin(performance.now() / 220) * 2;
      ctx.fillStyle = '#ff5f6d';
      ctx.beginPath();
      ctx.moveTo(x, z - pulse); ctx.lineTo(x + pulse, z); ctx.lineTo(x, z + pulse); ctx.lineTo(x - pulse, z);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // Traffic, then parked cars a touch dimmer.
    ctx.fillStyle = '#cfd8ea';
    for (const car of G.traffic.cars) {
      const [x, z] = toMap(car.x, car.z);
      ctx.fillRect(x - 1.5, z - 1.5, 3, 3);
    }
    ctx.fillStyle = 'rgba(207,216,234,0.55)';
    for (const car of G.parkedCars) {
      const [x, z] = toMap(car.x, car.z);
      ctx.fillRect(x - 1.5, z - 1.5, 3, 3);
    }
    // Police: squares flashing blue/red.
    const flash = Math.floor(performance.now() / 300) % 2 === 0;
    ctx.fillStyle = flash ? '#4d7cff' : '#ff5347';
    for (const car of G.police.cars) {
      const [x, z] = toMap(car.x, car.z);
      ctx.fillRect(x - 3, z - 3, 6, 6);
    }
    for (const cop of G.police.cops) {
      const [x, z] = toMap(cop.x, cop.z);
      ctx.fillRect(x - 2, z - 2, 4, 4);
    }
    // The player arrow, rotated to heading.
    const px = G.player.inCar ? G.player.inCar.x : G.player.x;
    const pz = G.player.inCar ? G.player.inCar.z : G.player.z;
    const heading = G.player.inCar ? G.player.inCar.heading : G.player.heading;
    const [mx, mz] = toMap(px, pz);
    ctx.save();
    ctx.translate(mx, mz);
    ctx.rotate(Math.PI - heading);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    // North tick.
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('N', S / 2 - 4, 13);
    ctx.restore();
  }
}
