/* ============================================================
   game-combat.js — chiến đấu, đạn, va chạm, vật tư, tiến trình
   ============================================================ */
(function () {
  'use strict';
  const U = TT.U;

  Object.assign(TT.Game.prototype, {
    addParticle(o) {
      if (this.particles.length > 620) return;
      this.particles.push(new TT.Particle(o));
    },
    addFloatText(x, y, text, color, size) {
      if (this.floatTexts.length > 90) this.floatTexts.shift();
      this.floatTexts.push(new TT.FloatText(x, y, text, color, size));
    },
    addDecal(d) {
      this.extraDecals.push(d);
      if (this.extraDecals.length > 220) this.extraDecals.shift();
    },

    updateCombat(dt) {
      if (this.buildMode) return;
      if (this.input.fireHeld || this.touch.fireHeld) this.tryShoot();
    },

    tryShoot() {
      const p = this.player;
      if (p.dead || p.reloadTimer > 0 || p.fireCd > 0) return;
      const w = p.weapon;
      if (!w || !w.owned) return;
      if (w.type === 'melee') {
        p.fireCd = w.rate;
        p.swingTimer = 0.18;
        p.swingDir = p.aimAngle;
        p.recoil = 0.8;
        const dmgBase = w.damage * (1 + 0.2 * (w.level - 1)) * (1 + 0.02 * (p.level - 1));
        let hitAny = false;
        for (const e of this.enemies) {
          if (e.dead) continue;
          const d = U.dist(p.x, p.y, e.x, e.y);
          if (d > w.reach + e.r) continue;
          const a = Math.atan2(e.y - p.y, e.x - p.x);
          if (Math.abs(U.angleDiff(p.aimAngle, a)) > w.arc / 2 && d > e.r + 22) continue;
          e.takeDamage(dmgBase, this, Math.cos(p.aimAngle) * 800, Math.sin(p.aimAngle) * 800);
          hitAny = true;
        }
        for (const o of this.world.obstacles) {
          if (!o.explosive) continue;
          const d = U.dist(p.x, p.y, o.x + o.w / 2, o.y + o.h / 2);
          if (d < w.reach + 16) { this.explodeBarrel(o); hitAny = true; }
        }
        if (hitAny) {
          this.shake(3, 0.16);
          TT.audio.hit();
        }
        TT.audio.melee();
        for (let i = 0; i < 4; i++) {
          this.addParticle({
            x: p.x + Math.cos(p.aimAngle) * 40, y: p.y + Math.sin(p.aimAngle) * 40,
            vx: Math.cos(p.aimAngle + U.rand(-0.7, 0.7)) * U.rand(20, 70),
            vy: Math.sin(p.aimAngle + U.rand(-0.7, 0.7)) * U.rand(20, 70),
            life: 0.22, size: 2, color: '#e7d8b2', type: 'spark', drag: 0.86,
          });
        }
        return;
      }

      if (w.mag <= 0) {
        p.fireCd = 0.22;
        TT.audio.empty();
        p.startReload();
        return;
      }

      const levelMult = (1 + 0.2 * (w.level - 1)) * (1 + 0.02 * (p.level - 1));
      const damage = w.damage * levelMult;
      const spread = w.spread * (1 - 0.06 * (w.level - 1));
      const px = p.x + Math.cos(p.aimAngle) * 20;
      const py = p.y + Math.sin(p.aimAngle) * 20;
      for (let i = 0; i < w.pellets; i++) {
        const a = p.aimAngle + U.rand(-spread, spread);
        this.bullets.push(new TT.Bullet(this, {
          x: px, y: py,
          vx: Math.cos(a) * w.bulletSpeed,
          vy: Math.sin(a) * w.bulletSpeed,
          damage, team: 'player',
          life: w.range / w.bulletSpeed,
          size: w.id === 'rifle' ? 2.6 : w.id === 'shotgun' ? 2 : 2.2,
          color: '#ffe1a6',
        }));
      }
      w.mag--;
      p.fireCd = w.rate * (1 - 0.03 * (w.level - 1));
      p.recoil = 1;
      p.muzzle = 0.07;
      TT.audio.shoot(w.id);
      this.shake(w.id === 'shotgun' ? 4.5 : w.id === 'rifle' ? 1.8 : 2, 0.1);
      for (let i = 0; i < (w.id === 'shotgun' ? 7 : 3); i++) {
        const a = p.aimAngle + U.rand(-0.4, 0.4);
        this.addParticle({
          x: px, y: py,
          vx: Math.cos(a) * U.rand(40, 150), vy: Math.sin(a) * U.rand(40, 150),
          life: U.rand(0.08, 0.18), size: U.rand(1.4, 3.4),
          color: '#ffd58a', type: 'spark', glow: true, drag: 0.85,
        });
      }
      const side = p.aimAngle + Math.PI / 2;
      this.addParticle({
        x: p.x, y: p.y, vx: Math.cos(side) * U.rand(25, 55), vy: Math.sin(side) * U.rand(25, 55),
        life: 0.6, size: 2, color: '#c7a25c', type: 'shell', drag: 0.94,
        rot: p.aimAngle, spin: 8,
      });
      this.ui.update(0, true);
      if (w.mag <= 0) p.startReload();
    },

    tryDash() {
      const p = this.player;
      if (!p || p.dead || this.state !== 'playing') return;
      if (p.dashCd > 0 || p.stamina < 24) {
        TT.audio.error();
        if (p.stamina < 24) this.ui.toast('KHÔNG ĐỦ THỂ LỰC', 'bad', '!');
        return;
      }
      const m = this.getMoveInput();
      let dx = m.x, dy = m.y;
      if (Math.hypot(dx, dy) < 0.2) { dx = Math.cos(p.aimAngle); dy = Math.sin(p.aimAngle); }
      const len = Math.hypot(dx, dy) || 1;
      p.dashDir.x = dx / len; p.dashDir.y = dy / len;
      p.dashTimer = 0.16;
      p.dashCd = 2.2;
      p.invuln = Math.max(p.invuln, 0.22);
      p.stamina = Math.max(0, p.stamina - 24);
      TT.audio.tone({ freq: 300, end: 640, dur: 0.16, type: 'sine', gain: 0.05 });
      this.shake(2, 0.1);
      for (let i = 0; i < 10; i++) {
        this.addParticle({
          x: p.x, y: p.y, vx: U.rand(-80, 80), vy: U.rand(-80, 80),
          life: U.rand(0.2, 0.45), size: U.rand(2, 4.5),
          color: 'rgba(174,184,150,0.45)', drag: 0.9,
        });
      }
    },

    useMedkit() {
      if (this.state !== 'playing') return;
      const p = this.player;
      if (!p || p.dead) return;
      if (this.resources.medkit <= 0) {
        this.ui.toast('BẠN KHÔNG CÒN BỘ Y TẾ', 'bad', '✚');
        TT.audio.error();
        return;
      }
      if (p.hp >= p.maxHp) {
        this.ui.toast('MÁU ĐÃ ĐẦY', 'info', '✚');
        return;
      }
      this.resources.medkit--;
      p.heal(45);
      TT.audio.heal();
      this.ui.update(0, true);
      for (let i = 0; i < 12; i++) {
        this.addParticle({
          x: p.x + U.rand(-12, 12), y: p.y + U.rand(-8, 10),
          vx: U.rand(-14, 14), vy: U.rand(-40, -18),
          life: U.rand(0.4, 0.9), size: U.rand(1.5, 3),
          color: '#9fe08c', glow: true,
        });
      }
    },

    /* ---------------- va chạm ---------------- */
    resolveCircle(entity, r) {
      let hit = false;
      const resolveRect = (ox, oy, ow, oh) => {
        const nx = U.clamp(entity.x, ox, ox + ow);
        const ny = U.clamp(entity.y, oy, oy + oh);
        let dx = entity.x - nx, dy = entity.y - ny;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r * r) return;
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const push = r - d;
          entity.x += (dx / d) * push;
          entity.y += (dy / d) * push;
        } else {
          const left = entity.x - ox, right = ox + ow - entity.x;
          const top = entity.y - oy, bottom = oy + oh - entity.y;
          const m = Math.min(left, right, top, bottom);
          if (m === left) entity.x = ox - r;
          else if (m === right) entity.x = ox + ow + r;
          else if (m === top) entity.y = oy - r;
          else entity.y = oy + oh + r;
        }
        hit = true;
      };
      for (const o of this.world.obstacles) {
        if (!o.solid) continue;
        resolveRect(o.x, o.y, o.w, o.h);
      }
      for (const s of this.structures) {
        if (s.dead) continue;
        resolveRect(s.x - s.w / 2, s.y - s.h / 2, s.w, s.h);
      }
      return hit;
    },

    /* ---------------- hiệu ứng đạn / nổ ---------------- */
    bulletImpact(x, y, acid, hitEnemy) {
      const color = acid ? '#a9e05a' : hitEnemy ? '#8c2c21' : '#d8c69a';
      for (let i = 0; i < (acid ? 6 : 3); i++) {
        this.addParticle({
          x, y, vx: U.rand(-70, 70), vy: U.rand(-70, 70),
          life: U.rand(0.15, 0.4), size: U.rand(1, 2.6),
          color, type: 'spark', drag: 0.88, glow: acid,
        });
      }
      if (acid && Math.random() < 0.35) {
        this.addDecal({ type: 'scorch', x, y, r: U.rand(6, 12), rot: U.rand(0, 6.28) });
      }
    },

    explodeBarrel(ob) {
      const i = this.world.obstacles.indexOf(ob);
      if (i < 0) return;
      this.world.obstacles.splice(i, 1);
      const ei = this.world.explosives.indexOf(ob);
      if (ei >= 0) this.world.explosives.splice(ei, 1);
      const cx = ob.x + ob.w / 2, cy = ob.y + ob.h / 2;
      this.explodeAt(cx, cy, 165, 95);
      for (const other of this.world.explosives.slice()) {
        if (U.dist(cx, cy, other.x + 13, other.y + 13) < 135) this.explodeBarrel(other);
      }
    },

    explodeAt(x, y, radius, damage) {
      TT.audio.explosion();
      this.shake(13, 0.5);
      this.addDecal({ type: 'crater', x, y, r: radius * 0.32, rot: U.rand(0, 6.28) });
      for (let i = 0; i < 42; i++) {
        const a = U.rand(0, U.TAU);
        const sp = U.rand(30, 340);
        this.addParticle({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: U.rand(0.25, 0.9), size: U.rand(2, 8),
          color: i % 4 === 0 ? '#ffe0a0' : i % 3 === 0 ? '#ff8a3a' : 'rgba(76,66,48,0.9)',
          drag: 0.9, glow: i % 4 === 0,
        });
      }
      for (const e of this.enemies) {
        if (e.dead) continue;
        const d = U.dist(x, y, e.x, e.y);
        if (d < radius + e.r) e.takeDamage(damage * (1 - d / (radius + e.r)) + 20, this, e.x - x, e.y - y);
      }
      const p = this.player;
      const pd = U.dist(x, y, p.x, p.y);
      if (pd < radius) p.takeDamage(38 * (1 - pd / radius) + 8, this);
      for (const s of this.soldiers) {
        if (s.dead) continue;
        const d = U.dist(x, y, s.x, s.y);
        if (d < radius) s.takeDamage(24 * (1 - d / radius) + 5, this);
      }
      for (const st of this.structures.slice()) {
        if (st.dead) continue;
        const d = U.dist(x, y, st.x, st.y);
        if (d < radius) st.takeDamage(damage * 0.5 * (1 - d / radius) + 10, this);
      }
    },

    /* ---------------- chiến lợi phẩm ---------------- */
    openLoot(loot) {
      if (loot.opened) return;
      loot.opened = true;
      this.stats.loots++;
      const lines = [];
      const p = this.player;
      const r = Math.random;
      const far = loot.far || 0;
      const f = 1 + far * 1.4;

      if (loot.weaponCache) {
        const shotgun = p.weapons.find(w => w.id === 'shotgun');
        const rifle = p.weapons.find(w => w.id === 'rifle');
        let unlocked = null;
        if (!shotgun.owned) {
          shotgun.owned = true;
          this.ammo.shell += 12;
          unlocked = shotgun;
          lines.push('SÚNG SĂN', '12 đạn ghém');
        } else if (!rifle.owned) {
          rifle.owned = true;
          this.ammo['556'] += 24;
          unlocked = rifle;
          lines.push('SÚNG TRƯỜNG', '24 đạn 5.56');
        } else {
          this.resources.parts += 2;
          this.ammo.shell += 8;
          this.ammo['556'] += 18;
          lines.push('2 linh kiện', 'đạn dược');
        }
        this.resources.scrap += 18;
        this.stats.scrap += 18;
        lines.push('18 phế liệu');
        if (unlocked) {
          this.ui.banner('KHO VŨ KHÍ', 'MỞ KHÓA: ' + unlocked.name, 'Phím ' + unlocked.slot + ' để trang bị · Đạn đã được thêm vào kho', 4);
          TT.audio.levelup();
        } else {
          TT.audio.pickup(true);
        }
        this.ui.refreshWeapons();
      } else if (loot.baseSupply) {
        this.resources.scrap += 16;
        this.stats.scrap += 16;
        this.resources.wood += 10;
        this.resources.food += 5;
        this.resources.medkit += 1;
        this.ammo['9mm'] += 12;
        lines.push('16 phế liệu', '10 gỗ', '5 lương', '1 y tế', '12 đạn 9mm');
        TT.audio.pickup(true);
      } else {
        const scrap = Math.round(U.rand(6, 14) * f);
        const wood = r() < 0.7 ? Math.round(U.rand(4, 10) * f) : 0;
        const food = r() < 0.55 ? Math.round(U.rand(2, 6) * f) : 0;
        const ammo9 = Math.round(U.rand(8, 20) * (0.7 + far));
        const parts = r() < 0.15 + far * 0.18 ? 1 : 0;
        const medkit = r() < 0.11 + far * 0.12 ? 1 : 0;
        const shell = r() < 0.1 + far * 0.14 ? Math.round(U.rand(3, 8)) : 0;
        this.resources.scrap += scrap;
        this.stats.scrap += scrap;
        this.resources.wood += wood;
        this.resources.food += food;
        this.resources.medkit += medkit;
        if (parts) this.resources.parts += parts;
        this.ammo['9mm'] += ammo9;
        this.ammo.shell += shell;
        lines.push(`${scrap} phế liệu`);
        if (wood) lines.push(`${wood} gỗ`);
        if (food) lines.push(`${food} lương`);
        if (ammo9) lines.push(`${ammo9} đạn 9mm`);
        if (shell) lines.push(`${shell} đạn ghém`);
        if (parts) lines.push(`${parts} linh kiện`);
        if (medkit) lines.push(`${medkit} y tế`);
        TT.audio.pickup(parts > 0 || medkit > 0);
      }

      this.addFloatText(loot.x, loot.y - 20, 'ĐÃ THU THẬP', '#ffcf87', 11);
      for (let i = 0; i < 12; i++) {
        this.addParticle({
          x: loot.x, y: loot.y - 5,
          vx: U.rand(-60, 60), vy: U.rand(-90, -20),
          life: U.rand(0.35, 0.8), size: U.rand(1.2, 3),
          color: i % 3 === 0 ? '#b7e6a0' : '#ffcf87', glow: true, drag: 0.93,
        });
      }
      this.ui.toast(lines.slice(0, 4).join(' · '), 'good', '◆');
      this.ui.update(0, true);
      this.checkQuests();
    },

    spawnDrop(x, y, type) {
      if (this.world.loots.length > 220) return;
      const loot = this.world.makeLoot(
        U.clamp(x + U.rand(-18, 18), 90, this.world.size - 90),
        U.clamp(y + U.rand(-18, 18), 90, this.world.size - 90),
        type, Math.random
      );
      loot.far = U.dist(loot.x, loot.y, this.world.base.x, this.world.base.y) / this.world.size;
      this.world.loots.push(loot);
    },

    /* ---------------- sự kiện sinh tử ---------------- */
    gainXP(amount) {
      const p = this.player;
      p.xp += amount;
      while (p.xp >= p.xpNext) {
        p.xp -= p.xpNext;
        p.level++;
        p.xpNext = Math.round(p.xpNext * 1.33);
        p.maxHp += 10;
        p.hp = Math.min(p.maxHp, p.hp + 22);
        this.ui.toast(`LÊN CẤP ${p.level} · MÁU TỐI ĐA +10`, 'good', '★');
        this.ui.banner('CẤP ĐỘ ' + p.level, 'BẠN ĐÃ MẠNH HƠN', 'Máu tối đa tăng · Sát thương tăng nhẹ', 2.6);
        TT.audio.levelup();
        for (let i = 0; i < 24; i++) {
          const a = U.rand(0, U.TAU);
          this.addParticle({
            x: p.x, y: p.y, vx: Math.cos(a) * U.rand(30, 130), vy: Math.sin(a) * U.rand(30, 130) - 30,
            life: U.rand(0.5, 1.2), size: U.rand(1.5, 3.6),
            color: i % 2 ? '#ffd27a' : '#b7e6a0', glow: true, drag: 0.94,
          });
        }
      }
      this.ui.update(0, true);
    },

    onEnemyKilled(e) {
      this.stats.kills++;
      this.gainXP(e.xp);
      const scrap = U.randInt(1, 3);
      this.resources.scrap += scrap;
      this.stats.scrap += scrap;
      this.addFloatText(e.x, e.y - 12, `+${scrap} ⚙`, '#d8b273', 9);
      if (e.type === 'boss') {
        this.stats.bosses++;
        this.resources.parts += 3;
        this.resources.medkit += 2;
        this.player.heal(30, true);
        for (let i = 0; i < 5; i++) this.spawnDrop(e.x + U.rand(-50, 50), e.y + U.rand(-50, 50), i % 2 ? 'supply' : 'crate');
        this.shake(16, 0.7);
      }
      if (Math.random() < 0.22) {
        this.spawnDrop(e.x, e.y, Math.random() < 0.5 ? 'duffel' : 'crate');
      }
      this.checkQuests();
    },

    onPlayerHurt(amount) {
      this.ui.flashDamage();
      this.shake(6, 0.25);
      if (this.player.hp / this.player.maxHp < 0.3 && this.alertCd <= 0) {
        this.alertCd = 6;
        this.ui.toast('MÁU NGUY KỊCH — NHẤN Q ĐỂ DÙNG BỘ Y TẾ', 'bad', '!');
      }
    },

    onPlayerDeath() {
      this.state = 'dead';
      this.input.fireHeld = false;
      this.touch.fireHeld = false;
      this.buildMode = false;
      document.body.classList.remove('build-open');
      this.ui.hideBuild();
      this.ui.hideHud();
      this.ui.el.panel.classList.add('hidden');
      this.ui.el.buildBar.classList.add('hidden');
      this.ui.el.lowHealth.style.opacity = '0';
      this.ui.showDeath();
      this.shake(20, 0.8);
      TT.audio.hurt();
      for (let i = 0; i < 32; i++) {
        const a = U.rand(0, U.TAU);
        this.addParticle({
          x: this.player.x, y: this.player.y,
          vx: Math.cos(a) * U.rand(20, 180), vy: Math.sin(a) * U.rand(20, 180),
          life: U.rand(0.4, 1.4), size: U.rand(2, 5), color: i % 3 ? '#7c2b21' : '#3e4a34',
          drag: 0.92,
        });
      }
    },

    onSoldierDown(soldier) {
      this.ui.toast(`ĐỒNG ĐỘI ${soldier.name} ĐÃ HY SINH`, 'bad', '†');
      this.shake(4, 0.25);
      TT.audio.kill();
      for (let i = 0; i < 18; i++) {
        this.addParticle({
          x: soldier.x, y: soldier.y,
          vx: U.rand(-120, 120), vy: U.rand(-120, 120),
          life: U.rand(0.3, 0.9), size: U.rand(1.6, 3.6), color: '#8f2b21',
          type: 'spark', drag: 0.9,
        });
      }
      this.ui.update(0, true);
    },

    onStructureAttacked(st) {
      if (this.alertCd <= 0) {
        this.alertCd = 7;
        if (U.dist(this.player.x, this.player.y, this.world.base.x, this.world.base.y) > 160) {
          this.ui.toast('CĂN CỨ ĐANG BỊ TẤN CÔNG!', 'bad', '!');
        }
      }
    },

    onStructureDestroyed(st) {
      const i = this.structures.indexOf(st);
      if (i >= 0) this.structures.splice(i, 1);
      this.shake(8, 0.4);
      TT.audio.explosion();
      this.ui.toast('CÔNG TRÌNH PHÒNG THỦ ĐÃ BỊ PHÁ HỦY', 'bad', '▦');
      this.addDecal({ type: 'crater', x: st.x, y: st.y, r: 26, rot: U.rand(0, 6.28) });
      for (let i2 = 0; i2 < 22; i2++) {
        this.addParticle({
          x: st.x + U.rand(-st.w / 2, st.w / 2), y: st.y + U.rand(-st.h / 2, st.h / 2),
          vx: U.rand(-140, 140), vy: U.rand(-140, 140),
          life: U.rand(0.3, 0.9), size: U.rand(2, 5), color: i2 % 2 ? '#756445' : '#403a27',
          type: 'spark', drag: 0.9,
        });
      }
      this.checkQuests();
    },
  });
})();
