import { clamp, dist, angleDiff, TAU, mulberry32 } from './util.js';

const FONT_BODY = "'Be Vietnam Pro', 'DejaVu Sans', sans-serif";
const FONT_HEAD = "'Barlow Condensed', 'DejaVu Sans', sans-serif";

function rr(ctx, x, y, w, h, r) {
  const rad = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function createGroundTexture(world) {
  const size = world.size;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const c = cv.getContext('2d');
  const rng = mulberry32(world.seed ^ 0x9e3779b9);
  const r = (a, b) => rng() * (b - a) + a;
  const base = world.center;

  c.fillStyle = '#2b2922';
  c.fillRect(0, 0, size, size);

  // Large tonal patches
  const patchColors = ['#332f26', '#27251f', '#3a3427', '#2f2f26', '#36302a', '#252820'];
  for (let i = 0; i < 1400; i++) {
    c.globalAlpha = r(0.05, 0.16);
    c.fillStyle = patchColors[(rng() * patchColors.length) | 0];
    c.beginPath();
    c.ellipse(r(0, size), r(0, size), r(20, 170), r(12, 95), r(0, TAU), 0, TAU);
    c.fill();
  }
  c.globalAlpha = 1;

  // Dry grass & debris speckle
  for (let i = 0; i < 2300; i++) {
    const x = r(0, size);
    const y = r(0, size);
    c.globalAlpha = r(0.08, 0.3);
    c.strokeStyle = rng() < 0.65 ? '#5c5a3e' : '#6d6547';
    c.lineWidth = r(0.6, 1.6);
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + r(-5, 5), y + r(-7, -1));
    c.stroke();
  }
  c.globalAlpha = 1;

  // Road network
  const drawRoad = (x, y, w, h, vertical) => {
    c.fillStyle = '#232326';
    c.fillRect(x, y, w, h);
    c.fillStyle = '#2b2b2e';
    c.fillRect(x + 4, y + 4, w - 8, h - 8);
    c.strokeStyle = 'rgba(10,10,12,0.55)';
    c.lineWidth = 2;
    c.strokeRect(x + 4, y + 4, w - 8, h - 8);
    // centre line
    c.strokeStyle = 'rgba(190,168,102,0.16)';
    c.lineWidth = 4;
    c.setLineDash([22, 34]);
    c.beginPath();
    if (vertical) {
      c.moveTo(x + w / 2, y);
      c.lineTo(x + w / 2, y + h);
    } else {
      c.moveTo(x, y + h / 2);
      c.lineTo(x + w, y + h / 2);
    }
    c.stroke();
    c.setLineDash([]);
    // cracks
    for (let i = 0; i < (vertical ? h : w) / 55; i++) {
      const t = r(0, 1);
      const cx = vertical ? x + r(10, w - 10) : x + t * w;
      const cy = vertical ? y + t * h : y + r(10, h - 10);
      c.strokeStyle = 'rgba(8,8,10,0.5)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(cx, cy);
      let px = cx;
      let py = cy;
      for (let k = 0; k < 4; k++) {
        px += r(-16, 16);
        py += r(-16, 16);
        c.lineTo(px, py);
      }
      c.stroke();
    }
    // stains
    for (let i = 0; i < (vertical ? h : w) / 90; i++) {
      c.globalAlpha = r(0.05, 0.14);
      c.fillStyle = rng() < 0.5 ? '#16181a' : '#4a3f31';
      c.beginPath();
      c.ellipse(
        vertical ? x + r(6, w - 6) : x + r(0, w),
        vertical ? y + r(0, h) : y + r(6, h - 6),
        r(10, 38), r(6, 24), r(0, TAU), 0, TAU,
      );
      c.fill();
    }
    c.globalAlpha = 1;
  };
  for (const rx of world.roadsX) drawRoad(rx - 62, 0, 124, size, true);
  for (const ry of world.roadsY) drawRoad(0, ry - 62, size, 124, false);

  // Sidewalk rims
  c.strokeStyle = 'rgba(150,143,120,0.13)';
  c.lineWidth = 3;
  for (const rx of world.roadsX) {
    c.beginPath();
    c.moveTo(rx - 66, 0);
    c.lineTo(rx - 66, size);
    c.moveTo(rx + 66, 0);
    c.lineTo(rx + 66, size);
    c.stroke();
  }
  for (const ry of world.roadsY) {
    c.beginPath();
    c.moveTo(0, ry - 66);
    c.lineTo(size, ry - 66);
    c.moveTo(0, ry + 66);
    c.lineTo(size, ry + 66);
    c.stroke();
  }

  // Concrete pads beneath buildings + rubble
  for (const b of world.buildings) {
    c.globalAlpha = 0.7;
    c.fillStyle = '#34332d';
    c.fillRect(b.x - b.w / 2 - 18, b.y - b.h / 2 - 18, b.w + 36, b.h + 36);
    c.globalAlpha = 0.35;
    c.strokeStyle = '#1b1c1a';
    c.lineWidth = 2;
    c.strokeRect(b.x - b.w / 2 - 18, b.y - b.h / 2 - 18, b.w + 36, b.h + 36);
    c.globalAlpha = 1;
    for (let i = 0; i < 22; i++) {
      const x = b.x + r(-b.w / 2 - 26, b.w / 2 + 26);
      const y = b.y + r(-b.h / 2 - 26, b.h / 2 + 26);
      c.fillStyle = rng() < 0.5 ? '#3f3c34' : '#2a2924';
      c.beginPath();
      c.ellipse(x, y, r(2, 7), r(1.5, 5), r(0, TAU), 0, TAU);
      c.fill();
    }
  }

  // Craters
  for (let i = 0; i < 34; i++) {
    const x = r(80, size - 80);
    const y = r(80, size - 80);
    if (Math.hypot(x - base.x, y - base.y) < 300) continue;
    const rad = r(14, 46);
    c.globalAlpha = 0.5;
    c.fillStyle = '#1b1a17';
    c.beginPath();
    c.ellipse(x, y, rad, rad * r(0.65, 0.95), r(0, TAU), 0, TAU);
    c.fill();
    c.globalAlpha = 0.3;
    c.strokeStyle = '#5c5544';
    c.lineWidth = 2;
    c.beginPath();
    c.ellipse(x, y, rad * 1.18, rad * 0.85, 0, 0, TAU);
    c.stroke();
    c.globalAlpha = 1;
  }

  // Toxic pools
  for (let i = 0; i < 10; i++) {
    const x = r(150, size - 150);
    const y = r(150, size - 150);
    if (Math.hypot(x - base.x, y - base.y) < 360) continue;
    if (world.hasStaticAt(x, y, 20)) continue;
    const rad = r(22, 50);
    const g = c.createRadialGradient(x, y, 2, x, y, rad);
    g.addColorStop(0, 'rgba(96,142,42,0.5)');
    g.addColorStop(0.6, 'rgba(62,91,31,0.35)');
    g.addColorStop(1, 'rgba(36,48,22,0)');
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(x, y, rad, rad * 0.72, r(0, TAU), 0, TAU);
    c.fill();
  }

  // Base clearing
  c.save();
  const bg = c.createRadialGradient(base.x, base.y, 40, base.x, base.y, 330);
  bg.addColorStop(0, 'rgba(71,61,42,0.95)');
  bg.addColorStop(0.65, 'rgba(55,49,36,0.9)');
  bg.addColorStop(1, 'rgba(43,41,34,0)');
  c.fillStyle = bg;
  c.beginPath();
  c.arc(base.x, base.y, 330, 0, TAU);
  c.fill();
  // tire tracks
  c.strokeStyle = 'rgba(30,26,20,0.35)';
  c.lineWidth = 13;
  c.setLineDash([26, 18]);
  for (let i = 0; i < 3; i++) {
    c.beginPath();
    c.arc(base.x + r(-30, 30), base.y + r(-30, 30), r(120, 250), r(0, TAU), r(0, TAU) + 1.4);
    c.stroke();
  }
  c.setLineDash([]);
  // hazard ring
  c.strokeStyle = 'rgba(196,154,66,0.28)';
  c.lineWidth = 5;
  c.setLineDash([28, 22]);
  c.beginPath();
  c.arc(base.x, base.y, 276, 0, TAU);
  c.stroke();
  c.setLineDash([]);
  c.restore();

  // Loose debris everywhere
  for (let i = 0; i < 700; i++) {
    const x = r(0, size);
    const y = r(0, size);
    c.globalAlpha = r(0.15, 0.5);
    c.fillStyle = rng() < 0.4 ? '#4c473a' : rng() < 0.5 ? '#37352d' : '#5a4c39';
    c.fillRect(x, y, r(1, 5), r(1, 4));
  }
  c.globalAlpha = 1;

  return cv;
}

export class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.w = 1;
    this.h = 1;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.lightCanvas = document.createElement('canvas');
    this.lctx = this.lightCanvas.getContext('2d');
    this.shakeX = 0;
    this.shakeY = 0;
    this.ground = null;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  ensureGround() {
    if (!this.ground) this.ground = createGroundTexture(this.game.world);
    return this.ground;
  }

  resize() {
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
    this.lightCanvas.width = Math.floor(this.w);
    this.lightCanvas.height = Math.floor(this.h);
    const g = this.game;
    if (g) g.updateZoom?.();
  }

  cameraZoom() {
    const g = this.game;
    if (g && g.camera && g.camera.zoom) return g.camera.zoom;
    return 1;
  }

  draw(time, dt) {
    const g = this.game;
    const ctx = this.ctx;
    const cam = g.camera;
    const zoom = cam.zoom;
    const w = this.w;
    const h = this.h;
    const dpr = this.dpr;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#101210';
    ctx.fillRect(0, 0, w, h);

    const shake = cam.shake;
    this.shakeX = shake > 0 ? (Math.random() - 0.5) * shake : 0;
    this.shakeY = shake > 0 ? (Math.random() - 0.5) * shake : 0;
    const originX = w / 2 - cam.x * zoom + this.shakeX;
    const originY = h / 2 - cam.y * zoom + this.shakeY;
    this.originX = originX;
    this.originY = originY;
    this.zoom = zoom;

    const view = {
      left: cam.x - w / (2 * zoom) - 160,
      right: cam.x + w / (2 * zoom) + 160,
      top: cam.y - h / (2 * zoom) - 160,
      bottom: cam.y + h / (2 * zoom) + 160,
    };

    // --- Ground -----------------------------------------------------------
    const ground = this.ensureGround();
    ctx.save();
    ctx.translate(originX, originY);
    ctx.scale(zoom, zoom);
    const gx = clamp(view.left, 0, g.world.size);
    const gy = clamp(view.top, 0, g.world.size);
    const gw = clamp(view.right, 0, g.world.size) - gx;
    const gh = clamp(view.bottom, 0, g.world.size) - gy;
    if (gw > 0 && gh > 0) ctx.drawImage(ground, gx, gy, gw, gh, gx, gy, gw, gh);

    // base boundary
    ctx.save();
    ctx.strokeStyle = 'rgba(255,178,84,0.13)';
    ctx.lineWidth = 3;
    ctx.setLineDash([18, 26]);
    ctx.lineDashOffset = -time * 8;
    ctx.beginPath();
    ctx.arc(g.world.base.x, g.world.base.y, g.world.base.buildRadius + 8, 0, TAU);
    ctx.stroke();
    ctx.restore();

    // --- Decals -----------------------------------------------------------
    for (const d of g.decals) {
      if (d.x < view.left || d.x > view.right || d.y < view.top || d.y > view.bottom) continue;
      const alpha = d.alpha ?? 1;
      ctx.globalAlpha = alpha;
      if (d.type === 'scorch') {
        const grd = ctx.createRadialGradient(d.x, d.y, 2, d.x, d.y, d.r);
        grd.addColorStop(0, 'rgba(12,10,9,0.8)');
        grd.addColorStop(1, 'rgba(12,10,9,0)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, TAU);
        ctx.fill();
      } else if (d.type === 'acid') {
        ctx.fillStyle = 'rgba(103,150,46,0.25)';
        ctx.beginPath();
        ctx.ellipse(d.x, d.y, d.r, d.r * 0.6, d.rot, 0, TAU);
        ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(78,18,20,0.6)';
        ctx.beginPath();
        ctx.ellipse(d.x, d.y, d.r, d.r * 0.62, d.rot, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(116,28,30,0.5)';
        ctx.beginPath();
        ctx.ellipse(d.x + d.r * 0.3, d.y - d.r * 0.2, d.r * 0.5, d.r * 0.3, d.rot, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // supply beacon ground ring
    if (g.supplyDrop) {
      const s = g.supplyDrop;
      ctx.strokeStyle = 'rgba(155,255,100,0.55)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 34 + Math.sin(time * 3) * 5, 0, TAU);
      ctx.stroke();
      const grd = ctx.createRadialGradient(s.x, s.y, 4, s.x, s.y, 70);
      grd.addColorStop(0, 'rgba(150,255,110,0.25)');
      grd.addColorStop(1, 'rgba(150,255,110,0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 70, 0, TAU);
      ctx.fill();
    }

    // --- Sorted world objects --------------------------------------------
    const items = [];
    const pushProp = (p, drawFn) => {
      if (p.x < view.left || p.x > view.right || p.y < view.top || p.y > view.bottom) return;
      items.push({ y: p.sortY || p.y, kind: p.kind, ref: p, draw: drawFn });
    };
    for (const p of g.world.props) {
      if (p.kind === 'crate') continue;
      if (p.kind === 'barrel' && !p.alive) continue;
      pushProp(p, null);
    }
    for (const cr of g.world.crates) {
      if (cr.x < view.left || cr.x > view.right || cr.y < view.top || cr.y > view.bottom) continue;
      items.push({ y: cr.y + 10, kind: 'crate', ref: cr });
    }
    for (const pickup of g.pickups || []) {
      if (pickup.x < view.left || pickup.x > view.right || pickup.y < view.top || pickup.y > view.bottom) continue;
      items.push({ y: pickup.y + 4, kind: 'pickup', ref: pickup });
    }
    if (g.supplyDrop) {
      items.push({ y: g.supplyDrop.y + 14, kind: 'supplycrate', ref: g.supplyDrop });
    }
    for (const s of g.structures) {
      if (!s.alive) continue;
      if (s.x < view.left || s.x > view.right || s.y < view.top || s.y > view.bottom) continue;
      items.push({ y: s.sortY || s.y + (s.h || 0) / 2, kind: s.kind, ref: s });
    }
    items.push({ y: g.core.y + 50, kind: 'core', ref: g.core });
    for (const s of g.soldiers) {
      if (!s.alive) continue;
      items.push({ y: s.y + 14, kind: 'soldier', ref: s });
    }
    for (const e of g.enemies) {
      if (!e.alive) continue;
      if (e.x < view.left || e.x > view.right || e.y < view.top || e.y > view.bottom) continue;
      items.push({ y: e.y + e.r, kind: 'enemy', ref: e });
    }
    if (g.player.alive) items.push({ y: g.player.y + 14, kind: 'player', ref: g.player });
    items.sort((a, b) => a.y - b.y);

    for (const it of items) {
      switch (it.kind) {
        case 'building': this.drawBuilding(ctx, it.ref); break;
        case 'car': this.drawCar(ctx, it.ref); break;
        case 'tree': this.drawTree(ctx, it.ref, time); break;
        case 'rock': this.drawRock(ctx, it.ref); break;
        case 'barrel': this.drawBarrel(ctx, it.ref, time); break;
        case 'lamp': this.drawStreetLamp(ctx, it.ref, time); break;
        case 'workbench': this.drawWorkbench(ctx, it.ref); break;
        case 'crate': this.drawCrate(ctx, it.ref, false, time); break;
        case 'supplycrate': this.drawCrate(ctx, it.ref, true, time); break;
        case 'pickup': this.drawPickup(ctx, it.ref, time); break;
        case 'wall': this.drawWall(ctx, it.ref); break;
        case 'turret': this.drawTurret(ctx, it.ref, time); break;
        case 'medbay': this.drawMedbay(ctx, it.ref, time); break;
        case 'lampbuild': this.drawBuiltLamp(ctx, it.ref, time); break;
        case 'campfire': this.drawCampfire(ctx, it.ref, time); break;
        case 'core': this.drawCore(ctx, it.ref, time); break;
        case 'soldier': this.drawSoldier(ctx, it.ref, time); break;
        case 'enemy': this.drawEnemy(ctx, it.ref, time); break;
        case 'player': this.drawPlayer(ctx, g.player, time); break;
        default: break;
      }
    }

    // --- Particles under lighting ----------------------------------------
    this.drawParticles(ctx, g, false);

    // --- Lighting ---------------------------------------------------------
    ctx.restore(); // back to screen space
    this.drawLighting(g, time);

    // --- Bright world-space effects above darkness ----------------------
    ctx.save();
    ctx.translate(originX, originY);
    ctx.scale(zoom, zoom);
    this.drawProjectiles(ctx, g, time);
    this.drawParticles(ctx, g, true);
    this.drawFloatingTexts(ctx, g);
    this.drawBuildGhost(ctx, g, time);
    ctx.restore();

    this.drawNightGlows(g, time);
    this.drawScreenFx(g, time);
    this.drawReticle(g);
  }

  drawBuilding(ctx, b) {
    const x = b.x - b.w / 2;
    const y = b.y - b.h / 2;
    const rng = mulberry32(b.seed || 7);
    ctx.save();
    ctx.fillStyle = 'rgba(5,6,5,0.5)';
    rr(ctx, x + 12, y + 16, b.w, b.h, 5);
    ctx.fill();
    // base
    ctx.fillStyle = b.warehouse ? '#3b3730' : '#34342f';
    rr(ctx, x, y, b.w, b.h, 4);
    ctx.fill();
    // roof tone
    const cols = b.warehouse
      ? ['#45443c', '#3f3e36', '#4a483f']
      : ['#3b3b36', '#353530', '#41413a', '#383832'];
    ctx.fillStyle = cols[(b.tone * cols.length) | 0];
    rr(ctx, x + 4, y + 3, b.w - 8, b.h - 8, 3);
    ctx.fill();
    // roof plates
    ctx.strokeStyle = 'rgba(20,20,18,0.35)';
    ctx.lineWidth = 1;
    const step = 24;
    for (let px = x + 10; px < x + b.w - 8; px += step) {
      ctx.beginPath();
      ctx.moveTo(px, y + 5);
      ctx.lineTo(px, y + b.h - 5);
      ctx.stroke();
    }
    // vents & AC units
    const vents = 2 + ((rng() * 3) | 0);
    for (let i = 0; i < vents; i++) {
      const vx = x + 12 + rng() * (b.w - 34);
      const vy = y + 12 + rng() * (b.h - 34);
      const vw = 8 + rng() * 16;
      const vh = 7 + rng() * 12;
      ctx.fillStyle = 'rgba(12,12,11,0.45)';
      ctx.fillRect(vx + 2, vy + 2, vw, vh);
      ctx.fillStyle = '#55544a';
      ctx.fillRect(vx, vy, vw, vh);
      ctx.fillStyle = '#2c2c28';
      ctx.fillRect(vx + 2, vy + 2, vw - 4, 2);
    }
    // ruined holes
    if (b.ruined) {
      const holes = 1 + ((rng() * 3) | 0);
      for (let i = 0; i < holes; i++) {
        const hx = x + 16 + rng() * (b.w - 42);
        const hy = y + 16 + rng() * (b.h - 42);
        const hw = 14 + rng() * 30;
        const hh = 12 + rng() * 24;
        ctx.fillStyle = '#161714';
        ctx.beginPath();
        ctx.moveTo(hx + rng() * 6, hy);
        ctx.lineTo(hx + hw - rng() * 8, hy + rng() * 4);
        ctx.lineTo(hx + hw, hy + hh - rng() * 5);
        ctx.lineTo(hx + rng() * 8, hy + hh);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(110,103,80,0.25)';
        ctx.lineWidth = 1;
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          ctx.moveTo(hx + rng() * hw, hy + rng() * hh);
          ctx.lineTo(hx + rng() * hw, hy + rng() * hh);
          ctx.stroke();
        }
      }
    }
    // edge highlight
    ctx.strokeStyle = 'rgba(150,146,120,0.18)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 4, y + 3, b.w - 8, b.h - 8);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x + 4, y + b.h - 8, b.w - 8, 4);
    // rust streaks
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = '#8a5530';
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(x + rng() * b.w, y + b.h - 14, 3 + rng() * 5, 10);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  drawCar(ctx, car) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    const w = car.w;
    const h = car.h;
    ctx.fillStyle = 'rgba(4,5,4,0.45)';
    rr(ctx, -w / 2 + 4, -h / 2 + 5, w, h, 8);
    ctx.fill();
    ctx.fillStyle = car.burned ? '#2b2824' : car.color;
    rr(ctx, -w / 2, -h / 2, w, h, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(15,15,14,0.6)';
    ctx.lineWidth = 1.5;
    rr(ctx, -w / 2 + 2, -h / 2 + 2, w - 4, h - 4, 6);
    ctx.stroke();
    // windows
    ctx.fillStyle = 'rgba(30,42,46,0.8)';
    if (w > h) {
      rr(ctx, -w * 0.18, -h * 0.36, w * 0.34, h * 0.72, 3);
      ctx.fill();
      ctx.fillStyle = 'rgba(28,35,38,0.6)';
      rr(ctx, w * 0.2, -h * 0.32, w * 0.16, h * 0.64, 2);
      ctx.fill();
    } else {
      rr(ctx, -w * 0.36, -h * 0.18, w * 0.72, h * 0.34, 3);
      ctx.fill();
    }
    // rust & damage
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#7a4b2c';
    ctx.beginPath();
    ctx.ellipse(w * 0.25, h * 0.2, w * 0.18, h * 0.16, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    // wheels
    ctx.fillStyle = '#171817';
    const wx = w > h ? w * 0.3 : w * 0.36;
    const wy = w > h ? h * 0.36 : h * 0.3;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) ctx.fillRect(sx * wx - 4, sy * wy - 3, 8, 6);
    ctx.restore();
  }

  drawTree(ctx, t, time) {
    const seed = mulberry32(t.seed || 3);
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.fillStyle = 'rgba(4,5,4,0.35)';
    ctx.beginPath();
    ctx.ellipse(5, 7, t.r + 7, t.r * 0.6, 0.4, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#3b3127';
    ctx.lineCap = 'round';
    const sway = Math.sin(time * 0.6 + t.seed) * 0.03;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + seed() * 0.4 + sway;
      const len = t.r * (0.8 + seed() * 1.7);
      ctx.lineWidth = Math.max(1, 4 - i * 0.35);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(Math.cos(a + 0.2) * len * 0.5, Math.sin(a + 0.2) * len * 0.5, Math.cos(a) * len, Math.sin(a) * len);
      ctx.stroke();
      if (i < 4) {
        ctx.lineWidth = 1;
        ctx.beginPath();
        const bx = Math.cos(a) * len * 0.6;
        const by = Math.sin(a) * len * 0.6;
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + Math.cos(a + 0.8) * len * 0.4, by + Math.sin(a + 0.8) * len * 0.4);
        ctx.stroke();
      }
    }
    ctx.fillStyle = '#4a3c2c';
    ctx.beginPath();
    ctx.arc(0, 0, 4.5, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  drawRock(ctx, rock) {
    ctx.save();
    ctx.translate(rock.x, rock.y);
    ctx.fillStyle = 'rgba(4,5,4,0.35)';
    ctx.beginPath();
    ctx.ellipse(5, 6, rock.r, rock.r * 0.7, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = rock.tone > 0.5 ? '#55534a' : '#4a4841';
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      const rr2 = rock.r * (0.8 + Math.sin(i * 3 + rock.seed) * 0.16);
      const px = Math.cos(a) * rr2;
      const py = Math.sin(a) * rr2 * 0.8;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,20,18,0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = 'rgba(180,174,150,0.14)';
    ctx.beginPath();
    ctx.ellipse(-rock.r * 0.25, -rock.r * 0.3, rock.r * 0.4, rock.r * 0.25, -0.5, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  drawBarrel(ctx, b, time) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.fillStyle = 'rgba(4,5,4,0.4)';
    ctx.beginPath();
    ctx.ellipse(3, 5, 13, 9, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#7d2f25';
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#3b1512';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#a1402f';
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#f0c35a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 5.5, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = '#f0c35a';
    ctx.fillRect(-1.5, -4, 3, 8);
    if (Math.sin(time * 3 + b.x) > 0.7) {
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#ffb054';
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  drawStreetLamp(ctx, lamp, time) {
    ctx.save();
    ctx.translate(lamp.x, lamp.y);
    ctx.fillStyle = 'rgba(4,5,4,0.35)';
    ctx.beginPath();
    ctx.ellipse(3, 4, 10, 6, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#4b4b45';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.lineTo(0, -18);
    ctx.lineTo(10, -22);
    ctx.stroke();
    ctx.fillStyle = '#5b5a50';
    ctx.fillRect(-5, 5, 10, 5);
    const on = this.game.isNight;
    ctx.fillStyle = on ? '#ffd98a' : '#65645a';
    rr(ctx, 6, -26, 10, 6, 2);
    ctx.fill();
    if (on) {
      ctx.globalAlpha = 0.25 + Math.sin(time * 5 + lamp.x) * 0.04;
      ctx.fillStyle = '#ffd98a';
      ctx.beginPath();
      ctx.arc(11, -23, 16, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  drawWorkbench(ctx, wb) {
    ctx.save();
    ctx.translate(wb.x, wb.y);
    ctx.fillStyle = 'rgba(4,5,4,0.4)';
    rr(ctx, -wb.w / 2 + 4, -wb.h / 2 + 6, wb.w, wb.h, 3);
    ctx.fill();
    ctx.fillStyle = '#4a3728';
    rr(ctx, -wb.w / 2, -wb.h / 2, wb.w, wb.h, 3);
    ctx.fill();
    ctx.strokeStyle = '#2a1f17';
    ctx.lineWidth = 1.5;
    rr(ctx, -wb.w / 2 + 1, -wb.h / 2 + 1, wb.w - 2, wb.h - 2, 2);
    ctx.stroke();
    // tools
    ctx.strokeStyle = '#aab0a6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-18, -3);
    ctx.lineTo(-4, 6);
    ctx.moveTo(4, -8);
    ctx.lineTo(14, 5);
    ctx.stroke();
    ctx.fillStyle = '#b7743a';
    ctx.fillRect(14, -10, 7, 5);
    ctx.fillStyle = '#6d7470';
    ctx.beginPath();
    ctx.arc(0, 4, 6, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#3a3f3c';
    ctx.beginPath();
    ctx.arc(0, 4, 3, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = '#e5b25e';
    ctx.font = `700 9px ${FONT_HEAD}`;
    ctx.textAlign = 'center';
    ctx.fillText('CHẾ TẠO', 0, -24);
    ctx.restore();
  }

  drawCrate(ctx, crate, isSupply, time) {
    ctx.save();
    ctx.translate(crate.x, crate.y);
    const opened = crate.opened;
    const type = crate.type;
    ctx.fillStyle = 'rgba(4,5,4,0.4)';
    rr(ctx, -15, -9, 34, 28, 3);
    ctx.fill();
    if (!opened) {
      const glowColor = isSupply ? '#a6ff6e' : type === 'weapon' ? '#8ee9a0' : type === 'rare' ? '#78d9e0' : '#e8bb6b';
      ctx.globalAlpha = 0.12 + Math.sin(time * 2 + crate.x) * 0.04;
      ctx.fillStyle = glowColor;
      ctx.beginPath();
      ctx.arc(2, 0, 34, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.rotate(opened ? -0.06 : 0.04);
    ctx.fillStyle = opened ? '#3b3126' : isSupply ? '#4a5a39' : '#5d4830';
    rr(ctx, -16, -16, 34, 32, 3);
    ctx.fill();
    if (!opened) {
      ctx.strokeStyle = '#2d2117';
      ctx.lineWidth = 1.5;
      rr(ctx, -16, -16, 34, 32, 3);
      ctx.stroke();
      ctx.fillStyle = '#6c5537';
      ctx.fillRect(-16, -4, 34, 3);
      ctx.fillStyle = '#6c5537';
      ctx.fillRect(-16, 6, 34, 3);
      ctx.strokeStyle = '#8b8d84';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(1, -16);
      ctx.lineTo(1, 16);
      ctx.stroke();
      ctx.fillStyle = '#f0c35a';
      ctx.fillRect(-4, -3, 10, 6);
    } else {
      // open lid
      ctx.fillStyle = '#2f271e';
      rr(ctx, -15, -15, 32, 29, 2);
      ctx.fill();
      ctx.strokeStyle = '#8b8d84';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-13, 14);
      ctx.lineTo(16, 20);
      ctx.stroke();
      ctx.fillStyle = '#6a5a3b';
      rr(ctx, -15, -20, 32, 8, 2);
      ctx.fill();
    }
    if (!opened) {
      // marker above
      const bob = Math.sin(time * 3 + crate.wobble) * 3;
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = isSupply ? '#a6ff6e' : type === 'weapon' ? '#8ee9a0' : type === 'rare' ? '#78d9e0' : '#e8bb6b';
      ctx.beginPath();
      ctx.moveTo(1, -28 + bob);
      ctx.lineTo(7, -22 + bob);
      ctx.lineTo(1, -16 + bob);
      ctx.lineTo(-5, -22 + bob);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  drawPickup(ctx, p, time) {
    const bob = Math.sin(time * 4 + p.bob) * 3;
    const fade = p.life < 4 ? clamp(p.life / 4, 0.15, 1) : 1;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(p.x, p.y + bob);
    ctx.fillStyle = 'rgba(3,4,3,0.35)';
    ctx.beginPath();
    ctx.ellipse(2, 8 - bob, 9, 4, 0, 0, TAU);
    ctx.fill();
    const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, 20);
    glow.addColorStop(0, p.color || '#ffcf6a');
    glow.addColorStop(1, 'rgba(255,207,106,0)');
    ctx.globalAlpha = fade * 0.22;
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = fade;

    if (p.type === 'medkit') {
      ctx.fillStyle = '#e7e2d2';
      rr(ctx, -7, -7, 14, 14, 2);
      ctx.fill();
      ctx.fillStyle = '#c94b45';
      ctx.fillRect(-1.8, -5, 3.6, 10);
      ctx.fillRect(-5, -1.8, 10, 3.6);
    } else if (p.type === 'weapon') {
      ctx.fillStyle = '#3a3e38';
      rr(ctx, -10, -3, 20, 6, 2);
      ctx.fill();
      ctx.fillStyle = '#6d5a3d';
      ctx.fillRect(2, 2, 5, 5);
      ctx.fillStyle = p.color || '#8ee9a0';
      ctx.fillRect(-13, -1, 3, 2);
    } else if (p.type === 'ammo') {
      ctx.fillStyle = '#7a6238';
      rr(ctx, -8, -6, 16, 12, 2);
      ctx.fill();
      ctx.fillStyle = '#e8bb6b';
      for (let i = -1; i <= 1; i++) {
        ctx.fillRect(i * 4 - 1, -4, 2, 8);
      }
    } else if (p.type === 'parts') {
      ctx.strokeStyle = p.color || '#78d9e0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = p.color || '#78d9e0';
      ctx.beginPath();
      ctx.arc(0, 0, 2.2, 0, TAU);
      ctx.fill();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU;
        ctx.fillRect(Math.cos(a) * 8 - 1, Math.sin(a) * 8 - 1, 2, 2);
      }
    } else if (p.type === 'wood') {
      ctx.strokeStyle = '#8a6a3c';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-7, 4);
      ctx.lineTo(7, -4);
      ctx.stroke();
      ctx.strokeStyle = '#c69a5d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-6, 3);
      ctx.lineTo(6, -3);
      ctx.stroke();
    } else {
      ctx.fillStyle = p.color || '#b8c6bd';
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(7, -2);
      ctx.lineTo(5, 6);
      ctx.lineTo(-5, 6);
      ctx.lineTo(-7, -2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(40,48,44,0.5)';
      ctx.beginPath();
      ctx.arc(0, 0, 2.4, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  drawWall(ctx, wall) {
    const w = wall.w || 56;
    const h = wall.h || 56;
    const x = wall.x - w / 2;
    const y = wall.y - h / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(4,5,4,0.42)';
    rr(ctx, x + 5, y + 7, w, h, 5);
    ctx.fill();
    ctx.fillStyle = '#565349';
    rr(ctx, x, y, w, h, 4);
    ctx.fill();
    ctx.fillStyle = '#615d51';
    rr(ctx, x + 4, y + 3, w - 8, h - 10, 3);
    ctx.fill();
    // sandbags / plates
    ctx.strokeStyle = 'rgba(30,30,26,0.5)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 14 + i * 16);
      ctx.lineTo(x + w - 4, y + 15 + i * 16);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(x + 4, y + h - 13, w - 8, 6);
    ctx.strokeStyle = 'rgba(190,180,150,0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 8, y + 5);
    ctx.lineTo(x + w - 10, y + 5);
    ctx.stroke();
    if (wall.hp < wall.maxHp) this.drawHpBar(ctx, wall.x, y - 10, 40, wall.hp / wall.maxHp, '#e0b45a');
    ctx.restore();
  }

  drawTurret(ctx, t, time) {
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.fillStyle = 'rgba(4,5,4,0.45)';
    ctx.beginPath();
    ctx.ellipse(5, 7, 27, 20, 0, 0, TAU);
    ctx.fill();
    // base
    ctx.fillStyle = '#3d3b35';
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#242420';
    ctx.lineWidth = 3;
    ctx.stroke();
    // legs
    ctx.strokeStyle = '#555248';
    ctx.lineWidth = 4;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 12, Math.sin(a) * 12);
      ctx.lineTo(Math.cos(a) * 26, Math.sin(a) * 26);
      ctx.stroke();
    }
    // body
    ctx.fillStyle = '#4f5549';
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#2b2d27';
    ctx.lineWidth = 2;
    ctx.stroke();
    // barrel
    ctx.save();
    ctx.rotate(t.angle);
    ctx.fillStyle = '#33362f';
    rr(ctx, 4, -4, 24 - t.muzzle * 3, 8, 2);
    ctx.fill();
    ctx.fillStyle = '#22241f';
    ctx.fillRect(22 - t.muzzle * 3, -3, 5, 6);
    ctx.fillStyle = '#8b4a2e';
    ctx.fillRect(10, -5, 5, 10);
    if (t.muzzle > 0.1) {
      ctx.globalAlpha = t.muzzle;
      ctx.fillStyle = '#ffcf6a';
      ctx.beginPath();
      ctx.arc(28, 0, 6 * t.muzzle, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // eye
    ctx.fillStyle = '#ffb454';
    ctx.beginPath();
    ctx.arc(0, 0, 3.5, 0, TAU);
    ctx.fill();
    if (t.hp < t.maxHp) this.drawHpBar(ctx, 0, -30, 36, t.hp / t.maxHp, '#71d6a6');
    if (t.hitFlash > 0) {
      ctx.globalAlpha = t.hitFlash * 0.45;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  drawMedbay(ctx, m, time) {
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.fillStyle = 'rgba(4,5,4,0.4)';
    rr(ctx, -25, -17, 56, 46, 6);
    ctx.fill();
    ctx.fillStyle = '#4a5145';
    rr(ctx, -27, -24, 54, 48, 5);
    ctx.fill();
    ctx.fillStyle = '#5b6354';
    rr(ctx, -21, -20, 42, 36, 4);
    ctx.fill();
    // tent stripes
    ctx.strokeStyle = 'rgba(31,35,29,0.6)';
    ctx.lineWidth = 2;
    for (let i = -18; i < 22; i += 12) {
      ctx.beginPath();
      ctx.moveTo(i, -18);
      ctx.lineTo(i, 14);
      ctx.stroke();
    }
    // cross
    ctx.fillStyle = '#c94b45';
    ctx.fillRect(-5, -12, 10, 26);
    ctx.fillRect(-13, -4, 26, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillRect(-4, -11, 3, 24);
    const pulse = 0.14 + Math.sin(time * 2.4) * 0.04;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#8dff9d';
    ctx.beginPath();
    ctx.arc(0, 0, 46, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (m.hp < m.maxHp) this.drawHpBar(ctx, 0, -33, 42, m.hp / m.maxHp, '#71d6a6');
    ctx.restore();
  }

  drawBuiltLamp(ctx, l, time) {
    ctx.save();
    ctx.translate(l.x, l.y);
    ctx.fillStyle = 'rgba(4,5,4,0.4)';
    ctx.beginPath();
    ctx.ellipse(3, 4, 11, 7, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#57554b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.lineTo(0, -26);
    ctx.stroke();
    ctx.fillStyle = '#6b675a';
    ctx.fillRect(-7, 6, 14, 5);
    ctx.fillStyle = this.game.isNight ? '#ffd98a' : '#78766a';
    rr(ctx, -8, -32, 16, 8, 2);
    ctx.fill();
    if (this.game.isNight) {
      ctx.globalAlpha = 0.22 + Math.sin(time * 5) * 0.04;
      ctx.fillStyle = '#ffd98a';
      ctx.beginPath();
      ctx.arc(0, -28, 20, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (l.hp < l.maxHp) this.drawHpBar(ctx, 0, -40, 30, l.hp / l.maxHp, '#e0b45a');
    ctx.restore();
  }

  drawCampfire(ctx, f, time) {
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.fillStyle = 'rgba(4,5,4,0.35)';
    ctx.beginPath();
    ctx.ellipse(3, 4, 24, 15, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#4a3a2a';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 13, Math.sin(a) * 9);
      ctx.lineTo(-Math.cos(a) * 13, -Math.sin(a) * 9);
      ctx.stroke();
    }
    const flick = Math.sin(time * 9) * 2 + Math.sin(time * 17) * 1.4;
    const grd = ctx.createRadialGradient(0, -4, 1, 0, 0, 24);
    grd.addColorStop(0, 'rgba(255,236,170,0.95)');
    grd.addColorStop(0.35, 'rgba(255,155,54,0.85)');
    grd.addColorStop(1, 'rgba(190,55,20,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.ellipse(0, -2, 13 + flick * 0.4, 19 + flick, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,216,120,0.8)';
    ctx.beginPath();
    ctx.ellipse(0, 2, 6, 10, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  drawCore(ctx, core, time) {
    ctx.save();
    ctx.translate(core.x, core.y);
    const pulse = 0.5 + Math.sin(time * 2.4) * 0.5;
    // platform
    ctx.fillStyle = 'rgba(4,5,4,0.45)';
    ctx.beginPath();
    ctx.ellipse(7, 9, 64, 52, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#3c3b33';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      const r = i % 2 === 0 ? 62 : 56;
      if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#27261f';
    ctx.lineWidth = 3;
    ctx.stroke();
    // sandbag ring
    ctx.fillStyle = '#5a5342';
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU;
      const rr2 = 66;
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * rr2, Math.sin(a) * rr2 * 0.8, 11, 6, a, 0, TAU);
      ctx.fill();
    }
    // generator body
    ctx.fillStyle = '#4b4a41';
    rr(ctx, -34, -30, 68, 60, 8);
    ctx.fill();
    ctx.strokeStyle = '#26261f';
    ctx.lineWidth = 2.5;
    rr(ctx, -34, -30, 68, 60, 8);
    ctx.stroke();
    // pipes
    ctx.strokeStyle = '#6c6555';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-24, -34);
    ctx.lineTo(-24, -20);
    ctx.moveTo(24, 34);
    ctx.lineTo(24, 22);
    ctx.stroke();
    // glowing core
    const grd = ctx.createRadialGradient(0, 0, 2, 0, 0, 26);
    grd.addColorStop(0, 'rgba(255,244,180,1)');
    grd.addColorStop(0.3, 'rgba(255,180,70,0.95)');
    grd.addColorStop(1, 'rgba(255,90,30,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(0, 0, 22 + pulse * 4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffce7a';
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, TAU);
    ctx.fill();
    // radar dish
    ctx.save();
    ctx.rotate(-time * 0.6);
    ctx.strokeStyle = '#7c7666';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 38, 0.2, 2.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(26, 26);
    ctx.stroke();
    ctx.restore();
    // level pips
    ctx.fillStyle = '#ffcf6a';
    for (let i = 0; i < core.level; i++) {
      ctx.fillRect(-20 + i * 10, 42, 6, 3);
    }
    ctx.font = `700 10px ${FONT_HEAD}`;
    ctx.fillStyle = 'rgba(255,235,200,0.7)';
    ctx.textAlign = 'center';
    ctx.fillText('LÕI CĂN CỨ', 0, -46);
    // hp ring
    const hpPct = core.hp / core.maxHp;
    if (hpPct < 1) {
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, 0, 55, -Math.PI, Math.PI);
      ctx.stroke();
      ctx.strokeStyle = hpPct > 0.5 ? '#71d6a6' : hpPct > 0.25 ? '#e0b45a' : '#ef5a4c';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, 55, -Math.PI, -Math.PI + TAU * hpPct);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawPlayer(ctx, p, time) {
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.invuln > 0 && Math.floor(p.invuln * 24) % 2 === 0) ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(3,4,3,0.45)';
    ctx.beginPath();
    ctx.ellipse(3, 8, 17, 9, 0, 0, TAU);
    ctx.fill();
    ctx.rotate(p.facing);
    const bob = Math.sin(p.walkPhase) * 1.5 * p.moving;
    const legSwing = Math.sin(p.walkPhase) * 5 * p.moving;
    // legs
    ctx.fillStyle = '#222d2b';
    rr(ctx, -10, -9 + legSwing * 0.4, 13, 8, 3);
    ctx.fill();
    rr(ctx, -10, 1 - legSwing * 0.4, 13, 8, 3);
    ctx.fill();
    // backpack
    ctx.fillStyle = '#5a4631';
    rr(ctx, -15, -8, 10, 16, 3);
    ctx.fill();
    ctx.fillStyle = '#42331f';
    ctx.fillRect(-13, -5, 6, 10);
    // torso
    ctx.fillStyle = '#3e4d4a';
    rr(ctx, -9, -10 + bob * 0.2, 30, 20, 7);
    ctx.fill();
    ctx.strokeStyle = '#1c2523';
    ctx.lineWidth = 1.5;
    rr(ctx, -9, -10 + bob * 0.2, 30, 20, 7);
    ctx.stroke();
    // vest straps
    ctx.fillStyle = '#2b3634';
    ctx.fillRect(2, -9, 5, 18);
    ctx.fillStyle = '#e09045';
    ctx.fillRect(-2, -10, 4, 20);
    // arms
    ctx.strokeStyle = '#7d5b44';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    const st = this.game.player.weaponStats(this.game);
    const aimRecoil = (this.game.player.recoil || 0) * 3;
    ctx.beginPath();
    ctx.moveTo(6, -10);
    ctx.lineTo(20 - aimRecoil, -4);
    ctx.moveTo(6, 10);
    ctx.lineTo(20 - aimRecoil, 4);
    ctx.stroke();
    // head
    ctx.fillStyle = '#8a6548';
    ctx.beginPath();
    ctx.arc(11, 0, 7.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#2a2520';
    ctx.beginPath();
    ctx.arc(8.5, 0, 7, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#8a6548';
    ctx.beginPath();
    ctx.arc(12.5, 0, 5.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#e8c07a';
    ctx.fillRect(14, -4, 2, 1.6);
    ctx.fillRect(14, 2.4, 2, 1.6);
    // weapon
    this.drawWeapon(ctx, p.current, st, aimRecoil);
    // scarf tail
    ctx.strokeStyle = '#d97d3f';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-8, 4);
    ctx.quadraticCurveTo(-18, 9 + Math.sin(time * 6) * 2, -23, 5);
    ctx.stroke();
    // muzzle flash
    if (p.muzzle > 0.05 && st.kind === 'ranged') {
      ctx.globalAlpha = Math.min(1, p.muzzle * 1.5);
      ctx.fillStyle = '#ffe9a0';
      const mx = 29 - aimRecoil;
      ctx.beginPath();
      ctx.moveTo(mx + 9, 0);
      ctx.lineTo(mx, -6);
      ctx.lineTo(mx + 3, 0);
      ctx.lineTo(mx, 6);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // slash arc
    if (p.slashTimer > 0) {
      const alpha = p.slashTimer / 0.18;
      ctx.save();
      ctx.rotate(p.slashAngle - p.facing);
      ctx.strokeStyle = `rgba(255,225,170,${alpha})`;
      ctx.lineWidth = 6 * alpha;
      ctx.beginPath();
      ctx.arc(0, 0, 45, -0.9, 0.9);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  drawWeapon(ctx, id, st, recoil) {
    ctx.save();
    ctx.translate(18 - recoil, 0);
    if (id === 'knife') {
      ctx.fillStyle = '#3a3a35';
      ctx.fillRect(-2, -2, 10, 4);
      ctx.fillStyle = '#c9cdc2';
      ctx.beginPath();
      ctx.moveTo(8, -2);
      ctx.lineTo(22, -1);
      ctx.lineTo(24, 0);
      ctx.lineTo(8, 2);
      ctx.closePath();
      ctx.fill();
    } else if (id === 'pistol') {
      ctx.fillStyle = '#2f3130';
      rr(ctx, 0, -3, 16, 6, 1);
      ctx.fill();
      ctx.fillStyle = '#222422';
      ctx.fillRect(2, 2, 6, 6);
      ctx.fillStyle = '#4a4d49';
      ctx.fillRect(13, -2, 4, 4);
    } else if (id === 'shotgun') {
      ctx.fillStyle = '#3a2c20';
      ctx.fillRect(-4, -3.5, 12, 7);
      ctx.fillStyle = '#434848';
      ctx.fillRect(6, -3, 20, 5);
      ctx.fillStyle = '#2a2e2d';
      ctx.fillRect(6, 1, 18, 3);
      ctx.fillStyle = '#7a5a35';
      ctx.fillRect(9, -5, 4, 10);
    } else if (id === 'rifle') {
      ctx.fillStyle = '#3c2d20';
      ctx.fillRect(-5, -3, 13, 6);
      ctx.fillStyle = '#343836';
      ctx.fillRect(6, -2.5, 20, 4);
      ctx.fillStyle = '#252927';
      ctx.fillRect(9, 1.5, 7, 6);
      ctx.fillStyle = '#4b504a';
      ctx.fillRect(23, -2, 7, 3);
      ctx.fillStyle = '#5a3a24';
      ctx.fillRect(-2, -4, 5, 8);
    } else if (id === 'launcher') {
      ctx.fillStyle = '#3d4137';
      rr(ctx, -4, -5, 30, 10, 3);
      ctx.fill();
      ctx.fillStyle = '#262a24';
      ctx.fillRect(24, -4, 6, 8);
      ctx.fillStyle = '#8a4a2a';
      ctx.fillRect(3, 3, 7, 7);
      ctx.fillStyle = '#5a5f51';
      ctx.fillRect(10, -7, 3, 4);
    }
    ctx.restore();
    // muzzle glow
    if (this.game.player.muzzle > 0.05 && st.kind === 'ranged') {
      const mx = 18 + (id === 'pistol' ? 17 : id === 'rifle' ? 30 : id === 'shotgun' ? 27 : 30) - recoil;
      const a = Math.min(1, this.game.player.muzzle);
      ctx.globalAlpha = a * 0.8;
      const grd = ctx.createRadialGradient(mx, 0, 0, mx, 0, 18);
      grd.addColorStop(0, 'rgba(255,235,160,0.9)');
      grd.addColorStop(1, 'rgba(255,140,40,0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(mx, 0, 18, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  drawSoldier(ctx, s, time) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.fillStyle = 'rgba(3,4,3,0.4)';
    ctx.beginPath();
    ctx.ellipse(3, 7, 14, 8, 0, 0, TAU);
    ctx.fill();
    ctx.rotate(s.facing || s.angle);
    const walk = Math.sin(s.anim) * 3 * s.moving;
    ctx.fillStyle = '#2b332d';
    rr(ctx, -9, -7 + walk * 0.4, 11, 6, 2);
    ctx.fill();
    rr(ctx, -9, 1 - walk * 0.4, 11, 6, 2);
    ctx.fill();
    ctx.fillStyle = '#4c5a44';
    rr(ctx, -8, -8, 25, 16, 6);
    ctx.fill();
    ctx.fillStyle = '#3b4736';
    rr(ctx, 2, -7, 8, 14, 3);
    ctx.fill();
    ctx.strokeStyle = '#8a6a4d';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(5, -7);
    ctx.lineTo(17, -2);
    ctx.moveTo(5, 7);
    ctx.lineTo(17, 2);
    ctx.stroke();
    ctx.fillStyle = '#8a6a4d';
    ctx.beginPath();
    ctx.arc(9, 0, 6.5, 0, TAU);
    ctx.fill();
    // helmet
    ctx.fillStyle = '#485339';
    ctx.beginPath();
    ctx.arc(7, 0, 7.5, 0, TAU);
    ctx.fill();
    // rifle
    ctx.fillStyle = '#2f3330';
    ctx.fillRect(14, -2, 17, 4);
    ctx.fillStyle = '#202320';
    ctx.fillRect(18, 2, 5, 4);
    if (s.muzzle > 0.05) {
      ctx.globalAlpha = s.muzzle;
      ctx.fillStyle = '#ffe8a0';
      ctx.beginPath();
      ctx.arc(32, 0, 6, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (s.hitFlash > 0) {
      ctx.globalAlpha = s.hitFlash * 0.35;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(2, 0, 15, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // name and hp
    if (s.alive) {
      const pct = s.hp / s.maxHp;
      ctx.font = `600 9px ${FONT_BODY}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(210,255,200,0.65)';
      ctx.fillText(s.name, s.x, s.y - 24);
      if (pct < 1) this.drawHpBar(ctx, s.x, s.y - 20, 30, pct, '#8ee9a0');
    }
  }

  drawEnemy(ctx, e, time) {
    const d = e.def;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.fillStyle = 'rgba(3,4,3,0.45)';
    ctx.beginPath();
    ctx.ellipse(4, e.r * 0.5, e.r * 1.05, e.r * 0.55, 0, 0, TAU);
    ctx.fill();
    ctx.rotate(e.angle);
    const wob = Math.sin(e.anim) * (e.type === 'runner' ? 3 : 2);
    const scale = e.spawnT < 0.35 ? 0.6 + e.spawnT * 1.2 : 1;
    ctx.scale(scale, scale);
    if (e.boss) bunnyDrawBoss(ctx, e, time, wob);
    else if (e.type === 'brute') drawBrute(ctx, e, wob);
    else if (e.type === 'spitter') drawSpitter(ctx, e, time, wob);
    else if (e.type === 'runner') drawRunner(ctx, e, wob);
    else drawWalker(ctx, e, wob);
    if (e.hitFlash > 0) {
      ctx.globalAlpha = e.hitFlash * 0.5;
      ctx.fillStyle = '#fff2e0';
      ctx.beginPath();
      ctx.arc(0, 0, e.r * 1.1, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    if (e.hp < e.maxHp && !e.boss) {
      this.drawHpBar(ctx, e.x, e.y - e.r - 10, Math.max(24, e.r * 2.2), e.hp / e.maxHp, e.type === 'brute' ? '#ff9a55' : '#e56353');
    }
    // glowing eyes above darkness are added in drawNightGlows
  }

  drawHpBar(ctx, x, y, w, pct, color) {
    ctx.save();
    ctx.fillStyle = 'rgba(8,9,8,0.75)';
    ctx.fillRect(x - w / 2, y, w, 4);
    ctx.fillStyle = color;
    ctx.fillRect(x - w / 2 + 0.5, y + 0.5, Math.max(0, (w - 1) * clamp(pct, 0, 1)), 3);
    ctx.restore();
  }

  drawProjectiles(ctx, g, time) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of g.bullets) {
      if (b.x < this.originX - 200 || b.x > this.originX + this.w / this.zoom + 200) {
        if (b.x < g.camera.x - 1200 || b.x > g.camera.x + 1200) continue;
      }
      const len = Math.hypot(b.x - b.px, b.y - b.py);
      const steps = Math.min(4, Math.max(1, Math.ceil(len / 8)));
      ctx.strokeStyle = b.color || 'rgba(255,207,106,0.9)';
      ctx.lineWidth = b.width || 2;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.moveTo(b.px, b.py);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = '#fff8d8';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius || 1.6, 0, TAU);
      ctx.fill();
      if (b.explosive) {
        ctx.fillStyle = 'rgba(255,140,60,0.5)';
        ctx.beginPath();
        ctx.arc(b.x, b.y, 5, 0, TAU);
        ctx.fill();
      }
    }
    for (const a of g.acids) {
      ctx.fillStyle = 'rgba(150,255,90,0.18)';
      ctx.beginPath();
      ctx.arc(a.x, a.y, 9, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(170,255,110,0.9)';
      ctx.beginPath();
      ctx.arc(a.x, a.y, 3.6, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  drawParticles(ctx, g, aboveLight) {
    for (const p of g.particles) {
      if (!!p.above !== aboveLight) continue;
      const t = p.life / p.maxLife;
      if (p.type === 'spark') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, t * 1.6);
        ctx.strokeStyle = p.color || '#ffca6a';
        ctx.lineWidth = p.size || 1.7;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02);
        ctx.stroke();
      } else if (p.type === 'blood') {
        ctx.globalAlpha = Math.min(0.9, t * 1.3);
        ctx.fillStyle = p.color || '#741c20';
        ctx.beginPath();
        ctx.arc(p.x, p.y, (p.size || 2) * (0.5 + t * 0.5), 0, TAU);
        ctx.fill();
      } else if (p.type === 'smoke') {
        ctx.globalAlpha = t * 0.32;
        ctx.fillStyle = p.color || '#3b3b38';
        ctx.beginPath();
        ctx.arc(p.x, p.y, (p.size || 8) * (1.5 - t * 0.5) + (p.grow || 0) * (1 - t), 0, TAU);
        ctx.fill();
      } else if (p.type === 'dust') {
        ctx.globalAlpha = t * 0.28;
        ctx.fillStyle = p.color || '#73694f';
        ctx.beginPath();
        ctx.arc(p.x, p.y, (p.size || 3) * (1.8 - t) + (p.grow || 0) * (1 - t), 0, TAU);
        ctx.fill();
      } else if (p.type === 'shell') {
        ctx.globalAlpha = t;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = '#c9a35a';
        ctx.fillRect(-2, -1, 4, 2);
        ctx.restore();
      } else if (p.type === 'ring') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = t * 0.7;
        ctx.strokeStyle = p.color || '#ffb454';
        ctx.lineWidth = 3 * t + 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1.6 - t) + (p.grow || 0) * (1 - t), 0, TAU);
        ctx.stroke();
      } else if (p.type === 'heal') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = t;
        ctx.fillStyle = '#8dff9d';
        ctx.fillRect(p.x - 1.5, p.y - 5, 3, 10);
        ctx.fillRect(p.x - 5, p.y - 1.5, 10, 3);
      } else if (p.type === 'ember') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = t * 0.8;
        ctx.fillStyle = p.color || '#ffab55';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size || 1.4, 0, TAU);
        ctx.fill();
      } else if (p.type === 'claw') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = t * 0.8;
        ctx.strokeStyle = '#ffd0a0';
        ctx.lineWidth = 2;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(0, 0, 20 + i * 4, -0.5 + i * 0.2, 0.2 + i * 0.2);
          ctx.stroke();
        }
        ctx.restore();
      } else if (p.type === 'muzzle') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = t;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = '#ffe7a6';
        ctx.beginPath();
        ctx.moveTo(4, 0);
        ctx.lineTo(-5, -8 * (1 - t));
        ctx.lineTo(-1, 0);
        ctx.lineTo(-5, 8 * (1 - t));
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (p.type === 'spit') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = t * 0.7;
        ctx.fillStyle = '#a6ff66';
        ctx.beginPath();
        ctx.arc(p.x, p.y, (p.size || 4) * (1.4 - t), 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  drawFloatingTexts(ctx, g) {
    ctx.textAlign = 'center';
    for (const f of g.floaters) {
      const t = f.life / f.maxLife;
      ctx.globalAlpha = Math.min(1, t * 1.4);
      ctx.font = f.big ? `800 22px ${FONT_HEAD}` : `700 12px ${FONT_BODY}`;
      ctx.fillStyle = 'rgba(3,4,3,0.7)';
      ctx.fillText(f.text, f.x + 1, f.y + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  drawBuildGhost(ctx, g, time) {
    if (!g.buildMode || !g.buildGhost) return;
    const ghost = g.buildGhost;
    const build = g.selectedBuildData;
    if (!build) return;
    ctx.save();
    ctx.globalAlpha = ghost.valid ? 0.65 : 0.4;
    ctx.translate(ghost.x, ghost.y);
    if (build.id === 'wall') {
      ctx.fillStyle = ghost.valid ? 'rgba(140,255,150,0.35)' : 'rgba(255,90,80,0.35)';
      ctx.strokeStyle = ghost.valid ? '#9dff9d' : '#ff6b5c';
      ctx.lineWidth = 2;
      ctx.fillRect(-28, -28, 56, 56);
      ctx.strokeRect(-28, -28, 56, 56);
    } else {
      ctx.fillStyle = ghost.valid ? 'rgba(140,255,150,0.28)' : 'rgba(255,90,80,0.28)';
      ctx.strokeStyle = ghost.valid ? '#9dff9d' : '#ff6b5c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, TAU);
      ctx.fill();
      ctx.stroke();
      if (build.id === 'turret') {
        ctx.setLineDash([6, 8]);
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.arc(0, 0, 430, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (build.id === 'medbay') {
        ctx.setLineDash([6, 8]);
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.arc(0, 0, 150, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.globalAlpha = 0.9;
    ctx.font = `600 11px ${FONT_BODY}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = ghost.valid ? '#c8ffc0' : '#ffb0a8';
    ctx.fillText(ghost.valid ? 'ĐẶT TẠI ĐÂY' : 'VỊ TRÍ KHÔNG HỢP LỆ', 0, -42);
    ctx.restore();
  }

  drawLighting(g, time) {
    const alpha = g.darkness;
    if (alpha <= 0.01) return;
    const lc = this.lightCanvas;
    const lctx = this.lctx;
    const w = this.w;
    const h = this.h;
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.clearRect(0, 0, w, h);
    lctx.fillStyle = `rgba(4,8,16,${alpha})`;
    lctx.fillRect(0, 0, w, h);
    lctx.globalCompositeOperation = 'destination-out';
    const px = this.worldToScreenX(g.player.x);
    const py = this.worldToScreenY(g.player.y);
    // ambient around player
    this.lightHole(lctx, px, py, 115, 0.92);
    // flashlight cone
    const cam = g.camera;
    lctx.save();
    lctx.translate(px, py);
    lctx.rotate(g.player.aimAngle);
    lctx.beginPath();
    lctx.moveTo(0, 0);
    lctx.arc(0, 0, 300, -0.36, 0.36);
    lctx.closePath();
    lctx.clip();
    const cone = lctx.createRadialGradient(0, 0, 12, 0, 0, 300);
    cone.addColorStop(0, 'rgba(0,0,0,0.9)');
    cone.addColorStop(0.5, 'rgba(0,0,0,0.55)');
    cone.addColorStop(1, 'rgba(0,0,0,0)');
    lctx.fillStyle = cone;
    lctx.fillRect(0, -180, 320, 360);
    lctx.restore();
    // base campfire
    const fire = g.world.base.fire;
    const flick = 0.92 + Math.sin(time * 9) * 0.08;
    this.lightHole(lctx, this.worldToScreenX(fire.x), this.worldToScreenY(fire.y), 230 * flick, 0.9);
    // core
    this.lightHole(lctx, this.worldToScreenX(g.core.x), this.worldToScreenY(g.core.y), 200, 0.5);
    for (const s of g.structures) {
      if (!s.alive) continue;
      let radius = 0;
      if (s.kind === 'lampbuild') radius = 230;
      else if (s.kind === 'medbay') radius = 120;
      else if (s.kind === 'turret') radius = 70;
      if (radius) this.lightHole(lctx, this.worldToScreenX(s.x), this.worldToScreenY(s.y), radius, s.kind === 'lampbuild' ? 0.9 : 0.5);
    }
    for (const l of g.world.lamps) {
      this.lightHole(lctx, this.worldToScreenX(l.x), this.worldToScreenY(l.y), 170, g.isNight ? 0.85 : 0.5);
    }
    for (const p of g.particles) {
      if (p.type === 'muzzle' || p.type === 'ring') {
        this.lightHole(lctx, this.worldToScreenX(p.x), this.worldToScreenY(p.y), 100 * (p.life / p.maxLife), 0.6);
      }
    }
    lctx.globalCompositeOperation = 'source-over';
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.drawImage(lc, 0, 0, w, h);
  }

  lightHole(ctx, x, y, radius, strength) {
    if (radius <= 1) return;
    const grd = ctx.createRadialGradient(x, y, 0, x, y, radius);
    grd.addColorStop(0, `rgba(0,0,0,${strength})`);
    grd.addColorStop(0.55, `rgba(0,0,0,${strength * 0.6})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.fill();
  }

  worldToScreenX(x) {
    return x * this.zoom + this.originX;
  }

  worldToScreenY(y) {
    return y * this.zoom + this.originY;
  }

  drawNightGlows(g, time) {
    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;
    if (g.darkness < 0.05) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const fire = g.world.base.fire;
    const fx = this.worldToScreenX(fire.x);
    const fy = this.worldToScreenY(fire.y);
    const glow = ctx.createRadialGradient(fx, fy, 4, fx, fy, 240);
    glow.addColorStop(0, 'rgba(255,148,56,0.16)');
    glow.addColorStop(1, 'rgba(255,100,20,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(fx, fy, 240, 0, TAU);
    ctx.fill();
    for (const l of g.world.lamps) {
      if (!g.isNight) continue;
      const x = this.worldToScreenX(l.x);
      const y = this.worldToScreenY(l.y);
      if (x < -80 || x > w + 80 || y < -80 || y > h + 80) continue;
      const lg = ctx.createRadialGradient(x, y - 20 * this.zoom, 2, x, y - 20 * this.zoom, 120 * this.zoom);
      lg.addColorStop(0, 'rgba(255,200,110,0.12)');
      lg.addColorStop(1, 'rgba(255,180,80,0)');
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.arc(x, y - 20 * this.zoom, 120 * this.zoom, 0, TAU);
      ctx.fill();
    }
    // enemy eyes
    if (g.isNight) {
      for (const e of g.enemies) {
        if (!e.alive) continue;
        const x = this.worldToScreenX(e.x);
        const y = this.worldToScreenY(e.y);
        if (x < -40 || x > w + 40 || y < -40 || y > h + 40) continue;
        const a = Math.atan2(e.angle);
        const off = e.r * 0.55 * this.zoom;
        const alpha = 0.5 + Math.sin(time * 3 + e.x) * 0.18;
        ctx.fillStyle = e.boss ? `rgba(255,60,50,${alpha})` : `rgba(255,196,90,${alpha})`;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * off + Math.sin(a) * 4 * this.zoom, y + Math.sin(a) * off - Math.cos(a) * 4 * this.zoom, (e.boss ? 3 : 1.7) * this.zoom, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * off - Math.sin(a) * 4 * this.zoom, y + Math.sin(a) * off + Math.cos(a) * 4 * this.zoom, (e.boss ? 3 : 1.7) * this.zoom, 0, TAU);
        ctx.fill();
        if (e.boss) {
          const bg = ctx.createRadialGradient(x, y, 10, x, y, 90 * this.zoom);
          bg.addColorStop(0, 'rgba(255,40,30,0.08)');
          bg.addColorStop(1, 'rgba(255,40,30,0)');
          ctx.fillStyle = bg;
          ctx.beginPath();
          ctx.arc(x, y, 90 * this.zoom, 0, TAU);
          ctx.fill();
        }
      }
    }
    // supply beacon
    if (g.supplyDrop) {
      const s = g.supplyDrop;
      const x = this.worldToScreenX(s.x);
      const y = this.worldToScreenY(s.y);
      const bg = ctx.createLinearGradient(x, y - 400, x, y);
      bg.addColorStop(0, 'rgba(150,255,110,0)');
      bg.addColorStop(1, 'rgba(150,255,110,0.16)');
      ctx.fillStyle = bg;
      ctx.fillRect(x - 16, y - 400, 32, 400);
    }
    ctx.restore();
  }

  drawScreenFx(g, time) {
    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // vignette
    const grd = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
    // damage vignette
    if (g.hitFlash > 0) {
      const red = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.72);
      red.addColorStop(0, 'rgba(120,10,10,0)');
      red.addColorStop(1, `rgba(150,15,12,${0.45 * g.hitFlash})`);
      ctx.fillStyle = red;
      ctx.fillRect(0, 0, w, h);
    }
    // low health pulse
    if (g.player.alive && g.player.hp / g.player.maxHp < 0.3) {
      const a = 0.1 + Math.sin(time * 6) * 0.05;
      const red = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
      red.addColorStop(0, 'rgba(90,8,8,0)');
      red.addColorStop(1, `rgba(120,10,10,${a})`);
      ctx.fillStyle = red;
      ctx.fillRect(0, 0, w, h);
    }
    // dusk grading
    if (g.phase === 'dusk') {
      ctx.fillStyle = 'rgba(150,70,25,0.06)';
      ctx.fillRect(0, 0, w, h);
    }
  }

  drawReticle(g) {
    if (g.touch || g.buildMode || g.menuOpen || g.mode !== 'playing') return;
    const ctx = this.ctx;
    const p = g.screenToWorld(g.input.mouse.x, g.input.mouse.y);
    const x = this.worldToScreenX(p.x);
    const y = this.worldToScreenY(p.y);
    const target = g.enemyAt(p.x, p.y, 30);
    const col = target ? 'rgba(255,105,80,0.95)' : 'rgba(255,210,140,0.9)';
    ctx.save();
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 15, y);
    ctx.lineTo(x - 5, y);
    ctx.moveTo(x + 5, y);
    ctx.lineTo(x + 15, y);
    ctx.moveTo(x, y - 15);
    ctx.lineTo(x, y - 5);
    ctx.moveTo(x, y + 5);
    ctx.lineTo(x, y + 15);
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(x, y, 1.7, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  drawMinimap(canvas, g) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    const scale = size / g.world.size;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#161a16';
    ctx.fillRect(0, 0, size, size);
    // roads
    ctx.strokeStyle = 'rgba(90,88,76,0.5)';
    ctx.lineWidth = 6 * scale * 6;
    for (const x of g.world.roadsX) {
      ctx.beginPath();
      ctx.moveTo(x * scale, 0);
      ctx.lineTo(x * scale, size);
      ctx.stroke();
    }
    for (const y of g.world.roadsY) {
      ctx.beginPath();
      ctx.moveTo(0, y * scale);
      ctx.lineTo(size, y * scale);
      ctx.stroke();
    }
    // buildings
    for (const b of g.world.buildings) {
      const x = (b.x - b.w / 2) * scale;
      const y = (b.y - b.h / 2) * scale;
      ctx.fillStyle = 'rgba(96,92,78,0.45)';
      ctx.fillRect(x, y, b.w * scale, b.h * scale);
    }
    // base
    const bx = g.world.base.x * scale;
    const by = g.world.base.y * scale;
    ctx.fillStyle = 'rgba(255,175,80,0.14)';
    ctx.beginPath();
    ctx.arc(bx, by, 300 * scale, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,190,110,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(bx, by, 240 * scale, 0, TAU);
    ctx.stroke();
    // crates
    for (const c of g.world.crates) {
      if (c.opened) continue;
      ctx.fillStyle = c.type === 'weapon' ? '#8ee9a0' : c.type === 'rare' ? '#78d9e0' : '#d9b46a';
      ctx.fillRect(c.x * scale - 2, c.y * scale - 2, 4, 4);
    }
    if (g.supplyDrop) {
      ctx.fillStyle = '#a6ff6e';
      ctx.beginPath();
      ctx.arc(g.supplyDrop.x * scale, g.supplyDrop.y * scale, 4, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(166,255,110,0.6)';
      ctx.beginPath();
      ctx.arc(g.supplyDrop.x * scale, g.supplyDrop.y * scale, 8, 0, TAU);
      ctx.stroke();
    }
    // enemies
    for (const e of g.enemies) {
      if (!e.alive) continue;
      ctx.fillStyle = e.boss ? '#ff3b30' : '#e56b5a';
      ctx.beginPath();
      ctx.arc(e.x * scale, e.y * scale, e.boss ? 3.5 : 2, 0, TAU);
      ctx.fill();
    }
    // allies
    for (const s of g.soldiers) {
      if (!s.alive) continue;
      ctx.fillStyle = '#9ddc8a';
      ctx.fillRect(s.x * scale - 1.5, s.y * scale - 1.5, 3, 3);
    }
    for (const s of g.structures) {
      if (!s.alive) continue;
      ctx.fillStyle = s.kind === 'turret' ? '#ffcf6a' : s.kind === 'lampbuild' ? '#ffe9a0' : '#7f8a7a';
      ctx.fillRect(s.x * scale - 1.5, s.y * scale - 1.5, 3, 3);
    }
    // player
    const px = g.player.x * scale;
    const py = g.player.y * scale;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(g.player.facing);
    ctx.fillStyle = '#ffe2a6';
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-4, -4);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,226,166,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(px, py, 10, 0, TAU);
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------------
// Enemy art
// ---------------------------------------------------------------------------

function drawWalker(ctx, e, wob) {
  const skin = e.def.skin;
  ctx.fillStyle = '#2a2b22';
  ctx.beginPath();
  ctx.ellipse(-4, -7 + wob * 0.3, 9, 5, 0.3, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-4, 7 - wob * 0.3, 9, 5, -0.3, 0, TAU);
  ctx.fill();
  ctx.fillStyle = e.def.cloth;
  ctx.beginPath();
  ctx.ellipse(-1, 0, 12, 9, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(5, 0, 10, 8, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = skin;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  const arm = wob * 1.2;
  ctx.beginPath();
  ctx.moveTo(7, -7);
  ctx.lineTo(17, -11 + arm);
  ctx.moveTo(7, 7);
  ctx.lineTo(17, 10 - arm);
  ctx.stroke();
  // claws
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(17, -11 + arm);
  ctx.lineTo(23, -15 + arm);
  ctx.moveTo(17, -11 + arm);
  ctx.lineTo(23, -9 + arm);
  ctx.moveTo(17, 10 - arm);
  ctx.lineTo(23, 14 - arm);
  ctx.moveTo(17, 10 - arm);
  ctx.lineTo(23, 8 - arm);
  ctx.stroke();
  // head
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(12, 0, 6.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#2a2b22';
  ctx.beginPath();
  ctx.arc(9, 0, 6.8, 0, TAU);
  ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(13, 0, 5, 0, TAU);
  ctx.fill();
  // mouth
  ctx.fillStyle = '#5c1e1c';
  ctx.beginPath();
  ctx.ellipse(16, 0, 2.4, 1.2, 0, 0, TAU);
  ctx.fill();
}

function drawRunner(ctx, e, wob) {
  const skin = e.def.skin;
  ctx.strokeStyle = '#332a25';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-2, -4);
  ctx.lineTo(-14 - wob, -7);
  ctx.moveTo(-2, 4);
  ctx.lineTo(-14 + wob, 7);
  ctx.stroke();
  ctx.fillStyle = e.def.cloth;
  ctx.beginPath();
  ctx.ellipse(-1, 0, 12, 6.5, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(6, 0, 9, 6, 0, 0, TAU);
  ctx.fill();
  // spikes
  ctx.fillStyle = '#6a4a30';
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(-5 + i * 4, -4);
    ctx.lineTo(-8 + i * 4, -10);
    ctx.lineTo(-2 + i * 4, -5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = skin;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(5, -5);
  ctx.lineTo(16, -11 + wob);
  ctx.moveTo(5, 5);
  ctx.lineTo(16, 10 - wob);
  ctx.stroke();
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(13, 0, 5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#2a1c18';
  ctx.beginPath();
  ctx.arc(10.5, 0, 5.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(14, 0, 4, 0, TAU);
  ctx.fill();
}

function drawSpitter(ctx, e, time, wob) {
  const skin = e.def.skin;
  ctx.strokeStyle = '#3a3325';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-6, -5);
  ctx.lineTo(-15, -9);
  ctx.moveTo(-6, 5);
  ctx.lineTo(-15, 9);
  ctx.stroke();
  // bloated sac
  const pulse = 1 + Math.sin(time * 4 + e.x) * 0.05;
  ctx.fillStyle = '#5e6b36';
  ctx.beginPath();
  ctx.ellipse(-3, 0, 15 * pulse, 12 * pulse, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(-1, 0, 12 * pulse, 9.5 * pulse, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(177,220,96,0.5)';
  ctx.beginPath();
  ctx.arc(-7, -3, 5, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-5, 4, 3.5, 0, TAU);
  ctx.fill();
  // head
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(10, 0, 6.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#3c2a1f';
  ctx.beginPath();
  ctx.arc(7.5, 0, 6.7, 0, TAU);
  ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(12, 0, 4.5, 0, TAU);
  ctx.fill();
  // drool
  ctx.fillStyle = 'rgba(160,220,90,0.65)';
  ctx.beginPath();
  ctx.ellipse(16, 2 + wob * 0.4, 2, 3, 0.4, 0, TAU);
  ctx.fill();
}

function drawBrute(ctx, e, wob) {
  const skin = e.def.skin;
  ctx.strokeStyle = '#2a211b';
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-8, -10);
  ctx.lineTo(-22, -16 + wob);
  ctx.moveTo(-8, 10);
  ctx.lineTo(-22, 16 - wob);
  ctx.stroke();
  ctx.fillStyle = e.def.cloth;
  ctx.beginPath();
  ctx.ellipse(-4, 0, 24, 20, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(4, 0, 20, 17, 0, 0, TAU);
  ctx.fill();
  // armor plates
  ctx.fillStyle = '#4a4033';
  ctx.beginPath();
  ctx.ellipse(2, 0, 13, 14, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#2c261f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-3, -13);
  ctx.lineTo(-3, 13);
  ctx.moveTo(9, -11);
  ctx.lineTo(9, 11);
  ctx.stroke();
  ctx.fillStyle = '#8a6a3f';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(9, -7 + i * 7, 2, 0, TAU);
    ctx.fill();
  }
  // arms
  ctx.strokeStyle = skin;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(8, -14);
  ctx.lineTo(24, -20 - wob);
  ctx.moveTo(8, 14);
  ctx.lineTo(24, 20 + wob);
  ctx.stroke();
  // head
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(16, 0, 9, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#30211a';
  ctx.beginPath();
  ctx.arc(13, 0, 9.4, 0, TAU);
  ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(19, 0, 6.5, 0, TAU);
  ctx.fill();
  // horns
  ctx.fillStyle = '#d8c9a5';
  ctx.beginPath();
  ctx.moveTo(12, -8);
  ctx.lineTo(8, -15);
  ctx.lineTo(16, -9);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(12, 8);
  ctx.lineTo(8, 15);
  ctx.lineTo(16, 9);
  ctx.closePath();
  ctx.fill();
}

function bunnyDrawBoss(ctx, e, time, wob) {
  const skin = e.def.skin;
  // aura
  const pulse = 0.5 + Math.sin(time * 2) * 0.5;
  ctx.strokeStyle = `rgba(255,60,40,${0.15 + pulse * 0.1})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 48 + pulse * 5, 0, TAU);
  ctx.stroke();
  // legs
  ctx.fillStyle = '#2a1d1b';
  ctx.beginPath();
  ctx.ellipse(-10, -20, 15, 9, 0.3, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-10, 20, 15, 9, -0.3, 0, TAU);
  ctx.fill();
  // torso
  ctx.fillStyle = e.def.cloth;
  ctx.beginPath();
  ctx.ellipse(-2, 0, 34, 28, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(6, 0, 28, 24, 0, 0, TAU);
  ctx.fill();
  // bone ribs
  ctx.strokeStyle = '#d8c9a5';
  ctx.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(6, 0, 10 + i * 3.5, -1.0, 1.0);
    ctx.stroke();
  }
  // arms (four)
  ctx.strokeStyle = skin;
  ctx.lineWidth = 11;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(8, -18);
  ctx.lineTo(34, -30 - wob);
  ctx.moveTo(8, 18);
  ctx.lineTo(34, 30 + wob);
  ctx.stroke();
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(2, -20);
  ctx.lineTo(26, -36 + wob * 0.5);
  ctx.moveTo(2, 20);
  ctx.lineTo(26, 36 - wob * 0.5);
  ctx.stroke();
  // claws
  ctx.strokeStyle = '#e5dcc0';
  ctx.lineWidth = 2.5;
  for (const sy of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(34, sy * 30 + (i - 1) * 4);
      ctx.lineTo(43, sy * 33 + (i - 1) * 6);
      ctx.stroke();
    }
  }
  // head
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(28, 0, 13, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#2c1b19';
  ctx.beginPath();
  ctx.arc(24, 0, 13.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(32, 0, 9, 0, TAU);
  ctx.fill();
  // crown
  ctx.fillStyle = '#d8c9a5';
  for (let i = 0; i < 5; i++) {
    const a = -0.7 + i * 0.35;
    const bx = 24 + Math.cos(a) * 14;
    const by = Math.sin(a) * 14;
    ctx.beginPath();
    ctx.moveTo(bx - 3, by + 2);
    ctx.lineTo(bx, by - 9);
    ctx.lineTo(bx + 3, by + 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#7a1518';
  ctx.beginPath();
  ctx.ellipse(36, 0, 4, 2.4, 0, 0, TAU);
  ctx.fill();
}
