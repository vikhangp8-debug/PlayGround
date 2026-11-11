/* ============================================================
   ui.js — HUD, bảng điều khiển, sổ tay, điều hướng giao diện
   ============================================================ */
(function () {
  'use strict';
  const U = TT.U;
  const $ = (id) => document.getElementById(id);

  const RES_LABEL = { scrap: 'phế liệu', wood: 'gỗ', food: 'lương thực', parts: 'linh kiện', medkit: 'bộ y tế' };
  const AMMO_LABEL = { ammo9: 'đạn 9mm', shell: 'đạn ghém', ammo556: 'đạn 5.56' };

  class UI {
    constructor(game) {
      this.game = game;
      this.el = {
        menu: $('menu'), hud: $('hud'), mobile: $('mobileControls'), panel: $('panel'),
        pause: $('pauseScreen'), death: $('deathScreen'), guide: $('guideScreen'),
        buildBar: $('buildBar'), buildItems: $('buildItems'),
        hpFill: $('hpFill'), hpText: $('hpText'), stamFill: $('stamFill'), xpFill: $('xpFill'),
        xpText: $('xpText'), levelChip: $('levelChip'), hpStatus: $('hpStatus'),
        clock: $('clockText'), day: $('dayText'), phase: $('phaseText'), threat: $('threatText'),
        timeIcon: $('timeIcon'), cycleFill: $('cycleFill'),
        wavePanel: $('wavePanel'), waveNumber: $('waveNumber'), waveFill: $('waveFill'), waveInfo: $('waveInfo'),
        resScrap: $('resScrap'), resWood: $('resWood'), resFood: $('resFood'), resParts: $('resParts'),
        minimap: $('minimap'), mapCoords: $('mapCoords'), questList: $('questList'), questCount: $('questCount'),
        weaponDock: $('weaponDock'), prompt: $('interactPrompt'), promptText: $('interactText'),
        toasts: $('toasts'), banner: $('banner'), crosshair: $('crosshair'), damageFlash: $('damageFlash'),
        lowHealth: $('lowHealth'), statusTags: $('statusTags'),
        panelKicker: $('panelKicker'), panelTitle: $('panelTitle'), panelRes: $('panelRes'),
        panelTabs: $('panelTabs'), panelBody: $('panelBody'), panelFoot: $('panelFoot'),
        pauseStats: $('pauseStats'), deathStats: $('deathStats'), deathEpitaph: $('deathEpitaph'),
        dashCd: $('dashCd'), keyHints: $('keyHints'), guide: $('guideScreen'),
      };
      this.weaponEls = [];
      this.questSignature = '';
      this.lastRes = {};
      this.lastPrompt = '';
      this.cache = {};
      this.bannerTimer = null;
      this.minimapTimer = 0;
      this.flashTimer = null;
      this.bind();
      this.buildWeaponDock();
    }

    bind() {
      const g = this.game;
      // menu
      $('btnStart').addEventListener('click', () => { TT.audio.init(); g.startGame(); });
      $('btnGuide').addEventListener('click', () => g.openGuide());
      $('guideClose').addEventListener('click', () => g.closeGuide());
      $('guideDone').addEventListener('click', () => g.closeGuide());
      $('pauseBtn').addEventListener('click', () => g.pause());
      $('btnResume').addEventListener('click', () => g.resume());
      $('btnPauseGuide').addEventListener('click', () => g.openGuide());
      $('btnQuit').addEventListener('click', () => g.quitToMenu());
      $('btnRetry').addEventListener('click', () => g.startGame());
      $('btnDeathMenu').addEventListener('click', () => g.quitToMenu());
      $('panelClose').addEventListener('click', () => g.closePanel());
      $('buildClose').addEventListener('click', () => g.toggleBuild(false));

      // HUD abilities
      $('abilityDash').addEventListener('click', () => g.tryDash());
      $('abilityReload').addEventListener('click', () => g.player && g.player.startReload());
      $('abilityBuild').addEventListener('click', () => g.toggleBuild());
      $('abilityHub').addEventListener('click', () => g.openHub());
      const healBtn = $('abilityHeal');
      if (healBtn) healBtn.addEventListener('click', () => g.useMedkit());

      // build bar
      this.el.buildItems.addEventListener('click', (e) => {
        const item = e.target.closest('[data-build]');
        if (!item) return;
        g.selectBuild(item.dataset.build);
      });
      // panel actions
      this.el.panelBody.addEventListener('click', (e) => {
        const tab = e.target.closest('[data-tab]');
        if (tab) { g.openPanel('hub', tab.dataset.tab); return; }
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        if (action === 'upgrade-weapon') g.upgradeWeapon(btn.dataset.id);
        else if (action === 'upgrade-base') g.upgradeBase();
        else if (action === 'recruit') g.recruitSoldier();
        else if (action === 'buy') g.buySupply(btn.dataset.id);
        else if (action === 'build') { g.closePanel(); g.toggleBuild(true); }
        else if (action === 'close') g.closePanel();
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      });
      this.el.panelTabs.addEventListener('click', (e) => {
        const tab = e.target.closest('[data-tab]');
        if (tab) g.openPanel('hub', tab.dataset.tab);
      });

      // weapon dock (event delegation)
      this.el.weaponDock.addEventListener('click', (e) => {
        const slot = e.target.closest('[data-slot]');
        if (slot && g.player) g.player.switchWeapon(Number(slot.dataset.slot));
      });
    }

    /* ---------------- weapon dock ---------------- */
    buildWeaponDock() {
      if (!this.game.player) return;
      this.el.weaponDock.innerHTML = '';
      this.weaponEls = [];
      this.game.player.weapons.forEach((w, i) => {
        const b = document.createElement('button');
        b.className = 'weapon-slot';
        b.dataset.slot = i;
        b.innerHTML = `<span class="wkey">${w.slot}</span><span class="wname">${w.name}</span><span class="wammo"></span><span class="wlvl"></span>`;
        this.el.weaponDock.appendChild(b);
        this.weaponEls.push(b);
      });
      this.refreshWeapons();
    }

    refreshWeapons() {
      const p = this.game.player;
      if (!p) return;
      p.weapons.forEach((w, i) => {
        const el = this.weaponEls[i];
        if (!el) return;
        el.classList.toggle('active', p.current === i);
        el.classList.toggle('empty', !w.owned);
        el.querySelector('.wname').textContent = w.owned ? w.name : '???';
        const ammoEl = el.querySelector('.wammo');
        if (!w.owned) ammoEl.textContent = 'CHƯA MỞ KHÓA';
        else if (w.type === 'melee') ammoEl.textContent = 'CẬN CHIẾN';
        else ammoEl.textContent = `${w.mag} / ${this.game.ammo[w.ammoType]}`;
        el.querySelector('.wlvl').textContent = w.owned ? (w.level > 1 ? 'L' + w.level : '') : '🔒';
      });
      const mobWeapon = document.getElementById('mobWeapon');
      if (mobWeapon) mobWeapon.textContent = p.weapon ? p.weapon.short : 'ĐỔI SÚNG';
    }

    /* ---------------- HUD ---------------- */
    showHud() {
      this.el.hud.classList.remove('hidden');
      if (this.game.isTouch) this.el.mobile.classList.remove('hidden');
      this.el.crosshair.classList.toggle('visible', !this.game.isTouch);
    }
    hideHud() {
      this.el.hud.classList.add('hidden');
      this.el.mobile.classList.add('hidden');
      this.el.crosshair.classList.remove('visible');
    }

    update(dt, force = false) {
      const g = this.game;
      const p = g.player;
      if (!p) return;
      this.cache.t = (this.cache.t || 0) + dt;
      this.minimapTimer -= dt;
      if (this.minimapTimer <= 0) {
        this.minimapTimer = 0.18;
        g.world.drawMinimap(this.el.minimap.getContext('2d'), g);
        this.el.mapCoords.textContent = `${Math.round(p.x)} : ${Math.round(p.y)}`;
      }
      if (!force && this.cache.t < 0.1) return;
      this.cache.t = 0;

      const hpPct = U.clamp(p.hp / p.maxHp, 0, 1) * 100;
      this.el.hpFill.style.width = hpPct + '%';
      this.el.hpText.textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
      this.el.stamFill.style.width = U.clamp(p.stamina / p.maxStamina, 0, 1) * 100 + '%';
      this.el.xpFill.style.width = U.clamp(p.xp / p.xpNext, 0, 1) * 100 + '%';
      this.el.xpText.textContent = `${Math.floor(p.xp)} / ${p.xpNext} XP`;
      this.el.levelChip.textContent = p.level;
      const status = p.hp / p.maxHp;
      this.el.hpStatus.textContent = status > 0.65 ? 'ỔN ĐỊNH' : status > 0.3 ? 'BỊ THƯƠNG' : 'NGUY KỊCH';
      this.el.hpStatus.className = status > 0.65 ? '' : status > 0.3 ? 'wounded' : 'critical';
      this.el.lowHealth.style.opacity = status < 0.3 ? '1' : '0';

      // đồng hồ / chu kỳ
      const hour = g.hour();
      const hh = Math.floor(hour);
      const mm = Math.floor((hour - hh) * 60);
      this.el.clock.textContent = `${U.pad2(hh)}:${U.pad2(Math.floor(mm / 1) * 1)}`;
      this.el.day.textContent = `NGÀY ${g.day}`;
      const phase = g.phaseInfo();
      this.el.phase.textContent = phase.name;
      this.el.threat.textContent = phase.threat;
      this.el.threat.style.color = phase.color;
      this.el.timeIcon.textContent = phase.icon;
      this.el.timeIcon.style.color = phase.color;
      this.el.timeIcon.style.borderColor = phase.color + '55';
      this.el.cycleFill.style.width = (hour / 24) * 100 + '%';

      // đợt sóng
      if (g.nightActive) {
        this.el.wavePanel.classList.remove('hidden');
        this.el.waveNumber.textContent = String(Math.max(1, g.waveNumber));
        const alive = g.enemies.filter(e => e.waveEnemy && !e.dead).length;
        const queue = Math.max(0, g.waveTotal - g.waveSpawned);
        const total = Math.max(1, g.waveTotal);
        this.el.waveFill.style.width = (g.waveCleared ? 100 : U.clamp(alive / total, 0, 1) * 100) + '%';
        if (g.waveCleared) this.el.waveInfo.textContent = 'ĐỢT ĐÃ BỊ ĐẨY LÙI · CỐ THỦ ĐẾN BÌNH MINH';
        else if (!g.waveActive) this.el.waveInfo.textContent = `ĐỢT TIẾP THEO: ${Math.ceil(g.waveTimer)} GIÂY · HÃY CỐ THỦ`;
        else if (queue > 0) this.el.waveInfo.textContent = `ĐANG TRIỂN KHAI · CÒN ${alive + queue} DỊ BIẾN`;
        else this.el.waveInfo.textContent = `CÒN ${alive} DỊ BIẾN · ĐẨY LÙI CHÚNG`;
      } else {
        this.el.wavePanel.classList.add('hidden');
      }

      // tài nguyên
      const res = g.resources;
      this.setRes('resScrap', res.scrap);
      this.setRes('resWood', res.wood);
      this.setRes('resFood', res.food);
      this.setRes('resParts', res.parts);

      // nhiệm vụ
      this.updateQuests();

      // vũ khí
      this.refreshWeapons();

      // hồi máu
      const heal = $('abilityHeal');
      if (heal) {
        const small = heal.querySelector('small');
        if (small) small.textContent = `MÁU x${res.medkit}`;
      }

      // hồi chiêu lướt
      const dashPct = g.player.dashCd > 0 ? (1 - g.player.dashCd / 2.2) * 100 : 100;
      this.el.dashCd.style.width = U.clamp(dashPct, 0, 100) + '%';

      // trạng thái
      const tags = [];
      if (g.nightActive) tags.push('BAN ĐÊM · NGUY HIỂM');
      if (p.reloadTimer > 0) tags.push('ĐANG NẠP ĐẠN');
      if (p.dashCd > 0 && p.dashCd < 0.3) tags.push('LƯỚT HỒI');
      this.el.statusTags.innerHTML = tags.map(t => `<span class="status-tag">${t}</span>`).join('');

      // thông báo tương tác
      const target = g.getInteractTarget();
      if (target && !g.buildMode && g.state === 'playing') {
        if (target.label !== this.lastPrompt) {
          this.el.promptText.textContent = target.label;
          const key = this.el.prompt.querySelector('kbd');
          if (key) key.textContent = g.isTouch ? '✦' : 'E';
          this.lastPrompt = target.label;
        }
        this.el.prompt.classList.remove('hidden');
      } else {
        this.el.prompt.classList.add('hidden');
        this.lastPrompt = '';
      }
      this.updateCrosshair();
    }

    updateCrosshair() {
      const g = this.game;
      if (g.isTouch || g.state !== 'playing') {
        this.el.crosshair.classList.remove('visible');
        return;
      }
      this.el.crosshair.classList.add('visible');
      this.el.crosshair.style.left = g.input.mouse.x + 'px';
      this.el.crosshair.style.top = g.input.mouse.y + 'px';
      const w = g.player.weapon;
      const spread = w.type === 'gun' ? 5 + w.spread * 80 : 2;
      this.el.crosshair.style.transform = `translate(-50%, -50%) scale(${1 + spread / 30})`;
    }

    setRes(id, value) {
      const el = this.el[id];
      if (!el) return;
      const key = id;
      if (this.lastRes[key] !== value) {
        el.textContent = U.fmt(value);
        if (this.lastRes[key] !== undefined) {
          el.parentElement.classList.remove('flash');
          void el.parentElement.offsetWidth;
          el.parentElement.classList.add('flash');
        }
        this.lastRes[key] = value;
      }
    }

    updateQuests() {
      const qs = this.game.activeQuests;
      const sig = qs.map(q => `${q.title}:${q.progress}/${q.target}`).join('|');
      this.el.questCount.textContent = `${qs.filter(q => q.progress >= q.target).length}/${qs.length}`;
      if (sig === this.questSignature) return;
      this.questSignature = sig;
      this.el.questList.innerHTML = qs.map(q => {
        const done = q.progress >= q.target;
        const pct = U.clamp(q.progress / q.target, 0, 1) * 100;
        return `<div class="quest-item ${done ? 'done' : ''}">
          <div class="quest-title-row"><span>${q.title}</span><b>${Math.min(q.target, Math.floor(q.progress))}/${q.target}</b></div>
          <div class="quest-progress"><i style="width:${pct}%"></i></div>
        </div>`;
      }).join('');
    }

    toast(text, type = 'info', icon = '◆') {
      const el = document.createElement('div');
      el.className = 'toast ' + (type === 'good' ? 'good' : type === 'bad' ? 'bad' : '');
      el.innerHTML = `<span class="tico">${icon}</span><span>${text}</span>`;
      this.el.toasts.prepend(el);
      while (this.el.toasts.children.length > 4) this.el.toasts.lastChild.remove();
      setTimeout(() => {
        el.classList.add('out');
        setTimeout(() => el.remove(), 360);
      }, 3200);
    }

    banner(kicker, title, sub, duration = 3.2) {
      const b = this.el.banner;
      b.innerHTML = `<small>${kicker}</small><strong>${title}</strong><em>${sub || ''}</em>`;
      b.classList.remove('hidden');
      b.style.animation = 'none';
      void b.offsetWidth;
      b.style.animation = 'bannerIn 0.5s ease-out';
      clearTimeout(this.bannerTimer);
      this.bannerTimer = setTimeout(() => b.classList.add('hidden'), duration * 1000);
    }

    flashDamage() {
      this.el.damageFlash.style.opacity = '1';
      clearTimeout(this.flashTimer);
      this.flashTimer = setTimeout(() => { this.el.damageFlash.style.opacity = '0'; }, 130);
    }

    /* ---------------- BUILD BAR ---------------- */
    refreshBuildBar() {
      const g = this.game;
      this.el.buildItems.innerHTML = Object.values(TT.BUILD).map(def => {
        const active = g.buildType === def.id;
        const afford = g.canAfford(def.cost);
        const costs = Object.entries(def.cost).map(([k, v]) => {
          const lack = g.resources[k] < v;
          return `<span class="${lack ? 'lack' : ''}">${def.id ? '' : ''}${v} ${RES_LABEL[k]}</span>`;
        }).join('');
        return `<button class="build-item ${active ? 'active' : ''} ${afford ? '' : 'disabled'}" data-build="${def.id}">
          <div class="bi-top"><strong>${def.name}</strong><span class="bi-key">${def.key}</span></div>
          <small>${def.desc}</small>
          <div class="build-cost">${costs}</div>
        </button>`;
      }).join('');
    }

    /* ---------------- PANEL ---------------- */
    openPanel(tabId = 'command') {
      this.el.panel.classList.remove('hidden');
      this.renderPanel(tabId);
    }
    closePanel() {
      this.el.panel.classList.add('hidden');
    }

    renderPanel(tabId) {
      const g = this.game;
      this.el.panelKicker.textContent = 'TRUNG TÂM CHỈ HUY · TRẠM 07';
      this.el.panelTitle.textContent = 'CĂN CỨ TRẠM 07';
      this.el.panelFoot.textContent = `Trạm 07 · Ngày ${g.day} · ${g.nightActive ? 'Ban đêm' : 'Ban ngày'} · Cấp căn cứ ${g.baseLevel}`;
      const escHint = document.querySelector('#panel .esc-hint');
      if (escHint) escHint.innerHTML = g.isTouch ? '<kbd>✕</kbd> ĐÓNG' : '<kbd>ESC</kbd> ĐÓNG';
      const tabs = [
        ['command', 'CHỈ HUY'], ['weapons', 'VŨ KHÍ'], ['recruit', 'CHIÊU MỘ'],
        ['supply', 'TIẾP TẾ'], ['quests', 'NHIỆM VỤ'],
      ];
      this.el.panelTabs.innerHTML = tabs.map(([id, name]) =>
        `<button class="panel-tab ${id === tabId ? 'active' : ''}" data-tab="${id}">${name}</button>`).join('');
      const r = g.resources;
      this.el.panelRes.innerHTML = `
        <div><span>PHẾ LIỆU</span><b>${U.fmt(r.scrap)}</b></div>
        <div><span>GỖ</span><b>${U.fmt(r.wood)}</b></div>
        <div><span>LƯƠNG</span><b>${U.fmt(r.food)}</b></div>
        <div><span>LINH KIỆN</span><b>${U.fmt(r.parts)}</b></div>`;

      if (tabId === 'weapons') this.el.panelBody.innerHTML = this.weaponsTab();
      else if (tabId === 'recruit') this.el.panelBody.innerHTML = this.recruitTab();
      else if (tabId === 'supply') this.el.panelBody.innerHTML = this.supplyTab();
      else if (tabId === 'quests') this.el.panelBody.innerHTML = this.questsTab();
      else this.el.panelBody.innerHTML = this.commandTab();
    }

    commandTab() {
      const g = this.game;
      const maxed = g.baseLevel >= 5;
      const cost = g.baseUpgradeCost();
      const can = g.canAfford(cost);
      const aliveSoldiers = g.soldiers.filter(s => !s.dead).length;
      return `<div class="hub-grid">
        <div class="hub-card wide">
          <h3><span class="num">HẠ TẦNG</span> NÂNG CẤP CĂN CỨ — CẤP ${g.baseLevel}/5</h3>
          <p>Tăng hiệu suất tháp súng, mở rộng biên chế và cải thiện tiếp tế mỗi ngày. Căn cứ mạnh hơn giúp bạn trụ vững qua các đêm.</p>
          <div class="hub-stat-row">
            <div class="hub-stat">SÁT THƯƠNG THÁP<b>+${(g.baseLevel - 1) * 12}%</b></div>
            <div class="hub-stat">BIÊN CHẾ TỐI ĐA<b>${2 + g.baseLevel} lính</b></div>
            <div class="hub-stat">ĐỢT ĐÃ SỐNG SÓT<b>${g.stats.nights}</b></div>
            <div class="hub-stat">CÔNG TRÌNH<b>${g.structures.filter(s => !s.dead).length}</b></div>
          </div>
          <div class="upgrade-base" style="margin-top:14px;padding:11px">
            <div><h3>${maxed ? 'CĂN CỨ ĐÃ ĐẠT CẤP TỐI ĐA' : 'NÂNG CẤP LÊN CẤP ' + (g.baseLevel + 1)}</h3>
            <p>${maxed ? 'Trạm 07 đã trở thành pháo đài thực sự.' : `Chi phí: ${cost.scrap} phế liệu · ${cost.parts} linh kiện`}</p></div>
            <button class="btn btn-primary" data-action="upgrade-base" ${maxed || !can ? 'disabled' : ''}>${maxed ? 'TỐI ĐA' : 'NÂNG CẤP'}</button>
          </div>
        </div>
        <div class="hub-card">
          <h3><span class="num">01</span> TÌNH HÌNH CHIẾN SỰ</h3>
          <div class="hub-stat-row">
            <div class="hub-stat">HẠ GỤC<b>${g.stats.kills}</b></div>
            <div class="hub-stat">VẬT TƯ ĐÃ MỞ<b>${g.stats.loots}</b></div>
            <div class="hub-stat">ĐÊM SỐNG SÓT<b>${g.stats.nights}</b></div>
          </div>
          <p style="margin-top:12px">Đồng đội đang trực chiến: <b style="color:#a7e05b">${aliveSoldiers}</b> / ${2 + g.baseLevel}</p>
        </div>
        <div class="hub-card">
          <h3><span class="num">02</span> LỢI ÍCH CĂN CỨ</h3>
          <p>• Tháp súng mạnh hơn theo cấp căn cứ.<br>• Chiêu mộ thêm lính bảo vệ.<br>• Tiếp tế giá tốt hơn mỗi ngày.<br>• Mở khóa thêm công trình phòng thủ.</p>
        </div>
        <div class="hub-card wide">
          <h3><span class="num">03</span> HÀNH ĐỘNG NHANH</h3>
          <div class="hub-stat-row" style="align-items:center">
            <button class="btn btn-ghost" data-action="build">▦ MỞ XÂY DỰNG</button>
            <button class="btn btn-ghost" data-action="tab" data-tab="weapons" style="display:none"></button>
            <span style="font-size:8px;color:#818a74;line-height:1.7">Tương tác với tường hoặc tháp súng để sửa chữa và nâng cấp.<br>
            Nhấn <kbd>B</kbd> để xây nhanh ngoài chiến trường. Nhấn <kbd>ESC</kbd> để đóng.</span>
          </div>
        </div>
      </div>`;
    }

    weaponsTab() {
      const g = this.game;
      const rows = g.player.weapons.map(w => {
        const cost = TT.WEAPON_UPGRADE_COST(w);
        const can = g.canAfford(cost) && w.owned && w.level < 5;
        const dmg = w.type === 'melee'
          ? w.damage * (1 + 0.2 * (w.level - 1))
          : w.damage * (1 + 0.2 * (w.level - 1)) * (w.pellets || 1);
        const reload = w.type === 'gun' ? (w.reloadTime * (1 - 0.06 * (w.level - 1))).toFixed(2) + 's' : '—';
        return `<div class="upgrade-row ${w.owned ? '' : 'locked-row'}">
          <div class="upgrade-icon">${w.icon}</div>
          <div class="upgrade-main">
            <h4>${w.name} ${w.owned ? '' : '· CHƯA MỞ KHÓA'}</h4>
            <div class="upgrade-stats">
              <span>SÁT THƯƠNG <b>${Math.round(dmg)}${w.pellets > 1 ? ' / phát' : ''}</b></span>
              <span>TỐC ĐỘ <b>${(1 / w.rate).toFixed(1)}/s</b></span>
              ${w.type === 'gun' ? `<span>BĂNG ĐẠN <b>${w.magSize}</b></span><span>NẠP <b>${reload}</b></span>` : '<span>TẦM <b>66</b></span>'}
            </div>
            <div class="pips">${[1, 2, 3, 4, 5].map(i => `<i class="pip ${i <= w.level ? 'on' : ''}"></i>`).join('')}</div>
            ${w.owned ? `<div class="upgrade-cost">${w.level >= 5 ? 'ĐÃ ĐẠT CẤP TỐI ĐA' : `NÂNG CẤP: <span class="${g.resources.scrap < cost.scrap ? 'lack' : ''}">${cost.scrap} phế liệu</span>${cost.parts ? ` · <span class="${g.resources.parts < cost.parts ? 'lack' : ''}">${cost.parts} linh kiện</span>` : ''}`}</div>` : '<div class="upgrade-cost">TÌM KHO VŨ KHÍ MÀU CAM TRONG VÙNG ĐỔ NÁT</div>'}
          </div>
          ${w.owned ? `<div class="upgrade-action"><button class="btn ${can ? 'btn-primary' : 'btn-ghost'}" data-action="upgrade-weapon" data-id="${w.id}" ${!can ? 'disabled' : ''}>${w.level >= 5 ? 'TỐI ĐA' : 'NÂNG CẤP'}</button></div>` : '<div class="upgrade-action"><span style="font-size:8px;color:#6f7863">KHÓA</span></div>'}
        </div>`;
      }).join('');
      return `<div class="weapon-upgrade-list">${rows}</div>
        <div class="empty-note" style="margin-top:12px;text-align:left">Mỗi cấp tăng 20% sát thương và giảm 6% thời gian nạp. Đạn được mua tại tab TIẾP TẾ hoặc nhặt trong đổ nát.</div>`;
    }

    recruitTab() {
      const g = this.game;
      const maxSoldiers = 2 + g.baseLevel;
      const alive = g.soldiers.filter(s => !s.dead);
      const cost = { scrap: 45, food: 10, parts: 1 };
      const can = g.canAfford(cost) && alive.length < maxSoldiers;
      const rows = alive.length ? alive.map(s => `<div class="soldier-row"><span>▸</span><span>${s.name}</span><span style="color:#758066">LÍNH SÚNG TRƯỜNG</span><span class="s-hp">${Math.ceil(s.hp)} / ${s.maxHp} HP</span></div>`).join('')
        : '<div class="empty-note">Chưa có đồng đội nào. Hãy chiêu mộ người đầu tiên.</div>';
      return `<div class="recruit-grid">
        <div class="recruit-card">
          <h3>CHIÊU MỘ LÍNH GÁC</h3>
          <p>Lính sẽ đi theo bạn khi ở gần căn cứ và tự động khai hỏa vào dị biến. Họ có thể hy sinh — hãy bảo vệ họ.</p>
          <div class="hub-stat-row">
            <div class="hub-stat">BIÊN CHẾ<b>${alive.length} / ${maxSoldiers}</b></div>
            <div class="hub-stat">SÁT THƯƠNG<b>${Math.round(13 + g.baseLevel * 1.5)}</b></div>
          </div>
          <button class="btn btn-primary" data-action="recruit" style="margin-top:12px;width:100%" ${can ? '' : 'disabled'}>CHIÊU MỘ · 45 PHẾ LIỆU · 10 LƯƠNG · 1 LINH KIỆN</button>
          ${alive.length >= maxSoldiers ? '<p style="margin-top:7px;color:#d9a76b">Đã đạt biên chế tối đa. Nâng cấp căn cứ để tăng giới hạn.</p>' : ''}
        </div>
        <div class="recruit-card">
          <h3>ĐỘI HÌNH HIỆN TẠI</h3>
          <div class="soldier-list">${rows}</div>
        </div>
      </div>`;
    }

    supplyTab() {
      const g = this.game;
      const items = [
        { id: 'ammo9', name: 'ĐẠN 9MM x24', cost: { scrap: 12 }, desc: 'Đạn cho súng lục.' },
        { id: 'shell', name: 'ĐẠN GHÉM x8', cost: { scrap: 18 }, desc: 'Đạn cho súng săn.', need: 'shotgun' },
        { id: 'ammo556', name: 'ĐẠN 5.56 x30', cost: { scrap: 24 }, desc: 'Đạn cho súng trường.', need: 'rifle' },
        { id: 'wood', name: 'GỖ x20', cost: { scrap: 15 }, desc: 'Vật liệu xây dựng.' },
        { id: 'medkit', name: 'BỘ Y TẾ x1', cost: { scrap: 18, food: 4 }, desc: 'Hồi 45 máu khi dùng.' },
        { id: 'parts', name: 'LINH KIỆN x1', cost: { scrap: 35, food: 2 }, desc: 'Nâng cấp vũ khí, căn cứ.' },
      ];
      const cards = items.map(it => {
        const locked = it.need && !g.player.weapons.find(w => w.id === it.need && w.owned);
        const costText = Object.entries(it.cost).map(([k, v]) => `${v} ${RES_LABEL[k]}`).join(' · ');
        return `<div class="shop-item">
          <h4>${it.name}</h4>
          <div class="price">${costText}</div>
          <p style="font-size:8px;color:#818a74;margin:0 0 8px">${locked ? 'Cần mở khóa ' + (it.need === 'shotgun' ? 'SÚNG SĂN' : 'SÚNG TRƯỜNG') : it.desc}</p>
          <button class="btn btn-ghost" data-action="buy" data-id="${it.id}" ${locked || !g.canAfford(it.cost) ? 'disabled' : ''}>MUA</button>
        </div>`;
      }).join('');
      return `<div class="shop-grid">${cards}</div>
        <div class="empty-note" style="margin-top:12px;text-align:left">Tiếp tế được bán bởi những người sống sót còn lại. Giá sẽ giảm 5% mỗi cấp căn cứ (tối đa 25%).</div>`;
    }

    questsTab() {
      const g = this.game;
      const cards = g.activeQuests.map(q => {
        const done = q.progress >= q.target;
        const pct = U.clamp(q.progress / q.target, 0, 1) * 100;
        return `<div class="quest-card ${done ? 'done' : ''}">
          <div class="qtag">${done ? 'HOÀN THÀNH' : q.tag}</div>
          <h3>${q.title}</h3>
          <p>${q.desc}</p>
          <div class="quest-bar"><i style="width:${pct}%"></i></div>
          <div class="quest-meta"><span>${Math.min(q.target, Math.floor(q.progress))} / ${q.target}</span><span class="quest-reward">${this.rewardText(q.reward)}</span></div>
        </div>`;
      }).join('');
      return `<div class="quest-board">${cards || '<div class="empty-note">Không còn nhiệm vụ. Hãy tiếp tục sinh tồn.</div>'}</div>
        <div class="empty-note" style="margin-top:12px;text-align:left">Đã hoàn thành: <b style="color:#a7e05b">${g.stats.quests}</b> nhiệm vụ. Phần thưởng được trao tự động khi mục tiêu đạt được.</div>`;
    }

    rewardText(reward) {
      const parts = [];
      if (reward.xp) parts.push(`+${reward.xp} XP`);
      for (const k of ['scrap', 'wood', 'food', 'parts', 'medkit']) {
        if (reward[k]) parts.push(`+${reward[k]} ${RES_LABEL[k]}`);
      }
      for (const k of ['ammo9', 'shell', 'ammo556']) {
        if (reward[k]) parts.push(`+${reward[k]} ${AMMO_LABEL[k]}`);
      }
      return parts.join(' · ');
    }

    /* ---------------- SCREENS ---------------- */
    showMenu() {
      this.el.menu.classList.remove('hidden');
      this.el.pause.classList.add('hidden');
      this.el.death.classList.add('hidden');
      this.el.panel.classList.add('hidden');
      this.el.guide.classList.add('hidden');
      this.el.buildBar.classList.add('hidden');
      this.hideHud();
    }
    showPause() {
      const g = this.game;
      this.el.pause.classList.remove('hidden');
      this.el.pauseStats.innerHTML = `
        <div><span>NGÀY</span><b>${g.day}</b></div>
        <div><span>HẠ GỤC</span><b>${g.stats.kills}</b></div>
        <div><span>ĐÊM SỐNG SÓT</span><b>${g.stats.nights}</b></div>`;
    }
    showDeath() {
      const g = this.game;
      this.el.death.classList.remove('hidden');
      this.el.deathStats.innerHTML = `
        <div><span>NGÀY</span><b>${g.day}</b></div>
        <div><span>HẠ GỤC</span><b>${g.stats.kills}</b></div>
        <div><span>ĐÊM SỐNG SÓT</span><b>${g.stats.nights}</b></div>
        <div><span>CẤP ĐỘ</span><b>${g.player.level}</b></div>`;
      const quotes = [
        '"Không ai chết một mình trong vùng đất chết."',
        '"Trạm 07 vẫn còn đó. Người tiếp theo sẽ tiếp tục."',
        '"Đêm nay, bầy dị biến lại có thêm một bữa ăn."',
        '"Bạn đã chiến đấu đến hơi thở cuối cùng."',
      ];
      this.el.deathEpitaph.textContent = quotes[Math.floor(Math.random() * quotes.length)];
    }
    showGuide() { this.el.guide.classList.remove('hidden'); }
    hideGuide() { this.el.guide.classList.add('hidden'); }
    showBuild() { this.el.buildBar.classList.remove('hidden'); this.refreshBuildBar(); }
    hideBuild() { this.el.buildBar.classList.add('hidden'); }
  }

  TT.UI = UI;
})();
