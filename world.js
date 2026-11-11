/* ============================================================
   world.js — sinh bản đồ, địa hình, đổ nát, căn cứ
   ============================================================ */
(function () {
  'use strict';
  const U = TT.U;

  class World {
    constructor(game) {
      this.game = game;
      this.size = 4200;
      this.base = {
        x: 2100, y: 2100, r: 310,
        command: { x: 2100, y: 1968 },
        fire: { x: 2242, y: 2172 },
        antenna: { x: 1908, y: 1930 },
        tents: [{ x: 1938, y: 2178, w: 96, h: 76 }, { x: 2282, y: 2024, w: 80, h: 68 }],
        spawn: { x: 2100, y: 2190 },
      };
      this.reset();
    }

    reset() {
      this.obstacles = [];
      this.buildings = [];
      this.loots = [];
      this.explosives = [];
      this.decals = [];
      this.baseProps = [];
      this.explored = new Set();
      this.generate();
      this.seedExplored();
    }

    seedExplored() {
      for (let dx = -6; dx <= 6; dx++) {
        for (let dy = -6; dy <= 6; dy++) {
          if (dx * dx + dy * dy < 40) this.explored.add(`${dx + 21},${dy + 21}`);
        }
      }
    }

    markExplored(x, y, radius = 480) {
      const cell = 100;
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
      const rr = Math.ceil(radius / cell);
      for (let dx = -rr; dx <= rr; dx++) {
        for (let dy = -rr; dy <= rr; dy++) {
          if (dx * dx + dy * dy > rr * rr) continue;
          this.explored.add(`${cx + dx},${cy + dy}`);
        }
      }
    }

    isExplored(x, y) {
      return this.explored.has(`${Math.floor(x / 100)},${Math.floor(y / 100)}`);
    }

    generate() {
      const rng = U.mulberry32(20771);
      const R = (a, b) => a + rng() * (b - a);
      const SIZE = this.size;

      // Vành đai đổ nát quanh biên bản đồ
      const border = 70;
      this.obstacles.push(
        { x: -60, y: -60, w: SIZE + 120, h: border, kind: 'rubble-edge', seed: 1, solid: true },
        { x: -60, y: SIZE - 10, w: SIZE + 120, h: border, kind: 'rubble-edge', seed: 2, solid: true },
        { x: -60, y: 0, w: border, h: SIZE, kind: 'rubble-edge', seed: 3, solid: true },
        { x: SIZE - 10, y: 0, w: border, h: SIZE, kind: 'rubble-edge', seed: 4, solid: true },
      );

      // ---- Nhà đổ nát ----
      let attempts = 0;
      while (this.buildings.length < 26 && attempts < 500) {
        attempts++;
        const w = Math.round(R(150, 360) / 20) * 20;
        const h = Math.round(R(130, 280) / 20) * 20;
        const x = Math.round(R(180, SIZE - 180 - w));
        const y = Math.round(R(180, SIZE - 180 - h));
        if (U.dist(x + w / 2, y + h / 2, this.base.x, this.base.y) < 520) continue;
        if (this.tooCloseToBuilding(x, y, w, h)) continue;
        if (this.onRoad(x, y, w, h, 30)) continue;
        this.buildBuilding(x, y, w, h, rng);
      }

      // ---- Ô tô hỏng dọc đường ----
      const roadSpots = [];
      for (let i = 0; i < 8; i++) {
        roadSpots.push({ x: R(350, SIZE - 350), y: 2100 + R(-50, 50), vertical: true });
        roadSpots.push({ x: 2100 + R(-55, 55), y: R(350, SIZE - 350), vertical: false });
      }
      for (let i = 0; i < 6; i++) {
        roadSpots.push({ x: R(300, SIZE - 300), y: 850 + R(-30, 30), vertical: true });
        roadSpots.push({ x: 850 + R(-30, 30), y: R(300, SIZE - 300), vertical: false });
        roadSpots.push({ x: R(300, SIZE - 300), y: 3350 + R(-30, 30), vertical: true });
        roadSpots.push({ x: 3350 + R(-30, 30), y: R(300, SIZE - 300), vertical: false });
      }
      for (const spot of roadSpots) {
        if (U.dist(spot.x, spot.y, this.base.x, this.base.y) < 420) continue;
        if (rng() > 0.62) continue;
        const vertical = spot.vertical;
        const w = vertical ? 62 : 112;
        const h = vertical ? 112 : 62;
        if (this.overlapsAny(spot.x - w / 2, spot.y - h / 2, w, h, 30)) continue;
        this.obstacles.push({ x: spot.x - w / 2, y: spot.y - h / 2, w, h, kind: 'car', seed: rng() * 999, solid: true });
      }

      // ---- Cây chết ----
      for (let i = 0; i < 100; i++) {
        const x = R(180, SIZE - 180), y = R(180, SIZE - 180);
        if (U.dist(x, y, this.base.x, this.base.y) < 400) continue;
        if (this.overlapsAny(x - 20, y - 20, 40, 40, 45)) continue;
        if (this.onRoad(x - 20, y - 20, 40, 40, 10)) continue;
        this.obstacles.push({ x: x - 17, y: y - 17, w: 34, h: 34, kind: 'tree', seed: rng() * 999, solid: true });
      }

      // ---- Đá tảng ----
      for (let i = 0; i < 55; i++) {
        const x = R(180, SIZE - 180), y = R(180, SIZE - 180);
        const s = R(28, 62);
        if (U.dist(x, y, this.base.x, this.base.y) < 360) continue;
        if (this.overlapsAny(x - s / 2, y - s / 2, s, s, 25)) continue;
        this.obstacles.push({ x: x - s / 2, y: y - s / 2, w: s, h: s * 0.86, kind: 'rock', seed: rng() * 999, solid: true });
      }

      // ---- Thùng nổ ----
      for (let i = 0; i < 34; i++) {
        const x = R(250, SIZE - 250), y = R(250, SIZE - 250);
        if (U.dist(x, y, this.base.x, this.base.y) < 380) continue;
        if (this.overlapsAny(x - 14, y - 14, 28, 28, 20)) continue;
        const ob = { x: x - 13, y: y - 13, w: 26, h: 26, kind: 'barrel', seed: rng() * 999, solid: true, hp: 24, explosive: true };
        this.obstacles.push(ob);
        this.explosives.push(ob);
      }

      // ---- Vật tư rải rác ----
      for (let i = 0; i < 72; i++) {
        const x = R(220, SIZE - 220), y = R(220, SIZE - 220);
        if (U.dist(x, y, this.base.x, this.base.y) < 390) continue;
        if (this.pointBlocked(x, y, 22)) continue;
        if (this.loots.some(l => U.dist(l.x, l.y, x, y) < 90)) continue;
        let type = 'crate';
        const roll = rng();
        if (roll > 0.76) type = 'duffel';
        else if (roll > 0.64) type = 'corpse';
        else if (roll > 0.56) type = 'locker';
        this.loots.push(this.makeLoot(x, y, type, rng));
      }

      // ---- Kho vũ khí đặc biệt ----
      const cachePositions = [
        { x: 860, y: 1460 }, { x: 3420, y: 1120 }, { x: 3080, y: 3420 },
        { x: 1280, y: 3250 }, { x: 3680, y: 2640 }, { x: 520, y: 2780 },
      ];
      for (const p of cachePositions) {
        if (this.pointBlocked(p.x, p.y, 30)) {
          p.x += 55; p.y += 35;
        }
        const loot = this.makeLoot(p.x, p.y, 'weapon', rng);
        loot.weaponCache = true;
        this.loots.push(loot);
      }

      // ---- Xác và vết máu cũ ----
      for (let i = 0; i < 75; i++) {
        const b = this.buildings[Math.floor(rng() * this.buildings.length)];
        if (!b) break;
        const x = b.x + R(30, b.w - 30), y = b.y + R(30, b.h - 30);
        this.decals.push({ type: 'blood', x, y, r: R(12, 34), rot: R(0, 6.28), seed: rng() * 100 });
      }
      for (let i = 0; i < 650; i++) {
        const x = R(100, SIZE - 100), y = R(100, SIZE - 100);
        const roll = rng();
        let type = 'patch';
        if (roll > 0.72) type = 'tuft';
        else if (roll > 0.55) type = 'debris';
        else if (roll > 0.49) type = 'crack';
        this.decals.push({ type, x, y, r: R(8, 42), rot: R(0, 6.28), seed: rng() * 100 });
      }

      // ---- Vật cản quanh căn cứ ----
      const base = this.base;
      const sandbags = [
        { x: base.x - 280, y: base.y - 90, w: 76, h: 26, a: -0.3 },
        { x: base.x - 240, y: base.y + 170, w: 76, h: 26, a: 0.55 },
        { x: base.x + 260, y: base.y - 130, w: 76, h: 26, a: -0.7 },
        { x: base.x + 220, y: base.y + 200, w: 76, h: 26, a: 0.2 },
      ];
      for (const sb of sandbags) {
        this.obstacles.push({ x: sb.x, y: sb.y, w: sb.w, h: sb.h, kind: 'sandbag', seed: rng() * 999, solid: true, angle: sb.a });
      }

      // ---- Vật trang trí căn cứ ----
      this.baseProps = [
        { type: 'antenna', x: base.antenna.x, y: base.antenna.y },
        { type: 'generator', x: base.x + 195, y: base.y - 95 },
        { type: 'barrel', x: base.x + 245, y: base.y - 40 },
        { type: 'barrel', x: base.x + 262, y: base.y - 4 },
        { type: 'crate', x: base.x - 180, y: base.y + 90 },
        { type: 'crate', x: base.x - 196, y: base.y + 70 },
        { type: 'flag', x: base.x - 60, y: base.y - 168 },
      ];

      // Thùng tiếp tế ban đầu trong căn cứ
      const supply = this.makeLoot(base.x + 160, base.y + 118, 'supply', rng);
      supply.baseSupply = true;
      this.loots.push(supply);
    }

    makeLoot(x, y, type, rng) {
      const r = rng || Math.random;
      return {
        x, y, type, opened: false,
        seed: r() * 999, phase: r() * 6.28,
        far: U.dist(x, y, this.base.x, this.base.y) / this.size,
        weaponCache: false, baseSupply: false,
        label: type === 'weapon' ? 'KHO VŨ KHÍ' : null,
      };
    }

    tooCloseToBuilding(x, y, w, h) {
      return this.buildings.some(b => {
        return x < b.x + b.w + 110 && x + w + 110 > b.x && y < b.y + b.h + 110 && y + h + 110 > b.y;
      });
    }

    onRoad(x, y, w, h, pad) {
      const roads = this.roadRects();
      return roads.some(r => x < r.x + r.w + pad && x + w + pad > r.x && y < r.y + r.h + pad && y + h + pad > r.y);
    }

    roadRects() {
      return [
        { x: 0, y: 2020, w: this.size, h: 160 },
        { x: 2020, y: 0, w: 160, h: this.size },
        { x: 0, y: 800, w: this.size, h: 100 },
        { x: 800, y: 0, w: 100, h: this.size },
        { x: 0, y: 3300, w: this.size, h: 100 },
        { x: 3300, y: 0, w: 100, h: this.size },
      ];
    }

    overlapsAny(x, y, w, h, pad) {
      const rect = { x: x - pad, y: y - pad, w: w + pad * 2, h: h + pad * 2 };
      return this.obstacles.some(o => o.kind !== 'rubble-edge' && x < o.x + o.w + pad && x + w + pad > o.x && y < o.y + o.h + pad && y + h + pad > o.y);
    }

    pointBlocked(x, y, r) {
      return this.obstacles.some(o => o.solid && U.circleRect(x, y, r, o));
    }

    buildBuilding(x, y, w, h, rng) {
      const building = { x, y, w, h, seed: rng() * 999, floors: [], walls: [] };
      const t = 18;
      const gapSide = Math.floor(rng() * 4);
      const gapStart = 0.32 + rng() * 0.2;
      const gapLen = 0.16 + rng() * 0.12;

      const makeWall = (wx, wy, ww, wh, side) => {
        const horizontal = ww > wh;
        const start = horizontal ? (wx - x) / w : (wy - y) / h;
        const len = horizontal ? ww / w : wh / h;
        const inGap = side === gapSide && start < gapStart + gapLen && start + len > gapStart;
        if (inGap) return;
        if (side !== gapSide && rng() < 0.11) return;
        const ob = { x: wx, y: wy, w: ww, h: wh, kind: 'wall', seed: rng() * 999, solid: true };
        this.obstacles.push(ob);
        building.walls.push(ob);
      };

      makeWall(x, y, w, t, 0);
      makeWall(x, y + h - t, w, t, 2);
      makeWall(x, y + t, t, h - t * 2, 1);
      makeWall(x + w - t, y + t, t, h - t * 2, 3);
      this.buildings.push(building);

      // nội thất đổ nát
      const innerCount = 1 + Math.floor(rng() * 3);
      for (let i = 0; i < innerCount; i++) {
        const iw = 30 + rng() * 60, ih = 20 + rng() * 40;
        const ix = x + 30 + rng() * (w - 60 - iw);
        const iy = y + 30 + rng() * (h - 60 - ih);
        if (ix + iw > x + w - 24 || iy + ih > y + h - 24) continue;
        this.obstacles.push({ x: ix, y: iy, w: iw, h: ih, kind: rng() > 0.55 ? 'shelf' : 'rubble', seed: rng() * 999, solid: true });
      }

      // vật tư trong nhà
      const lootCount = 2 + Math.floor(rng() * 3);
      for (let i = 0; i < lootCount; i++) {
        const lx = x + 50 + rng() * (w - 100);
        const ly = y + 50 + rng() * (h - 100);
        if (this.pointBlocked(lx, ly, 16)) continue;
        const r = rng();
        this.loots.push(this.makeLoot(lx, ly, r > 0.68 ? 'locker' : r > 0.38 ? 'crate' : 'duffel', rng));
      }

      // mảng nứt sàn
      this.decals.push({ type: 'floor', x, y, w, h, seed: rng() * 99 });
    }

    // ============================================================
    //  VẼ ĐỊA HÌNH
    // ============================================================
    drawGround(ctx, view) {
      const SIZE = this.size;
      const tile = 80;
      const x0 = Math.max(0, Math.floor(view.left / tile));
      const x1 = Math.min(Math.ceil(SIZE / tile), Math.ceil(view.right / tile));
      const y0 = Math.max(0, Math.floor(view.top / tile));
      const y1 = Math.min(Math.ceil(SIZE / tile), Math.ceil(view.bottom / tile));

      for (let ty = y0; ty < y1; ty++) {
        for (let tx = x0; tx < x1; tx++) {
          const h = U.hash(tx, ty, 3);
          const r = 27 + h * 8;
          const g = 32 + h * 9;
          const b = 23 + h * 7;
          ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
          ctx.fillRect(tx * tile - 1, ty * tile - 1, tile + 2, tile + 2);
        }
      }

      // đường nhựa
      ctx.save();
      for (const road of this.roadRects()) {
        if (road.x + road.w < view.left || road.x > view.right || road.y + road.h < view.top || road.y > view.bottom) continue;
        const main = road.w > 140 || road.h > 140;
        ctx.fillStyle = main ? '#242622' : '#222420';
        ctx.fillRect(road.x, road.y, road.w, road.h);
        // mép đường
        ctx.fillStyle = 'rgba(78,76,61,0.55)';
        if (road.w > road.h) {
          ctx.fillRect(road.x, road.y, road.w, 4);
          ctx.fillRect(road.x, road.y + road.h - 4, road.w, 4);
        } else {
          ctx.fillRect(road.x, road.y, 4, road.h);
          ctx.fillRect(road.x + road.w - 4, road.y, 4, road.h);
        }
        // vạch kẻ mờ
        ctx.strokeStyle = main ? 'rgba(196,164,84,0.22)' : 'rgba(180,168,120,0.14)';
        ctx.lineWidth = main ? 5 : 3;
        ctx.setLineDash([main ? 46 : 30, main ? 36 : 42]);
        ctx.beginPath();
        if (road.w > road.h) {
          const cy = road.y + road.h / 2;
          ctx.moveTo(Math.max(view.left, road.x), cy);
          ctx.lineTo(Math.min(view.right, road.x + road.w), cy);
        } else {
          const cx = road.x + road.w / 2;
          ctx.moveTo(cx, Math.max(view.top, road.y));
          ctx.lineTo(cx, Math.min(view.bottom, road.y + road.h));
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();

      // vết nứt, bụi, cỏ khô
      for (const d of this.decals) {
        if (d.x < view.left - 80 || d.x > view.right + 80 || d.y < view.top - 80 || d.y > view.bottom + 80) continue;
        if (d.type === 'patch') {
          ctx.fillStyle = U.hash(d.x | 0, d.y | 0, 9) > 0.5 ? 'rgba(45,50,33,0.34)' : 'rgba(18,22,16,0.32)';
          ctx.beginPath();
          ctx.ellipse(d.x, d.y, d.r * 1.6, d.r * 0.8, d.rot, 0, U.TAU);
          ctx.fill();
        } else if (d.type === 'tuft') {
          ctx.strokeStyle = 'rgba(92,96,54,0.34)';
          ctx.lineWidth = 1.2;
          for (let i = 0; i < 4; i++) {
            const a = d.rot + i * 0.4;
            ctx.beginPath();
            ctx.moveTo(d.x, d.y);
            ctx.lineTo(d.x + Math.cos(a) * (5 + i * 2), d.y + Math.sin(a) * (5 + i * 2) - 5);
            ctx.stroke();
          }
        } else if (d.type === 'debris') {
          ctx.fillStyle = 'rgba(89,84,66,0.5)';
          ctx.fillRect(d.x, d.y, 5, 3);
          ctx.fillRect(d.x + 7, d.y - 4, 3, 2);
        } else if (d.type === 'crack') {
          ctx.strokeStyle = 'rgba(9,11,8,0.36)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          let px = d.x, py = d.y;
          for (let i = 0; i < 4; i++) {
            const a = d.rot + Math.sin(d.seed + i) * 1.1;
            px += Math.cos(a) * 9; py += Math.sin(a) * 9;
            ctx.lineTo(px, py);
          }
          ctx.stroke();
        } else if (d.type === 'blood') {
          ctx.fillStyle = 'rgba(64,24,18,0.34)';
          ctx.beginPath();
          ctx.ellipse(d.x, d.y, d.r, d.r * 0.55, d.rot, 0, U.TAU);
          ctx.fill();
        } else if (d.type === 'floor') {
          ctx.fillStyle = 'rgba(72,70,57,0.2)';
          ctx.fillRect(d.x, d.y, d.w, d.h);
        }
      }

      this.drawBaseGround(ctx, view);
    }

    drawBaseGround(ctx, view) {
      const b = this.base;
      if (b.x + b.r < view.left || b.x - b.r > view.right || b.y + b.r < view.top || b.y - b.r > view.bottom) return;
      ctx.save();
      ctx.fillStyle = '#37382e';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, U.TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(130,126,96,0.4)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r - 8, 0, U.TAU);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(18,20,16,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r - 26, 0, U.TAU);
      ctx.stroke();

      // vạch cảnh báo
      ctx.strokeStyle = 'rgba(211,151,57,0.35)';
      ctx.lineWidth = 4;
      ctx.setLineDash([16, 14]);
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r - 44, 0, U.TAU);
      ctx.stroke();
      ctx.setLineDash([]);

      // vết nứt sàn
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * U.TAU + 0.24;
        const rr = 100 + (i * 47) % 160;
        ctx.strokeStyle = 'rgba(20,22,17,0.35)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        const sx = b.x + Math.cos(a) * rr, sy = b.y + Math.sin(a) * rr * 0.9;
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.cos(a + 0.8) * 20, sy + Math.sin(a + 0.8) * 12);
        ctx.lineTo(sx + Math.cos(a + 0.2) * 34, sy + Math.sin(a + 0.2) * 22);
        ctx.stroke();
      }

      // chữ 07 trên sàn
      ctx.save();
      ctx.translate(b.x, b.y + 175);
      ctx.rotate(-0.04);
      ctx.font = '900 64px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = 'rgba(216,209,177,0.09)';
      ctx.textAlign = 'center';
      ctx.fillText('07', 0, 0);
      ctx.restore();

      // lối vào
      ctx.fillStyle = 'rgba(187,164,103,0.2)';
      ctx.fillRect(b.x - 46, b.y + b.r - 14, 92, 24);

      ctx.restore();
    }

    drawProps(ctx, view) {
      for (const o of this.obstacles) {
        if (o.x + o.w < view.left - 100 || o.x > view.right + 100 || o.y + o.h < view.top - 100 || o.y > view.bottom + 100) continue;
        this.drawObstacle(ctx, o);
      }
      // trang trí căn cứ
      for (const p of this.baseProps) {
        if (p.x < view.left - 120 || p.x > view.right + 120 || p.y < view.top - 120 || p.y > view.bottom + 120) continue;
        this.drawBaseProp(ctx, p);
      }
      this.drawBaseStructures(ctx, view);
    }

    drawObstacle(ctx, o) {
      const s = o.seed || 0;
      switch (o.kind) {
        case 'wall': {
          ctx.fillStyle = 'rgba(5,7,5,0.4)';
          ctx.fillRect(o.x + 5, o.y + 7, o.w, o.h);
          ctx.fillStyle = '#3f4237';
          ctx.fillRect(o.x, o.y, o.w, o.h);
          ctx.fillStyle = '#4c4e41';
          ctx.fillRect(o.x, o.y, o.w, Math.max(4, o.h * 0.34));
          // gạch nứt
          ctx.strokeStyle = 'rgba(17,19,14,0.45)';
          ctx.lineWidth = 1;
          const n = Math.max(1, Math.floor((o.w + o.h) / 42));
          for (let i = 0; i < n; i++) {
            const hx = o.x + U.hash(i, s, 4) * o.w;
            const hy = o.y + U.hash(i, s, 6) * o.h;
            ctx.beginPath();
            ctx.moveTo(hx, hy);
            ctx.lineTo(hx + 6, hy + 4);
            ctx.lineTo(hx + 9, hy + 1);
            ctx.stroke();
          }
          if (s % 5 < 2) {
            ctx.fillStyle = 'rgba(83,102,55,0.28)';
            ctx.fillRect(o.x + (s * 13) % Math.max(1, o.w - 10), o.y + o.h - 6, 12, 6);
          }
          break;
        }
        case 'car': {
          this.drawCar(ctx, o);
          break;
        }
        case 'tree': {
          const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
          ctx.fillStyle = 'rgba(4,6,4,0.35)';
          ctx.beginPath();
          ctx.ellipse(cx + 14, cy + 14, 46, 16, 0.5, 0, U.TAU);
          ctx.fill();
          ctx.strokeStyle = '#403b2d';
          ctx.lineCap = 'round';
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.moveTo(cx, cy + 10);
          ctx.lineTo(cx + Math.sin(s) * 6, cy - 22);
          ctx.stroke();
          ctx.lineWidth = 3;
          for (let i = 0; i < 5; i++) {
            const a = s + i * 1.2;
            ctx.beginPath();
            ctx.moveTo(cx + Math.sin(s) * 3, cy - 10 - i * 2);
            ctx.lineTo(cx + Math.cos(a) * (20 + i * 3), cy - 16 - i * 3 + Math.sin(a) * 15);
            ctx.stroke();
          }
          ctx.fillStyle = '#3a3529';
          ctx.beginPath();
          ctx.arc(cx, cy, 7, 0, U.TAU);
          ctx.fill();
          break;
        }
        case 'rock': {
          const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
          ctx.fillStyle = 'rgba(4,6,4,0.32)';
          ctx.beginPath();
          ctx.ellipse(cx + 6, cy + 9, o.w * 0.52, o.h * 0.36, 0.3, 0, U.TAU);
          ctx.fill();
          ctx.fillStyle = s % 3 === 0 ? '#494b41' : '#43453b';
          ctx.beginPath();
          for (let i = 0; i < 7; i++) {
            const a = (i / 7) * U.TAU;
            const rr = (0.4 + U.hash(i, s, 2) * 0.14);
            const px = cx + Math.cos(a) * o.w * rr;
            const py = cy + Math.sin(a) * o.h * rr;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = 'rgba(150,148,124,0.13)';
          ctx.beginPath();
          ctx.ellipse(cx - o.w * 0.1, cy - o.h * 0.12, o.w * 0.24, o.h * 0.14, -0.5, 0, U.TAU);
          ctx.fill();
          break;
        }
        case 'barrel': {
          const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
          ctx.fillStyle = 'rgba(4,6,4,0.36)';
          ctx.beginPath();
          ctx.ellipse(cx + 5, cy + 6, 15, 10, 0.3, 0, U.TAU);
          ctx.fill();
          ctx.fillStyle = '#6c4b31';
          ctx.beginPath();
          ctx.arc(cx, cy, 12, 0, U.TAU);
          ctx.fill();
          ctx.strokeStyle = '#3d2b1d';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx, cy, 8, 0, U.TAU);
          ctx.stroke();
          ctx.fillStyle = '#b89a51';
          ctx.fillRect(cx - 12, cy - 4, 24, 3);
          ctx.fillStyle = 'rgba(24,14,8,0.5)';
          ctx.beginPath();
          ctx.arc(cx - 4, cy - 4, 3, 0, U.TAU);
          ctx.fill();
          break;
        }
        case 'sandbag': {
          const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(o.angle || 0);
          ctx.fillStyle = 'rgba(4,6,4,0.3)';
          ctx.fillRect(-o.w / 2 + 4, -o.h / 2 + 6, o.w, o.h);
          for (let i = 0; i < 3; i++) {
            ctx.fillStyle = i % 2 ? '#7b704c' : '#857a54';
            ctx.beginPath();
            ctx.ellipse(-o.w / 2 + 14 + i * 25, 0, 17, 12, 0, 0, U.TAU);
            ctx.fill();
            ctx.strokeStyle = 'rgba(57,50,31,0.5)';
            ctx.lineWidth = 1;
            ctx.stroke();
          }
          ctx.restore();
          break;
        }
        case 'shelf': {
          ctx.fillStyle = 'rgba(4,6,4,0.3)';
          ctx.fillRect(o.x + 4, o.y + 5, o.w, o.h);
          ctx.fillStyle = '#3b382c';
          ctx.fillRect(o.x, o.y, o.w, o.h);
          ctx.strokeStyle = 'rgba(140,128,90,0.35)';
          ctx.lineWidth = 1;
          for (let i = 1; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(o.x, o.y + (o.h / 3) * i);
            ctx.lineTo(o.x + o.w, o.y + (o.h / 3) * i);
            ctx.stroke();
          }
          break;
        }
        case 'rubble': {
          ctx.fillStyle = 'rgba(4,6,4,0.3)';
          ctx.fillRect(o.x + 4, o.y + 4, o.w, o.h);
          for (let i = 0; i < 7; i++) {
            const px = o.x + U.hash(i, s, 1) * o.w;
            const py = o.y + U.hash(i, s, 2) * o.h;
            ctx.fillStyle = i % 2 ? '#47463a' : '#3a3a2f';
            ctx.fillRect(px, py, 6 + (i % 3) * 4, 4 + (i % 2) * 4);
          }
          break;
        }
        case 'rubble-edge': {
          break;
        }
        default: {
          ctx.fillStyle = '#3b3d32';
          ctx.fillRect(o.x, o.y, o.w, o.h);
        }
      }
    }

    drawCar(ctx, o) {
      const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
      const vertical = o.h > o.w;
      const w = vertical ? o.w : o.w;
      const h = vertical ? o.h : o.h;
      const s = o.seed || 0;
      const palette = [
        ['#6f3e2c', '#512b1e'], ['#3f4f51', '#2c3839'], ['#6a6440', '#4d482e'], ['#5b4a3c', '#40332a'],
      ];
      const col = palette[Math.floor(s) % palette.length];
      ctx.save();
      ctx.translate(cx, cy);
      if (!vertical) ctx.rotate(Math.PI / 2);
      ctx.fillStyle = 'rgba(3,5,3,0.4)';
      ctx.beginPath();
      ctx.roundRect(-w / 2 + 5, -h / 2 + 8, w, h, 10);
      ctx.fill();
      ctx.fillStyle = col[0];
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, 11);
      ctx.fill();
      ctx.fillStyle = col[1];
      ctx.beginPath();
      ctx.roundRect(-w / 2 + 7, -h / 2 + 8, w - 14, h - 16, 7);
      ctx.fill();
      // kính
      ctx.fillStyle = 'rgba(23,33,34,0.82)';
      ctx.beginPath();
      ctx.roundRect(-w / 2 + 10, -h / 2 + 16, w - 20, 17, 3);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(-w / 2 + 10, h / 2 - 34, w - 20, 16, 3);
      ctx.fill();
      // nóc
      ctx.fillStyle = 'rgba(190,183,150,0.1)';
      ctx.fillRect(-w / 2 + 12, -h / 2 + 38, w - 24, h - 76);
      // bánh xe
      ctx.fillStyle = '#151713';
      ctx.fillRect(-w / 2 - 3, -h / 2 + 14, 7, 16);
      ctx.fillRect(w / 2 - 4, -h / 2 + 14, 7, 16);
      ctx.fillRect(-w / 2 - 3, h / 2 - 30, 7, 16);
      ctx.fillRect(w / 2 - 4, h / 2 - 30, 7, 16);
      // gỉ sét
      ctx.fillStyle = 'rgba(99,63,37,0.45)';
      ctx.beginPath();
      ctx.ellipse(-w * 0.2, h * 0.22, 8, 12, 0.4, 0, U.TAU);
      ctx.fill();
      ctx.restore();
    }

    drawBaseProp(ctx, p) {
      if (p.type === 'antenna') {
        ctx.strokeStyle = 'rgba(4,6,4,0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(p.x + 8, p.y + 12, 26, 10, 0.4, 0, U.TAU);
        ctx.stroke();
        ctx.strokeStyle = '#4f5546';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y + 8); ctx.lineTo(p.x, p.y - 54); ctx.stroke();
        for (let i = 0; i < 3; i++) {
          const yy = p.y - 10 - i * 16;
          ctx.beginPath();
          ctx.moveTo(p.x - 12 + i * 2, yy); ctx.lineTo(p.x, yy - 9); ctx.lineTo(p.x + 12 - i * 2, yy);
          ctx.stroke();
        }
        ctx.fillStyle = '#d4793c';
        ctx.beginPath();
        ctx.arc(p.x, p.y - 58, 3, 0, U.TAU);
        ctx.fill();
        const blink = (Math.sin(performance.now() / 480) + 1) / 2;
        ctx.fillStyle = `rgba(255,120,50,${0.25 + blink * 0.6})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y - 58, 7 + blink * 3, 0, U.TAU);
        ctx.fill();
      } else if (p.type === 'generator') {
        ctx.fillStyle = 'rgba(3,5,3,0.35)';
        ctx.fillRect(p.x - 20, p.y - 12, 48, 38);
        ctx.fillStyle = '#4e523f';
        ctx.fillRect(p.x - 24, p.y - 18, 48, 36);
        ctx.fillStyle = '#33372b';
        ctx.fillRect(p.x - 18, p.y - 12, 36, 24);
        ctx.fillStyle = '#c08e42';
        for (let i = 0; i < 4; i++) ctx.fillRect(p.x - 14 + i * 8, p.y + 2, 4, 8);
        ctx.strokeStyle = '#25291f';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x + 24, p.y - 10);
        ctx.lineTo(p.x + 36, p.y - 10);
        ctx.lineTo(p.x + 36, p.y + 4);
        ctx.stroke();
      } else if (p.type === 'barrel') {
        ctx.fillStyle = 'rgba(3,5,3,0.35)';
        ctx.beginPath();
        ctx.ellipse(p.x + 4, p.y + 6, 13, 8, 0.2, 0, U.TAU);
        ctx.fill();
        ctx.fillStyle = '#525d3d';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 12, 0, U.TAU);
        ctx.fill();
        ctx.strokeStyle = '#2e3524';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, U.TAU); ctx.stroke();
      } else if (p.type === 'crate') {
        ctx.fillStyle = 'rgba(3,5,3,0.32)';
        ctx.fillRect(p.x - 10, p.y - 8, 32, 28);
        ctx.fillStyle = '#5e5637';
        ctx.fillRect(p.x - 14, p.y - 14, 28, 26);
        ctx.strokeStyle = '#38331f';
        ctx.lineWidth = 2;
        ctx.strokeRect(p.x - 14, p.y - 14, 28, 26);
        ctx.beginPath();
        ctx.moveTo(p.x - 14, p.y - 14); ctx.lineTo(p.x + 14, p.y + 12);
        ctx.stroke();
      } else if (p.type === 'flag') {
        ctx.strokeStyle = '#4d5141';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y + 12); ctx.lineTo(p.x, p.y - 64); ctx.stroke();
        const wave = Math.sin(performance.now() / 380) * 5;
        ctx.fillStyle = 'rgba(169,93,43,0.85)';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - 64);
        ctx.lineTo(p.x + 30 + wave, p.y - 54);
        ctx.lineTo(p.x, p.y - 40);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(230,213,164,0.8)';
        ctx.fillRect(p.x + 6, p.y - 57, 4, 4);
      }
    }

    drawBaseStructures(ctx, view) {
      const b = this.base;
      if (b.x + b.r < view.left || b.x - b.r > view.right || b.y + b.r < view.top || b.y - b.r > view.bottom) return;
      // lều
      for (const t of b.tents) {
        ctx.fillStyle = 'rgba(3,5,3,0.35)';
        ctx.beginPath();
        ctx.ellipse(t.x + 6, t.y + t.h * 0.32, t.w * 0.55, t.h * 0.4, 0.2, 0, U.TAU);
        ctx.fill();
        ctx.fillStyle = '#4f5137';
        ctx.beginPath();
        ctx.moveTo(t.x, t.y + t.h / 2);
        ctx.lineTo(t.x + t.w / 2, t.y - t.h / 2);
        ctx.lineTo(t.x + t.w, t.y + t.h / 2);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(28,30,21,0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(t.x + t.w / 2, t.y - t.h / 2);
        ctx.lineTo(t.x + t.w / 2, t.y + t.h / 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(18,21,14,0.7)';
        ctx.beginPath();
        ctx.moveTo(t.x + t.w / 2 - 12, t.y + t.h / 2);
        ctx.lineTo(t.x + t.w / 2, t.y + 4);
        ctx.lineTo(t.x + t.w / 2 + 12, t.y + t.h / 2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(191,151,90,0.2)';
        ctx.fillRect(t.x + 5, t.y + t.h / 2 - 5, t.w - 10, 4);
      }

      // bàn chỉ huy
      const c = b.command;
      ctx.fillStyle = 'rgba(3,5,3,0.4)';
      ctx.fillRect(c.x - 48, c.y - 18, 100, 54);
      ctx.fillStyle = '#5a5137';
      ctx.fillRect(c.x - 52, c.y - 26, 104, 50);
      ctx.fillStyle = '#6b6041';
      ctx.fillRect(c.x - 52, c.y - 26, 104, 9);
      ctx.fillStyle = '#2f382a';
      ctx.fillRect(c.x - 42, c.y - 16, 40, 26);
      ctx.strokeStyle = 'rgba(180,160,104,0.35)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(c.x - 38, c.y - 12 + i * 5);
        ctx.lineTo(c.x - 8, c.y - 12 + i * 5);
        ctx.stroke();
      }
      ctx.fillStyle = '#3d4436';
      ctx.fillRect(c.x + 6, c.y - 17, 18, 22);
      ctx.fillStyle = '#c5883e';
      ctx.fillRect(c.x + 9, c.y - 14, 4, 3);
      ctx.fillRect(c.x + 16, c.y - 14, 4, 3);
      ctx.strokeStyle = '#5d624d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(c.x + 42, c.y - 24);
      ctx.lineTo(c.x + 42, c.y - 70);
      ctx.stroke();
      ctx.fillStyle = '#cc7c3e';
      ctx.beginPath();
      ctx.arc(c.x + 42, c.y - 72, 4, 0, U.TAU);
      ctx.fill();

      // lửa trại
      const f = b.fire;
      ctx.fillStyle = '#2d2d24';
      ctx.beginPath();
      ctx.ellipse(f.x, f.y, 26, 16, 0, 0, U.TAU);
      ctx.fill();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * U.TAU;
        ctx.fillStyle = '#4d4938';
        ctx.beginPath();
        ctx.arc(f.x + Math.cos(a) * 20, f.y + Math.sin(a) * 12, 5, 0, U.TAU);
        ctx.fill();
      }
      const t = performance.now() / 1000;
      for (let i = 0; i < 4; i++) {
        const flick = Math.sin(t * 7 + i * 1.7) * 4;
        ctx.fillStyle = i % 2 ? 'rgba(255,171,69,0.85)' : 'rgba(255,110,40,0.75)';
        ctx.beginPath();
        ctx.moveTo(f.x - 9 + i * 5, f.y + 5);
        ctx.quadraticCurveTo(f.x - 5 + i * 5 + flick, f.y - 18 - i * 2, f.x + i * 4, f.y - 24 - i * 3);
        ctx.quadraticCurveTo(f.x + 5 + i * 4, f.y - 10, f.x + 4 + i * 5, f.y + 5);
        ctx.fill();
      }
    }

    // ============================================================
    //  VẬT TƯ
    // ============================================================
    drawLoot(ctx, loot, nearby) {
      if (loot.x < -100 || loot.x > this.size + 100) return;
      const t = performance.now() / 1000;
      ctx.save();
      if (loot.weaponCache && !loot.opened) {
        const pulse = 0.5 + Math.sin(t * 2.2 + loot.phase) * 0.5;
        const g = ctx.createLinearGradient(loot.x, loot.y - 140, loot.x, loot.y);
        g.addColorStop(0, 'rgba(255,171,69,0)');
        g.addColorStop(1, `rgba(255,171,69,${0.14 + pulse * 0.07})`);
        ctx.fillStyle = g;
        ctx.fillRect(loot.x - 18, loot.y - 140, 36, 140);
      }
      ctx.fillStyle = 'rgba(3,5,3,0.4)';
      ctx.beginPath();
      ctx.ellipse(loot.x + 4, loot.y + 7, 20, 9, 0, 0, U.TAU);
      ctx.fill();

      if (loot.type === 'crate') {
        ctx.fillStyle = loot.opened ? '#3e3a29' : '#665b38';
        ctx.fillRect(loot.x - 15, loot.y - 13, 30, 26);
        ctx.strokeStyle = loot.opened ? '#282619' : '#3d3520';
        ctx.lineWidth = 2;
        ctx.strokeRect(loot.x - 15, loot.y - 13, 30, 26);
        if (!loot.opened) {
          ctx.beginPath();
          ctx.moveTo(loot.x - 15, loot.y - 13); ctx.lineTo(loot.x + 15, loot.y + 13);
          ctx.moveTo(loot.x + 15, loot.y - 13); ctx.lineTo(loot.x - 15, loot.y + 13);
          ctx.stroke();
          ctx.fillStyle = 'rgba(198,167,103,0.5)';
          ctx.fillRect(loot.x - 15, loot.y - 2, 30, 3);
        } else {
          ctx.fillStyle = '#252217';
          ctx.fillRect(loot.x - 10, loot.y - 8, 20, 16);
        }
      } else if (loot.type === 'weapon') {
        const pulse = 0.5 + Math.sin(t * 2.4 + loot.phase) * 0.5;
        ctx.fillStyle = loot.opened ? '#4a4230' : '#735c34';
        ctx.fillRect(loot.x - 21, loot.y - 15, 42, 30);
        ctx.strokeStyle = loot.opened ? '#6d5c3a' : '#c8903e';
        ctx.lineWidth = 2;
        ctx.strokeRect(loot.x - 21, loot.y - 15, 42, 30);
        if (!loot.opened) {
          ctx.fillStyle = `rgba(255,180,80,${0.35 + pulse * 0.25})`;
          ctx.fillRect(loot.x - 21, loot.y - 1, 42, 3);
          ctx.font = 'bold 13px var(--mono), monospace';
          ctx.fillStyle = '#ffc477';
          ctx.textAlign = 'center';
          ctx.fillText('⌖', loot.x, loot.y + 1);
          ctx.textAlign = 'left';
        }
      } else if (loot.type === 'duffel') {
        ctx.fillStyle = loot.opened ? '#2d3528' : '#45523a';
        ctx.beginPath();
        ctx.ellipse(loot.x, loot.y, 19, 11, 0.1, 0, U.TAU);
        ctx.fill();
        ctx.strokeStyle = '#20281b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(loot.x - 14, loot.y);
        ctx.lineTo(loot.x + 14, loot.y);
        ctx.stroke();
        if (!loot.opened) {
          ctx.fillStyle = '#8b7a4b';
          ctx.fillRect(loot.x - 4, loot.y - 2, 8, 5);
        }
      } else if (loot.type === 'corpse') {
        ctx.fillStyle = '#3c3a2c';
        ctx.beginPath();
        ctx.ellipse(loot.x, loot.y, 18, 9, 0.5, 0, U.TAU);
        ctx.fill();
        ctx.fillStyle = '#6a5c45';
        ctx.beginPath();
        ctx.arc(loot.x + 13, loot.y - 6, 5, 0, U.TAU);
        ctx.fill();
        if (!loot.opened) {
          ctx.fillStyle = 'rgba(168,57,42,0.7)';
          ctx.fillRect(loot.x - 18, loot.y + 5, 26, 3);
        }
      } else if (loot.type === 'locker') {
        ctx.fillStyle = loot.opened ? '#2d3b31' : '#3f5948';
        ctx.fillRect(loot.x - 16, loot.y - 14, 32, 28);
        ctx.strokeStyle = '#243a2b';
        ctx.lineWidth = 2;
        ctx.strokeRect(loot.x - 16, loot.y - 14, 32, 28);
        ctx.fillStyle = '#a8be7a';
        ctx.fillRect(loot.x - 2, loot.y - 5, 5, 10);
      } else {
        // supply
        ctx.fillStyle = loot.opened ? '#3b3d2a' : '#4f5c3b';
        ctx.fillRect(loot.x - 19, loot.y - 14, 38, 28);
        ctx.fillStyle = '#2d3724';
        ctx.fillRect(loot.x - 19, loot.y - 14, 38, 8);
        ctx.fillStyle = '#c7a34f';
        ctx.fillRect(loot.x - 6, loot.y - 2, 12, 4);
      }

      if (nearby && !loot.opened) {
        const pulse = 0.5 + Math.sin(t * 3) * 0.5;
        ctx.strokeStyle = `rgba(255,171,69,${0.35 + pulse * 0.35})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(loot.x, loot.y, 26 + pulse * 3, 0, U.TAU);
        ctx.stroke();
      }
      ctx.restore();
    }

    // ============================================================
    //  BẢN ĐỒ NHỎ
    // ============================================================
    drawMinimap(ctx, game) {
      const W = 220, H = 220;
      const s = W / this.size;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#080d09';
      ctx.fillRect(0, 0, W, H);

      // vùng đã khám phá
      const cell = 100;
      for (const key of this.explored) {
        const [cx, cy] = key.split(',').map(Number);
        if (cx < 0 || cy < 0 || cx * cell > this.size || cy * cell > this.size) continue;
        ctx.fillStyle = '#1b2419';
        ctx.fillRect(cx * cell * s, cy * cell * s, cell * s + 0.5, cell * s + 0.5);
      }

      // đường
      ctx.strokeStyle = 'rgba(121,116,86,0.35)';
      ctx.lineWidth = 2.4;
      const roads = this.roadRects();
      for (const r of roads) {
        if (r.w > r.h) {
          ctx.beginPath(); ctx.moveTo(r.x * s, (r.y + r.h / 2) * s); ctx.lineTo((r.x + r.w) * s, (r.y + r.h / 2) * s); ctx.stroke();
        } else {
          ctx.beginPath(); ctx.moveTo((r.x + r.w / 2) * s, r.y * s); ctx.lineTo((r.x + r.w / 2) * s, (r.y + r.h) * s); ctx.stroke();
        }
      }

      // nhà
      for (const b of this.buildings) {
        if (!this.isExplored(b.x + b.w / 2, b.y + b.h / 2)) continue;
        ctx.fillStyle = 'rgba(117,122,99,0.22)';
        ctx.fillRect(b.x * s, b.y * s, b.w * s, b.h * s);
        ctx.strokeStyle = 'rgba(144,149,119,0.28)';
        ctx.lineWidth = 0.7;
        ctx.strokeRect(b.x * s, b.y * s, b.w * s, b.h * s);
      }

      // vật tư đã khám phá
      for (const l of this.loots) {
        if (l.opened) continue;
        if (!this.isExplored(l.x, l.y)) continue;
        ctx.fillStyle = l.weaponCache ? '#ffab45' : 'rgba(201,165,92,0.65)';
        ctx.beginPath();
        ctx.arc(l.x * s, l.y * s, l.weaponCache ? 2.6 : 1.4, 0, U.TAU);
        ctx.fill();
      }

      // công trình
      for (const st of game.structures) {
        ctx.fillStyle = st.kind === 'turret' ? '#72c4c1' : 'rgba(137,177,124,0.8)';
        ctx.fillRect(st.x * s - 1, st.y * s - 1, 2.4, 2.4);
      }

      // địch
      for (const e of game.enemies) {
        if (e.dead) continue;
        if (U.dist(e.x, e.y, game.player.x, game.player.y) > 1500 && !game.nightActive) continue;
        ctx.fillStyle = e.type === 'boss' ? '#ff6b3d' : '#cf5841';
        const rr = e.type === 'boss' ? 3.4 : 1.8;
        ctx.beginPath();
        ctx.arc(e.x * s, e.y * s, rr, 0, U.TAU);
        ctx.fill();
      }

      // lính
      for (const sld of game.soldiers) {
        if (sld.dead) continue;
        ctx.fillStyle = '#8fce80';
        ctx.beginPath(); ctx.arc(sld.x * s, sld.y * s, 1.8, 0, U.TAU); ctx.fill();
      }

      // căn cứ
      ctx.strokeStyle = 'rgba(255,171,69,0.75)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(this.base.x * s, this.base.y * s, this.base.r * s, 0, U.TAU);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,171,69,0.28)';
      ctx.beginPath(); ctx.arc(this.base.x * s, this.base.y * s, 3, 0, U.TAU); ctx.fill();

      // người chơi
      const p = game.player;
      ctx.save();
      ctx.translate(p.x * s, p.y * s);
      ctx.rotate(p.aimAngle + Math.PI / 2);
      ctx.fillStyle = '#d6e7a0';
      ctx.beginPath();
      ctx.moveTo(0, -4.5);
      ctx.lineTo(3.2, 3.4);
      ctx.lineTo(0, 2);
      ctx.lineTo(-3.2, 3.4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // khung nhìn
      const vw = game.W / game.cam.zoom * s;
      const vh = game.H / game.cam.zoom * s;
      ctx.strokeStyle = 'rgba(230,224,200,0.16)';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(game.cam.x * s - vw / 2, game.cam.y * s - vh / 2, vw, vh);

      ctx.strokeStyle = 'rgba(207,224,189,0.15)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
    }
  }

  TT.World = World;
})();
