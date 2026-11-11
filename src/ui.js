import {
  WEAPONS, WEAPON_ORDER, BUILDS, CORE_UPGRADES, MAX_WEAPON_LEVEL,
  weaponStats, upgradeCost, RECRUIT_COST, HEAL_KIT_PRICE, PHASE_LABELS,
} from './data.js';
import { formatClock } from './util.js';

export const SVG = {
  knife: `<svg viewBox="0 0 32 20"><path d="M3 10h9"/><path d="M12 7l12-4 4 2-4 5-8 3z"/><path d="M12 9l-2 5"/></svg>`,
  pistol: `<svg viewBox="0 0 32 20"><path d="M5 7h16l3 3v3H14l-2 5H7l1-5H5z"/><path d="M21 7v-3h4v3"/></svg>`,
  shotgun: `<svg viewBox="0 0 32 20"><path d="M3 10h20l5 1-1 4H8l-5-1z"/><path d="M9 10V6h7v4"/><path d="M14 15v2h5"/></svg>`,
  rifle: `<svg viewBox="0 0 32 20"><path d="M3 9h12l3-3h4l2 3h5v4h-8l-2 3h-5l1-3H8l-5-1z"/><path d="M16 11l-1 6h4l1-6"/></svg>`,
  launcher: `<svg viewBox="0 0 32 20"><path d="M4 6h20v7H4z"/><path d="M24 8h6v3h-6"/><path d="M10 13v5h5l1-5"/></svg>`,
  wall: `<svg viewBox="0 0 24 24"><path d="M3 8h18v12H3zM3 12h18M9 8v4M15 12v4M9 16v4M15 8v4M3 8l3-4h12l3 4"/></svg>`,
  turret: `<svg viewBox="0 0 24 24"><circle cx="11" cy="12" r="5"/><path d="M16 11h7M11 17v4M6 21h10M8 8l-3-3M11 7V3"/><circle cx="11" cy="12" r="1"/></svg>`,
  med: `<svg viewBox="0 0 24 24"><path d="M8 3h8v5h5v8h-5v5H8v-5H3V8h5z"/></svg>`,
  lamp: `<svg viewBox="0 0 24 24"><path d="M12 21V8M7 21h10M8 8h8l2-5H6z"/><path d="M12 8v5"/></svg>`,
  core: `<svg viewBox="0 0 24 24"><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
};

export class UI {
  constructor(game) {
    this.game = game;
    this.$ = (id) => document.getElementById(id);
    this.el = {
      hud: this.$('hud'),
      title: this.$('titleScreen'),
      startBtn: this.$('startBtn'),
      continueBtn: this.$('continueBtn'),
      saveSummary: this.$('saveSummary'),
      clock: this.$('clockLabel'),
      day: this.$('dayLabel'),
      phase: this.$('phaseLabel'),
      phaseFill: this.$('phaseFill'),
      hpFill: this.$('hpFill'),
      hpText: this.$('hpText'),
      staminaFill: this.$('staminaFill'),
      xpFill: this.$('xpFill'),
      xpText: this.$('xpText'),
      level: this.$('levelLabel'),
      medkits: this.$('medkitCount'),
      wood: this.$('woodCount'),
      scrap: this.$('scrapCount'),
      parts: this.$('partsCount'),
      questList: this.$('questList'),
      questFull: this.$('questFullList'),
      questStat: this.$('questStatLine'),
      waveChip: this.$('nightChip'),
      waveLabel: this.$('waveLabel'),
      waveValue: this.$('waveValue'),
      minimap: this.$('minimap'),
      threat: this.$('minimapThreat'),
      bossBar: this.$('bossBar'),
      bossFill: this.$('bossFill'),
      bossText: this.$('bossHpText'),
      prompt: this.$('prompt'),
      promptText: this.$('promptText'),
      promptKey: this.$('prompt').querySelector('kbd'),
      toastLayer: this.$('toastLayer'),
      bannerLayer: this.$('bannerLayer'),
      hotbar: this.$('hotbar'),
      mwName: this.$('mwName'),
      mwAmmo: this.$('mwAmmo'),
      buildMenu: this.$('buildMenu'),
      buildGrid: this.$('buildGrid'),
      baseActions: this.$('baseActions'),
      buildGhostState: this.$('buildGhostState'),
      buildFloat: this.$('buildFloat'),
      buildFloatName: this.$('buildFloatName'),
      buildFloatCost: this.$('buildFloatCost'),
      upgradeMenu: this.$('upgradeMenu'),
      weaponUpgradeList: this.$('weaponUpgradeList'),
      questMenu: this.$('questMenu'),
      pauseMenu: this.$('pauseMenu'),
      helpMenu: this.$('helpMenu'),
      deathScreen: this.$('deathScreen'),
      deathEyebrow: this.$('deathEyebrow'),
      deathTitle: this.$('deathTitle'),
      deathSub: this.$('deathSub'),
      deathStats: this.$('deathStats'),
      deathActions: this.$('deathActions'),
      pauseStats: this.$('pauseStats'),
      soundBtn: this.$('soundBtn'),
      interactBtn: this.$('interactBtn'),
      mobileHealBtn: this.$('mobileHealBtn'),
      toggleSound: this.$('toggleSound'),
      toggleAssist: this.$('toggleAssist'),
      titleControls: this.$('titleControls'),
      buildTip: document.querySelector('.build-tip'),
    };
    this.hotbarSig = '';
    this.lastHud = 0;
    this.lastMinimap = 0;
    this.lastBuildSig = '';
    this.helpPrev = null;
    this.pending = [];
    this.bind();
    this.setTouch(game.input.touch);
    this.syncSettings();
    this.refreshResources(game);
    this.refreshVitals(game);
    this.refreshQuests(game);
  }

  bind() {
    document.addEventListener('click', (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      e.preventDefault();
      e.stopPropagation();
      this.dispatch(target.dataset.action, target);
    });
    if (this.el.toggleSound) {
      this.el.toggleSound.addEventListener('change', () => this.game.setSound(this.el.toggleSound.checked));
    }
    if (this.el.toggleAssist) {
      this.el.toggleAssist.addEventListener('change', () => this.game.setAimAssist(this.el.toggleAssist.checked));
    }
    // Prevent clicks inside menus from reaching the canvas.
    for (const menu of [this.el.buildMenu, this.el.upgradeMenu, this.el.questMenu, this.el.pauseMenu, this.el.helpMenu, this.el.deathScreen]) {
      if (!menu) continue;
      menu.addEventListener('pointerdown', (e) => e.stopPropagation());
    }
  }

  setTouch(touch) {
    document.body.classList.toggle('touch', !!touch);
    if (this.el.titleControls) {
      this.el.titleControls.textContent = touch
        ? 'Cần trái di chuyển · Cần phải ngắm & bắn · Nút XÂY để dựng căn cứ · Chạm MỞ để nhặt đồ'
        : 'WASD di chuyển · Chuột ngắm & bắn · B xây dựng · E nhặt đồ · J nhiệm vụ';
    }
  }

  syncSettings() {
    const s = this.game.settings;
    if (this.el.toggleSound) this.el.toggleSound.checked = !!s.sound;
    if (this.el.toggleAssist) this.el.toggleAssist.checked = !!s.aimAssist;
    if (this.el.soundBtn) this.el.soundBtn.classList.toggle('off', !s.sound);
  }

  dispatch(action, el) {
    const g = this.game;
    switch (action) {
      case 'start-new': g.startNew(); break;
      case 'continue': g.continueRun(); break;
      case 'help': g.openHelp(); break;
      case 'close-help': g.closeHelp(); break;
      case 'pause': g.togglePause(); break;
      case 'resume': g.resume(); break;
      case 'quests': g.openQuests(); break;
      case 'close-menu': g.closeMenu(); break;
      case 'build': g.toggleBuild(); break;
      case 'build-close': g.closeBuild(); break;
      case 'build-place': g.placeBuild(); break;
      case 'build-select': g.selectBuild(el.dataset.build); break;
      case 'recruit': g.recruitSoldier(); break;
      case 'core-upgrade': g.upgradeCore(); break;
      case 'buy-medkit': g.buyMedkit(); break;
      case 'weapon-upgrade': g.upgradeWeapon(el.dataset.weapon); break;
      case 'respawn': g.respawn(); break;
      case 'restart-run': g.restartRun(); break;
      case 'quit-title': g.quitToTitle(); break;
      case 'wipe-save': g.wipeSave(); break;
      case 'sound': g.toggleSound(); this.syncSettings(); break;
      case 'open-upgrade': g.openUpgradeFromPause(); break;
      case 'reload': if (g.player.alive) g.player.reload(g); break;
      case 'heal': if (g.player.alive) g.player.useMedkit(g); break;
      case 'melee': if (g.player.alive && g.canAct()) g.player.quickMelee(g); break;
      case 'interact': g.interact(); break;
      case 'cycle': if (g.player.alive) g.player.cycleWeapon(1, g); break;
      default: break;
    }
  }

  // -------------------------------------------------------------------------
  // Screens
  // -------------------------------------------------------------------------
  showTitle(hasSave, summary) {
    document.body.classList.remove('playing');
    document.body.classList.remove('build-open');
    this.el.hud.classList.add('hidden');
    this.el.title.classList.remove('hidden', 'out');
    this.closeAllMenus();
    this.el.deathScreen.classList.add('hidden');
    if (this.el.continueBtn) this.el.continueBtn.classList.toggle('hidden', !hasSave);
    if (this.el.startBtn) {
      this.el.startBtn.textContent = hasSave ? 'BẮT ĐẦU MỚI' : 'BẮT ĐẦU SINH TỒN';
      this.el.startBtn.classList.toggle('ghost', !!hasSave);
      this.el.startBtn.classList.toggle('primary', !hasSave);
    }
    if (this.el.saveSummary) {
      this.el.saveSummary.classList.toggle('hidden', !hasSave);
      this.el.saveSummary.innerHTML = hasSave ? summary : '';
    }
  }

  hideTitle() {
    this.el.title.classList.add('out');
    setTimeout(() => this.el.title.classList.add('hidden'), 480);
    this.el.hud.classList.remove('hidden');
    document.body.classList.add('playing');
  }

  showDeath(game, cause) {
    const isBase = cause === 'base';
    this.el.deathScreen.classList.remove('hidden');
    this.el.deathEyebrow.textContent = isBase ? 'CĂN CỨ ĐÃ THẤT THỦ' : 'BẠN ĐÃ GỤC NGÃ';
    this.el.deathTitle.textContent = isBase ? 'MÀN ĐÊM NUỐT CHỬNG TẤT CẢ' : 'MÀN ĐÊM NUỐT CHỬNG BẠN';
    this.el.deathSub.textContent = isBase
      ? 'Lõi căn cứ đã bị phá hủy. Không còn nơi nào để quay về — nhưng bạn có thể bắt đầu lại từ tro tàn.'
      : 'Căn cứ vẫn đứng vững. Hãy trở về, băng bó và tiếp tục chiến đấu. Bạn sẽ mất một phần vật liệu mang theo.';
    const s = game.stats;
    this.el.deathStats.innerHTML = `
      <div class="death-stat"><b>${s.kills}</b><span>QUÁI ĐÃ HẠ</span></div>
      <div class="death-stat"><b>${s.nights}</b><span>ĐÊM SỐNG SÓT</span></div>
      <div class="death-stat"><b>${s.looted}</b><span>THÙNG ĐÃ MỞ</span></div>
      <div class="death-stat"><b>${s.built}</b><span>CÔNG TRÌNH</span></div>
      <div class="death-stat"><b>${s.bosses}</b><span>QUÁI CHÚA</span></div>
      <div class="death-stat"><b>${game.player.level || game.level}</b><span>CẤP ĐỘ</span></div>`;
    const respawn = this.el.deathActions.querySelector('[data-action="respawn"]');
    if (respawn) respawn.classList.toggle('hidden', isBase);
  }

  hideDeath() {
    this.el.deathScreen.classList.add('hidden');
  }

  // -------------------------------------------------------------------------
  // Menus
  // -------------------------------------------------------------------------
  closeAllMenus() {
    for (const m of [this.el.buildMenu, this.el.upgradeMenu, this.el.questMenu, this.el.pauseMenu, this.el.helpMenu]) {
      if (m) m.classList.add('hidden');
    }
    document.body.classList.remove('build-open');
  }

  openBuild(game) {
    this.el.buildMenu.classList.remove('hidden');
    document.body.classList.add('build-open');
    this.renderBuild(game, true);
    this.el.buildFloat.classList.remove('hidden');
  }

  closeBuild() {
    this.el.buildMenu.classList.add('hidden');
    document.body.classList.remove('build-open');
    this.el.buildFloat.classList.add('hidden');
  }

  openUpgrade(game) {
    this.el.upgradeMenu.classList.remove('hidden');
    this.renderUpgrades(game);
  }

  openQuests(game) {
    this.el.questMenu.classList.remove('hidden');
    this.renderFullQuests(game);
  }

  openPause(game) {
    this.el.pauseMenu.classList.remove('hidden');
    this.renderPauseStats(game);
    this.syncSettings();
  }

  openHelp() {
    this.el.helpMenu.classList.remove('hidden');
  }

  renderPauseStats(game) {
    const s = game.stats;
    this.el.pauseStats.innerHTML = `
      <span>ĐÊM <b>${s.nights}</b></span>
      <span>HẠ GỤC <b>${s.kills}</b></span>
      <span>THÙNG <b>${s.looted}</b></span>
      <span>CẤP <b>${game.level}</b></span>`;
  }

  totalWeapons(game) {
    return game.player.weaponOrder.filter((id) => game.player.unlocked.has(id));
  }

  renderUpgrades(game) {
    const rows = this.totalWeapons(game).filter((id) => WEAPONS[id].kind !== 'melee');
    this.el.weaponUpgradeList.innerHTML = rows.map((id) => {
      const st = weaponStats(id, game.player.weapons[id]?.level || 0);
      const level = game.player.weapons[id]?.level || 0;
      const maxed = level >= MAX_WEAPON_LEVEL;
      const cost = upgradeCost(level);
      const afford = game.materials.parts >= (cost.parts || 0) && game.materials.scrap >= (cost.scrap || 0);
      const pips = Array.from({ length: MAX_WEAPON_LEVEL }, (_, i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('');
      return `<div class="wu-card">
        <div class="wu-icon">${SVG[id] || ''}</div>
        <div class="wu-main">
          <b>${WEAPONS[id].name}</b><span class="wu-pips">${pips}</span>
          <div class="wu-stats"><span>SÁT THƯƠNG <b>${st.dmg}${st.pellets > 1 ? '×' + st.pellets : ''}</b></span><span>BĂNG <b>${st.mag}</b></span><span>NẠP <b>${st.reload.toFixed(1)}s</b></span></div>
        </div>
        <div class="wu-buy">
          ${maxed ? '<span class="cost-chip good">TỐI ĐA</span>' : `<span class="cost-chip ${afford ? 'good' : 'bad'}">${cost.parts} linh kiện · ${cost.scrap} sắt</span>
          <button class="btn tiny ${afford ? 'primary' : ''}" data-action="weapon-upgrade" data-weapon="${id}">NÂNG CẤP</button>`}
        </div>
      </div>`;
    }).join('') || '<p class="muted">Chưa có vũ khí có thể nâng cấp.</p>';
  }

  renderFullQuests(game) {
    const list = game.quests;
    this.el.questFull.innerHTML = list.map((q, i) => {
      const pct = Math.min(100, (q.progress / q.goal) * 100);
      return `<div class="quest-full">
        <div class="qf-index">${String(i + 1).padStart(2, '0')}</div>
        <div class="qf-main">
          <b>${q.title}</b>
          <p>${q.desc}</p>
          <div class="qf-bar"><i style="width:${pct}%"></i></div>
        </div>
        <div class="qf-reward"><span>THƯỞNG</span>${this.rewardMarkup(q.reward)}</div>
      </div>`;
    }).join('') || '<p class="muted">Không có nhiệm vụ.</p>';
    const s = game.stats;
    this.el.questStat.textContent = `Đã hoàn thành ${s.quests} nhiệm vụ · Đêm ${s.nights} · Cấp ${game.level}`;
  }

  rewardMarkup(reward) {
    const bits = [];
    if (reward.scrap) bits.push(`<b>+${Math.round(reward.scrap)} sắt</b>`);
    if (reward.parts) bits.push(`<b>+${Math.round(reward.parts)} linh kiện</b>`);
    if (reward.wood) bits.push(`<em>+${Math.round(reward.wood)} gỗ</em>`);
    if (reward.medkit) bits.push(`<b>+${reward.medkit} sơ cứu</b>`);
    if (reward.xp) bits.push(`<em>+${Math.round(reward.xp)} XP</em>`);
    return bits.slice(0, 3).join('');
  }

  // -------------------------------------------------------------------------
  // Build menu
  // -------------------------------------------------------------------------
  buildSignature(game) {
    return `${game.materials.wood},${game.materials.scrap},${game.materials.parts},${game.buildKind},${game.structures.length},${game.soldiers.length},${game.core.level},${game.player.medkits}`;
  }

  renderBuild(game, force = false) {
    const sig = this.buildSignature(game);
    if (!force && sig === this.lastBuildSig) return;
    this.lastBuildSig = sig;
    const cards = Object.values(BUILDS).map((b) => {
      const count = game.structureCount(b.id);
      const limit = game.structureLimit(b.id);
      const afford = game.canAfford(b.cost);
      const selected = game.buildKind === b.id;
      const costs = this.costChips(b.cost, game);
      return `<button class="build-card ${selected ? 'selected' : ''} ${afford ? '' : 'unaffordable'}" data-action="build-select" data-build="${b.id}">
        <div class="bc-icon">${SVG[b.icon] || ''}</div>
        <div class="bc-body">
          <div class="bc-name"><b>${b.name}</b><span>${b.hp} HP</span></div>
          <div class="bc-desc">${b.desc}</div>
          <div class="bc-cost">${costs}</div>
        </div>
        <div class="bc-side">
          <span class="bc-count"><b>${count}</b> / ${limit}</span>
          <span class="bc-select">${selected ? 'ĐANG CHỌN' : 'CHỌN'}</span>
        </div>
      </button>`;
    }).join('');
    this.el.buildGrid.innerHTML = cards;

    const maxSoldiers = game.maxSoldiers();
    const recruitCost = this.costChips(RECRUIT_COST, game);
    const coreNext = CORE_UPGRADES[game.core.level] || null;
    const coreCost = coreNext ? this.costChips(coreNext.cost, game) : '';
    this.el.baseActions.innerHTML = `
      <div class="base-card">
        <h4>CHIÊU MỘ LÍNH</h4>
        <p>Lính tự động bắn quái và bảo vệ căn cứ. Tối đa ${maxSoldiers}.</p>
        <div class="bc-cost">${recruitCost}<span class="bc-count"><b>${game.soldiers.length}</b> / ${maxSoldiers}</span></div>
        <button class="btn tiny" data-action="recruit">CHIÊU MỘ</button>
      </div>
      <div class="base-card">
        <h4>NÂNG CẤP LÕI · CẤP ${game.core.level}</h4>
        <p>${coreNext ? `Lõi bền hơn: ${coreNext.hp} HP. Mở thêm giới hạn tháp và lính.` : 'Lõi căn cứ đã đạt cấp tối đa.'}</p>
        <div class="bc-cost">${coreNext ? coreCost : '<span class="cost-chip good">TỐI ĐA</span>'}</div>
        <button class="btn tiny" data-action="core-upgrade">${coreNext ? 'NÂNG CẤP LÕI' : 'ĐÃ TỐI ĐA'}</button>
      </div>
      <div class="base-card">
        <h4>BỘ SƠ CỨU</h4>
        <p>Hồi 45 máu khi sử dụng. Bạn đang có ${game.player.medkits}.</p>
        <div class="bc-cost">${this.costChips(HEAL_KIT_PRICE, game)}</div>
        <button class="btn tiny" data-action="buy-medkit">MUA · 15 SẮT</button>
      </div>`;
    this.updateBuildFloat(game);
  }

  updateBuildFloat(game) {
    if (!game.buildMode || !game.selectedBuildData) {
      this.el.buildFloat.classList.add('hidden');
      return;
    }
    this.el.buildFloat.classList.remove('hidden');
    const b = game.selectedBuildData;
    this.el.buildFloatName.textContent = b.name;
    this.el.buildFloatCost.textContent = this.costText(b.cost);
    const ghost = game.buildGhost;
    if (this.el.buildGhostState) {
      this.el.buildGhostState.className = 'ghost-state ' + (ghost?.valid ? 'valid' : 'invalid');
      this.el.buildGhostState.innerHTML = ghost
        ? (ghost.valid ? '● Vị trí hợp lệ — nhấn ĐẶT để xây' : `✕ ${ghost.reason}`)
        : '<span>Di chuyển để chọn vị trí...</span>';
    }
  }

  costText(cost) {
    const bits = [];
    if (cost.wood) bits.push(`${cost.wood} gỗ`);
    if (cost.scrap) bits.push(`${cost.scrap} sắt`);
    if (cost.parts) bits.push(`${cost.parts} linh kiện`);
    return bits.join(' · ');
  }

  costChips(cost, game) {
    if (!cost) return '';
    return Object.entries(cost).map(([k, v]) => {
      const labels = { wood: 'gỗ', scrap: 'sắt', parts: 'linh kiện' };
      const have = game.materials[k] || 0;
      return `<span class="cost-chip ${have >= v ? 'good' : 'bad'}">${v} ${labels[k] || k}</span>`;
    }).join('');
  }

  // -------------------------------------------------------------------------
  // HUD
  // -------------------------------------------------------------------------
  refreshVitals(game, force = false) {
    const p = game.player;
    const hpPct = Math.max(0, Math.min(1, p.hp / p.maxHp));
    if (this.el.hpFill) this.el.hpFill.style.width = `${hpPct * 100}%`;
    if (this.el.hpText) this.el.hpText.textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
    if (this.el.staminaFill) this.el.staminaFill.style.width = `${(p.stamina / p.maxStamina) * 100}%`;
    const need = game.xpNext();
    if (this.el.xpFill) this.el.xpFill.style.width = `${Math.min(100, (game.xp / need) * 100)}%`;
    if (this.el.xpText) this.el.xpText.textContent = `${Math.floor(game.xp)} / ${need} XP`;
    if (this.el.level) this.el.level.textContent = `CẤP ${game.level}`;
    if (this.el.medkits) this.el.medkits.textContent = String(p.medkits);
    if (this.el.mobileHealBtn) this.el.mobileHealBtn.textContent = `SƠ CỨU ${p.medkits > 0 ? '· ' + p.medkits : ''}`;
    if (this.el.mobileHealBtn) this.el.mobileHealBtn.disabled = p.medkits <= 0 || p.hp >= p.maxHp;
  }

  refreshResources(game) {
    if (this.el.wood) this.el.wood.textContent = Math.floor(game.materials.wood);
    if (this.el.scrap) this.el.scrap.textContent = Math.floor(game.materials.scrap);
    if (this.el.parts) this.el.parts.textContent = Math.floor(game.materials.parts);
  }

  refreshQuests(game) {
    if (!this.el.questList) return;
    this.el.questList.innerHTML = game.quests.slice(0, 3).map((q) => {
      const pct = Math.min(100, (q.progress / q.goal) * 100);
      return `<div class="quest-item">
        <div class="qi-top"><b>${q.title}</b><span>${Math.min(q.goal, Math.floor(q.progress))}/${q.goal}</span></div>
        <div class="qi-desc">${q.desc}</div>
        <div class="qi-bar"><i style="width:${pct}%"></i></div>
      </div>`;
    }).join('');
  }

  refreshHotbar(game) {
    const order = game.player.weaponOrder.filter((id) => game.player.unlocked.has(id));
    const sig = order.join(',');
    if (sig !== this.hotbarSig) {
      this.hotbarSig = sig;
      this.el.hotbar.innerHTML = order.map((id, i) => {
        const def = WEAPONS[id];
        return `<div class="slot" data-weapon="${id}">
          <span class="slot-key">${i + 1}</span>
          <div class="slot-top"><span class="slot-icon">${SVG[def.icon] || ''}</span><span class="slot-name">${def.name}</span></div>
          <span class="slot-ammo" data-ammo="${id}"></span>
        </div>`;
      }).join('');
    }
    for (const id of order) {
      const slot = this.el.hotbar.querySelector(`.slot[data-weapon="${id}"]`);
      if (!slot) continue;
      slot.classList.toggle('active', game.player.current === id);
      const w = game.player.weapons[id];
      const st = game.player.weaponStats(game, id);
      const ammo = slot.querySelector('[data-ammo]');
      if (st.kind === 'melee') {
        ammo.innerHTML = '∞ <em>CẬN CHIẾN</em>';
        ammo.classList.remove('low');
      } else {
        const reloading = w.reloading > 0;
        const pct = w.mag / st.mag;
        ammo.innerHTML = `${reloading ? '···' : w.mag} <em>/ ${w.reserve}</em>`;
        ammo.classList.toggle('low', pct < 0.25 && w.reserve === 0);
      }
    }
    // mobile current weapon
    const cur = WEAPONS[game.player.current];
    if (cur) {
      if (this.el.mwName) this.el.mwName.textContent = cur.name;
      if (this.el.mwAmmo) {
        const w = game.player.weapons[game.player.current];
        const st = game.player.weaponStats(game);
        this.el.mwAmmo.textContent = st.kind === 'melee' ? '∞' : `${w.mag} / ${w.reserve}`;
      }
    }
  }

  setPrompt(game) {
    const n = game.nearInteract;
    if (!n || game.buildMode || game.menuOpen) {
      this.el.prompt.classList.add('hidden');
      if (this.el.interactBtn) {
        this.el.interactBtn.disabled = true;
        this.el.interactBtn.textContent = 'MỞ';
      }
      return;
    }
    this.el.prompt.classList.remove('hidden');
    this.el.promptKey.textContent = n.key || 'E';
    this.el.promptText.textContent = n.label;
    if (this.el.interactBtn) {
      this.el.interactBtn.disabled = false;
      this.el.interactBtn.textContent = n.mobileLabel || 'MỞ';
    }
  }

  updateHUD(game, dt) {
    this.refreshVitals(game);
    this.refreshResources(game);
    this.refreshHotbar(game);
    if (this.el.clock) this.el.clock.textContent = formatClock(game.time);
    if (this.el.day) this.el.day.textContent = `NGÀY ${game.day}`;
    if (this.el.phase) this.el.phase.textContent = PHASE_LABELS[game.phase] || 'BAN NGÀY';
    if (this.el.phaseFill) this.el.phaseFill.style.width = `${Math.min(100, game.time * 100)}%`;

    const night = game.nightActive;
    if (this.el.waveChip) {
      this.el.waveChip.classList.toggle('night', night);
      if (night) {
        this.el.waveLabel.textContent = `ĐÊM ${game.nightIndex} · QUÁI`;
        this.el.waveValue.textContent = String(game.enemies.filter((e) => e.alive).length);
      } else if (game.phase === 'dusk') {
        this.el.waveLabel.textContent = 'HOÀNG HÔN · CHUẨN BỊ';
        this.el.waveValue.textContent = `${Math.ceil((0.545 - game.time) * 280)}s`;
      } else {
        this.el.waveLabel.textContent = 'TRƯỚC ĐÊM';
        this.el.waveValue.textContent = String(game.nightIndex + 1);
      }
    }

    if (game.boss && game.boss.alive) {
      this.el.bossBar.classList.remove('hidden');
      const pct = Math.max(0, game.boss.hp / game.boss.maxHp);
      this.el.bossFill.style.width = `${pct * 100}%`;
      this.el.bossText.textContent = `${Math.ceil(pct * 100)}%`;
    } else {
      this.el.bossBar.classList.add('hidden');
    }

    this.setPrompt(game);
    if (game.buildMode) this.updateBuildFloat(game);
    if (game.menuOpen === 'build') this.renderBuild(game);

    const threat = game.enemies.filter((e) => e.alive && Math.hypot(e.x - game.player.x, e.y - game.player.y) < 620).length;
    if (this.el.threat) {
      this.el.threat.textContent = threat > 0 ? `${threat} MỐI ĐE DOẠ` : game.isNight ? 'IM LẶNG' : 'YÊN TĨNH';
      this.el.threat.classList.toggle('danger', threat > 0);
    }

    this.lastHud += dt;
    if (this.lastHud > 0.1) {
      this.lastHud = 0;
      if (game.renderer) game.renderer.drawMinimap(this.el.minimap, game);
      if (game.menuOpen === 'quests') this.renderFullQuests(game);
    }
  }

  // -------------------------------------------------------------------------
  // Toasts / banners
  // -------------------------------------------------------------------------
  toast(title, sub = '', tone = 'info', icon = '◆') {
    const node = document.createElement('div');
    node.className = `toast ${tone}`;
    node.innerHTML = `<span class="t-icon">${icon}</span><div><b>${title}</b>${sub ? `<span>${sub}</span>` : ''}</div>`;
    this.el.toastLayer.appendChild(node);
    while (this.el.toastLayer.children.length > 4) this.el.toastLayer.firstElementChild.remove();
    setTimeout(() => {
      node.classList.add('out');
      setTimeout(() => node.remove(), 280);
    }, 3800);
  }

  banner(eyebrow, title, sub = '', tone = '') {
    const node = document.createElement('div');
    node.className = `banner ${tone}`;
    node.innerHTML = `<div class="b-eyebrow">${eyebrow}</div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}<div class="b-line"></div>`;
    this.el.bannerLayer.appendChild(node);
    setTimeout(() => node.remove(), 4300);
  }

  announce(text, tone = '') {
    this.banner('', text, '', tone);
  }
}
