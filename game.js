/* ============================================================
   game.js — lõi trò chơi: vòng lặp, cảnh, camera, điều khiển
   ============================================================ */
(function () {
  'use strict';
  const U = TT.U;

  class Game {
    constructor() {
      this.canvas = document.getElementById('game');
      this.ctx = this.canvas.getContext('2d', { alpha: false });
      this.W = window.innerWidth;
      this.H = window.innerHeight;
      this.dpr = 1;
      this.isTouch = window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 900;
      this.cam = { x: 2100, y: 2100, zoom: 1, shake: 0, shakeMax: 0, shakeTime: 0 };
      this.state = 'menu';
      this.elapsed = 0;
      this.previewT = 0;
      this.last = performance.now();
      this.touch = {
        move: { x: 0, y: 0, active: false, mag: 0 },
        aim: { x: 0, y: 0, active: false, mag: 0 },
        fireHeld: false,
      };
      this.input = {
        keys: new Set(),
        mouse: { x: this.W / 2, y: this.H / 2 },
        fireHeld: false,
      };
      this.ash = [];
      this.lightCanvas = document.createElement('canvas');
      this.lightCtx = this.lightCanvas.getContext('2d');
      this.enemies = [];
      this.soldiers = [];
      this.bullets = [];
      this.particles = [];
      this.floatTexts = [];
      this.extraDecals = [];
      this.structures = [];
      this.activeQuests = [];
      this.resources = { scrap: 45, wood: 36, food: 14, parts: 3, medkit: 2 };
      this.ammo = { '9mm': 84, shell: 0, '556': 0 };
      this.stats = this.freshStats();
      this.buildMode = false;
      this.buildType = 'wall';
      this.buildAngle = 0;
      this.guidePrev = 'menu';
      this.baseLevel = 1;
      this.alertCd = 0;
      this.campfireCd = 0;
      this.gameTime = 420;

      this.setupPreview();
      this.ui = new TT.UI(this);
      this.ui.showMenu();
      this.setupInput();
      this.resize();
      this.loop = this.loop.bind(this);
      requestAnimationFrame(this.loop);

      window.GAME = this;
    }

    freshStats() {
      return {
        kills: 0, loots: 0, scrap: 0, builds: 0, turrets: 0, soldiers: 0,
        nights: 0, upgrades: 0, bosses: 0, waves: 0, quests: 0, distance: 0,
      };
    }

    setupPreview() {
      this.resetScene(true);
      this.state = 'menu';
      const base = this.world.base;
      const previewEnemies = [
        [430, -250, 'walker'], [620, 70, 'walker'], [-520, 180, 'runner'],
        [-430, -350, 'spitter'], [250, 470, 'walker'], [-660, 400, 'brute'],
      ];
      for (const [dx, dy, type] of previewEnemies) {
        this.enemies.push(new TT.Enemy(this, type, base.x + dx, base.y + dy, 2, false));
      }
      this.player.x = base.x + 15;
      this.player.y = base.y + 30;
      this.player.aimAngle = -0.65;
      this.player.moveAngle = -0.65;
      this.cam.x = base.x + 150;
      this.cam.y = base.y - 40;
      this.cam.zoom = this.isTouch ? 0.9 : 1.05;
      this.gameTime = 18.6 * 60;
      this.day = 1;
      this.updateLightLevel();
      this.cam.shake = 0;
    }

    resetScene(preview = false) {
      this.world = new TT.World(this);
      this.player = new TT.Player(this);
      this.enemies = [];
      this.soldiers = [];
      this.bullets = [];
      this.particles = [];
      this.floatTexts = [];
      this.extraDecals = [];
      this.structures = [];
      this.activeQuests = [];
      this.nextQuestIndex = 0;
      this.stats = this.freshStats();
      this.resources = { scrap: 45, wood: 36, food: 14, parts: 3, medkit: 2 };
      this.ammo = { '9mm': 84, shell: 0, '556': 0 };
      this.baseLevel = 1;
      this.gameTime = preview ? 18.6 * 60 : 7 * 60;
      this.day = 1;
      this.nightActive = false;
      this.nightAmount = 0;
      this.waveNumber = 0;
      this.waveTimer = 0;
      this.waveActive = false;
      this.waveTotal = 0;
      this.waveSpawned = 0;
      this.waveSpawnQueue = 0;
      this.waveSpawnTimer = 0;
      this.bossSpawned = false;
      this.ambientSpawnTimer = 3;
      this.alertCd = 0;
      this.campfireCd = 0;
      this.buildMode = false;
      this.buildType = 'wall';
      this.buildAngle = 0;
      this.questTick = 0;
      this.exploreTick = 0;
      this.elapsed = 0;
      this.input.fireHeld = false;
      this.touch.fireHeld = false;
      this.cam.x = this.player.x;
      this.cam.y = this.player.y;
      this.cam.shake = 0;
      this.cam.shakeTime = 0;
      this.setupBase();
      this.resetQuests();
      this.updateLightLevel();
      if (!preview) {
        // vài kẻ địch rải rác quanh căn cứ để trận chiến bắt đầu ngay
        const starts = [[-520, 260, 'walker'], [600, 310, 'walker'], [-380, -480, 'runner'], [510, -430, 'walker']];
        for (const [dx, dy, type] of starts) {
          this.enemies.push(new TT.Enemy(this, type, this.world.base.x + dx, this.world.base.y + dy, 1, false));
        }
        // lính gác kho vũ khí
        for (const loot of this.world.loots.filter(l => l.weaponCache)) {
          for (let i = 0; i < 2; i++) {
            const a = Math.random() * U.TAU;
            this.enemies.push(new TT.Enemy(this, i ? 'walker' : 'runner', loot.x + Math.cos(a) * 90, loot.y + Math.sin(a) * 90, 1, false));
          }
        }
      }
    }

    setupBase() {
      const b = this.world.base;
      this.structures.push(new TT.Structure(this, 'turret', b.x - 150, b.y - 108));
      this.structures.push(new TT.Structure(this, 'wall', b.x - 250, b.y + 105, Math.PI / 2));
      this.structures.push(new TT.Structure(this, 'wall', b.x + 250, b.y + 105, Math.PI / 2));
      this.structures.push(new TT.Structure(this, 'wall', b.x - 120, b.y + 255, 0));
      this.structures.push(new TT.Structure(this, 'wall', b.x + 120, b.y + 255, 0));
    }

    loop(now) {
      const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      if (this.state === 'playing') {
        this.update(dt);
      } else if (this.state === 'menu') {
        this.updatePreview(dt);
      }
      this.updateAsh(dt);
      this.render(dt);
      requestAnimationFrame(this.loop);
    }

    update(dt) {
      if (this.player.dead) return;
      this.elapsed += dt;
      this.updateTime(dt);
      this.updateAim();
      this.player.update(dt, this.getMoveInput());
      if (this.state !== 'playing') return;
      this.updateCombat(dt);
      this.updateEnemies(dt);
      this.updateSoldiers(dt);
      this.updateStructures(dt);
      this.updateBullets(dt);
      this.updateEffects(dt);
      this.updateWaves(dt);
      this.updateAmbientSpawn(dt);
      this.updateCamera(dt);
      this.campfireCd = Math.max(0, this.campfireCd - dt);
      this.alertCd = Math.max(0, this.alertCd - dt);

      this.questTick -= dt;
      if (this.questTick <= 0) { this.questTick = 0.35; this.checkQuests(); }
      this.exploreTick -= dt;
      if (this.exploreTick <= 0) {
        this.exploreTick = 0.3;
        this.world.markExplored(this.player.x, this.player.y, 470);
      }
      this.ui.update(dt);
      if (Math.random() < dt * 2.4) this.spawnCampfireEmbers();
    }

    updatePreview(dt) {
      this.previewT += dt;
      const base = this.world.base;
      this.cam.x = base.x + 170 + Math.sin(this.previewT * 0.055) * 150;
      this.cam.y = base.y - 30 + Math.cos(this.previewT * 0.041) * 90;
      this.player.aimAngle = -0.6 + Math.sin(this.previewT * 0.23) * 0.35;
      for (let i = 0; i < this.enemies.length; i++) {
        const e = this.enemies[i];
        e.walkPhase += dt * 1.2;
        e.angle += Math.sin(this.previewT * 0.4 + i) * dt * 0.25;
      }
      this.updateEffects(dt);
      this.gameTime = 18.6 * 60;
      this.updateLightLevel();
      if (this.ui && this.state === 'menu') this.ui.updateCrosshair();
      if (Math.random() < dt * 3.2) this.spawnCampfireEmbers();
    }

    updateEffects(dt) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.update(dt);
        if (p.life <= 0) this.particles.splice(i, 1);
      }
      if (this.particles.length > 650) this.particles.splice(0, this.particles.length - 650);
      for (let i = this.floatTexts.length - 1; i >= 0; i--) {
        const f = this.floatTexts[i];
        f.update(dt);
        if (f.life <= 0) this.floatTexts.splice(i, 1);
      }
    }

    updateBullets(dt) {
      for (const b of this.bullets) b.update(dt);
      this.bullets = this.bullets.filter(b => !b.dead);
    }

    updateSoldiers(dt) {
      for (const s of this.soldiers) s.update(dt);
    }

    updateStructures(dt) {
      for (const s of this.structures.slice()) s.update(dt);
    }

    updateEnemies(dt) {
      for (const e of this.enemies) {
        if (!e.dead) e.update(dt);
      }
      this.enemies = this.enemies.filter(e => !e.dead);
      if (this.enemies.length > 110) this.enemies.splice(0, this.enemies.length - 110);
    }

    getMoveInput() {
      let x = 0, y = 0;
      const k = this.input.keys;
      if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
      if (k.has('KeyW') || k.has('ArrowUp')) y -= 1;
      if (k.has('KeyS') || k.has('ArrowDown')) y += 1;
      if (this.touch.move.active && this.touch.move.mag > 0.12) {
        x = this.touch.move.x;
        y = this.touch.move.y;
      }
      const len = Math.hypot(x, y);
      if (len > 1) { x /= len; y /= len; }
      return { x, y, move: { x, y }, sprint: k.has('ShiftLeft') || k.has('ShiftRight') };
    }

    updateAim() {
      const p = this.player;
      if (this.isTouch) {
        const a = this.touch.aim;
        if (a.active && a.mag > 0.24) {
          p.aimAngle = Math.atan2(a.y, a.x);
        } else if (this.touch.fireHeld) {
          let best = null, bd = 660;
          for (const e of this.enemies) {
            if (e.dead) continue;
            const d = U.dist(p.x, p.y, e.x, e.y);
            if (d < bd) { bd = d; best = e; }
          }
          if (best) p.aimAngle = Math.atan2(best.y - p.y, best.x - p.x);
        }
      } else {
        const w = this.screenToWorld(this.input.mouse.x, this.input.mouse.y);
        p.aimAngle = Math.atan2(w.y - p.y, w.x - p.x);
      }
    }

    screenToWorld(sx, sy) {
      return {
        x: this.cam.x + (sx - this.W / 2) / this.cam.zoom,
        y: this.cam.y + (sy - this.H / 2) / this.cam.zoom,
      };
    }

    updateCamera(dt) {
      const p = this.player;
      let lx = 0, ly = 0;
      if (!this.isTouch) {
        lx = U.clamp((this.input.mouse.x - this.W / 2) * 0.1, -60, 60) / this.cam.zoom;
        ly = U.clamp((this.input.mouse.y - this.H / 2) * 0.1, -45, 45) / this.cam.zoom;
      }
      const k = Math.min(1, dt * 7);
      this.cam.x += (p.x + lx - this.cam.x) * k;
      this.cam.y += (p.y + ly - this.cam.y) * k;
      const z = this.isTouch ? 0.88 : 1;
      this.cam.zoom += (z - this.cam.zoom) * Math.min(1, dt * 4);
      const hw = this.W / 2 / this.cam.zoom;
      const hh = this.H / 2 / this.cam.zoom;
      this.cam.x = U.clamp(this.cam.x, hw, this.world.size - hw);
      this.cam.y = U.clamp(this.cam.y, hh, this.world.size - hh);
      if (this.cam.shakeTime > 0) {
        this.cam.shakeTime -= dt;
        this.cam.shake = this.cam.shakeMax * Math.max(0, this.cam.shakeTime / 0.3);
      } else this.cam.shake = 0;
    }

    shake(amount, duration = 0.2) {
      this.cam.shakeMax = Math.max(this.cam.shakeMax, amount);
      this.cam.shakeTime = Math.max(this.cam.shakeTime, duration);
      this.cam.shake = amount;
    }

    resize() {
      this.W = window.innerWidth;
      this.H = window.innerHeight;
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.floor(this.W * this.dpr);
      this.canvas.height = Math.floor(this.H * this.dpr);
      this.canvas.style.width = this.W + 'px';
      this.canvas.style.height = this.H + 'px';
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.lightCanvas.width = Math.ceil(this.W / 2);
      this.lightCanvas.height = Math.ceil(this.H / 2);
      this.isTouch = window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 900;
      this.ash = [];
      for (let i = 0; i < 80; i++) {
        this.ash.push({
          x: Math.random() * this.W, y: Math.random() * this.H,
          vx: U.rand(-7, 7), vy: U.rand(9, 26), size: U.rand(0.7, 2.1),
          alpha: U.rand(0.1, 0.42), phase: Math.random() * 6.28,
          ember: Math.random() < 0.14,
        });
      }
      if (this.ui) {
        if (this.state === 'playing') {
          this.ui.el.mobile.classList.toggle('hidden', !this.isTouch);
          this.ui.el.crosshair.classList.toggle('visible', !this.isTouch);
        }
        this.ui.update(0, true);
      }
    }

    updateAsh(dt) {
      const drift = Math.sin(performance.now() / 4200) * 6;
      for (const a of this.ash) {
        a.x += (a.vx + drift) * dt;
        a.y += a.vy * dt;
        if (a.y > this.H + 6) { a.y = -6; a.x = Math.random() * this.W; }
        if (a.x < -6) a.x = this.W + 5;
        if (a.x > this.W + 6) a.x = -5;
      }
    }

    spawnCampfireEmbers() {
      const f = this.world.base.fire;
      if (Math.abs(f.x - this.cam.x) > this.W / this.cam.zoom / 2 + 60) return;
      if (Math.abs(f.y - this.cam.y) > this.H / this.cam.zoom / 2 + 60) return;
      this.particles.push(new TT.Particle({
        x: f.x + U.rand(-10, 10), y: f.y - 8,
        vx: U.rand(-12, 12), vy: U.rand(-45, -20),
        life: U.rand(0.6, 1.6), size: U.rand(1, 2.4),
        color: Math.random() < 0.35 ? '#ffd27a' : '#ff8a3c',
        glow: true, drag: 0.97,
      }));
    }

    /* ============================================================
       ĐIỀU KHIỂN
       ============================================================ */
    setupInput() {
      window.addEventListener('keydown', (e) => this.onKeyDown(e));
      window.addEventListener('keyup', (e) => this.input.keys.delete(e.code));
      window.addEventListener('blur', () => {
        this.input.keys.clear();
        this.input.fireHeld = false;
        this.touch.fireHeld = false;
      });

      document.addEventListener('pointerdown', () => TT.audio.init(), { once: true });

      this.canvas.addEventListener('pointermove', (e) => {
        if (e.pointerType === 'touch') return;
        this.input.mouse.x = e.clientX;
        this.input.mouse.y = e.clientY;
      });
      this.canvas.addEventListener('pointerdown', (e) => {
        TT.audio.init();
        this.input.mouse.x = e.clientX;
        this.input.mouse.y = e.clientY;
        if (this.state !== 'playing') return;
        if (this.buildMode) {
          if (e.button === 2) { this.rotateBuild(); return; }
          const w = this.screenToWorld(e.clientX, e.clientY);
          this.placeBuildAt(w.x, w.y);
          e.preventDefault();
          return;
        }
        if (e.pointerType !== 'touch') this.input.fireHeld = true;
      });
      window.addEventListener('pointerup', (e) => {
        if (e.pointerType !== 'touch') this.input.fireHeld = false;
      });
      this.canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (this.state === 'playing' && this.buildMode) this.rotateBuild();
      });
      window.addEventListener('resize', () => this.resize());
      window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));

      // nút hành động trên HUD
      const click = (id, fn) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', (e) => { e.preventDefault(); TT.audio.init(); fn(); });
      };
      click('btnFire', () => {});
      click('btnReload', () => this.player && this.player.startReload());
      click('btnDash', () => this.tryDash());
      click('btnInteract', () => this.interact());
      click('btnBuild', () => this.toggleBuild());
      click('btnHeal', () => this.useMedkit());
      click('btnWeapon', () => this.cycleWeapon());
      click('btnHub', () => this.openHub());

      this.setupStick('moveZone', this.touch.move);
      this.setupStick('aimZone', this.touch.aim);

      const fireBtn = document.getElementById('btnFire');
      if (fireBtn) {
        const down = (e) => { e.preventDefault(); TT.audio.init(); this.touch.fireHeld = true; fireBtn.style.transform = 'scale(0.94)'; };
        const up = (e) => { e.preventDefault(); this.touch.fireHeld = false; fireBtn.style.transform = ''; };
        fireBtn.addEventListener('pointerdown', down);
        fireBtn.addEventListener('pointerup', up);
        fireBtn.addEventListener('pointercancel', up);
        fireBtn.addEventListener('pointerleave', up);
      }
    }

    setupStick(id, state) {
      const el = document.getElementById(id);
      if (!el) return;
      const knob = el.querySelector('.stick-knob');
      let pointerId = null;
      const update = (e) => {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        let dx = e.clientX - cx;
        let dy = e.clientY - cy;
        const max = r.width * 0.32;
        const len = Math.hypot(dx, dy);
        if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
        state.x = dx / max;
        state.y = dy / max;
        state.mag = Math.min(1, len / max);
        state.active = true;
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
      };
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        TT.audio.init();
        pointerId = e.pointerId;
        el.setPointerCapture(pointerId);
        update(e);
      });
      el.addEventListener('pointermove', (e) => {
        if (pointerId !== e.pointerId) return;
        e.preventDefault();
        update(e);
      });
      const end = (e) => {
        if (pointerId !== null && e.pointerId !== pointerId) return;
        pointerId = null;
        state.x = 0; state.y = 0; state.mag = 0; state.active = false;
        knob.style.transform = '';
      };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
      el.addEventListener('pointerleave', (e) => { if (state.active && e.pointerId === pointerId) end(e); });
    }

    onKeyDown(e) {
      TT.audio.init();
      const code = e.code;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(code)) e.preventDefault();
      this.input.keys.add(code);
      if (e.repeat) return;
      const guideOpen = this.ui && !this.ui.el.guide.classList.contains('hidden');
      if (guideOpen) {
        if (code === 'Escape' || code === 'KeyG' || code === 'Enter') this.closeGuide();
        return;
      }
      if (this.state === 'menu') {
        if (code === 'Enter' || code === 'Space') this.startGame();
        else if (code === 'KeyG' || code === 'F1') this.openGuide();
        return;
      }
      if (this.state === 'dead') {
        if (code === 'Enter' || code === 'Space') this.startGame();
        return;
      }
      if (this.state === 'paused') {
        if (code === 'Escape' || code === 'KeyP') this.resume();
        return;
      }
      if (this.state === 'panel') {
        if (code === 'Escape' || code === 'KeyH' || code === 'KeyJ') this.closePanel();
        return;
      }
      if (this.state !== 'playing') return;

      if (code === 'Escape') {
        if (this.buildMode) this.toggleBuild(false);
        else this.pause();
        return;
      }
      if (code === 'Space') { this.tryDash(); return; }
      if (code === 'KeyE') { this.interact(); return; }
      if (code === 'KeyQ') { this.useMedkit(); return; }
      if (code === 'KeyB') { this.toggleBuild(); return; }
      if (code === 'KeyH') { this.openHub(); return; }
      if (code === 'KeyJ') { this.openPanel('quests'); return; }
      if (code === 'KeyP') { this.pause(); return; }
      if (code === 'KeyF') { this.toggleBuild(); return; }
      if (this.buildMode) {
        if (code === 'KeyR') { this.rotateBuild(); return; }
        const map = { Digit1: 'wall', Digit2: 'barricade', Digit3: 'turret', Digit4: 'medic' };
        if (map[code]) { this.selectBuild(map[code]); return; }
      }
      if (code === 'KeyR') { this.player.startReload(); return; }
      if (code.startsWith('Digit')) {
        const n = Number(code.slice(5));
        if (n >= 1 && n <= 4) this.player.switchWeapon(n - 1);
        return;
      }
      if (code === 'KeyM') { this.cycleWeapon(); }
    }
  }

  TT.Game = Game;
})();
