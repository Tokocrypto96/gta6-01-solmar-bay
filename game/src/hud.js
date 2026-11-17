// Solmar Bay — the HUD: cash, wanted stars, health, objective, speedometer, toast
// messages, a feed of events, and the circular minimap (roads, player, traffic,
// police, mission marker, shells) drawn on a 2D canvas every frame.
import { CITY_HALF, PITCH } from './config.js';

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

  /** Draw the minimap: roads, beach, player arrow, cars, cops, marker, shells. */
  drawMinimap(G) {
    const ctx = this.mapCtx;
    const S = 208;
    const range = CITY_HALF + 34;
    const toMap = (x, z) => [S / 2 + (x / range) * (S / 2), S / 2 + (z / range) * (S / 2)];
    ctx.clearRect(0, 0, S, S);
    // Circular clip: the map is a round radar.
    ctx.save();
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#16233d';
    ctx.fillRect(0, 0, S, S);
    // Beach + ocean strip at the south edge.
    const [, beachY] = toMap(0, 191);
    ctx.fillStyle = '#c9ad6d';
    ctx.fillRect(0, beachY, S, S - beachY);
    ctx.fillStyle = '#1b7fa8';
    ctx.fillRect(0, beachY + 14, S, S - beachY - 14);
    // Blocks (between the roads).
    ctx.fillStyle = '#2c3a52';
    for (let bx = -3; bx <= 2; bx += 1) {
      for (let bz = -3; bz <= 2; bz += 1) {
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
    // Named places.
    for (const p of Object.values(G.city.places)) {
      const [x, z] = toMap(p.x, p.z);
      ctx.fillStyle = p.kind === 'safehouse' ? '#37d67a' : p.kind === 'police' ? '#4d7cff' : '#ffd21f';
      ctx.beginPath(); ctx.arc(x, z, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    // Shells (tiny gold dots).
    ctx.fillStyle = '#ffd21f';
    for (const item of G.shells.items) {
      if (item.taken) continue;
      const [x, z] = toMap(item.x, item.z);
      ctx.fillRect(x - 1, z - 1, 2, 2);
    }
    // Mission marker: pulsing diamond.
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
    // Traffic dots.
    ctx.fillStyle = '#cfd8ea';
    for (const car of G.traffic.cars) {
      const [x, z] = toMap(car.x, car.z);
      ctx.fillRect(x - 1.5, z - 1.5, 3, 3);
    }
    // Police: flashing blue/red squares.
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
    // Player arrow (rotates with heading).
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
