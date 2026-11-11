/* ============================================================
   entities.js — người chơi, dị biến, lính, đạn, công trình
   ============================================================ */
(function () {
  'use strict';
  const U = TT.U;
  const TAU = U.TAU;

  /* ============================================================
     HIỆU ỨNG
     ============================================================ */
  class Particle {
    constructor(o) {
      this.x = o.x; this.y = o.y;
      this.vx = o.vx || 0; this.vy = o.vy || 0;
      this.life = o.life || 0.5; this.maxLife = this.life;
      this.size = o.size || 3;
      this.color = o.color || '#ffab45';
      this.drag = o.drag ?? 0.9;
      this.glow = o.glow || false;
      this.shrink = o.shrink !== false;
      this.gravity = o.gravity || 0;
      this.type = o.type || 'dot';
      this.rot = o.rot || 0;
      this.spin = o.spin || 0;
    }
    update(dt) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vx *= Math.pow(this.drag, dt * 60);
      this.vy *= Math.pow(this.drag, dt * 60);
      this.vy += this.gravity * dt;
      this.rot += this.spin * dt;
      this.life -= dt;
    }
    draw(ctx) {
      const a = U.clamp(this.life / this.maxLife, 0, 1);
      const s = this.shrink ? this.size * (0.35 + a * 0.65) : this.size;
      ctx.globalAlpha = a;
      if (this.glow) ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = this.color;
      if (this.type === 'spark') {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(Math.atan2(this.vy, this.vx));
        ctx.fillRect(-s * 2, -s * 0.35, s * 4, s * 0.7);
        ctx.restore();
      } else if (this.type === 'shell') {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rot);
        ctx.fillRect(-2, -1, 4, 2);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(this.x, this.y, Math.max(0.3, s), 0, TAU);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  class FloatText {
    constructor(x, y, text, color = '#ffd28a', size = 12) {
      this.x = x; this.y = y; this.text = text; this.color = color;
      this.life = 0.95; this.maxLife = 0.95; this.size = size;
      this.vy = -38; this.vx = U.rand(-8, 8);
    }
    update(dt) {
      this.life -= dt;
      this.y += this.vy * dt;
      this.x += this.vx * dt;
      this.vy *= 0.96;
    }
    draw(ctx) {
      const a = U.clamp(this.life / this.maxLife, 0, 1);
      ctx.globalAlpha = Math.min(1, a * 1.6);
      ctx.font = `800 ${this.size}px ui-monospace, Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillText(this.text, this.x + 1, this.y + 1);
      ctx.fillStyle = this.color;
      ctx.fillText(this.text, this.x, this.y);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }
  }

  /* ============================================================
     ĐẠN
     ============================================================ */
  class Bullet {
    constructor(game, o) {
      this.game = game;
      this.x = o.x; this.y = o.y;
      this.vx = o.vx; this.vy = o.vy;
      this.damage = o.damage || 10;
      this.team = o.team || 'player';
      this.life = o.life || 1.4;
      this.size = o.size || 2.4;
      this.color = o.color || '#ffd08a';
      this.acid = o.acid || false;
      this.dead = false;
      this.trail = [];
      this.pierce = o.pierce || 0;
    }

    update(dt) {
      if (this.dead) return;
      this.life -= dt;
      if (this.life <= 0) { this.dead = true; return; }

      this.trail.push({ x: this.x, y: this.y });
      if (this.trail.length > 5) this.trail.shift();

      const speed = Math.hypot(this.vx, this.vy);
      const steps = Math.max(1, Math.ceil((speed * dt) / 12));
      const sx = (this.vx * dt) / steps;
      const sy = (this.vy * dt) / steps;

      for (let i = 0; i < steps; i++) {
        this.x += sx;
        this.y += sy;

        // địa hình
        for (const o of this.game.world.obstacles) {
          if (!o.solid) continue;
          if (this.x > o.x && this.x < o.x + o.w && this.y > o.y && this.y < o.y + o.h) {
            if (o.explosive) this.game.explodeBarrel(o);
            else this.game.bulletImpact(this.x, this.y, this.acid);
            this.dead = true;
            return;
          }
        }
        // công trình (đạn địch)
        if (this.team === 'enemy') {
          for (const st of this.game.structures) {
            if (st.dead) continue;
            if (this.x > st.x - st.w / 2 && this.x < st.x + st.w / 2 && this.y > st.y - st.h / 2 && this.y < st.y + st.h / 2) {
              st.takeDamage(this.damage * 0.7, this.game);
              this.game.bulletImpact(this.x, this.y, this.acid);
              this.dead = true;
              return;
            }
          }
        }

        if (this.team === 'enemy') {
          const p = this.game.player;
          if (!p.dead && U.dist(this.x, this.y, p.x, p.y) < 15 + this.size) {
            p.takeDamage(this.damage, this.game);
            this.game.bulletImpact(this.x, this.y, this.acid);
            this.dead = true;
            return;
          }
          for (const s of this.game.soldiers) {
            if (s.dead) continue;
            if (U.dist(this.x, this.y, s.x, s.y) < 14 + this.size) {
              s.takeDamage(this.damage, this.game);
              this.game.bulletImpact(this.x, this.y, this.acid);
              this.dead = true;
              return;
            }
          }
        } else {
          for (const e of this.game.enemies) {
            if (e.dead) continue;
            const rr = e.r + this.size;
            if (U.dist2(this.x, this.y, e.x, e.y) < rr * rr) {
              e.takeDamage(this.damage, this.game, this.vx, this.vy);
              this.game.bulletImpact(this.x, this.y, this.acid, true);
              if (this.pierce > 0) this.pierce--;
              else { this.dead = true; return; }
            }
          }
        }
      }
      if (this.x < 0 || this.y < 0 || this.x > this.game.world.size || this.y > this.game.world.size) this.dead = true;
    }

    draw(ctx) {
      const col = this.acid ? '#a9e05a' : this.color;
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = col;
      ctx.lineWidth = this.size * 0.85;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      const tracer = this.acid ? 0.03 : 0.018;
      ctx.moveTo(this.x - this.vx * tracer, this.y - this.vy * tracer);
      ctx.lineTo(this.x, this.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, TAU);
      ctx.fill();
      if (this.acid) {
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * 2.6, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /* ============================================================
     NGƯỜI CHƠI
     ============================================================ */
  class Player {
    constructor(game) {
      this.game = game;
      this.x = game.world.base.spawn.x;
      this.y = game.world.base.spawn.y;
      this.r = 15;
      this.hp = 100;
      this.maxHp = 100;
      this.stamina = 100;
      this.maxStamina = 100;
      this.level = 1;
      this.xp = 0;
      this.xpNext = 100;
      this.speed = 238;
      this.angle = 0;
      this.aimAngle = -Math.PI / 2;
      this.moveAngle = -Math.PI / 2;
      this.moving = false;
      this.walkPhase = 0;
      this.dashTimer = 0;
      this.dashCd = 0;
      this.dashDir = { x: 0, y: -1 };
      this.invuln = 0;
      this.recoil = 0;
      this.muzzle = 0;
      this.swingTimer = 0;
      this.swingDir = 0;
      this.reloadTimer = 0;
      this.reloadTotal = 0;
      this.weapons = TT.WEAPONS.map(w => ({ ...w, mag: w.type === 'gun' ? w.magSize : 0, owned: w.owned }));
      this.current = 1;
      this.fireCd = 0;
      this.dead = false;
      this.footstep = 0;
      this.healFlash = 0;
      this.lastDamageAt = 0;
      this.kills = 0;
    }

    get weapon() { return this.weapons[this.current]; }

    update(dt, input) {
      if (this.dead) return;
      this.fireCd = Math.max(0, this.fireCd - dt);
      this.dashCd = Math.max(0, this.dashCd - dt);
      this.invuln = Math.max(0, this.invuln - dt);
      this.muzzle = Math.max(0, this.muzzle - dt);
      this.recoil = Math.max(0, this.recoil - dt * 8);
      this.swingTimer = Math.max(0, this.swingTimer - dt);
      this.healFlash = Math.max(0, this.healFlash - dt);

      // nạp đạn
      if (this.reloadTimer > 0) {
        this.reloadTimer -= dt;
        if (this.reloadTimer <= 0) this.finishReload();
      }

      // lướt
      if (this.dashTimer > 0) {
        this.dashTimer -= dt;
        this.x += this.dashDir.x * 780 * dt;
        this.y += this.dashDir.y * 780 * dt;
        this.game.resolveCircle(this, this.r);
        if (Math.random() < 0.7) {
          this.game.addParticle({
            x: this.x + U.rand(-6, 6), y: this.y + U.rand(-4, 4),
            vx: U.rand(-20, 20), vy: U.rand(-20, 20), life: 0.35, size: 4,
            color: 'rgba(165,178,139,0.4)', drag: 0.9,
          });
        }
        this.stamina = Math.max(0, this.stamina - 12 * dt);
      } else {
        let mx = input.move.x, my = input.move.y;
        const len = Math.hypot(mx, my);
        this.moving = len > 0.08;
        if (this.moving) {
          mx /= len; my /= len;
          this.moveAngle = Math.atan2(my, mx);
          const sprinting = input.sprint && this.stamina > 2;
          const sp = this.speed * (sprinting ? 1.48 : 1) * (this.reloadTimer > 0 ? 0.78 : 1);
          this.x += mx * sp * dt;
          this.y += my * sp * dt;
          this.walkPhase += dt * (sprinting ? 15 : 10);
          this.game.resolveCircle(this, this.r);
          if (sprinting) this.stamina = Math.max(0, this.stamina - 17 * dt);
          this.footstep += dt;
          if (this.footstep > (sprinting ? 0.22 : 0.32)) {
            this.footstep = 0;
            this.game.addParticle({
              x: this.x - mx * 8 + U.rand(-4, 4), y: this.y + 8,
              vx: U.rand(-12, 12), vy: U.rand(-6, 6), life: 0.4,
              size: 4, color: 'rgba(116,109,80,0.32)', drag: 0.88,
            });
          }
        } else {
          this.walkPhase += dt * 2;
        }
        if (!input.sprint || !this.moving) this.stamina = Math.min(this.maxStamina, this.stamina + 21 * dt);
      }

      // biên bản đồ
      this.x = U.clamp(this.x, 80, this.game.world.size - 80);
      this.y = U.clamp(this.y, 80, this.game.world.size - 80);
    }

    startReload() {
      const w = this.weapon;
      if (w.type !== 'gun' || this.reloadTimer > 0) return;
      const ammo = this.game.ammo[w.ammoType];
      if (w.mag >= w.magSize || ammo <= 0) {
        if (ammo <= 0 && w.mag <= 0) {
          this.game.toast(`HẾT ${TT.AMMO[w.ammoType].name}`, 'bad');
          TT.audio.empty();
        }
        return;
      }
      this.reloadTotal = w.reloadTime * (1 - 0.06 * (w.level - 1));
      this.reloadTimer = this.reloadTotal;
      TT.audio.reload();
    }

    finishReload() {
      const w = this.weapon;
      if (!w || w.type !== 'gun') return;
      const ammo = this.game.ammo[w.ammoType];
      const need = w.magSize - w.mag;
      const take = Math.min(need, ammo);
      w.mag += take;
      this.game.ammo[w.ammoType] -= take;
      this.reloadTimer = 0;
      this.reloadTotal = 0;
    }

    switchWeapon(index) {
      if (index === this.current) return;
      const w = this.weapons[index];
      if (!w || !w.owned) {
        this.game.toast('VŨ KHÍ CHƯA ĐƯỢC MỞ KHÓA', 'bad');
        TT.audio.error();
        return;
      }
      this.current = index;
      this.reloadTimer = 0;
      this.game.ui.refreshWeapons();
      TT.audio.click();
    }

    heal(amount, silent = false) {
      const before = this.hp;
      this.hp = Math.min(this.maxHp, this.hp + amount);
      const got = this.hp - before;
      if (got > 0) {
        this.healFlash = 0.5;
        this.game.addFloatText(this.x, this.y - 26, `+${Math.round(got)}`, '#9fe08c', 12);
        if (!silent) TT.audio.heal();
      }
      return got;
    }

    takeDamage(amount, game) {
      if (this.invuln > 0 || this.dead) return;
      this.hp -= amount;
      this.invuln = 0.36;
      this.lastDamageAt = performance.now();
      game.onPlayerHurt(amount);
      TT.audio.hurt();
      game.addFloatText(this.x, this.y - 28, `-${Math.round(amount)}`, '#ff8a70', 13);
      for (let i = 0; i < 8; i++) {
        game.addParticle({
          x: this.x, y: this.y, vx: U.rand(-100, 100), vy: U.rand(-100, 100),
          life: U.rand(0.25, 0.5), size: U.rand(1.4, 3), color: 'rgba(165,43,30,0.8)',
          type: 'spark', drag: 0.9, glow: false,
        });
      }
      if (this.hp <= 0) {
        this.hp = 0;
        this.dead = true;
        game.onPlayerDeath();
      }
    }

    draw(ctx) {
      const t = performance.now() / 1000;
      const flicker = this.invuln > 0 && Math.floor(this.invuln * 24) % 2 === 0;
      ctx.save();
      ctx.translate(this.x, this.y);

      // bóng
      ctx.fillStyle = 'rgba(2,4,2,0.42)';
      ctx.beginPath();
      ctx.ellipse(3, 10, 17, 8, 0, 0, TAU);
      ctx.fill();

      // chân
      const swing = this.moving ? Math.sin(this.walkPhase) * 7 : 0;
      ctx.save();
      ctx.rotate(this.moveAngle);
      ctx.strokeStyle = '#2c3428';
      ctx.lineCap = 'round';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(-2, -6); ctx.lineTo(3 + swing, -8);
      ctx.moveTo(-2, 6); ctx.lineTo(3 - swing, 8);
      ctx.stroke();
      ctx.strokeStyle = '#1e241c';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(3 + swing, -8); ctx.lineTo(5 + swing, -9);
      ctx.moveTo(3 - swing, 8); ctx.lineTo(5 - swing, 9);
      ctx.stroke();
      ctx.restore();

      // thân xoay theo hướng ngắm
      ctx.save();
      ctx.rotate(this.aimAngle);
      // ba lô
      ctx.fillStyle = '#383d2c';
      ctx.beginPath();
      ctx.roundRect(-16, -7, 10, 14, 3);
      ctx.fill();
      ctx.fillStyle = '#454b36';
      ctx.fillRect(-14, -5, 5, 10);
      // thân
      if (flicker) ctx.globalAlpha = 0.65;
      ctx.fillStyle = '#566442';
      ctx.beginPath();
      ctx.ellipse(0, 0, 11, 13, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#2f3928';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      // giáp vai
      ctx.fillStyle = '#65704d';
      ctx.beginPath();
      ctx.ellipse(-2, -10, 5, 4, 0.3, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(-2, 10, 5, 4, -0.3, 0, TAU);
      ctx.fill();
      // tay
      ctx.strokeStyle = '#a37850';
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(3, -8); ctx.lineTo(14, -5);
      ctx.moveTo(3, 8); ctx.lineTo(14, 5);
      ctx.stroke();
      // đầu
      ctx.fillStyle = '#bd8c60';
      ctx.beginPath();
      ctx.arc(3, 0, 7, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#252d23';
      ctx.beginPath();
      ctx.arc(1.5, 0, 7.2, 1.6, 4.7);
      ctx.fill();
      // vũ khí
      this.drawWeapon(ctx, t);
      // tay cầm súng
      if (this.weapon.type !== 'melee') {
        ctx.strokeStyle = '#a37850';
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        ctx.moveTo(10, 5); ctx.lineTo(20, 3);
        ctx.stroke();
      }
      ctx.restore();

      // hiệu ứng cận chiến
      if (this.swingTimer > 0) {
        const prog = 1 - this.swingTimer / 0.18;
        ctx.strokeStyle = `rgba(255,226,170,${0.55 * (1 - prog)})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 42, this.swingDir - 0.9 + prog * 1.8, this.swingDir - 0.5 + prog * 1.8);
        ctx.stroke();
      }

      // nạp đạn
      if (this.reloadTimer > 0) {
        const p = 1 - this.reloadTimer / this.reloadTotal;
        ctx.strokeStyle = 'rgba(255,171,69,0.18)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 26, -Math.PI / 2, TAU - Math.PI / 2);
        ctx.stroke();
        ctx.strokeStyle = '#ffab45';
        ctx.beginPath();
        ctx.arc(0, 0, 26, -Math.PI / 2, -Math.PI / 2 + TAU * p);
        ctx.stroke();
      }

      // hồi máu
      if (this.healFlash > 0) {
        ctx.strokeStyle = `rgba(150,224,120,${this.healFlash * 0.7})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 24 + (0.5 - this.healFlash) * 30, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawWeapon(ctx, t) {
      const w = this.weapon;
      const kick = this.recoil * 3;
      ctx.save();
      ctx.translate(10 - kick, 3);
      if (w.type === 'melee') {
        ctx.rotate(-0.3);
        ctx.fillStyle = '#4b3b28';
        ctx.fillRect(0, -2, 10, 4);
        ctx.fillStyle = '#c4c6b6';
        ctx.beginPath();
        ctx.moveTo(10, -2.4);
        ctx.lineTo(33, -1.6);
        ctx.lineTo(36, 0);
        ctx.lineTo(33, 1.6);
        ctx.lineTo(10, 2.4);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(14, -1, 18, 0.8);
      } else if (w.id === 'pistol') {
        ctx.fillStyle = '#2b2f2a';
        ctx.fillRect(0, -3, 17, 6);
        ctx.fillStyle = '#454b40';
        ctx.fillRect(2, -4, 11, 2);
        ctx.fillStyle = '#1e211d';
        ctx.fillRect(2, 2, 5, 7);
        ctx.fillStyle = '#757b68';
        ctx.fillRect(15, -1.4, 4, 2.8);
      } else if (w.id === 'shotgun') {
        ctx.fillStyle = '#4a3826';
        ctx.fillRect(-4, -2.5, 15, 5);
        ctx.fillStyle = '#33362f';
        ctx.fillRect(9, -2.6, 30, 4);
        ctx.fillStyle = '#55594b';
        ctx.fillRect(12, 1.4, 20, 2.3);
        ctx.fillStyle = '#6b5a3b';
        ctx.fillRect(14, -5, 8, 3);
        ctx.fillStyle = '#2a2c26';
        ctx.fillRect(36, -1.6, 4, 3.2);
      } else if (w.id === 'rifle') {
        ctx.fillStyle = '#3d3f34';
        ctx.fillRect(-6, -2, 16, 4.4);
        ctx.fillStyle = '#55594b';
        ctx.fillRect(8, -2.3, 32, 4.2);
        ctx.fillStyle = '#22251f';
        ctx.fillRect(14, 1.6, 7, 6);
        ctx.fillStyle = '#707966';
        ctx.fillRect(38, -1.6, 7, 2.8);
        ctx.fillStyle = '#2f3229';
        ctx.fillRect(20, -5, 9, 2.4);
      }

      if (this.muzzle > 0) {
        const a = this.muzzle / 0.07;
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(38, 0, 1, 38, 0, 18);
        g.addColorStop(0, `rgba(255,245,190,${a})`);
        g.addColorStop(0.4, `rgba(255,170,60,${a * 0.7})`);
        g.addColorStop(1, 'rgba(255,110,20,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(38, 0, 18, 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
    }
  }

  /* ============================================================
     DỊ BIẾN
     ============================================================ */
  class Enemy {
    constructor(game, type, x, y, night = 1, wave = false) {
      this.game = game;
      this.type = type;
      this.cfg = TT.ENEMIES[type];
      this.x = x; this.y = y;
      this.r = this.cfg.r;
      this.night = night;
      this.waveEnemy = wave;
      const hpScale = 1 + 0.24 * (night - 1) + (wave ? 0.08 * game.waveNumber : 0);
      this.maxHp = Math.round(this.cfg.hp * hpScale);
      this.hp = this.maxHp;
      this.speed = this.cfg.speed * (1 + 0.035 * (night - 1));
      this.damage = this.cfg.damage * (1 + 0.09 * (night - 1));
      this.xp = this.cfg.xp;
      this.angle = U.rand(0, TAU);
      this.walkPhase = U.rand(0, 6.28);
      this.attackCd = U.rand(0, 0.5);
      this.rangedCd = U.rand(1, 2);
      this.think = 0;
      this.target = null;
      this.targetKind = null;
      this.aggro = false;
      this.flash = 0;
      this.dead = false;
      this.deathTimer = 0;
      this.wanderAngle = U.rand(0, TAU);
      this.wanderTimer = U.rand(1, 3);
      this.retreat = false;
      this.retreatTimer = 0;
      this.stuckTimer = 0;
      this.bloodColor = this.type === 'spitter' ? '#6f9c3e' : '#7a2c22';
      this.hpShow = 0;
      this.spawnAnim = 0.6;
      this.bossRoarCd = 3;
      this.step = 0;
    }

    takeDamage(amount, game, vx = 0, vy = 0) {
      if (this.dead) return;
      this.hp -= amount;
      this.flash = 0.09;
      this.hpShow = 2;
      this.aggro = true;
      const kb = this.type === 'boss' ? 8 : this.type === 'brute' ? 16 : 34;
      this.x += (vx / 1200) * kb;
      this.y += (vy / 1200) * kb;
      game.addFloatText(this.x + U.rand(-6, 6), this.y - this.r - 12, `${Math.round(amount)}`, this.type === 'boss' ? '#ffb069' : '#ffd28a', amount >= 30 ? 14 : 11);
      for (let i = 0; i < 7; i++) {
        game.addParticle({
          x: this.x, y: this.y - 3, vx: U.rand(-130, 130), vy: U.rand(-130, 80),
          life: U.rand(0.25, 0.55), size: U.rand(1.4, 3.4), color: this.bloodColor,
          type: 'spark', drag: 0.9,
        });
      }
      TT.audio.hit();
      if (this.hp <= 0) this.die(game);
    }

    die(game) {
      if (this.dead) return;
      this.dead = true;
      this.deathTimer = 0.8;
      game.onEnemyKilled(this);
      TT.audio.kill();
      game.shake(5, 0.18);
      for (let i = 0; i < (this.type === 'boss' ? 50 : 16); i++) {
        game.addParticle({
          x: this.x, y: this.y, vx: U.rand(-220, 220), vy: U.rand(-220, 220),
          life: U.rand(0.4, 1.1), size: U.rand(2, this.type === 'boss' ? 8 : 4.2),
          color: i % 3 === 0 ? '#2f3a29' : this.bloodColor, drag: 0.9,
        });
      }
      game.addDecal({ type: 'blood', x: this.x, y: this.y, r: this.r * 1.5, rot: U.rand(0, TAU), seed: Math.random() * 99 });
      // rơi vật tư
      if (U.chance(this.type === 'boss' ? 1 : this.type === 'brute' ? 0.5 : 0.16)) {
        game.spawnDrop(this.x, this.y, this.type === 'brute' || this.type === 'boss' ? 'supply' : 'crate');
      }
      if (this.type === 'boss') {
        game.showBanner('MỤC TIÊU BỊ TIÊU DIỆT', 'QUÁI VẬT CHÚA ĐÃ GỤC NGÃ', 'Căn cứ tạm thời an toàn', 3.4);
        game.shake(18, 0.6);
        TT.audio.bossRoar();
      }
    }

    update(dt) {
      if (this.dead) return;
      this.flash = Math.max(0, this.flash - dt);
      this.hpShow = Math.max(0, this.hpShow - dt);
      this.attackCd = Math.max(0, this.attackCd - dt);
      this.rangedCd = Math.max(0, this.rangedCd - dt);
      this.spawnAnim = Math.max(0, this.spawnAnim - dt);
      this.think -= dt;
      this.walkPhase += dt * 7;
      this.bossRoarCd -= dt;

      if (this.retreat) {
        this.retreatTimer -= dt;
        const base = this.game.world.base;
        const a = Math.atan2(this.y - base.y, this.x - base.x);
        this.move(this.x + Math.cos(a) * 160 * dt, this.y + Math.sin(a) * 160 * dt);
        if (this.retreatTimer <= 0) this.dead = true;
        return;
      }

      const game = this.game;
      const p = game.player;

      if (this.think <= 0) {
        this.think = 0.3 + Math.random() * 0.2;
        this.pickTarget();
      }

      let tx = this.x, ty = this.y;
      let distT = 9999;
      if (this.targetKind === 'player' && !p.dead) {
        tx = p.x; ty = p.y; distT = U.dist(this.x, this.y, tx, ty);
      } else if (this.targetKind === 'soldier' && this.target && !this.target.dead) {
        tx = this.target.x; ty = this.target.y; distT = U.dist(this.x, this.y, tx, ty);
      } else if (this.targetKind === 'structure' && this.target && !this.target.dead) {
        tx = this.target.x; ty = this.target.y; distT = U.dist(this.x, this.y, tx, ty) - Math.max(this.target.w, this.target.h) * 0.5;
      } else if (this.targetKind === 'base') {
        tx = game.world.base.x; ty = game.world.base.y; distT = U.dist(this.x, this.y, tx, ty);
      } else {
        // lang thang
        this.wanderTimer -= dt;
        if (this.wanderTimer <= 0) {
          this.wanderTimer = U.rand(2, 5);
          this.wanderAngle = U.rand(0, TAU);
        }
        tx = this.x + Math.cos(this.wanderAngle) * 100;
        ty = this.y + Math.sin(this.wanderAngle) * 100;
        distT = 100;
      }

      const angleTo = Math.atan2(ty - this.y, tx - this.x);
      this.angle += U.angleDiff(this.angle, angleTo) * Math.min(1, dt * 7);

      const attackRange = this.cfg.ranged ? 210 : this.cfg.attackRange + this.r;
      const shouldApproach = distT > attackRange - (this.cfg.ranged ? 40 : 0);
      if (shouldApproach && this.spawnAnim <= 0) {
        const speed = this.speed * (this.waveEnemy ? 1.04 : 1);
        let mx = Math.cos(angleTo), my = Math.sin(angleTo);
        // né vật cản: nếu bị kẹt, thử hướng chéo
        if (this.stuckTimer > 0.4) {
          const side = (this.seedSide || 1);
          mx = Math.cos(angleTo + side * 0.9);
          my = Math.sin(angleTo + side * 0.9);
        }
        // tách bầy
        let sepX = 0, sepY = 0;
        for (const other of game.enemies) {
          if (other === this || other.dead) continue;
          const dx = this.x - other.x, dy = this.y - other.y;
          const d2 = dx * dx + dy * dy;
          const rr = (this.r + other.r + 4);
          if (d2 > 0.01 && d2 < rr * rr) {
            const d = Math.sqrt(d2);
            sepX += (dx / d) * (1 - d / rr);
            sepY += (dy / d) * (1 - d / rr);
          }
        }
        mx += sepX * 1.5; my += sepY * 1.5;
        const ml = Math.hypot(mx, my) || 1;
        const ox = this.x, oy = this.y;
        this.move(this.x + (mx / ml) * speed * dt, this.y + (my / ml) * speed * dt);
        const moved = U.dist(ox, oy, this.x, this.y);
        if (moved < speed * dt * 0.3) this.stuckTimer += dt;
        else this.stuckTimer = Math.max(0, this.stuckTimer - dt * 2);
        if (this.stuckTimer > 0.8) { this.seedSide = (this.seedSide || 1) * -1; this.stuckTimer = 0; }
      } else {
        this.stuckTimer = 0;
      }

      this.step += dt;
      if (this.step > 0.22) {
        this.step = 0;
        game.addParticle({
          x: this.x + U.rand(-6, 6), y: this.y + this.r * 0.5,
          vx: U.rand(-14, 14), vy: U.rand(-8, 8), life: 0.35,
          size: 4, color: 'rgba(104,98,74,0.25)', drag: 0.9,
        });
      }

      // tấn công công trình gần đó (ban đêm / bị chặn)
      let structureNear = null, sd = 1e9;
      for (const st of game.structures) {
        if (st.dead) continue;
        const d = U.dist(this.x, this.y, st.x, st.y);
        if (d < sd) { sd = d; structureNear = st; }
      }
      if (structureNear && sd < this.r + Math.max(structureNear.w, structureNear.h) / 2 + 12 && this.attackCd <= 0) {
        structureNear.takeDamage(this.damage, game);
        this.attackCd = this.cfg.attackRate;
        this.attackAnim = 0.22;
        game.shake(2, 0.08);
        TT.audio.hit();
      }

      // tấn công mục tiêu
      if (this.attackCd <= 0) {
        if (this.targetKind === 'player' && !p.dead && distT < this.cfg.attackRange + this.r + 6) {
          p.takeDamage(this.damage, game);
          this.attackCd = this.cfg.attackRate;
          this.attackAnim = 0.22;
          game.shake(4, 0.14);
        } else if (this.targetKind === 'soldier' && this.target && !this.target.dead && distT < this.cfg.attackRange + this.r + 6) {
          this.target.takeDamage(this.damage, game);
          this.attackCd = this.cfg.attackRate;
          this.attackAnim = 0.22;
        } else if (this.targetKind === 'structure' && this.target && !this.target.dead && distT < this.cfg.attackRange + this.r + 10) {
          this.target.takeDamage(this.damage, game);
          this.attackCd = this.cfg.attackRate;
          this.attackAnim = 0.22;
        }
      }

      // bắn axit
      if (this.cfg.ranged && distT < this.cfg.range && this.rangedCd <= 0) {
        const target = this.targetKind === 'player' ? p : this.target;
        if (target) {
          this.shootAcid(target, game);
          this.rangedCd = this.cfg.rangedRate * U.rand(0.85, 1.15);
        }
      }

      // boss: húc + bắn chùm
      if (this.type === 'boss' && this.bossRoarCd <= 0 && distT < 600) {
        this.bossRoarCd = 5.5;
        const baseAngle = Math.atan2(p.y - this.y, p.x - this.x);
        for (let i = -2; i <= 2; i++) {
          const a = baseAngle + i * 0.2;
          game.bullets.push(new Bullet(game, {
            x: this.x + Math.cos(a) * 30, y: this.y + Math.sin(a) * 30,
            vx: Math.cos(a) * 300, vy: Math.sin(a) * 300,
            damage: 16, team: 'enemy', life: 2.2, size: 4.5, acid: true,
          }));
        }
        game.shake(9, 0.3);
        TT.audio.bossRoar();
        game.addFloatText(this.x, this.y - 60, 'GẦM GỪ!', '#ff6b3b', 14);
      }
    }

    shootAcid(target, game) {
      const a = Math.atan2(target.y - this.y, target.x - this.x) + U.rand(-0.06, 0.06);
      const speed = 360;
      game.bullets.push(new Bullet(game, {
        x: this.x + Math.cos(a) * this.r, y: this.y + Math.sin(a) * this.r,
        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        damage: this.cfg.projDamage * (1 + 0.08 * (this.night - 1)), team: 'enemy',
        life: 1.6, size: 3.4, acid: true,
      }));
      this.attackAnim = 0.25;
      TT.audio.shoot('enemy');
    }

    pickTarget() {
      const game = this.game;
      const p = game.player;
      const dPlayer = U.dist(this.x, this.y, p.x, p.y);
      const base = game.world.base;
      const dBase = U.dist(this.x, this.y, base.x, base.y);

      // người chơi luôn là ưu tiên nếu ở gần
      if (!p.dead && dPlayer < 330) {
        this.target = p; this.targetKind = 'player'; this.aggro = true; return;
      }

      // ban đêm / đợt sóng: nhắm vào căn cứ
      if (this.waveEnemy || game.nightActive) {
        if (!p.dead && dPlayer < 240) { this.target = p; this.targetKind = 'player'; return; }
        let best = null, bestD = 520;
        for (const st of game.structures) {
          if (st.dead) continue;
          const d = U.dist(this.x, this.y, st.x, st.y);
          if (d < bestD) { bestD = d; best = st; }
        }
        if (!p.dead && dPlayer < 380 && (!best || dPlayer < bestD)) { this.target = p; this.targetKind = 'player'; return; }
        if (best) { this.target = best; this.targetKind = 'structure'; return; }
        if (dBase > 270) { this.target = null; this.targetKind = 'base'; return; }
      }

      // lính gần
      let bestS = null, bd = 480;
      for (const s of game.soldiers) {
        if (s.dead) continue;
        const d = U.dist(this.x, this.y, s.x, s.y);
        if (d < bd) { bd = d; bestS = s; }
      }
      if (bestS && dPlayer > 240) { this.target = bestS; this.targetKind = 'soldier'; return; }

      if (!p.dead && dPlayer < 740) { this.target = p; this.targetKind = 'player'; this.aggro = true; return; }

      // công trình gần để đập
      let best = null, bestD = 220;
      for (const st of game.structures) {
        if (st.dead) continue;
        const d = U.dist(this.x, this.y, st.x, st.y);
        if (d < bestD) { bestD = d; best = st; }
      }
      if (best) { this.target = best; this.targetKind = 'structure'; return; }

      if (dBase < 620) { this.target = null; this.targetKind = 'base'; return; }
      this.target = null; this.targetKind = null;
    }

    move(nx, ny) {
      const dx = nx - this.x, dy = ny - this.y;
      this.x = nx; this.y = ny;
      const hit = this.game.resolveCircle(this, this.r * 0.82);
      if (hit) {
        this.stuckTimer += 0.02;
      }
      this.x = U.clamp(this.x, 80, this.game.world.size - 80);
      this.y = U.clamp(this.y, 80, this.game.world.size - 80);
    }

    draw(ctx) {
      if (this.dead) return;
      const t = performance.now() / 1000;
      const scale = this.type === 'boss' ? 1.65 : this.type === 'brute' ? 1.25 : 1;
      const spawnScale = this.spawnAnim > 0 ? 0.5 + (1 - this.spawnAnim / 0.6) * 0.5 : 1;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(scale * spawnScale, scale * spawnScale);

      // bóng
      ctx.fillStyle = 'rgba(2,4,2,0.42)';
      ctx.beginPath();
      ctx.ellipse(3, this.r * 0.65, this.r * 1.1, this.r * 0.45, 0, 0, TAU);
      ctx.fill();

      const swing = Math.sin(this.walkPhase) * 4;
      ctx.save();
      ctx.rotate(this.angle);

      // chân
      ctx.strokeStyle = this.cfg.dark;
      ctx.lineWidth = this.type === 'boss' ? 9 : 5.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-4, -this.r * 0.4); ctx.lineTo(4 + swing, -this.r * 0.7);
      ctx.moveTo(-4, this.r * 0.4); ctx.lineTo(4 - swing, this.r * 0.7);
      ctx.stroke();

      // thân gù
      ctx.fillStyle = this.flash > 0 ? '#fff0d0' : this.cfg.color;
      ctx.beginPath();
      ctx.ellipse(-2, 0, this.r * 0.9, this.r * 0.78, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = this.cfg.dark;
      ctx.lineWidth = 2;
      ctx.stroke();

      // gù lưng
      ctx.fillStyle = this.cfg.dark;
      ctx.beginPath();
      ctx.ellipse(-6, 0, this.r * 0.5, this.r * 0.6, 0.2, 0, TAU);
      ctx.fill();

      if (this.type === 'brute' || this.type === 'boss') {
        ctx.fillStyle = '#78664e';
        for (let i = 0; i < 4; i++) {
          const sy = -this.r * 0.5 + i * this.r * 0.32;
          ctx.beginPath();
          ctx.moveTo(-2, sy);
          ctx.lineTo(-this.r * 0.9, sy - 5);
          ctx.lineTo(-this.r * 0.3, sy + 4);
          ctx.fill();
        }
      }
      if (this.type === 'spitter') {
        ctx.fillStyle = 'rgba(143,200,75,0.65)';
        ctx.beginPath();
        ctx.ellipse(-5, 0, this.r * 0.6, this.r * 0.5, 0, 0, TAU);
        ctx.fill();
      }

      // tay
      ctx.strokeStyle = this.flash > 0 ? '#ffe9c0' : this.cfg.dark;
      ctx.lineWidth = this.type === 'boss' ? 8 : 4;
      const reach = this.attackAnim > 0 ? this.r * 1.5 : this.r * 1.1;
      ctx.beginPath();
      ctx.moveTo(4, -this.r * 0.45);
      ctx.lineTo(reach, -this.r * 0.7 - (this.attackAnim > 0 ? 8 : 0));
      ctx.moveTo(4, this.r * 0.45);
      ctx.lineTo(reach * 0.9, this.r * 0.7 + (this.attackAnim > 0 ? 8 : 0));
      ctx.stroke();
      // móng
      ctx.strokeStyle = '#c4b58f';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(reach, -this.r * 0.7); ctx.lineTo(reach + 5, -this.r * 0.85);
      ctx.moveTo(reach * 0.9, this.r * 0.7); ctx.lineTo(reach * 0.9 + 5, this.r * 0.85);
      ctx.stroke();

      // đầu
      const hx = this.r * 0.55;
      ctx.fillStyle = this.flash > 0 ? '#fff2d5' : '#7f6f54';
      ctx.beginPath();
      ctx.arc(hx, 0, this.r * 0.48, 0, TAU);
      ctx.fill();
      ctx.fillStyle = this.cfg.dark;
      ctx.beginPath();
      ctx.arc(hx - 2, 0, this.r * 0.34, 2.2, 4.2);
      ctx.fill();
      // mắt phát sáng
      ctx.fillStyle = this.cfg.eye;
      ctx.shadowColor = this.cfg.eye;
      ctx.shadowBlur = 8;
      if (this.type === 'boss') {
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.arc(hx + 2, i * 6, 2.1, 0, TAU);
          ctx.fill();
        }
      } else {
        ctx.beginPath();
        ctx.arc(hx + 1, -3.5, 1.5, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(hx + 1, 3.5, 1.5, 0, TAU);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      // miệng
      ctx.strokeStyle = '#3c241c';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(hx + 4, 0, this.r * 0.28, 0.4, Math.PI - 0.4);
      ctx.stroke();

      // vết thương nhấp nháy khi trúng đòn
      if (this.flash > 0) {
        ctx.globalAlpha = this.flash / 0.09;
        ctx.fillStyle = '#ffe4b0';
        ctx.beginPath();
        ctx.arc(0, 0, this.r * 0.65, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      // thanh máu
      if (this.hpShow > 0 || this.type === 'boss') {
        const w = this.type === 'boss' ? 90 : this.type === 'brute' ? 40 : 28;
        const y = -this.r * scale - (this.type === 'boss' ? 26 : 14);
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(-w / 2 - 1, y - 1, w + 2, 5);
        ctx.fillStyle = this.type === 'boss' ? '#b33d28' : '#a94535';
        ctx.fillRect(-w / 2, y, w, 3);
        ctx.fillStyle = this.type === 'boss' ? '#ff8b5c' : '#e47b58';
        ctx.fillRect(-w / 2, y, w * U.clamp(this.hp / this.maxHp, 0, 1), 3);
        if (this.type === 'boss') {
          ctx.font = '700 7px ui-monospace, monospace';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#ffbf91';
          ctx.fillText('QUÁI VẬT CHÚA', 0, y - 6);
          ctx.textAlign = 'left';
        }
      }

      // chỉ báo máu thấp
      ctx.restore();
    }
  }

  /* ============================================================
     LÍNH AI
     ============================================================ */
  class Soldier {
    constructor(game, x, y, name, index) {
      this.game = game;
      this.x = x; this.y = y;
      this.homeX = x; this.homeY = y;
      this.r = 13;
      this.name = name || 'LÍNH';
      this.index = index || 0;
      this.maxHp = 120 + game.baseLevel * 18;
      this.hp = this.maxHp;
      this.speed = 205;
      this.angle = U.rand(0, TAU);
      this.aimAngle = this.angle;
      this.moveAngle = 0;
      this.walkPhase = 0;
      this.moving = false;
      this.target = null;
      this.fireCd = U.rand(0, 0.8);
      this.dead = false;
      this.flash = 0;
      this.muzzle = 0;
      this.think = 0;
      this.damage = 13 + game.baseLevel * 1.5;
      this.followOffset = { x: Math.cos(index * 2.1) * 90, y: 60 + Math.sin(index * 2.1) * 70 };
      this.step = 0;
    }

    takeDamage(amount, game) {
      if (this.dead) return;
      this.hp -= amount;
      this.flash = 0.1;
      game.addFloatText(this.x, this.y - 24, `-${Math.round(amount)}`, '#ff9a80', 10);
      this.hpShow = 2;
      for (let i = 0; i < 5; i++) {
        game.addParticle({ x: this.x, y: this.y, vx: U.rand(-80, 80), vy: U.rand(-80, 80), life: 0.3, size: 2, color: '#8f2b21', type: 'spark' });
      }
      if (this.hp <= 0) {
        this.hp = 0;
        this.dead = true;
        game.onSoldierDown(this);
      }
    }

    update(dt) {
      if (this.dead) return;
      this.flash = Math.max(0, this.flash - dt);
      this.fireCd = Math.max(0, this.fireCd - dt);
      this.muzzle = Math.max(0, this.muzzle - dt);
      this.hpShow = Math.max(0, (this.hpShow || 0) - dt);
      this.think -= dt;
      const game = this.game;
      const p = game.player;

      if (this.think <= 0) {
        this.think = 0.35;
        let best = null, bd = 560;
        for (const e of game.enemies) {
          if (e.dead) continue;
          const d = U.dist(this.x, this.y, e.x, e.y);
          if (d < bd) { bd = d; best = e; }
        }
        this.target = best;
      }

      let tx, ty;
      const nearPlayer = U.dist(this.x, this.y, p.x, p.y) < 1000 && !p.dead;
      if (this.target) {
        const d = U.dist(this.x, this.y, this.target.x, this.target.y);
        const desired = 210;
        if (d > desired) { tx = this.target.x; ty = this.target.y; }
        else if (d < 130) {
          tx = this.x - (this.target.x - this.x); ty = this.y - (this.target.y - this.y);
        } else { tx = this.x; ty = this.y; }
        this.aimAngle += U.angleDiff(this.aimAngle, Math.atan2(this.target.y - this.y, this.target.x - this.x)) * Math.min(1, dt * 10);
        if (d < 470 && this.fireCd <= 0) this.fire();
      } else {
        if (nearPlayer) {
          tx = p.x + this.followOffset.x;
          ty = p.y + this.followOffset.y;
        } else {
          const a = performance.now() / 5000 + this.index * 2;
          tx = game.world.base.x + Math.cos(a) * 180;
          ty = game.world.base.y + Math.sin(a) * 150;
        }
        const d = U.dist(this.x, this.y, tx, ty);
        if (d < 36) { tx = this.x; ty = this.y; }
        this.aimAngle += U.angleDiff(this.aimAngle, Math.atan2(ty - this.y, tx - this.x)) * Math.min(1, dt * 4);
      }

      const d = U.dist(this.x, this.y, tx, ty);
      if (d > 10) {
        const a = Math.atan2(ty - this.y, tx - this.x);
        this.moveAngle = a;
        const len = Math.min(d, this.speed * dt);
        this.x += Math.cos(a) * len;
        this.y += Math.sin(a) * len;
        this.game.resolveCircle(this, this.r);
        this.walkPhase += dt * 9;
        this.moving = true;
        this.step += dt;
        if (this.step > 0.3) {
          this.step = 0;
          game.addParticle({ x: this.x, y: this.y + 8, vx: U.rand(-8, 8), vy: U.rand(-5, 5), life: 0.3, size: 3, color: 'rgba(110,103,76,0.25)' });
        }
      } else {
        this.moving = false;
      }
    }

    fire() {
      const game = this.game;
      const spread = 0.06;
      const a = this.aimAngle + U.rand(-spread, spread);
      const range = 470;
      game.bullets.push(new Bullet(game, {
        x: this.x + Math.cos(a) * 16, y: this.y + Math.sin(a) * 16,
        vx: Math.cos(a) * 1150, vy: Math.sin(a) * 1150,
        damage: this.damage, team: 'soldier', life: range / 1150, size: 2, color: '#d9e7a9',
      }));
      this.fireCd = 0.38;
      this.muzzle = 0.06;
      TT.audio.shoot('soldier');
      game.addParticle({ x: this.x + Math.cos(a) * 20, y: this.y + Math.sin(a) * 20, vx: U.rand(-20, 20), vy: U.rand(-20, 20), life: 0.12, size: 4, color: '#ffd58a', glow: true });
    }

    draw(ctx) {
      if (this.dead) return;
      ctx.save();
      ctx.translate(this.x, this.y);
      // bóng
      ctx.fillStyle = 'rgba(2,4,2,0.4)';
      ctx.beginPath(); ctx.ellipse(3, 10, 15, 7, 0, 0, TAU); ctx.fill();
      // chân
      const swing = this.moving ? Math.sin(this.walkPhase) * 6 : 0;
      ctx.save(); ctx.rotate(this.moveAngle);
      ctx.strokeStyle = '#39402f'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-2, -5); ctx.lineTo(3 + swing, -8);
      ctx.moveTo(-2, 5); ctx.lineTo(3 - swing, 8);
      ctx.stroke();
      ctx.restore();
      // thân
      ctx.save(); ctx.rotate(this.aimAngle);
      if (this.flash > 0) ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#6f6241';
      ctx.beginPath(); ctx.ellipse(0, 0, 10, 12, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#3c3524'; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.fillStyle = '#83754d';
      ctx.fillRect(-8, -8, 5, 16);
      // đầu
      ctx.fillStyle = this.flash > 0 ? '#ffe5cf' : '#bd8c60';
      ctx.beginPath(); ctx.arc(3, 0, 6.4, 0, TAU); ctx.fill();
      ctx.fillStyle = '#4b4a2c';
      ctx.beginPath(); ctx.arc(2, 0, 6.8, 1.5, 4.8); ctx.fill();
      // súng
      ctx.fillStyle = '#2f332a';
      ctx.fillRect(9, -1.8, 27, 3.8);
      ctx.fillStyle = '#585c48';
      ctx.fillRect(11, -2.2, 14, 1.5);
      ctx.fillStyle = '#6e5534';
      ctx.fillRect(8, 0, 6, 4);
      if (this.muzzle > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,208,120,0.8)';
        ctx.beginPath(); ctx.arc(37, 0, 8, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
      // tên
      if (this.hpShow > 0 || this.hp < this.maxHp) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(-16, -30, 32, 4);
        ctx.fillStyle = '#9ed47f';
        ctx.fillRect(-16, -30, 32 * U.clamp(this.hp / this.maxHp, 0, 1), 4);
      }
      ctx.font = '700 6px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(190,205,160,0.8)';
      ctx.fillText(this.name, 0, -34);
      ctx.textAlign = 'left';
      ctx.restore();
    }
  }

  /* ============================================================
     CÔNG TRÌNH
     ============================================================ */
  class Structure {
    constructor(game, kind, x, y, angle = 0, level = 1) {
      this.game = game;
      this.kind = kind;
      this.def = TT.BUILD[kind];
      this.x = x; this.y = y;
      this.baseW = this.def.w;
      this.baseH = this.def.h;
      this.angle = angle;
      this.level = level;
      this.maxHp = Math.round(this.def.hp * (1 + 0.4 * (level - 1)));
      this.hp = this.maxHp;
      this.dead = false;
      this.fireCd = U.rand(0, 0.4);
      this.aim = U.rand(0, TAU);
      this.target = null;
      this.flash = 0;
      this.muzzle = 0;
      this.pulse = 0;
      this.applyRotation();
    }

    applyRotation() {
      const swap = this.angle > 0.1 && this.angle < Math.PI - 0.1;
      this.w = swap ? this.baseH : this.baseW;
      this.h = swap ? this.baseW : this.baseH;
    }

    takeDamage(amount, game) {
      if (this.dead) return;
      this.hp -= amount;
      this.flash = 0.1;
      game.addFloatText(this.x + U.rand(-8, 8), this.y - this.h / 2 - 8, `-${Math.round(amount)}`, '#e8a26f', 9);
      for (let i = 0; i < 4; i++) {
        game.addParticle({
          x: this.x + U.rand(-this.w / 2, this.w / 2), y: this.y + U.rand(-this.h / 2, this.h / 2),
          vx: U.rand(-100, 100), vy: U.rand(-100, 100), life: 0.35,
          size: U.rand(1.5, 3.5), color: '#806b45', type: 'spark',
        });
      }
      TT.audio.hit();
      if (this.hp <= 0) {
        this.dead = true;
        game.onStructureDestroyed(this);
      }
    }

    update(dt) {
      if (this.dead) return;
      this.flash = Math.max(0, this.flash - dt);
      this.muzzle = Math.max(0, this.muzzle - dt);
      this.pulse += dt;
      if (this.kind === 'turret') this.updateTurret(dt);
      if (this.kind === 'medic') this.updateMedic(dt);
    }

    updateTurret(dt) {
      const game = this.game;
      this.fireCd = Math.max(0, this.fireCd - dt);
      if (this.target && (this.target.dead || U.dist(this.x, this.y, this.target.x, this.target.y) > 540)) this.target = null;
      if (!this.target) {
        let best = null, bd = 480 + this.level * 30;
        for (const e of game.enemies) {
          if (e.dead) continue;
          const d = U.dist(this.x, this.y, e.x, e.y);
          if (d < bd) { bd = d; best = e; }
        }
        this.target = best;
      }
      if (this.target) {
        const a = Math.atan2(this.target.y - this.y, this.target.x - this.x);
        this.aim += U.angleDiff(this.aim, a) * Math.min(1, dt * 8);
        if (Math.abs(U.angleDiff(this.aim, a)) < 0.2 && this.fireCd <= 0) {
          const spread = 0.025;
          const ba = this.aim + U.rand(-spread, spread);
          const dmg = (12 + this.level * 4) * (1 + 0.12 * (game.baseLevel - 1));
          game.bullets.push(new Bullet(game, {
            x: this.x + Math.cos(this.aim) * 24, y: this.y + Math.sin(this.aim) * 24,
            vx: Math.cos(ba) * 1200, vy: Math.sin(ba) * 1200,
            damage: dmg, team: 'turret', life: 0.65, size: 2.4, color: '#b7f2e2',
          }));
          this.fireCd = 0.4 / (1 + 0.18 * (this.level - 1));
          this.muzzle = 0.07;
          TT.audio.shoot('turret');
          game.addParticle({
            x: this.x + Math.cos(this.aim) * 26, y: this.y + Math.sin(this.aim) * 26,
            vx: U.rand(-20, 20), vy: U.rand(-20, 20), life: 0.1, size: 4,
            color: '#c8fff2', glow: true,
          });
        }
      }
    }

    updateMedic(dt) {
      const game = this.game;
      const range = 150 + this.level * 15;
      for (const s of game.soldiers) {
        if (s.dead) continue;
        if (U.dist(this.x, this.y, s.x, s.y) < range && s.hp < s.maxHp) s.hp = Math.min(s.maxHp, s.hp + 3 * dt);
      }
      const p = game.player;
      if (!p.dead && U.dist(this.x, this.y, p.x, p.y) < range && p.hp < p.maxHp) {
        p.hp = Math.min(p.maxHp, p.hp + 3.2 * dt);
        if (Math.random() < dt * 3) {
          game.addParticle({
            x: p.x + U.rand(-12, 12), y: p.y + U.rand(-10, 10),
            vx: 0, vy: -16, life: 0.7, size: 2.2, color: '#9fe08c', glow: true,
          });
        }
      }
    }

    draw(ctx) {
      if (this.dead) return;
      const t = performance.now() / 1000;
      ctx.save();
      ctx.translate(this.x, this.y);
      // bóng
      ctx.fillStyle = 'rgba(2,4,2,0.38)';
      ctx.fillRect(-this.w / 2 + 4, -this.h / 2 + 7, this.w, this.h);

      if (this.kind === 'wall' || this.kind === 'barricade') {
        ctx.rotate(this.angle);
        const w = this.baseW, h = this.baseH;
        if (this.kind === 'wall') {
          ctx.fillStyle = this.flash > 0 ? '#b7a47c' : '#655636';
          ctx.fillRect(-w / 2, -h / 2, w, h);
          ctx.fillStyle = 'rgba(157,138,92,0.6)';
          ctx.fillRect(-w / 2, -h / 2, w, 4);
          ctx.fillStyle = 'rgba(38,32,19,0.55)';
          for (let i = 0; i < 4; i++) {
            ctx.fillRect(-w / 2 + 6 + i * (w - 12) / 3.4, -h / 2 + 4, 1.5, h - 8);
          }
          ctx.strokeStyle = '#37301e';
          ctx.lineWidth = 2;
          ctx.strokeRect(-w / 2, -h / 2, w, h);
          ctx.fillStyle = '#8e7c4f';
          for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.arc(-w / 2 + 12 + i * (w - 24) / 3, 0, 1.7, 0, TAU);
            ctx.fill();
          }
          if (this.level > 1) {
            ctx.strokeStyle = 'rgba(218,183,104,0.8)';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6);
          }
        } else {
          ctx.fillStyle = this.flash > 0 ? '#b7a47c' : '#4f432d';
          ctx.fillRect(-w / 2, -h / 2, w, h);
          ctx.strokeStyle = '#31291b';
          ctx.lineWidth = 2;
          for (let i = -w / 2 + 8; i < w / 2; i += 12) {
            ctx.beginPath();
            ctx.moveTo(i, h / 2);
            ctx.lineTo(i + 6, -h / 2 - 5);
            ctx.stroke();
          }
          ctx.fillStyle = '#736443';
          ctx.fillRect(-w / 2, -h / 2, w, 4);
        }
      } else if (this.kind === 'turret') {
        // đế
        ctx.fillStyle = this.flash > 0 ? '#cbbfa3' : '#3c4437';
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = '#252c22';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#2b3228';
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, TAU);
        ctx.fill();
        // thân xoay
        ctx.save();
        ctx.rotate(this.aim);
        ctx.fillStyle = '#596552';
        ctx.fillRect(-4, -8, 18, 16);
        ctx.fillStyle = '#78856b';
        ctx.fillRect(0, -6, 14, 3);
        ctx.fillRect(0, 3, 14, 3);
        ctx.fillStyle = '#2d3428';
        ctx.fillRect(20, -5, 9, 2.5);
        ctx.fillRect(20, 2.5, 9, 2.5);
        if (this.muzzle > 0) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = 'rgba(200,255,240,0.75)';
          ctx.beginPath(); ctx.arc(30, 0, 8, 0, TAU); ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        }
        ctx.restore();
        // cấp
        for (let i = 0; i < this.level; i++) {
          ctx.fillStyle = '#d6b56f';
          ctx.fillRect(-10 + i * 7, -25, 4, 2.5);
        }
      } else if (this.kind === 'medic') {
        const pulse = (Math.sin(t * 2.4) + 1) / 2;
        ctx.strokeStyle = `rgba(138,203,114,${0.12 + pulse * 0.1})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, 42 + pulse * 8, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = this.flash > 0 ? '#e4f0d8' : '#46513d';
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = '#293225';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#dbe9ce';
        ctx.fillRect(-4, -11, 8, 22);
        ctx.fillRect(-11, -4, 22, 8);
        ctx.fillStyle = '#8fbf7a';
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, TAU);
        ctx.fill();
      }

      // thanh máu
      if (this.hp < this.maxHp) {
        const bw = Math.max(34, this.w);
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(-bw / 2 - 1, -this.h / 2 - 11, bw + 2, 5);
        ctx.fillStyle = '#b06a3f';
        ctx.fillRect(-bw / 2, -this.h / 2 - 10, bw, 3);
        ctx.fillStyle = '#e3be75';
        ctx.fillRect(-bw / 2, -this.h / 2 - 10, bw * U.clamp(this.hp / this.maxHp, 0, 1), 3);
      }
      ctx.restore();
    }
  }

  TT.Particle = Particle;
  TT.FloatText = FloatText;
  TT.Bullet = Bullet;
  TT.Player = Player;
  TT.Enemy = Enemy;
  TT.Soldier = Soldier;
  TT.Structure = Structure;
})();
