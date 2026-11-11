/* ============================================================
   game-system.js — cảnh chơi, thời gian, đợt sóng, nhiệm vụ,
   tương tác, xây dựng và tiến trình căn cứ
   ============================================================ */
(function () {
  'use strict';
  const U = TT.U;

  const LOOT_LABEL = {
    crate: 'THÙNG GỖ', duffel: 'TÚI CỨU HỘ', corpse: 'XÁC NGƯỜI',
    locker: 'TỦ KHÓA', supply: 'HÒM TIẾP TẾ', weapon: 'KHO VŨ KHÍ',
  };

  Object.assign(TT.Game.prototype, {
    /* ============================================================
       TIỆN ÍCH GIAO DIỆN
       ============================================================ */
    toast(text, type = 'info', icon = '◆') {
      if (this.ui) this.ui.toast(text, type, icon);
    },

    showBanner(kicker, title, sub, duration = 3.2) {
      if (this.ui) this.ui.banner(kicker, title, sub, duration);
    },

    cycleWeapon() {
      if (!this.player || this.player.dead) return;
      const owned = this.player.weapons
        .map((w, i) => ({ w, i }))
        .filter(o => o.w.owned);
      if (!owned.length) return;
      const idx = owned.findIndex(o => o.i === this.player.current);
      const next = owned[(idx + 1) % owned.length];
      if (next) this.player.switchWeapon(next.i);
    },

    /* ============================================================
       CẢNH CHƠI
       ============================================================ */
    startGame() {
      TT.audio.init();
      this.resetScene(false);
      this.state = 'playing';
      this.last = performance.now();
      this.guidePrev = 'playing';
      this.buildMode = false;
      document.body.classList.remove('build-open');
      this.ui.el.menu.classList.add('hidden');
      this.ui.el.pause.classList.add('hidden');
      this.ui.el.death.classList.add('hidden');
      this.ui.el.guide.classList.add('hidden');
      this.ui.el.panel.classList.add('hidden');
      this.ui.hideBuild();
      this.ui.showHud();
      this.ui.buildWeaponDock();
      this.ui.update(0, true);
      this.ui.banner('TRẠM TÍN HIỆU 07', 'BẮT ĐẦU SINH TỒN', 'Thu thập vật tư · Dựng phòng tuyến · Sống qua đêm', 4);
      this.toast('HÃY THU THẬP PHẾ LIỆU QUANH CĂN CỨ', 'info', '⌖');
      TT.audio.click();
    },

    pause() {
      if (this.state !== 'playing') return;
      this.state = 'paused';
      this.input.fireHeld = false;
      this.touch.fireHeld = false;
      if (this.buildMode) this.toggleBuild(false);
      this.ui.showPause();
      TT.audio.click();
    },

    resume() {
      if (this.state !== 'paused') return;
      this.state = 'playing';
      this.ui.el.pause.classList.add('hidden');
      this.last = performance.now();
      TT.audio.click();
    },

    quitToMenu() {
      this.setupPreview();
      this.state = 'menu';
      this.buildMode = false;
      document.body.classList.remove('build-open');
      this.ui.hideBuild();
      this.ui.el.pause.classList.add('hidden');
      this.ui.el.death.classList.add('hidden');
      this.ui.el.guide.classList.add('hidden');
      this.ui.el.panel.classList.add('hidden');
      this.ui.showMenu();
      TT.audio.click();
    },

    openGuide() {
      if (this.state === 'dead') return;
      this.guidePrev = this.state;
      this.state = 'guide';
      this.input.fireHeld = false;
      this.touch.fireHeld = false;
      this.ui.showGuide();
      TT.audio.click();
    },

    closeGuide() {
      this.ui.hideGuide();
      if (this.state !== 'guide') return;
      this.state = this.guidePrev || 'menu';
      this.last = performance.now();
      TT.audio.click();
    },

    openHub() {
      this.openPanel('command');
    },

    openPanel(tabId = 'command', maybeTab) {
      if (!this.player || this.player.dead || this.state === 'menu' || this.state === 'dead') return;
      const tabs = ['command', 'weapons', 'recruit', 'supply', 'quests'];
      const actualTab = tabs.includes(tabId) ? tabId : tabs.includes(maybeTab) ? maybeTab : 'command';
      if (this.state === 'playing' && this.buildMode) this.toggleBuild(false);
      this.state = 'panel';
      this.input.fireHeld = false;
      this.touch.fireHeld = false;
      this.ui.openPanel(actualTab);
      TT.audio.click();
    },

    closePanel() {
      this.ui.closePanel();
      if (this.state === 'panel') {
        this.state = 'playing';
        this.last = performance.now();
      }
      TT.audio.click();
    },

    /* ============================================================
       THỜI GIAN / NGÀY ĐÊM
       ============================================================ */
    hour() {
      return (this.gameTime / 60) % 24;
    },

    phaseInfo() {
      const h = this.hour();
      if (h >= 5 && h < 7) {
        return { name: 'BÌNH MINH', threat: 'CẨN TRỌNG', color: '#d9a76b', icon: '◐' };
      }
      if (h >= 7 && h < 17) {
        return { name: 'BAN NGÀY', threat: 'AN TOÀN', color: '#b7d38a', icon: '☀' };
      }
      if (h >= 17 && h < 19) {
        return { name: 'HOÀNG HÔN', threat: 'CẨN TRỌNG', color: '#e0955a', icon: '◑' };
      }
      return { name: 'BAN ĐÊM', threat: 'NGUY HIỂM', color: '#e06a55', icon: '☾' };
    },

    updateTime(dt) {
      this.gameTime += dt * 2.0;
      while (this.gameTime >= 1440) {
        this.gameTime -= 1440;
        this.day++;
      }

      const h = this.hour();
      const shouldBeNight = h >= 19 || h < 5.5;
      if (shouldBeNight && !this.nightActive) {
        this.nightActive = true;
        this.onNightStart();
      } else if (!shouldBeNight && this.nightActive) {
        this.nightActive = false;
        this.onDayStart();
      }
      this.updateLightLevel();
    },

    updateLightLevel() {
      const h = this.hour();
      let darkness = 0;
      if (h >= 18 && h < 20.5) darkness = U.smoothstep(18, 20.5, h);
      else if (h >= 20.5 || h < 4.5) darkness = 1;
      else if (h >= 4.5 && h < 6.5) darkness = 1 - U.smoothstep(4.5, 6.5, h);
      this.nightAmount = U.clamp(darkness, 0, 1);
    },

    onNightStart() {
      this.waveNumber = 0;
      this.waveActive = false;
      this.waveCleared = false;
      this.waveTotal = 0;
      this.waveSpawned = 0;
      this.waveTimer = 14;
      this.bossPending = this.day % 5 === 0;
      this.showBanner('MÀN ĐÊM BUÔNG XUỐNG', 'DỊ BIẾN ĐANG TỤ HỌP', 'Tháp súng và tường chắn sẽ quyết định đêm nay', 4);
      this.toast('ĐỢT TẤN CÔNG SẼ BẮT ĐẦU SAU 14 GIÂY', 'bad', '☾');
      this.ui.update(0, true);
      TT.audio.wave();
    },

    onDayStart() {
      this.waveActive = false;
      this.waveCleared = false;
      this.waveNumber = 0;
      this.waveTimer = 0;
      this.showBanner('BÌNH MINH', 'BẠN ĐÃ SỐNG QUA MỘT ĐÊM NỮA', 'Hãy sửa chữa phòng tuyến và thu thập vật tư', 3.6);
      this.toast('BÌNH MINH ĐẾN · DỊ BIẾN TẠM RÚT LUI', 'good', '☀');
      this.updateLightLevel();
      TT.audio.quest();
    },

    /* ============================================================
       ĐỢT SÓNG
       ============================================================ */
    updateWaves(dt) {
      if (!this.nightActive) {
        if (this.waveActive) this.waveActive = false;
        return;
      }
      if (this.waveCleared) return;

      if (!this.waveActive) {
        this.waveTimer = Math.max(0, this.waveTimer - dt);
        if (this.waveTimer <= 0) this.startWave();
        return;
      }

      if (this.waveSpawned < this.waveTotal) {
        this.waveSpawnTimer -= dt;
        if (this.waveSpawnTimer <= 0) {
          const batch = Math.min(2, this.waveTotal - this.waveSpawned);
          for (let i = 0; i < batch; i++) this.spawnWaveEnemy();
          this.waveSpawnTimer = Math.max(0.2, 0.72 - this.day * 0.025);
        }
      } else {
        const alive = this.enemies.some(e => e.waveEnemy && !e.dead);
        if (!alive) this.finishWave();
      }
    },

    startWave() {
      this.waveNumber = Math.max(1, this.waveNumber + 1);
      this.waveActive = true;
      this.waveCleared = false;
      this.waveTotal = Math.min(46, 6 + this.day * 3 + (this.baseLevel - 1) * 2);
      if (this.bossPending) this.waveTotal += 1;
      this.waveSpawned = 0;
      this.waveSpawnTimer = 0.25;
      this.showBanner(`ĐỢT DỊ BIẾN · ĐÊM ${this.day}`, `ĐỢT ${this.waveNumber} BẮT ĐẦU`, `${this.waveTotal} dị biến đang tiến về căn cứ`, 3.2);
      this.toast('GIỮ VỮNG PHÒNG TUYẾN!', 'bad', '!');
      this.shake(6, 0.4);
      TT.audio.wave();
      this.checkQuests();
      this.ui.update(0, true);
    },

    spawnWaveEnemy() {
      if (this.waveSpawned >= this.waveTotal) return;
      let type = 'walker';
      if (this.bossPending && this.waveSpawned >= this.waveTotal - 1) {
        type = 'boss';
        this.bossPending = false;
        this.showBanner('QUÁI VẬT CHÚA', 'MỘT THỰC THỂ KHỔNG LỒ XUẤT HIỆN', 'Hạ gục nó để kết thúc đợt tấn công', 3.4);
        TT.audio.bossRoar();
      } else {
        const roll = Math.random();
        if (this.day >= 4 && roll < 0.12) type = 'brute';
        else if (this.day >= 2 && roll < 0.3) type = 'spitter';
        else if (roll < 0.62) type = 'runner';
      }

      const angle = U.rand(0, U.TAU);
      const radius = U.rand(820, 1080);
      const base = this.world.base;
      const x = U.clamp(base.x + Math.cos(angle) * radius, 100, this.world.size - 100);
      const y = U.clamp(base.y + Math.sin(angle) * radius, 100, this.world.size - 100);
      this.enemies.push(new TT.Enemy(this, type, x, y, this.day, true));
      this.waveSpawned++;
    },

    finishWave() {
      this.waveActive = false;
      this.waveCleared = true;
      this.stats.nights++;
      const bonusScrap = 12 + this.day * 5;
      const bonusParts = this.day % 2 === 0 ? 2 : 1;
      this.resources.scrap += bonusScrap;
      this.stats.scrap += bonusScrap;
      this.resources.parts += bonusParts;
      this.player.heal(12, true);
      this.showBanner('ĐỢT TẤN CÔNG BỊ ĐẨY LÙI', 'CĂN CỨ VẪN ĐỨNG VỮNG', `+${bonusScrap} phế liệu · +${bonusParts} linh kiện · Chờ bình minh`, 4);
      this.toast(`ĐÊM ${this.day} ĐÃ ĐƯỢC GIỮ · +${bonusScrap} PHẾ LIỆU`, 'good', '★');
      TT.audio.levelup();
      this.checkQuests();
      this.ui.update(0, true);
    },

    /* ============================================================
       DỊ BIẾN RẢI RÁC
       ============================================================ */
    updateAmbientSpawn(dt) {
      this.ambientSpawnTimer -= dt;
      if (this.ambientSpawnTimer > 0) return;
      this.ambientSpawnTimer = this.nightActive ? U.rand(3.5, 6.5) : U.rand(4.5, 8.5);

      const cap = this.nightActive ? 34 : 24;
      if (this.enemies.length >= cap) return;

      const type = this.pickAmbientType();
      const angle = U.rand(0, U.TAU);
      const radius = U.rand(680, 1080);
      const p = this.player;
      const x = U.clamp(p.x + Math.cos(angle) * radius, 100, this.world.size - 100);
      const y = U.clamp(p.y + Math.sin(angle) * radius, 100, this.world.size - 100);
      const base = this.world.base;
      if (U.dist(x, y, base.x, base.y) < 420) return;
      this.enemies.push(new TT.Enemy(this, type, x, y, this.day, false));
      if (this.day >= 3 && Math.random() < 0.28 && this.enemies.length < cap) {
        const a2 = angle + U.rand(-0.8, 0.8);
        this.enemies.push(new TT.Enemy(this, this.pickAmbientType(),
          U.clamp(p.x + Math.cos(a2) * (radius + 90), 100, this.world.size - 100),
          U.clamp(p.y + Math.sin(a2) * (radius + 90), 100, this.world.size - 100),
          this.day, false));
      }
    },

    pickAmbientType() {
      const roll = Math.random();
      if (this.day >= 5 && roll < 0.1) return 'brute';
      if (this.day >= 3 && roll < 0.22) return 'spitter';
      if (roll < 0.52) return 'runner';
      return 'walker';
    },

    /* ============================================================
       NHIỆM VỤ
       ============================================================ */
    resetQuests() {
      this.activeQuests = [];
      this.nextQuestIndex = 0;
      for (let i = 0; i < 3; i++) {
        const def = TT.QUEST_DEFS[this.nextQuestIndex++];
        if (def) this.activeQuests.push(this.makeQuest(def));
      }
    },

    makeQuest(def) {
      const quest = {
        ...def,
        reward: { ...def.reward },
        baseline: this.stats[def.stat] || 0,
        progress: 0,
        claimed: false,
      };
      quest.desc = String(quest.desc).replace('{n}', quest.target);
      return quest;
    },

    nextQuestDef() {
      if (this.nextQuestIndex < TT.QUEST_DEFS.length) {
        return TT.QUEST_DEFS[this.nextQuestIndex++];
      }
      const base = U.choice(TT.QUEST_ENDLESS);
      return {
        ...base,
        target: Math.round(base.target * (1 + 0.2 * Math.max(0, this.day - 1))),
        reward: { ...base.reward },
      };
    },

    checkQuests() {
      if (!this.activeQuests || !this.player) return;
      for (let i = this.activeQuests.length - 1; i >= 0; i--) {
        const q = this.activeQuests[i];
        if (q.claimed) continue;
        q.progress = Math.max(0, (this.stats[q.stat] || 0) - q.baseline);
        if (q.progress < q.target) continue;
        q.claimed = true;
        this.stats.quests++;
        this.grantReward(q.reward);
        this.toast(`HOÀN THÀNH: ${q.title}`, 'good', '✓');
        this.showBanner('NHIỆM VỤ HOÀN THÀNH', q.title, this.ui.rewardText(q.reward), 2.8);
        TT.audio.quest();
        this.activeQuests.splice(i, 1);
        const next = this.nextQuestDef();
        if (next) this.activeQuests.push(this.makeQuest(next));
      }
      if (this.ui) this.ui.update(0, true);
    },

    grantReward(reward) {
      if (!reward) return;
      if (reward.xp) this.gainXP(reward.xp);
      for (const key of ['scrap', 'wood', 'food', 'parts', 'medkit']) {
        if (reward[key]) this.resources[key] += reward[key];
      }
      const ammoMap = { ammo9: '9mm', shell: 'shell', ammo556: '556' };
      for (const key of Object.keys(ammoMap)) {
        if (reward[key]) this.ammo[ammoMap[key]] += reward[key];
      }
    },

    /* ============================================================
       TƯƠNG TÁC
       ============================================================ */
    lootLabel(loot) {
      if (loot.weaponCache) return 'KHO VŨ KHÍ';
      return LOOT_LABEL[loot.type] || 'VẬT TƯ';
    },

    getInteractTarget() {
      if (this.state !== 'playing' || this.player.dead) return null;
      const p = this.player;
      let best = null;
      let bestD = Infinity;

      for (const loot of this.world.loots) {
        if (loot.opened) continue;
        const d = U.dist(p.x, p.y, loot.x, loot.y);
        if (d < 62 && d < bestD) {
          bestD = d;
          best = { obj: loot, kind: 'loot', label: 'MỞ ' + this.lootLabel(loot) };
        }
      }

      for (const st of this.structures) {
        if (st.dead) continue;
        const reach = Math.max(st.w, st.h) * 0.5 + 38;
        const d = U.dist(p.x, p.y, st.x, st.y);
        if (d < reach && d < bestD) {
          const label = st.hp < st.maxHp - 0.5
            ? 'SỬA CHỮA CÔNG TRÌNH'
            : st.level < 3 ? 'NÂNG CẤP CÔNG TRÌNH' : 'CÔNG TRÌNH ĐÃ TỐI ĐA';
          bestD = d;
          best = { obj: st, kind: 'structure', label };
        }
      }

      const command = this.world.base.command;
      if (U.dist(p.x, p.y, command.x, command.y) < 96 && 96 < bestD) {
        bestD = 96;
        best = { obj: command, kind: 'command', label: 'MỞ TRUNG TÂM CHỈ HUY' };
      }

      const fire = this.world.base.fire;
      const df = U.dist(p.x, p.y, fire.x, fire.y);
      if (df < 78 && df < bestD) {
        bestD = df;
        best = { obj: fire, kind: 'fire', label: this.campfireCd > 0 ? 'LỬA TRẠI · ĐANG HỒI' : 'NGHỈ NGƠI BÊN LỬA TRẠI' };
      }

      return best;
    },

    interact() {
      if (this.state !== 'playing') return;
      const target = this.getInteractTarget();
      if (!target) {
        this.toast('KHÔNG CÓ GÌ ĐỂ TƯƠNG TÁC Ở ĐÂY', 'info', '⌖');
        return;
      }
      if (target.kind === 'loot') {
        this.openLoot(target.obj);
      } else if (target.kind === 'structure') {
        this.interactStructure(target.obj);
      } else if (target.kind === 'command') {
        this.openHub();
      } else if (target.kind === 'fire') {
        this.interactCampfire();
      }
    },

    interactStructure(st) {
      if (st.hp < st.maxHp - 0.5) {
        const cost = { scrap: 8 + Math.round(st.maxHp * 0.025) };
        if (!this.canAfford(cost)) {
          this.toast('KHÔNG ĐỦ PHẾ LIỆU ĐỂ SỬA CHỮA', 'bad', '⚙');
          TT.audio.error();
          return;
        }
        this.pay(cost);
        st.hp = Math.min(st.maxHp, st.hp + st.maxHp * 0.45);
        st.flash = 0.2;
        this.toast('ĐÃ SỬA CHỮA CÔNG TRÌNH', 'good', '▦');
        TT.audio.build();
        for (let i = 0; i < 12; i++) {
          this.addParticle({
            x: st.x + U.rand(-st.w / 2, st.w / 2), y: st.y + U.rand(-st.h / 2, st.h / 2),
            vx: U.rand(-30, 30), vy: U.rand(-60, -15), life: U.rand(0.4, 0.9),
            size: U.rand(1.4, 3), color: '#d8c08a', glow: true,
          });
        }
        this.ui.update(0, true);
        return;
      }

      if (st.level >= 3) {
        this.toast('CÔNG TRÌNH ĐÃ ĐẠT CẤP TỐI ĐA', 'info', '▦');
        return;
      }
      const cost = { scrap: 26 + st.level * 22, parts: st.level >= 2 ? 2 : 1 };
      if (!this.canAfford(cost)) {
        this.toast('KHÔNG ĐỦ VẬT TƯ ĐỂ NÂNG CẤP', 'bad', '⚙');
        TT.audio.error();
        return;
      }
      this.pay(cost);
      st.level++;
      st.maxHp = Math.round(st.def.hp * (1 + 0.4 * (st.level - 1)));
      st.hp = st.maxHp;
      st.flash = 0.25;
      this.toast(`CÔNG TRÌNH ĐÃ LÊN CẤP ${st.level}`, 'good', '▦');
      TT.audio.build();
      this.ui.update(0, true);
    },

    interactCampfire() {
      if (this.campfireCd > 0) {
        this.toast('LỬA TRẠI CẦN THỜI GIAN ĐỂ HỒI PHỤC', 'info', '☼');
        return;
      }
      const p = this.player;
      if (p.hp >= p.maxHp - 0.5) {
        this.toast('BẠN ĐANG KHỎE MẠNH', 'info', '✚');
        return;
      }
      this.campfireCd = 16;
      p.heal(22);
      this.toast('NGHỈ NGƠI BÊN LỬA · +22 MÁU', 'good', '✚');
      TT.audio.heal();
      for (let i = 0; i < 18; i++) {
        this.addParticle({
          x: p.x + U.rand(-14, 14), y: p.y + U.rand(-10, 12),
          vx: U.rand(-14, 14), vy: U.rand(-45, -18), life: U.rand(0.5, 1.1),
          size: U.rand(1.4, 3), color: '#ffcf87', glow: true,
        });
      }
      this.ui.update(0, true);
    },

    /* ============================================================
       XÂY DỰNG
       ============================================================ */
    canAfford(cost) {
      if (!cost) return true;
      for (const key of Object.keys(cost)) {
        if ((this.resources[key] || 0) < cost[key]) return false;
      }
      return true;
    },

    pay(cost) {
      if (!this.canAfford(cost)) return false;
      for (const key of Object.keys(cost)) this.resources[key] -= cost[key];
      return true;
    },

    toggleBuild(force) {
      if (this.state !== 'playing') return;
      const on = force === undefined ? !this.buildMode : !!force;
      this.buildMode = on;
      document.body.classList.toggle('build-open', on);
      this.input.fireHeld = false;
      this.touch.fireHeld = false;
      if (on) {
        this.ui.showBuild();
        this.ui.refreshBuildBar();
        this.toast(this.isTouch ? 'CHỌN CÔNG TRÌNH · CHẠM ĐỂ ĐẶT' : 'CHỌN CÔNG TRÌNH · CHUỘT TRÁI ĐỂ ĐẶT', 'info', '▦');
      } else {
        this.ui.hideBuild();
      }
    },

    selectBuild(id) {
      if (!TT.BUILD[id] || this.state !== 'playing') return;
      this.buildType = id;
      this.buildMode = true;
      this.ui.showBuild();
      this.ui.refreshBuildBar();
      TT.audio.click();
    },

    rotateBuild() {
      if (this.state !== 'playing' || !this.buildMode) return;
      const def = TT.BUILD[this.buildType];
      if (!def || !def.rotatable) {
        this.toast('CÔNG TRÌNH NÀY KHÔNG THỂ XOAY', 'info', '▦');
        return;
      }
      this.buildAngle = (this.buildAngle + Math.PI / 2) % Math.PI;
      TT.audio.click();
    },

    getGhost() {
      if (!this.buildMode) return null;
      let wx, wy;
      if (this.isTouch) {
        wx = this.player.x + Math.cos(this.player.aimAngle) * 105;
        wy = this.player.y + Math.sin(this.player.aimAngle) * 105;
      } else {
        const w = this.screenToWorld(this.input.mouse.x, this.input.mouse.y);
        wx = w.x; wy = w.y;
      }
      return this.getGhostAt(wx, wy);
    },

    getGhostAt(x, y) {
      const def = TT.BUILD[this.buildType];
      if (!def) return null;
      const angle = def.rotatable ? this.buildAngle : 0;
      const swap = angle > 0.1 && angle < Math.PI - 0.1;
      const w = swap ? def.h : def.w;
      const h = swap ? def.w : def.h;
      const gx = U.clamp(x, 40, this.world.size - 40);
      const gy = U.clamp(y, 40, this.world.size - 40);
      let valid = true;
      let reason = 'ĐẶT ĐƯỢC';

      if (!this.canAfford(def.cost)) { valid = false; reason = 'THIẾU VẬT TƯ'; }
      if (U.dist(this.player.x, this.player.y, gx, gy) > 330) { valid = false; reason = 'QUÁ XA'; }

      const rect = { x: gx - w / 2, y: gy - h / 2, w, h };
      if (valid) {
        for (const o of this.world.obstacles) {
          if (!o.solid) continue;
          if (rect.x < o.x + o.w + 4 && rect.x + rect.w + 4 > o.x &&
              rect.y < o.y + o.h + 4 && rect.y + rect.h + 4 > o.y) {
            valid = false; reason = 'VƯỚNG CHƯỚNG NGẠI VẬT'; break;
          }
        }
      }
      if (valid) {
        for (const st of this.structures) {
          if (st.dead) continue;
          if (rect.x < st.x + st.w / 2 + 5 && rect.x + rect.w + 5 > st.x - st.w / 2 &&
              rect.y < st.y + st.h / 2 + 5 && rect.y + rect.h + 5 > st.y - st.h / 2) {
            valid = false; reason = 'ĐÃ CÓ CÔNG TRÌNH'; break;
          }
        }
      }
      if (valid) {
        const cmd = this.world.base.command;
        if (U.dist(gx, gy, cmd.x, cmd.y) < 62) { valid = false; reason = 'QUÁ GẦN BÀN CHỈ HUY'; }
      }
      if (valid) {
        const fire = this.world.base.fire;
        if (U.dist(gx, gy, fire.x, fire.y) < 58) { valid = false; reason = 'QUÁ GẦN LỬA TRẠI'; }
      }

      return { x: gx, y: gy, w, h, angle, def, valid, reason };
    },

    placeBuildAt(x, y) {
      if (this.state !== 'playing' || !this.buildMode) return;
      const g = this.getGhostAt(x, y);
      if (!g) return;
      if (!g.valid) {
        this.toast(g.reason, 'bad', '▦');
        TT.audio.error();
        return;
      }
      if (!this.pay(g.def.cost)) {
        this.toast('KHÔNG ĐỦ VẬT TƯ', 'bad', '⚙');
        TT.audio.error();
        return;
      }

      const st = new TT.Structure(this, g.def.id, g.x, g.y, g.angle, 1);
      this.structures.push(st);
      this.stats.builds++;
      if (g.def.id === 'turret') this.stats.turrets++;

      TT.audio.build();
      this.shake(2.5, 0.18);
      for (let i = 0; i < 18; i++) {
        this.addParticle({
          x: g.x + U.rand(-g.w / 2, g.w / 2), y: g.y + U.rand(-g.h / 2, g.h / 2),
          vx: U.rand(-50, 50), vy: U.rand(-55, -10), life: U.rand(0.3, 0.8),
          size: U.rand(1.2, 3), color: i % 3 === 0 ? '#d8c08a' : '#77694c', drag: 0.9,
        });
      }
      this.toast(`ĐÃ XÂY ${g.def.name}`, 'good', '▦');
      this.ui.refreshBuildBar();
      this.ui.update(0, true);
      this.checkQuests();
    },

    /* ============================================================
       CĂN CỨ / NÂNG CẤP / CHIÊU MỘ
       ============================================================ */
    baseUpgradeCost() {
      return {
        scrap: 90 + this.baseLevel * 70,
        parts: this.baseLevel,
      };
    },

    upgradeBase() {
      if (this.baseLevel >= 5) {
        this.toast('CĂN CỨ ĐÃ ĐẠT CẤP TỐI ĐA', 'info', '⌂');
        return;
      }
      const cost = this.baseUpgradeCost();
      if (!this.canAfford(cost)) {
        this.toast('KHÔNG ĐỦ VẬT TƯ NÂNG CẤP CĂN CỨ', 'bad', '⚙');
        TT.audio.error();
        return;
      }
      this.pay(cost);
      this.baseLevel++;
      this.showBanner('CĂN CỨ NÂNG CẤP', `TRẠM 07 · CẤP ${this.baseLevel}`, 'Tháp súng mạnh hơn · Biên chế tăng · Tiếp tế tốt hơn', 3.2);
      this.toast(`CĂN CỨ ĐÃ LÊN CẤP ${this.baseLevel}`, 'good', '⌂');
      TT.audio.levelup();
      for (const s of this.soldiers) {
        s.maxHp += 18;
        s.hp = Math.min(s.maxHp, s.hp + 18);
        s.damage = 13 + this.baseLevel * 1.5;
      }
      this.ui.renderPanel('command');
      this.ui.update(0, true);
    },

    upgradeWeapon(id) {
      const w = this.player.weapons.find(x => x.id === id);
      if (!w || !w.owned) return;
      if (w.level >= 5) {
        this.toast('VŨ KHÍ ĐÃ ĐẠT CẤP TỐI ĐA', 'info', '✦');
        return;
      }
      const cost = TT.WEAPON_UPGRADE_COST(w);
      if (!this.canAfford(cost)) {
        this.toast('KHÔNG ĐỦ VẬT TƯ NÂNG CẤP VŨ KHÍ', 'bad', '⚙');
        TT.audio.error();
        return;
      }
      this.pay(cost);
      w.level++;
      this.stats.upgrades++;
      this.toast(`${w.name} ĐÃ LÊN CẤP ${w.level}`, 'good', '✦');
      TT.audio.levelup();
      this.ui.refreshWeapons();
      this.ui.renderPanel('weapons');
      this.ui.update(0, true);
      this.checkQuests();
    },

    recruitSoldier() {
      const maxSoldiers = 2 + this.baseLevel;
      const alive = this.soldiers.filter(s => !s.dead).length;
      if (alive >= maxSoldiers) {
        this.toast('ĐÃ ĐẠT BIÊN CHẾ TỐI ĐA', 'bad', '▸');
        return;
      }
      const cost = { scrap: 45, food: 10, parts: 1 };
      if (!this.canAfford(cost)) {
        this.toast('KHÔNG ĐỦ VẬT TƯ ĐỂ CHIÊU MỘ', 'bad', '⚙');
        TT.audio.error();
        return;
      }
      this.pay(cost);
      const name = U.choice(TT.SOLDIER_NAMES);
      const b = this.world.base;
      const angle = U.rand(0, U.TAU);
      const s = new TT.Soldier(this, b.x + Math.cos(angle) * 120, b.y + Math.sin(angle) * 150, name, alive);
      this.soldiers.push(s);
      this.stats.soldiers++;
      this.toast(`ĐỒNG ĐỘI ${name} ĐÃ GIA NHẬP`, 'good', '▸');
      TT.audio.levelup();
      for (let i = 0; i < 18; i++) {
        this.addParticle({
          x: s.x, y: s.y, vx: U.rand(-40, 40), vy: U.rand(-70, -20),
          life: U.rand(0.4, 1), size: U.rand(1.4, 3), color: '#b7e6a0', glow: true,
        });
      }
      this.ui.renderPanel('recruit');
      this.ui.update(0, true);
      this.checkQuests();
    },

    buySupply(id) {
      const offers = {
        ammo9: { cost: { scrap: 12 }, apply: () => { this.ammo['9mm'] += 24; }, label: '24 ĐẠN 9MM' },
        shell: { cost: { scrap: 18 }, apply: () => { this.ammo.shell += 8; }, label: '8 ĐẠN GHÉM', need: 'shotgun' },
        ammo556: { cost: { scrap: 24 }, apply: () => { this.ammo['556'] += 30; }, label: '30 ĐẠN 5.56', need: 'rifle' },
        wood: { cost: { scrap: 15 }, apply: () => { this.resources.wood += 20; }, label: '20 GỖ' },
        medkit: { cost: { scrap: 18, food: 4 }, apply: () => { this.resources.medkit += 1; }, label: '1 BỘ Y TẾ' },
        parts: { cost: { scrap: 35, food: 2 }, apply: () => { this.resources.parts += 1; }, label: '1 LINH KIỆN' },
      };
      const offer = offers[id];
      if (!offer) return;
      if (offer.need) {
        const w = this.player.weapons.find(x => x.id === offer.need && x.owned);
        if (!w) {
          this.toast('VŨ KHÍ TƯƠNG ỨNG CHƯA ĐƯỢC MỞ KHÓA', 'bad', '✦');
          TT.audio.error();
          return;
        }
      }
      if (!this.canAfford(offer.cost)) {
        this.toast('KHÔNG ĐỦ PHẾ LIỆU', 'bad', '⚙');
        TT.audio.error();
        return;
      }
      this.pay(offer.cost);
      offer.apply();
      this.toast(`ĐÃ MUA ${offer.label}`, 'good', '◆');
      TT.audio.pickup(true);
      this.ui.renderPanel('supply');
      this.ui.update(0, true);
    },
  });
})();
