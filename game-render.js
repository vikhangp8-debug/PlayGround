/* ============================================================
   game-render.js — kết xuất thế giới, ánh sáng ngày đêm, hiệu ứng
   ============================================================ */
(function () {
  'use strict';
  const U = TT.U;

  Object.assign(TT.Game.prototype, {
    render() {
      const ctx = this.ctx;
      const W = this.W, H = this.H;
      const shake = this.cam.shake || 0;
      const shx = shake ? (Math.random() * 2 - 1) * shake : 0;
      const shy = shake ? (Math.random() * 2 - 1) * shake : 0;
      const zoom = this.cam.zoom;

      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#0a0d0a';
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.translate(W / 2 + shx, H / 2 + shy);
      ctx.scale(zoom, zoom);
      ctx.translate(-this.cam.x, -this.cam.y);

      const view = {
        left: this.cam.x - W / 2 / zoom - 150,
        right: this.cam.x + W / 2 / zoom + 150,
        top: this.cam.y - H / 2 / zoom - 150,
        bottom: this.cam.y + H / 2 / zoom + 150,
      };

      this.world.drawGround(ctx, view);
      this.drawExtraDecals(ctx, view);

      // vật tư
      const near = this.state === 'playing' ? this.getInteractTarget() : null;
      for (const loot of this.world.loots) {
        if (loot.x < view.left - 60 || loot.x > view.right + 60 || loot.y < view.top - 60 || loot.y > view.bottom + 60) continue;
        const nearby = near && near.obj === loot;
        this.world.drawLoot(ctx, loot, nearby);
      }

      this.world.drawProps(ctx, view);

      // công trình do người chơi xây
      for (const s of this.structures) {
        if (s.dead) continue;
        if (s.x < view.left - 100 || s.x > view.right + 100 || s.y < view.top - 100 || s.y > view.bottom + 100) continue;
        s.draw(ctx);
      }

      // nhân vật, sắp xếp theo trục y để chồng lớp tự nhiên
      const actors = [];
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (e.x < view.left - 80 || e.x > view.right + 80 || e.y < view.top - 80 || e.y > view.bottom + 80) continue;
        actors.push({ y: e.y, draw: () => e.draw(ctx) });
      }
      for (const s of this.soldiers) {
        if (s.dead) continue;
        if (s.x < view.left - 80 || s.x > view.right + 80 || s.y < view.top - 80 || s.y > view.bottom + 80) continue;
        actors.push({ y: s.y, draw: () => s.draw(ctx) });
      }
      if (!this.player.dead) actors.push({ y: this.player.y, draw: () => this.player.draw(ctx) });
      actors.sort((a, b) => a.y - b.y);
      for (const a of actors) a.draw();

      // vòng chỉ báo mục tiêu tương tác
      if (near && near.obj && (near.obj.x || near.obj.y)) {
        const t = performance.now() / 1000;
        ctx.strokeStyle = 'rgba(255,171,69,0.24)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(near.obj.x, near.obj.y, 25 + Math.sin(t * 2.5) * 3, 0, U.TAU);
        ctx.stroke();
      }

      for (const b of this.bullets) b.draw(ctx);
      for (const p of this.particles) p.draw(ctx);
      for (const f of this.floatTexts) f.draw(ctx);

      if (this.buildMode) this.drawGhost(ctx);

      ctx.restore();

      this.drawLighting();
      this.drawAsh();
      this.drawWeatherTint();
    },

    drawExtraDecals(ctx, view) {
      for (const d of this.extraDecals) {
        if (d.x < view.left || d.x > view.right || d.y < view.top || d.y > view.bottom) continue;
        if (d.type === 'blood') {
          ctx.fillStyle = 'rgba(55,20,15,0.4)';
          ctx.beginPath();
          ctx.ellipse(d.x, d.y, d.r, d.r * 0.6, d.rot, 0, U.TAU);
          ctx.fill();
          ctx.fillStyle = 'rgba(40,14,10,0.32)';
          ctx.beginPath();
          ctx.ellipse(d.x + d.r * 0.8, d.y - d.r * 0.2, d.r * 0.28, d.r * 0.16, d.rot + 0.6, 0, U.TAU);
          ctx.fill();
        } else if (d.type === 'crater') {
          ctx.fillStyle = 'rgba(10,10,8,0.55)';
          ctx.beginPath();
          ctx.ellipse(d.x, d.y, d.r, d.r * 0.7, d.rot, 0, U.TAU);
          ctx.fill();
          ctx.strokeStyle = 'rgba(79,67,46,0.4)';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else if (d.type === 'scorch') {
          ctx.fillStyle = 'rgba(8,8,6,0.4)';
          ctx.beginPath();
          ctx.ellipse(d.x, d.y, d.r, d.r * 0.75, d.rot, 0, U.TAU);
          ctx.fill();
        }
      }
    },

    drawGhost(ctx) {
      const g = this.getGhost();
      if (!g) return;
      const def = g.def;
      const w = g.valid ? g.w : g.w;
      const h = g.h;
      ctx.save();
      ctx.translate(g.x, g.y);
      if (def.id === 'turret') {
        ctx.strokeStyle = g.valid ? 'rgba(142,213,147,0.3)' : 'rgba(216,84,61,0.3)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([8, 9]);
        ctx.beginPath();
        ctx.arc(0, 0, 500, 0, U.TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.rotate(g.angle);
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = g.valid ? '#86bf74' : '#c25b45';
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = g.valid ? '#b7e6a0' : '#ff9275';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = g.valid ? '#d9f0c5' : '#ffb4a2';
      ctx.font = '700 9px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(g.valid ? 'ĐẶT ĐƯỢC' : g.reason, 0, -h / 2 - 7);
      ctx.textAlign = 'left';
      ctx.restore();
    },

    drawLighting() {
      const night = this.nightAmount;
      const hour = this.hour();
      if (night < 0.015) return;
      const ctx = this.ctx;
      const lc = this.lightCanvas;
      const l = this.lightCtx;
      const LW = lc.width, LH = lc.height;
      const scX = LW / this.W, scY = LH / this.H;
      const zoom = this.cam.zoom;
      l.setTransform(1, 0, 0, 1, 0, 0);
      l.clearRect(0, 0, LW, LH);
      l.fillStyle = `rgba(4,8,19,${0.8 * night})`;
      l.fillRect(0, 0, LW, LH);

      const sx = (wx) => ((wx - this.cam.x) * zoom + this.W / 2) * scX;
      const sy = (wy) => ((wy - this.cam.y) * zoom + this.H / 2) * scY;
      const sr = (r) => r * zoom * scX;

      const punch = (wx, wy, radius, strength = 1) => {
        const px = sx(wx), py = sy(wy), pr = sr(radius);
        if (px < -pr || px > LW + pr || py < -pr || py > LH + pr) return;
        const g = l.createRadialGradient(px, py, pr * 0.05, px, py, pr);
        g.addColorStop(0, `rgba(0,0,0,${0.88 * strength})`);
        g.addColorStop(0.45, `rgba(0,0,0,${0.55 * strength})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        l.fillStyle = g;
        l.beginPath();
        l.arc(px, py, pr, 0, U.TAU);
        l.fill();
      };

      l.globalCompositeOperation = 'destination-out';
      const p = this.player;
      if (!p.dead) {
        punch(p.x, p.y, 170, 0.8);
        // đèn pin hình nón
        const px = sx(p.x), py = sy(p.y);
        const rad = sr(500);
        if (px > -rad && px < LW + rad && py > -rad && py < LH + rad) {
          l.save();
          l.beginPath();
          l.moveTo(px, py);
          l.arc(px, py, rad, p.aimAngle - 0.4, p.aimAngle + 0.4);
          l.closePath();
          l.clip();
          const g = l.createRadialGradient(px, py, rad * 0.06, px, py, rad);
          g.addColorStop(0, 'rgba(0,0,0,0.94)');
          g.addColorStop(0.55, 'rgba(0,0,0,0.66)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          l.fillStyle = g;
          l.fillRect(px - rad, py - rad, rad * 2, rad * 2);
          l.restore();
        }
      }
      const base = this.world.base;
      punch(base.fire.x, base.fire.y, 330, 0.95);
      punch(base.antenna.x, base.antenna.y - 40, 100, 0.35);
      for (const s of this.structures) {
        if (s.dead) continue;
        if (s.kind === 'turret') punch(s.x, s.y, 130, 0.4);
        else if (s.kind === 'medic') punch(s.x, s.y, 130, 0.3);
      }
      for (const so of this.soldiers) {
        if (!so.dead) punch(so.x, so.y, 90, 0.22);
      }
      for (const b of this.bullets) {
        if (b.acid) punch(b.x, b.y, 60, 0.3);
      }
      for (const pa of this.particles) {
        if (pa.glow && pa.life > 0.05) punch(pa.x, pa.y, pa.size * 14, 0.12);
      }
      if (p.muzzle > 0) punch(p.x + Math.cos(p.aimAngle) * 30, p.y + Math.sin(p.aimAngle) * 30, 120, 0.7);
      l.globalCompositeOperation = 'source-over';

      ctx.drawImage(lc, 0, 0, this.W, this.H);

      // ánh sáng ấm cộng thêm
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const glow = (wx, wy, radius, color1, color2) => {
        const sxp = (wx - this.cam.x) * zoom + this.W / 2;
        const syp = (wy - this.cam.y) * zoom + this.H / 2;
        const rr = radius * zoom;
        if (sxp < -rr || sxp > this.W + rr || syp < -rr || syp > this.H + rr) return;
        const grad = ctx.createRadialGradient(sxp, syp, 4, sxp, syp, rr);
        grad.addColorStop(0, color1);
        grad.addColorStop(0.5, color2);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(sxp, syp, rr, 0, U.TAU);
        ctx.fill();
      };
      const fireAlpha = 0.1 + Math.sin(performance.now() / 180) * 0.025;
      glow(base.fire.x, base.fire.y, 300, `rgba(255,161,65,${fireAlpha * night * 2})`, `rgba(255,91,30,${fireAlpha * night})`);
      glow(p.x, p.y, 120, `rgba(255,214,151,${0.03 * night})`, 'rgba(255,160,70,0)');
      if (p.muzzle > 0) {
        glow(p.x + Math.cos(p.aimAngle) * 28, p.y + Math.sin(p.aimAngle) * 28, 90, 'rgba(255,230,160,0.3)', 'rgba(255,160,60,0.05)');
      }
      for (const s of this.structures) {
        if (s.dead) continue;
        if (s.kind === 'medic') glow(s.x, s.y, 110, 'rgba(132,215,130,0.12)', 'rgba(90,180,100,0.03)');
      }
      ctx.restore();

      // ánh hoàng hôn / bình minh
      if (hour > 17 && hour < 20) {
        const t = U.smoothstep(17, 19.5, hour) * (1 - U.smoothstep(19.5, 20.2, hour));
        ctx.fillStyle = `rgba(138,58,24,${0.13 * t})`;
        ctx.fillRect(0, 0, this.W, this.H);
      } else if (hour >= 5 && hour < 7.4) {
        const t = (1 - U.smoothstep(6.4, 7.4, hour)) * U.smoothstep(5, 5.6, hour);
        ctx.fillStyle = `rgba(190,120,65,${0.09 * t})`;
        ctx.fillRect(0, 0, this.W, this.H);
      }
    },

    drawAsh() {
      const ctx = this.ctx;
      ctx.save();
      for (const a of this.ash) {
        const flicker = 0.65 + Math.sin(performance.now() / 900 + a.phase) * 0.35;
        if (a.ember) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = `rgba(255,145,65,${a.alpha * flicker})`;
        } else {
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = `rgba(206,196,166,${a.alpha * 0.75})`;
        }
        ctx.beginPath();
        ctx.arc(a.x, a.y, a.size, 0, U.TAU);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
    },

    drawWeatherTint() {
      if (this.state === 'menu') return;
      const ctx = this.ctx;
      // làm tối nhẹ các góc khi màn đêm buông
      if (this.nightAmount > 0.6) {
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        const g = ctx.createLinearGradient(0, 0, 0, this.H);
        g.addColorStop(0, 'rgba(100,112,150,1)');
        g.addColorStop(0.5, 'rgba(160,168,186,1)');
        g.addColorStop(1, 'rgba(86,96,120,1)');
        ctx.fillStyle = g;
        ctx.globalAlpha = 0.45 * this.nightAmount;
        ctx.fillRect(0, 0, this.W, this.H);
        ctx.restore();
      }
    },
  });
})();
