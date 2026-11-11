import { clamp, dist, mulberry32, rand as _rand, resolveCircleRect, resolveCircleCircle } from './util.js';

export const WORLD_SIZE = 2800;
export const GRID = 56;
export const COLS = Math.ceil(WORLD_SIZE / GRID);

export class World {
  constructor(seed = 1337) {
    this.seed = seed;
    this.size = WORLD_SIZE;
    this.center = { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2 };
    this.rng = mulberry32(seed);
    this.props = [];
    this.buildings = [];
    this.cars = [];
    this.trees = [];
    this.rocks = [];
    this.barrels = [];
    this.lamps = [];
    this.crates = [];
    this.solidRects = [];
    this.solidCircles = [];
    this.roadsX = [420, 980, 1820, 2380];
    this.roadsY = [420, 980, 1820, 2380];
    this.lootSeq = 0;
    this.generate();
    this.buildSolids();
    this.flow = this.buildFlowField();
    this.ground = null;
  }

  r(min = 0, max = 1) {
    return this.rng() * (max - min) + min;
  }

  overlapRect(x, y, w, h, pad = 0) {
    return this.props.some((p) => {
      if (p.kind === 'crate' || p.kind === 'lamp') return false;
      if (!p.w || !p.h) return false;
      return (
        x - w / 2 < p.x + p.w / 2 + pad &&
        x + w / 2 > p.x - p.w / 2 - pad &&
        y - h / 2 < p.y + p.h / 2 + pad &&
        y + h / 2 > p.y - p.h / 2 - pad
      );
    });
  }

  nearRoad(x, y, pad = 60) {
    return (
      this.roadsX.some((rx) => Math.abs(x - rx) < pad) ||
      this.roadsY.some((ry) => Math.abs(y - ry) < pad)
    );
  }

  addProp(prop) {
    prop.sortY = prop.y + (prop.h ? prop.h / 2 : prop.r || 0);
    this.props.push(prop);
    return prop;
  }

  generate() {
    const c = this.center;
    const r = this.r.bind(this);
    const rng = this.rng;

    // --- City buildings -------------------------------------------------
    let attempts = 0;
    while (this.buildings.length < 34 && attempts < 500) {
      attempts++;
      const w = this.r(86, 250);
      const h = this.r(80, 220);
      const x = this.r(90, this.size - 90);
      const y = this.r(90, this.size - 90);
      const dx = x - c.x;
      const dy = y - c.y;
      if (Math.hypot(dx, dy) < 440) continue;
      if (this.nearRoad(x, y, 74)) continue;
      if (this.overlapRect(x, y, w, h, 34)) continue;
      const b = {
        kind: 'building',
        x,
        y,
        w,
        h,
        seed: Math.floor(rng() * 99999),
        tone: rng(),
        ruined: rng() < 0.55,
        height: r(10, 26),
      };
      this.buildings.push(b);
      this.addProp(b);
    }

    // A couple of larger warehouses for landmarks
    for (const [bx, by, bw, bh] of [
      [330, 1140, 210, 190],
      [2360, 760, 250, 170],
      [650, 2300, 240, 160],
      [2150, 2230, 200, 210],
    ]) {
      if (Math.hypot(bx - c.x, by - c.y) < 430) continue;
      const b = {
        kind: 'building',
        x: bx,
        y: by,
        w: bw,
        h: bh,
        seed: Math.floor(rng() * 99999),
        tone: rng(),
        ruined: true,
        height: r(20, 30),
        warehouse: true,
      };
      this.buildings.push(b);
      this.addProp(b);
    }

    // --- Wrecks along the roads -----------------------------------------
    for (let i = 0; i < 22; i++) {
      const vertical = rng() < 0.5;
      const roadX = this.roadsX[(rng() * this.roadsX.length) | 0];
      const roadY = this.roadsY[(rng() * this.roadsY.length) | 0];
      const x = vertical ? roadX + this.r(-48, 48) : this.r(150, this.size - 150);
      const y = vertical ? this.r(150, this.size - 150) : roadY + this.r(-48, 48);
      if (Math.hypot(x - c.x, y - c.y) < 360) continue;
      const car = {
        kind: 'car',
        x,
        y,
        w: vertical ? 34 : 58,
        h: vertical ? 58 : 34,
        angle: (vertical ? 0 : Math.PI / 2) + this.r(-0.12, 0.12),
        color: ['#5d4a3a', '#464e4a', '#5a3b34', '#4d4a58', '#414a3b'][(rng() * 5) | 0],
        burned: rng() < 0.35,
      };
      this.cars.push(car);
      this.addProp(car);
    }

    // --- Dead trees & rocks ---------------------------------------------
    for (let i = 0; i < 82; i++) {
      const x = this.r(60, this.size - 60);
      const y = this.r(60, this.size - 60);
      if (Math.hypot(x - c.x, y - c.y) < 380) continue;
      if (this.nearRoad(x, y, 76)) continue;
      if (this.overlapRect(x, y, 30, 30, 18)) continue;
      const tree = {
        kind: 'tree',
        x,
        y,
        r: this.r(10, 17),
        seed: rng() * 99,
        dead: rng() < 0.85,
      };
      this.trees.push(tree);
      this.addProp(tree);
    }
    for (let i = 0; i < 30; i++) {
      const x = this.r(60, this.size - 60);
      const y = this.r(60, this.size - 60);
      if (Math.hypot(x - c.x, y - c.y) < 360) continue;
      if (this.overlapRect(x, y, 34, 34, 18)) continue;
      const rock = { kind: 'rock', x, y, r: this.r(11, 25), seed: rng() * 99, tone: rng() };
      this.rocks.push(rock);
      this.addProp(rock);
    }

    // --- Explosive barrels ----------------------------------------------
    for (let i = 0; i < 20; i++) {
      const b = this.buildings[(rng() * this.buildings.length) | 0];
      if (!b) continue;
      const x = b.x + this.r(-1, 1) * (b.w / 2 + 26);
      const y = b.y + this.r(-1, 1) * (b.h / 2 + 26);
      if (Math.hypot(x - c.x, y - c.y) < 330) continue;
      const barrel = { kind: 'barrel', x, y, r: 11, hp: 26, alive: true };
      this.barrels.push(barrel);
      this.addProp(barrel);
    }

    // --- Street lamps ----------------------------------------------------
    for (let i = 0; i < 16; i++) {
      const vertical = rng() < 0.5;
      const roadX = this.roadsX[(rng() * this.roadsX.length) | 0];
      const roadY = this.roadsY[(rng() * this.roadsY.length) | 0];
      const x = vertical ? roadX + 66 : this.r(200, this.size - 200);
      const y = vertical ? this.r(200, this.size - 200) : roadY + 66;
      if (Math.hypot(x - c.x, y - c.y) < 340) continue;
      if (this.overlapRect(x, y, 16, 16, 10)) continue;
      const lamp = { kind: 'lamp', x, y, r: 9, lit: true };
      this.lamps.push(lamp);
      this.addProp(lamp);
    }

    // --- Workbench at the base ------------------------------------------
    this.workbench = {
      kind: 'workbench',
      x: c.x + 118,
      y: c.y + 66,
      w: 58,
      h: 36,
    };
    this.addProp(this.workbench);

    // --- Loot crates -----------------------------------------------------
    const crateSpots = [
      ...this.buildings.map((b) => ({
        x: b.x + (rng() < 0.5 ? -1 : 1) * (b.w / 2 + this.r(24, 54)),
        y: b.y + this.r(-b.h / 2, b.h / 2),
      })),
      ...this.buildings.map((b) => ({
        x: b.x + this.r(-b.w / 2, b.w / 2),
        y: b.y + (rng() < 0.5 ? -1 : 1) * (b.h / 2 + this.r(24, 54)),
      })),
    ];
    let guard = 0;
    while (this.crates.length < 32 && guard < 140) {
      guard++;
      const spot = crateSpots[(rng() * crateSpots.length) | 0];
      if (!spot) continue;
      const x = spot.x + this.r(-22, 22);
      const y = spot.y + this.r(-22, 22);
      if (Math.hypot(x - c.x, y - c.y) < 260) continue;
      if (this.hasStaticAt(x, y, 34)) continue;
      if (this.crates.some((cr) => dist(cr.x, cr.y, x, y) < 110)) continue;
      const roll = rng();
      const type = roll < 0.09 ? 'weapon' : roll < 0.3 ? 'rare' : 'common';
      const crate = {
        kind: 'crate',
        x,
        y,
        r: 18,
        opened: false,
        type,
        id: ++this.lootSeq,
        wobble: rng() * 6,
      };
      this.crates.push(crate);
      this.addProp(crate);
    }

    this.base = {
      x: c.x,
      y: c.y,
      fire: { x: c.x - 96, y: c.y + 72 },
      radius: 330,
      buildRadius: 238,
    };
  }

  buildSolids() {
    this.solidRects = [];
    this.solidCircles = [];
    for (const p of this.props) {
      if (p.kind === 'crate' || p.kind === 'lamp') continue;
      if (p.kind === 'tree' || p.kind === 'rock') {
        this.solidCircles.push({ x: p.x, y: p.y, r: p.r, ref: p });
      } else if (p.kind === 'barrel') {
        this.solidCircles.push({ x: p.x, y: p.y, r: p.r + 2, ref: p });
      } else if (p.w && p.h) {
        this.solidRects.push({ x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h, ref: p });
      }
    }
  }

  hasStaticAt(x, y, radius = 4) {
    for (const rect of this.solidRects) {
      const nx = clamp(x, rect.x, rect.x + rect.w);
      const ny = clamp(y, rect.y, rect.y + rect.h);
      if ((x - nx) ** 2 + (y - ny) ** 2 < radius * radius) return true;
    }
    for (const circle of this.solidCircles) {
      if (dist(x, y, circle.x, circle.y) < circle.r + radius) return true;
    }
    return false;
  }

  randomOpenSpot(minFromBase = 380, radius = 18) {
    for (let i = 0; i < 220; i++) {
      const x = this.r(90, this.size - 90);
      const y = this.r(90, this.size - 90);
      if (Math.hypot(x - this.center.x, y - this.center.y) < minFromBase) continue;
      if (this.hasStaticAt(x, y, radius + 8)) continue;
      return { x, y };
    }
    return { x: this.r(120, this.size - 120), y: this.r(120, this.size - 120) };
  }

  // BFS flow field towards the base core. Destructible player structures
  // are deliberately ignored so enemies path straight at walls and attack.
  buildFlowField() {
    const cols = COLS;
    const rows = COLS;
    const distField = new Int32Array(cols * rows).fill(-1);
    const dirX = new Float32Array(cols * rows);
    const dirY = new Float32Array(cols * rows);
    const blocked = new Uint8Array(cols * rows);
    const pad = 18;
    for (const rect of this.solidRects) {
      const x0 = clamp(Math.floor((rect.x - pad) / GRID), 0, cols - 1);
      const x1 = clamp(Math.floor((rect.x + rect.w + pad) / GRID), 0, cols - 1);
      const y0 = clamp(Math.floor((rect.y - pad) / GRID), 0, rows - 1);
      const y1 = clamp(Math.floor((rect.y + rect.h + pad) / GRID), 0, rows - 1);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) blocked[y * cols + x] = 1;
    }
    for (const circ of this.solidCircles) {
      const x0 = clamp(Math.floor((circ.x - circ.r - pad) / GRID), 0, cols - 1);
      const x1 = clamp(Math.floor((circ.x + circ.r + pad) / GRID), 0, cols - 1);
      const y0 = clamp(Math.floor((circ.y - circ.r - pad) / GRID), 0, rows - 1);
      const y1 = clamp(Math.floor((circ.y + circ.r + pad) / GRID), 0, rows - 1);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const cx = x * GRID + GRID / 2;
          const cy = y * GRID + GRID / 2;
          if (Math.hypot(cx - circ.x, cy - circ.y) < circ.r + pad + GRID / 2) {
            blocked[y * cols + x] = 1;
          }
        }
      }
    }
    const start = this.cellAt(this.center.x, this.center.y);
    const queue = [start];
    distField[start] = 0;
    const neigh = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [1, -1], [-1, 1], [-1, -1],
    ];
    for (let head = 0; head < queue.length; head++) {
      const idx = queue[head];
      const cx = idx % cols;
      const cy = (idx / cols) | 0;
      const d = distField[idx];
      for (const [ox, oy] of neigh) {
        const nx = cx + ox;
        const ny = cy + oy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const nidx = ny * cols + nx;
        if (blocked[nidx] || distField[nidx] !== -1) continue;
        if (ox !== 0 && oy !== 0) {
          if (blocked[cy * cols + nx] || blocked[ny * cols + cx]) continue;
        }
        distField[nidx] = d + (ox !== 0 && oy !== 0 ? 14 : 10);
        queue.push(nidx);
      }
    }
    for (let i = 0; i < cols * rows; i++) {
      if (distField[i] <= 0) continue;
      const cx = i % cols;
      const cy = (i / cols) | 0;
      let best = distField[i];
      let bx = 0;
      let by = 0;
      for (const [ox, oy] of neigh) {
        const nx = cx + ox;
        const ny = cy + oy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const nd = distField[ny * cols + nx];
        if (nd === -1 || nd >= best) continue;
        if (ox !== 0 && oy !== 0) {
          if (blocked[cy * cols + nx] || blocked[ny * cols + cx]) continue;
        }
        best = nd;
        bx = ox;
        by = oy;
      }
      dirX[i] = bx;
      dirY[i] = by;
    }
    return { cols, rows, dist: distField, dirX, dirY, blocked };
  }

  cellAt(x, y) {
    const cx = clamp(Math.floor(x / GRID), 0, COLS - 1);
    const cy = clamp(Math.floor(y / GRID), 0, COLS - 1);
    return cy * COLS + cx;
  }

  flowAt(x, y) {
    const idx = this.cellAt(x, y);
    let dx = this.flow.dirX[idx];
    let dy = this.flow.dirY[idx];
    if (!dx && !dy) return null;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  }
}
