import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { World } from './world.js';
import { Player, Enemy, Soldier, Turret, Pickup } from './entities.js';
import { Renderer } from './render.js';
import { UI } from './ui.js';
import {
  WEAPONS, WEAPON_ORDER, BUILDS, ENEMIES, CORE_UPGRADES, QUEST_TEMPLATES,
  MAX_WEAPON_LEVEL, RECRUIT_COST, HEAL_KIT_PRICE, weaponStats, upgradeCost,
} from './data.js';
import {
  clamp, dist, rand, randInt, pick, chance, angleDiff, TAU,
  segmentCircle, segmentRect,
} from './util.js';

const DAY_LENGTH = 180;
const SAVE_KEY = 'tantro.save.v2';
const SETTINGS_KEY = 'tantro.settings.v1';
const META = { version: 2 };

function phaseFor(t) {
  if (t < 0.06) return 'dawn';
  if (t < 0.5) return 'day';
  if (t < 0.575) return 'dusk';
  return 'night';
}

function segmentCircleT(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const a = dx * dx + dy * dy;
  const fx = x1 - cx;
  const fy = y1 - cy;
  if (a < 0.000001) {
    return fx * fx + fy * fy <= r * r ? 0 : null;
  }
  const c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0;
  const b = 2 * (fx * dx + fy * dy);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const t1 = (-b - sq) / (2 * a);
  const t2 = (-b + sq) / (2 * a);
  if (t1 >= 0 && t1 <= 1) return t1;
  if (t2 >= 0 && t2 <= 1) return t2;
  return null;
}

function segmentRectT(x1, y1, x2, y2, rect) {
  let tmin = 0;
  let tmax = 1;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - rect.x, rect.x + rect.w - x1, y1 - rect.y, rect.y + rect.h - y1];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-9) {
      if (q[i] < 0) return null;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > tmax) return null;
        if (t > tmin) tmin = t;
      } else {
        if (t < tmin) return null;
        if (t < tmax) tmax = t;
      }
    }
  }
  return tmin <= tmax ? tmin : null;
}

function ammoLabel(type) {
  for (const id of WEAPON_ORDER) {
    if (WEAPONS[id].ammoType === type) return WEAPONS[id].ammoName;
  }
  return 'Đạn';
}

const RESOURCE_META = {
  wood: { name: 'Gỗ', color: '#d6a86a' },
  scrap: { name: 'Sắt', color: '#b8c6bd' },
  parts: { name: 'Linh kiện', color: '#78d9e0' },
};

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.settings = this.loadSettings();
    this.input = new Input(this.canvas);
    this.input.attachSticks();
    this.audio = new AudioSys();
    this.audio.setMuted(!this.settings.sound);
    this.touch = this.input.touch;

    this.seed = 1337;
    this.world = new World(this.seed);
    this.time = 0.14;
    this.timeOfDay = this.time;
    this.day = 1;
    this.phase = phaseFor(this.time);
    this.isNight = false;
    this.darkness = 0;
    this.nightIndex = 0;
    this.nightActive = false;
    this.boss = null;

    this.mode = 'title';
    this.menuOpen = null;
    this.helpReturn = null;
    this.buildMode = false;
    this.buildKind = 'wall';
    this.selectedBuildData = BUILDS.wall;
    this.buildGhost = null;
    this.nearInteract = null;

    this.camera = { x: this.world.base.x, y: this.world.base.y, zoom: 1, shake: 0 };
    this.hitFlash = 0;
    this.elapsed = 0;
    this.visualTime = 0;
    this.lastTs = 0;
    this.lastSave = 0;
    this.ambientTimer = 8;
    this.soldierSeq = 0;

    this.materials = { wood: 60, scrap: 80, parts: 35 };
    this.xp = 0;
    this.level = 1;
    this.questTier = 0;
    this.quests = [];
    this.stats = this.freshStats();

    this.player = new Player(this.world.base.x, this.world.base.y + 150);
    this.player.level = 1;
    this.core = this.makeCore(1);
    this.enemies = [];
    this.soldiers = [];
    this.structures = [];
    this.bullets = [];
    this.acids = [];
    this.particles = [];
    this.floaters = [];
    this.decals = [];
    this.pickups = [];
    this.supplyDrop = null;

    this.rebuildSolids();
    this.initQuests();

    this.ui = new UI(this);
    this.renderer = new Renderer(this.canvas, this);
    this.updateZoom();
    this.audio.setMuted(!this.settings.sound);

    const save = this.readSave();
    this.ui.showTitle(!!save, save ? this.saveSummary(save) : '');

    window.addEventListener('pagehide', () => this.save());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.save();
    });
    window.addEventListener('resize', () => this.updateZoom());

    requestAnimationFrame((t) => this.tick(t));
  }

  freshStats() {
    return {
      kills: 0,
      nights: 0,
      looted: 0,
      built: 0,
      bosses: 0,
      quests: 0,
      shots: 0,
    };
  }

  // -------------------------------------------------------------------------
  // Settings & persistence
  // -------------------------------------------------------------------------
  loadSettings() {
    try {
      const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
      if (raw && typeof raw === 'object') {
        return { sound: raw.sound !== false, aimAssist: raw.aimAssist !== false };
      }
    } catch {
      /* private mode */
    }
    return { sound: true, aimAssist: true };
  }

  saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      /* ignore */
    }
  }

  setSound(on) {
    this.settings.sound = !!on;
    if (on) this.audio.init();
    this.audio.setMuted(!on);
    this.saveSettings();
    this.ui?.syncSettings();
  }

  toggleSound() {
    this.setSound(!this.settings.sound);
    this.audio.ui();
  }

  setAimAssist(on) {
    this.settings.aimAssist = !!on;
    this.saveSettings();
  }

  readSave() {
    try {
      const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!raw || typeof raw !== 'object') return null;
      return raw;
    } catch {
      return null;
    }
  }

  saveSummary(save) {
    if (!save) return '';
    const day = save.day || 1;
    const level = save.level || 1;
    const nights = save.stats?.nights || 0;
    const kills = save.stats?.kills || 0;
    return `NGÀY <b>${day}</b> · CẤP <b>${level}</b> · <b>${nights}</b> ĐÊM SỐNG SÓT · <b>${kills}</b> HẠ GỤC`;
  }

  save() {
    if (this.mode !== 'playing') return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.serialize()));
      this.lastSave = Date.now();
    } catch {
      /* storage unavailable */
    }
  }

  serialize() {
    const p = this.player;
    const weapons = {};
    for (const [id, w] of Object.entries(p.weapons)) {
      weapons[id] = { level: w.level || 0, mag: w.mag || 0, reserve: w.reserve || 0 };
    }
    return {
      ...META,
      seed: this.seed,
      time: this.time,
      day: this.day,
      nightIndex: this.nightIndex,
      elapsed: this.elapsed,
      level: this.level,
      xp: this.xp,
      questTier: this.questTier,
      materials: { ...this.materials },
      stats: { ...this.stats },
      settings: { ...this.settings },
      player: {
        x: p.x,
        y: p.y,
        hp: p.hp,
        maxHp: p.maxHp,
        stamina: p.stamina,
        current: p.current,
        medkits: p.medkits,
        unlocked: [...p.unlocked],
        weaponOrder: p.weaponOrder.slice(),
        weapons,
      },
      core: { level: this.core.level, hp: this.core.hp },
      structures: this.structures
        .filter((s) => s.alive)
        .map((s) => ({ kind: s.kind, x: s.x, y: s.y, hp: s.hp })),
      soldiers: this.soldiers
        .filter((s) => s.alive)
        .map((s) => ({ id: s.id, x: s.x, y: s.y, hp: s.hp, name: s.name })),
      quests: this.quests.map((q) => ({
        type: q.type,
        title: q.title,
        desc: q.desc,
        goal: q.goal,
        progress: q.progress,
        reward: { ...q.reward },
        tier: q.tier,
      })),
      opened: this.world.crates.filter((c) => c.opened).map((c) => c.id),
    };
  }

  // -------------------------------------------------------------------------
  // Run lifecycle
  // -------------------------------------------------------------------------
  startNew() {
    this.audio.init();
    this.audio.ui();
    this.seed = (Math.random() * 1e9) | 0;
    this.world = new World(this.seed);
    if (this.renderer) this.renderer.ground = null;

    this.enemies = [];
    this.soldiers = [];
    this.structures = [];
    this.bullets = [];
    this.acids = [];
    this.particles = [];
    this.floaters = [];
    this.decals = [];
    this.pickups = [];
    this.supplyDrop = null;
    this.boss = null;
    this.nearInteract = null;
    this.buildGhost = null;
    this.buildMode = false;
    this.menuOpen = null;
    this.helpReturn = null;
    this.soldierSeq = 0;

    this.materials = { wood: 60, scrap: 80, parts: 35 };
    this.xp = 0;
    this.level = 1;
    this.questTier = 0;
    this.quests = [];
    this.stats = this.freshStats();

    this.time = 0.14;
    this.timeOfDay = this.time;
    this.day = 1;
    this.phase = phaseFor(this.time);
    this.isNight = false;
    this.darkness = 0;
    this.nightIndex = 0;
    this.nightActive = false;
    this.elapsed = 0;
    this.ambientTimer = 10;
    this.hitFlash = 0;

    this.player = new Player(this.world.base.x, this.world.base.y + 150);
    this.player.level = 1;
    this.core = this.makeCore(1);
    this.selectedBuildData = BUILDS[this.buildKind] || BUILDS.wall;
    this.buildKind = this.selectedBuildData.id;

    this.rebuildSolids();
    this.initQuests();
    this.mode = 'playing';
    this.camera.zoom = this.camera.zoom || 1;
    this.updateZoom();
    this.camera.x = this.player.x;
    this.camera.y = this.player.y;
    this.camera.shake = 0;

    this.ui.closeAllMenus();
    this.ui.closeBuild();
    this.ui.hideDeath();
    this.ui.hideTitle();
    this.ui.syncSettings();
    this.ui.refreshResources(this);
    this.ui.refreshVitals(this, true);
    this.ui.refreshQuests(this);
    this.ui.refreshHotbar(this);

    for (let i = 0; i < 3; i++) this.spawnRoamer(i === 2 ? 'runner' : 'walker');
    this.spawnSupplyDrop(false);
    this.ui.banner('NGÀY 1', 'BẮT ĐẦU SINH TỒN', 'Lùng sục phế tích. Quay về trước khi trời tối.', '');
    this.ui.toast('Bộ sơ cứu', 'Nhấn H khi bị thương. Tìm bàn chế tạo để nâng cấp.', 'info', '+');
    this.save();
    this.lastSave = Date.now();
  }

  continueRun() {
    const save = this.readSave();
    if (!save) {
      this.startNew();
      return;
    }
    this.audio.init();
    this.audio.ui();
    this.applySave(save);
    this.mode = 'playing';
    this.menuOpen = null;
    this.buildMode = false;
    this.buildGhost = null;
    this.helpReturn = null;
    this.ui.closeAllMenus();
    this.ui.closeBuild();
    this.ui.hideDeath();
    this.ui.hideTitle();
    this.ui.syncSettings();
    this.ui.refreshResources(this);
    this.ui.refreshVitals(this, true);
    this.ui.refreshQuests(this);
    this.ui.refreshHotbar(this);

    this.ui.banner(
      `NGÀY ${this.day}`,
      this.isNight ? 'ĐÊM VẪN CHƯA KẾT THÚC' : 'CHƠI TIẾP',
      this.isNight ? 'Bầy biến dị vẫn đang bao vây căn cứ.' : 'Căn cứ vẫn đứng vững. Tiếp tục sinh tồn.',
      this.isNight ? 'danger' : '',
    );
    if (this.isNight) {
      if (this.nightIndex < 1) this.nightIndex = 1;
      this.nightActive = true;
      this.spawnWave();
    }
    this.lastSave = Date.now();
  }

  applySave(save) {
    this.seed = save.seed || 1337;
    this.world = new World(this.seed);
    if (this.renderer) this.renderer.ground = null;

    this.enemies = [];
    this.soldiers = [];
    this.structures = [];
    this.bullets = [];
    this.acids = [];
    this.particles = [];
    this.floaters = [];
    this.decals = [];
    this.pickups = [];
    this.supplyDrop = null;
    this.boss = null;
    this.nearInteract = null;

    const opened = new Set(save.opened || []);
    for (const c of this.world.crates) if (opened.has(c.id)) c.opened = true;

    this.materials = {
      wood: Math.max(0, Number(save.materials?.wood) || 0),
      scrap: Math.max(0, Number(save.materials?.scrap) || 0),
      parts: Math.max(0, Number(save.materials?.parts) || 0),
    };
    this.stats = { ...this.freshStats(), ...(save.stats || {}) };
    this.level = clamp(Math.round(save.level) || 1, 1, 99);
    this.xp = Math.max(0, Number(save.xp) || 0);
    this.questTier = Math.max(0, Number(save.questTier) || 0);

    this.time = clamp(Number(save.time) || 0.14, 0, 0.9999);
    this.timeOfDay = this.time;
    this.day = Math.max(1, Math.round(save.day) || 1);
    this.nightIndex = Math.max(0, Math.round(save.nightIndex) || 0);
    this.phase = phaseFor(this.time);
    this.isNight = this.phase === 'night';
    this.nightActive = this.isNight;
    this.darkness = this.isNight ? 0.78 : 0;
    this.elapsed = Math.max(0, Number(save.elapsed) || 0);
    this.hitFlash = 0;

    const p = save.player || {};
    const player = new Player(p.x ?? this.world.base.x, p.y ?? this.world.base.y + 150);
    player.maxHp = Math.max(60, Number(p.maxHp) || 100);
    player.hp = clamp(Number(p.hp) || player.maxHp, 0, player.maxHp);
    player.stamina = clamp(Number(p.stamina) || 100, 0, player.maxStamina);
    player.medkits = clamp(Math.round(p.medkits ?? 1), 0, 9);
    player.level = this.level;
    player.lastHurt = this.elapsed;

    const order = (Array.isArray(p.weaponOrder) ? p.weaponOrder : []).filter((id) => WEAPONS[id]);
    for (const id of ['knife', 'pistol']) if (!order.includes(id)) order.push(id);
    player.weapons = {};
    player.weaponOrder = [];
    player.unlocked = new Set();
    for (const id of order) player.initWeapon(id);
    for (const [id, w] of Object.entries(p.weapons || {})) {
      if (!WEAPONS[id]) continue;
      player.initWeapon(id);
      const target = player.weapons[id];
      target.level = clamp(Math.round(w.level) || 0, 0, MAX_WEAPON_LEVEL);
      if (WEAPONS[id].kind !== 'melee') {
        target.mag = clamp(Math.round(w.mag) || 0, 0, weaponStats(id, target.level).mag);
        target.reserve = Math.max(0, Math.round(w.reserve) || 0);
      }
    }
    player.current = WEAPONS[p.current] ? p.current : 'pistol';
    player.invuln = 1.5;
    this.player = player;

    const lvl = clamp(Math.round(save.core?.level) || 1, 1, CORE_UPGRADES.length);
    this.core = this.makeCore(lvl);
    this.core.hp = clamp(Number(save.core?.hp) || this.core.maxHp, 1, this.core.maxHp);

    for (const s of save.structures || []) {
      const kindMap = { wall: 'wall', turret: 'turret', medbay: 'medbay', lampbuild: 'lamp', lamp: 'lamp' };
      const kind = kindMap[s.kind];
      if (!kind) continue;
      const built = this.addStructure(kind, s.x, s.y, { hp: Number(s.hp) || undefined });
      if (built) built.hp = clamp(Number(s.hp) || built.maxHp, 1, built.maxHp);
    }
    this.soldierSeq = 0;
    for (let i = 0; i < (save.soldiers || []).length; i++) {
      const data = save.soldiers[i];
      const soldier = new Soldier(data.x, data.y, data.id ?? i + 1);
      if (data.name) soldier.name = data.name;
      soldier.hp = clamp(Number(data.hp) || soldier.maxHp, 1, soldier.maxHp);
      this.soldiers.push(soldier);
      this.soldierSeq = Math.max(this.soldierSeq, soldier.id);
    }

    this.quests = [];
    for (const q of save.quests || []) {
      if (!QUEST_TEMPLATES[q.type]) continue;
      this.quests.push({
        type: q.type,
        title: q.title || QUEST_TEMPLATES[q.type].title,
        desc: q.desc || '',
        goal: Math.max(1, q.goal || 1),
        progress: Math.max(0, q.progress || 0),
        reward: q.reward || QUEST_TEMPLATES[q.type].reward(q.goal || 1),
        tier: q.tier || 0,
      });
    }
    if (!this.quests.length) this.initQuests();

    this.buildKind = BUILDS[this.buildKind] ? this.buildKind : 'wall';
    this.selectedBuildData = BUILDS[this.buildKind];
    this.buildGhost = null;
    this.buildMode = false;

    if (save.settings) {
      this.settings.sound = save.settings.sound !== false;
      this.settings.aimAssist = save.settings.aimAssist !== false;
      this.saveSettings();
      this.audio.setMuted(!this.settings.sound);
    }

    this.rebuildSolids();
    this.camera = { x: player.x, y: player.y, zoom: this.camera.zoom || 1, shake: 0 };
    this.updateZoom();
  }

  makeCore(level) {
    const def = CORE_UPGRADES[clamp(level - 1, 0, CORE_UPGRADES.length - 1)];
    return {
      x: this.world.base.x,
      y: this.world.base.y,
      r: 44,
      level,
      maxHp: def.hp,
      hp: def.hp,
    };
  }

  quitToTitle() {
    if (this.mode === 'playing') this.save();
    this.mode = 'title';
    this.menuOpen = null;
    this.buildMode = false;
    this.buildGhost = null;
    this.nearInteract = null;
    this.input.clear();
    this.ui.closeAllMenus();
    this.ui.closeBuild();
    this.ui.hideDeath();
    const save = this.readSave();
    this.ui.showTitle(!!save, save ? this.saveSummary(save) : '');
  }

  wipeSave() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
    this.mode = 'title';
    this.menuOpen = null;
    this.buildMode = false;
    this.nearInteract = null;
    this.input.clear();
    this.ui.closeAllMenus();
    this.ui.closeBuild();
    this.ui.hideDeath();
    this.ui.showTitle(false, '');
    this.ui.toast('Đã xoá tiến trình', 'Một ván mới đang chờ bạn.', 'info', '×');
  }

  restartRun() {
    this.startNew();
  }

  // -------------------------------------------------------------------------
  // Main loop
  // -------------------------------------------------------------------------
  tick(timestamp) {
    if (!this.lastTs) this.lastTs = timestamp;
    const dt = clamp((timestamp - this.lastTs) / 1000, 0, 0.05);
    this.lastTs = timestamp;
    this.visualTime += dt;

    this.handleHotkeys();

    if (this.mode === 'playing' && !this.simulationPaused()) {
      this.update(dt);
    } else if (this.mode === 'playing') {
      this.updateAim();
      this.hitFlash = Math.max(0, this.hitFlash - dt * 2);
    }

    this.renderer.draw(this.visualTime, dt);
    if (this.mode === 'playing') this.ui.updateHUD(this, dt);

    this.input.endFrame();
    requestAnimationFrame((t) => this.tick(t));
  }

  simulationPaused() {
    return (
      this.menuOpen === 'upgrade' ||
      this.menuOpen === 'quests' ||
      this.menuOpen === 'pause' ||
      this.menuOpen === 'help'
    );
  }

  handleHotkeys() {
    const i = this.input;

    if (this.mode === 'title') {
      if (i.wasPressed('Escape') && this.menuOpen === 'help') this.closeHelp();
      else if (i.wasPressed('Enter') || i.wasPressed('NumpadEnter')) {
        if (this.readSave()) this.continueRun();
        else this.startNew();
      }
      return;
    }

    if (this.mode === 'dead' || this.mode === 'over') {
      if (i.wasPressed('Enter')) {
        if (this.core.hp > 0) this.respawn();
        else this.restartRun();
      }
      return;
    }

    if (this.mode !== 'playing') return;

    if (i.wasPressed('Escape')) {
      if (this.menuOpen === 'help') this.closeHelp();
      else if (this.menuOpen === 'pause') this.resume();
      else if (this.menuOpen) this.closeMenu();
      else this.togglePause();
      return;
    }

    if (i.wasPressed('KeyJ')) {
      if (this.menuOpen === 'quests') this.closeMenu();
      else if (!this.menuOpen) this.openQuests();
      return;
    }

    if (this.menuOpen && this.menuOpen !== 'build') return;

    if (this.buildMode) {
      if (i.wasPressed('KeyB')) {
        this.closeBuild();
        return;
      }
      if (i.wasPressed('Enter') || i.wasPressed('NumpadEnter') || i.wasPressed('Space') || i.wasPressed('KeyE')) {
        this.placeBuild();
        return;
      }
      if (i.mouse.pressed) this.placeBuild();
      return;
    }

    if (!this.player.alive) return;

    if (i.wasPressed('KeyB')) {
      this.toggleBuild();
      return;
    }
    if (i.wasPressed('KeyU')) {
      this.tryOpenUpgrade();
      return;
    }
    if (i.wasPressed('KeyE')) {
      this.interact();
      return;
    }
    if (i.wasPressed('KeyH')) {
      if (!this.player.useMedkit(this)) this.audio.denied();
      return;
    }
    if (i.wasPressed('KeyQ')) {
      this.player.quickMelee(this);
      return;
    }
    if (i.wasPressed('KeyR')) {
      if (this.player.reload(this)) this.save();
      return;
    }

    for (let n = 1; n <= 5; n++) {
      if (i.wasPressed(`Digit${n}`)) {
        const order = this.player.weaponOrder.filter((id) => this.player.unlocked.has(id));
        const id = order[n - 1];
        if (id) this.player.switchWeapon(id, this);
        return;
      }
    }

    const wheel = i.consumeWheel();
    if (wheel) this.player.cycleWeapon(wheel > 0 ? 1 : -1, this);
  }

  // -------------------------------------------------------------------------
  // Simulation
  // -------------------------------------------------------------------------
  update(dt) {
    this.elapsed += dt;
    this.timeOfDay = this.time;
    this.player.level = this.level;
    this.updateTime(dt);
    this.updateAim();
    this.player.update(dt, this);

    // Touch players auto-fire at the nearest threat when not aiming manually.
    if (this.touch && this.canAct() && !this.input.aimStick?.active) {
      if (this.nearestEnemy(this.player.x, this.player.y, 470)) this.player.tryAttack(this);
    }

    for (let n = 0; n < this.enemies.length; n++) this.enemies[n].update(dt, this);
    for (let n = 0; n < this.soldiers.length; n++) this.soldiers[n].update(dt, this);

    this.updateStructures(dt);
    this.updateBullets(dt);
    this.updateAcids(dt);
    this.updatePickups(dt);
    this.updateParticles(dt);
    this.updateFloaters(dt);
    this.updateAmbient(dt);
    this.updateBuildGhost();
    this.updateNearInteract();

    this.hitFlash = Math.max(0, this.hitFlash - dt * 1.8);
    this.camera.shake = Math.max(0, this.camera.shake - dt * 34);
    this.updateCamera(dt);
    this.audio.setNight(this.isNight);

    this.enemies = this.enemies.filter((e) => e.alive);
    this.soldiers = this.soldiers.filter((s) => s.alive);
    this.structures = this.structures.filter((s) => s.alive);
    if (this.boss && !this.boss.alive) this.boss = null;

    if (Date.now() - this.lastSave > 15000) this.save();
  }

  updateTime(dt) {
    const prev = this.phase;
    this.time += dt / DAY_LENGTH;

    if (this.time >= 1) {
      this.time -= 1;
      this.day += 1;
      if (this.nightActive) this.endNight();
      this.onNewDay();
    }

    this.timeOfDay = this.time;
    this.phase = phaseFor(this.time);
    this.isNight = this.phase === 'night';

    if (prev !== 'night' && this.phase === 'night') this.beginNight();

    let target = 0;
    if (this.phase === 'night') target = 0.78;
    else if (this.phase === 'dusk') target = 0.5 * clamp((this.time - 0.5) / 0.075, 0, 1);
    else if (this.phase === 'dawn') target = 0.46 * clamp(1 - this.time / 0.06, 0, 1);
    this.darkness += (target - this.darkness) * Math.min(1, dt * 2.2);
    if (this.darkness < 0.004) this.darkness = 0;
  }

  onNewDay() {
    this.ui.toast('BÌNH MINH', `Ngày ${this.day} bắt đầu. Hãy lùng sục và củng cố căn cứ.`, 'good', '☀');
    this.spawnSupplyDrop(false);
    this.ambientTimer = 12;
  }

  beginNight() {
    if (this.nightActive) return;
    this.nightActive = true;
    this.nightIndex += 1;
    this.audio.night();
    this.audio.wave();
    this.ui.banner(
      `ĐÊM ${String(this.nightIndex).padStart(2, '0')}`,
      'BẦY BIẾN DỊ TRÀN VỀ',
      'Sống sót đến bình minh. Bảo vệ lõi căn cứ.',
      'danger',
    );
    this.ui.toast('MÀN ĐÊM BUÔNG XUỐNG', 'Quái vật sẽ tấn công căn cứ. Giữ vị trí!', 'danger', '☾');
    this.spawnWave();
  }

  endNight() {
    if (!this.nightActive) return;
    this.nightActive = false;
    this.stats.nights += 1;
    const n = Math.max(1, this.nightIndex);

    let survivors = 0;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      survivors++;
      e.alive = false;
      this.spawnSmoke(e.x, e.y, 3);
    }
    this.enemies = [];
    this.boss = null;

    this.addMaterials({ scrap: 35 + n * 14, parts: 10 + n * 7, wood: 10 + n * 5 });
    this.addXp(50 + n * 18);
    this.questEvent('survive', 1);
    this.audio.dawn();
    this.ui.banner(
      'BÌNH MINH',
      `SỐNG SÓT QUA ĐÊM ${n}`,
      `+${35 + n * 14} sắt · +${10 + n * 7} linh kiện · +${50 + n * 18} XP${survivors ? ` · ${survivors} quái bỏ chạy` : ''}`,
      'good',
    );
    this.ui.toast('ĐÊM ĐÃ QUA', 'Phần thưởng đã được cộng vào kho. Hãy tận dụng ban ngày.', 'good', '✓');
    this.save();
  }

  spawnWave() {
    if (this.mode !== 'playing') return;
    const night = Math.max(1, this.nightIndex);
    const budget = 7 + night * 5;
    const pool = [{ id: 'walker', w: 5 }];
    if (night >= 2) pool.push({ id: 'runner', w: 4 });
    if (night >= 3) pool.push({ id: 'spitter', w: 2 });
    if (night >= 4) pool.push({ id: 'brute', w: 1.4 });

    let spent = 0;
    let count = 0;
    while (spent < budget && count < 36) {
      const total = pool.reduce((sum, t) => sum + t.w, 0);
      let roll = Math.random() * total;
      let chosen = pool[0].id;
      for (const entry of pool) {
        roll -= entry.w;
        if (roll <= 0) {
          chosen = entry.id;
          break;
        }
      }
      const cost = ENEMIES[chosen].cost || 1;
      if (spent + cost > budget + 1.5 && count > 0) break;
      spent += cost;
      count++;
      this.spawnEnemy(chosen);
    }

    if (night % 3 === 0) {
      const boss = this.spawnEnemy('boss');
      if (boss) {
        this.boss = boss;
        this.audio.bossRoar();
        this.ui.banner('QUÁI VẬT CHÚA', 'MỘT THỨ KHỔNG LỒ ĐANG ĐẾN', 'Hạ gục nó để nhận chiến lợi phẩm lớn.', 'danger');
        this.camera.shake = Math.min(30, this.camera.shake + 18);
      }
    }
  }

  spawnEnemy(type) {
    const base = this.world.base;
    let x = 0;
    let y = 0;
    let found = false;
    for (let i = 0; i < 80; i++) {
      const a = rand(0, TAU);
      const r = rand(640, 1020);
      x = clamp(base.x + Math.cos(a) * r, 70, this.world.size - 70);
      y = clamp(base.y + Math.sin(a) * r, 70, this.world.size - 70);
      if (dist(x, y, base.x, base.y) < 520) continue;
      if (this.world.hasStaticAt(x, y, 26)) continue;
      found = true;
      break;
    }
    if (!found) {
      const spot = this.world.randomOpenSpot(420, 22);
      x = spot.x;
      y = spot.y;
    }
    const enemy = new Enemy(x, y, type, Math.max(1, this.nightIndex), this.day);
    this.enemies.push(enemy);
    return enemy;
  }

  spawnRoamer(type = 'walker') {
    const p = this.player;
    let x = p.x + rand(620, 900);
    let y = p.y + rand(-760, 760);
    for (let i = 0; i < 40; i++) {
      const a = rand(0, TAU);
      const r = rand(560, 900);
      x = clamp(p.x + Math.cos(a) * r, 70, this.world.size - 70);
      y = clamp(p.y + Math.sin(a) * r, 70, this.world.size - 70);
      if (dist(x, y, p.x, p.y) < 500) continue;
      if (this.world.hasStaticAt(x, y, 24)) continue;
      break;
    }
    const enemy = new Enemy(x, y, type, Math.max(1, this.nightIndex), this.day, { roamer: true });
    this.enemies.push(enemy);
    return enemy;
  }

  updateAmbient(dt) {
    if (this.isNight) return;
    this.ambientTimer -= dt;
    if (this.ambientTimer > 0) return;
    this.ambientTimer = rand(13, 22);
    const alive = this.enemies.filter((e) => e.alive).length;
    if (alive >= 5) return;
    this.spawnRoamer(chance(0.22) ? 'runner' : 'walker');
  }

  updateAim() {
    const p = this.player;
    if (!p || !p.alive) return;
    if (!this.touch) {
      const m = this.screenToWorld(this.input.mouse.x, this.input.mouse.y);
      let angle = Math.atan2(m.y - p.y, m.x - p.x);
      if (this.settings.aimAssist) {
        const target = this.nearestEnemy(p.x, p.y, 540);
        if (target) {
          const ideal = Math.atan2(target.y - p.y, target.x - p.x);
          if (Math.abs(angleDiff(angle, ideal)) < 0.16) angle = ideal;
        }
      }
      this.aimAngle = angle;
    } else {
      const aim = this.input.aimVector;
      if (aim.active) {
        this.aimAngle = Math.atan2(aim.y, aim.x);
      } else {
        const target = this.nearestEnemy(p.x, p.y, 500);
        if (target) this.aimAngle = Math.atan2(target.y - p.y, target.x - p.x);
        else {
          const mv = this.input.moveVector;
          if (Math.hypot(mv.x, mv.y) > 0.2) this.aimAngle = Math.atan2(mv.y, mv.x);
        }
      }
    }
  }

  updateCamera(dt) {
    const cam = this.camera;
    let tx = cam.x;
    let ty = cam.y;
    if (this.mode === 'title') {
      tx = this.world.base.x;
      ty = this.world.base.y;
    } else if (this.player?.alive) {
      tx = this.player.x + Math.cos(this.aimAngle || 0) * 34;
      ty = this.player.y + Math.sin(this.aimAngle || 0) * 34;
    }
    const k = 1 - Math.pow(0.0008, dt);
    cam.x += (tx - cam.x) * k;
    cam.y += (ty - cam.y) * k;

    const r = this.renderer;
    const z = cam.zoom || 1;
    const halfW = (r?.w || window.innerWidth) / (2 * z);
    const halfH = (r?.h || window.innerHeight) / (2 * z);
    if (this.world.size > halfW * 2) cam.x = clamp(cam.x, halfW, this.world.size - halfW);
    else cam.x = this.world.size / 2;
    if (this.world.size > halfH * 2) cam.y = clamp(cam.y, halfH, this.world.size - halfH);
    else cam.y = this.world.size / 2;
  }

  updateZoom() {
    const r = this.renderer;
    if (!r) return;
    const base = Math.min(r.w || window.innerWidth, r.h || window.innerHeight);
    this.camera.zoom = clamp(base / 790, 0.72, 1.08);
  }

  screenToWorld(sx, sy) {
    const r = this.renderer;
    const w = r?.w || window.innerWidth;
    const h = r?.h || window.innerHeight;
    const z = this.camera.zoom || 1;
    return {
      x: (sx - w / 2) / z + this.camera.x,
      y: (sy - h / 2) / z + this.camera.y,
    };
  }

  enemyAt(x, y, radius = 30) {
    let best = null;
    let bestD = radius;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = dist(x, y, e.x, e.y) - e.r;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  canAct() {
    return this.mode === 'playing' && this.player.alive && !this.buildMode && this.menuOpen === null;
  }

  // -------------------------------------------------------------------------
  // World collision / vision
  // -------------------------------------------------------------------------
  rebuildSolids() {
    const solids = [];
    for (const r of this.world.solidRects) {
      solids.push({ shape: 'rect', x: r.x, y: r.y, w: r.w, h: r.h, ref: r.ref });
    }
    for (const c of this.world.solidCircles) {
      if (c.ref?.kind === 'barrel' && !c.ref.alive) continue;
      solids.push({ shape: 'circle', x: c.x, y: c.y, r: c.r, ref: c.ref });
    }
    for (const s of this.structures) {
      if (!s.alive) continue;
      if (s.kind === 'wall') {
        solids.push({ shape: 'rect', x: s.x - 28, y: s.y - 28, w: 56, h: 56, ref: s });
      } else if (s.kind === 'turret') {
        solids.push({ shape: 'circle', x: s.x, y: s.y, r: 23, ref: s });
      } else if (s.kind === 'medbay') {
        solids.push({ shape: 'circle', x: s.x, y: s.y, r: 27, ref: s });
      }
    }
    if (this.core) {
      solids.push({ shape: 'circle', x: this.core.x, y: this.core.y, r: this.core.r, ref: this.core });
    }
    this.solids = solids;
  }

  getSolids() {
    return this.solids;
  }

  hasLOS(x1, y1, x2, y2) {
    for (const r of this.world.solidRects) {
      if (segmentRect(x1, y1, x2, y2, r)) return false;
    }
    for (const c of this.world.solidCircles) {
      if (c.ref?.kind === 'barrel' && !c.ref.alive) continue;
      if (segmentCircle(x1, y1, x2, y2, c.x, c.y, c.r)) return false;
    }
    return true;
  }

  nearestEnemy(x, y, maxDist = Infinity) {
    let best = null;
    let bestD = maxDist;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = dist(x, y, e.x, e.y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  nearestStructure(x, y, radius, filter) {
    let best = null;
    let bestD = radius;
    for (const s of this.structures) {
      if (!s.alive) continue;
      if (filter && !filter(s)) continue;
      const d = dist(x, y, s.x, s.y) - (s.r || Math.max(s.w || 0, s.h || 0) / 2 || 0);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  // -------------------------------------------------------------------------
  // Projectiles & combat
  // -------------------------------------------------------------------------
  spawnPlayerBullet(x, y, angle, st) {
    const speed = st.speed || 1200;
    const ox = x + Math.cos(angle) * 22;
    const oy = y + Math.sin(angle) * 22;
    const colors = {
      pistol: 'rgba(255,224,158,0.95)',
      shotgun: 'rgba(255,196,128,0.9)',
      rifle: 'rgba(255,236,170,0.95)',
      launcher: 'rgba(255,150,78,0.95)',
    };
    this.bullets.push({
      x: ox,
      y: oy,
      px: ox,
      py: oy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: st.area ? 1.5 : 0.72,
      dmg: st.dmg,
      color: colors[st.id] || 'rgba(255,220,150,0.9)',
      width: st.id === 'launcher' ? 3.4 : st.id === 'shotgun' ? 1.5 : 2,
      radius: st.id === 'launcher' ? 4 : 1.8,
      explosive: !!st.area,
      area: st.area || 0,
      owner: 'player',
    });
  }

  spawnSoldierBullet(x, y, angle, dmg) {
    this.bullets.push({
      x: x + Math.cos(angle) * 16,
      y: y + Math.sin(angle) * 16,
      px: x,
      py: y,
      vx: Math.cos(angle) * 1450,
      vy: Math.sin(angle) * 1450,
      life: 0.7,
      dmg,
      color: 'rgba(170,255,170,0.9)',
      width: 1.7,
      radius: 1.4,
      owner: 'ally',
    });
  }

  spawnTurretBullet(x, y, angle, dmg) {
    this.bullets.push({
      x,
      y,
      px: x,
      py: y,
      vx: Math.cos(angle) * 1550,
      vy: Math.sin(angle) * 1550,
      life: 0.65,
      dmg,
      color: 'rgba(255,206,120,0.95)',
      width: 1.8,
      radius: 1.5,
      owner: 'ally',
    });
  }

  traceBullet(x1, y1, x2, y2) {
    let bestT = 1.0001;
    let best = null;

    for (const e of this.enemies) {
      if (!e.alive) continue;
      const t = segmentCircleT(x1, y1, x2, y2, e.x, e.y, e.r + 1);
      if (t !== null && t < bestT) {
        bestT = t;
        best = { type: 'enemy', ref: e };
      }
    }
    for (const b of this.world.barrels) {
      if (!b.alive) continue;
      const t = segmentCircleT(x1, y1, x2, y2, b.x, b.y, b.r + 2);
      if (t !== null && t < bestT) {
        bestT = t;
        best = { type: 'barrel', ref: b };
      }
    }
    for (const r of this.world.solidRects) {
      const t = segmentRectT(x1, y1, x2, y2, r);
      if (t !== null && t < bestT) {
        bestT = t;
        best = { type: 'world' };
      }
    }
    for (const c of this.world.solidCircles) {
      if (c.ref?.kind === 'barrel') continue;
      const t = segmentCircleT(x1, y1, x2, y2, c.x, c.y, c.r);
      if (t !== null && t < bestT) {
        bestT = t;
        best = { type: 'world' };
      }
    }
    if (best) {
      best.t = bestT;
      best.x = x1 + (x2 - x1) * bestT;
      best.y = y1 + (y2 - y1) * bestT;
    }
    return best;
  }

  updateBullets(dt) {
    const alive = [];
    for (const b of this.bullets) {
      b.life -= dt;
      if (b.life <= 0) {
        if (b.explosive) this.explode(b.x, b.y, b.area, b.dmg, { hurtPlayer: false, hitStructures: false });
        continue;
      }
      const x1 = b.x;
      const y1 = b.y;
      const x2 = x1 + b.vx * dt;
      const y2 = y1 + b.vy * dt;
      const hit = this.traceBullet(x1, y1, x2, y2);

      if (hit) {
        if (hit.type === 'enemy') {
          if (b.explosive) {
            this.explode(hit.x, hit.y, b.area, b.dmg, { hurtPlayer: false, hitStructures: false });
          } else {
            this.damageEnemy(hit.ref, b.dmg, { x: x1, y: y1, crit: chance(0.08) });
          }
        } else if (hit.type === 'barrel') {
          if (b.explosive) {
            this.explode(hit.x, hit.y, b.area, b.dmg, { hurtPlayer: false, hitStructures: false });
          } else {
            this.damageBarrel(hit.ref, b.dmg);
          }
        } else {
          this.spawnSparks(hit.x, hit.y, 3, '#ffd28a');
          if (b.explosive) this.explode(hit.x, hit.y, b.area, b.dmg, { hurtPlayer: false, hitStructures: false });
        }
        continue;
      }

      b.px = x1;
      b.py = y1;
      b.x = x2;
      b.y = y2;
      if (b.x < 0 || b.y < 0 || b.x > this.world.size || b.y > this.world.size) continue;
      alive.push(b);
    }
    this.bullets = alive;
  }

  spawnAcid(x, y, angle, speed, dmg) {
    this.acids.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 3.2,
      dmg,
      r: 6,
    });
  }

  spawnAcidFan(x, y, angle, count, spread, speed, dmg) {
    for (let i = 0; i < count; i++) {
      const a = angle + (i / Math.max(1, count - 1) - 0.5) * spread;
      this.spawnAcid(x, y, a, speed, dmg);
    }
    this.spawnSpitCharge(x, y);
  }

  updateAcids(dt) {
    const alive = [];
    for (const a of this.acids) {
      a.life -= dt;
      if (a.life <= 0) {
        this.addAcidDecal(a.x, a.y);
        continue;
      }
      const nx = a.x + a.vx * dt;
      const ny = a.y + a.vy * dt;
      const p = this.player;
      if (p.alive && dist(nx, ny, p.x, p.y) < p.r + 6) {
        p.takeDamage(this, a.dmg, a.x, a.y);
        this.addAcidDecal(nx, ny);
        continue;
      }
      if (this.world.hasStaticAt(nx, ny, 4)) {
        this.addAcidDecal(nx, ny);
        continue;
      }
      a.x = nx;
      a.y = ny;
      this.spawnParticle({
        type: 'spit',
        x: nx,
        y: ny,
        vx: 0,
        vy: 0,
        life: 0.16,
        size: 3.5,
        color: '#a6ff66',
        above: true,
      });
      alive.push(a);
    }
    this.acids = alive;
  }

  addAcidDecal(x, y) {
    this.decals.push({ x, y, r: rand(9, 17), rot: rand(0, TAU), type: 'acid', alpha: 0.5 });
    this.trimDecals();
  }

  trimDecals() {
    while (this.decals.length > 140) this.decals.shift();
  }

  damageEnemy(enemy, amount, opts = {}) {
    if (!enemy || !enemy.alive) return 0;
    let dmg = amount;
    if (opts.crit) dmg *= 1.6;
    enemy.takeDamage(this, dmg, opts);
    return dmg;
  }

  killEnemy(enemy, opts = {}) {
    const def = enemy.def;
    this.stats.kills += 1;
    const xp = Math.round((def.xp || 5) * (1 + Math.max(0, this.nightIndex - 1) * 0.12));
    this.addXp(xp);
    this.questEvent('kill', 1);
    this.audio.kill();
    this.spawnBlood(enemy.x, enemy.y, 12, opts.x != null ? Math.atan2(enemy.y - opts.y, enemy.x - opts.x) : rand(0, TAU));
    this.spawnSmoke(enemy.x, enemy.y, 2);
    this.decals.push({ x: enemy.x, y: enemy.y, r: rand(10, 20), rot: rand(0, TAU), type: 'blood', alpha: 0.65 });
    this.trimDecals();

    if (enemy.boss) {
      this.stats.bosses += 1;
      this.boss = null;
      this.questEvent('boss', 1);
      this.camera.shake = Math.min(28, this.camera.shake + 20);
      this.spawnBossLoot(enemy.x, enemy.y);
      this.ui.banner('QUÁI VẬT CHÚA ĐÃ GỤC NGÃ', 'CHIẾN LỢI PHẨM RƠI XUỐNG', 'Thu thập linh kiện và vật tư trước khi đêm kết thúc.', 'good');
      return;
    }

    if (chance(0.72)) {
      this.dropPickup('scrap', enemy.x + rand(-10, 10), enemy.y + rand(-10, 10), {
        amount: randInt(2, 5) + Math.floor(this.nightIndex / 2),
        name: 'Sắt',
      });
    }
    if (chance(0.28)) {
      this.dropPickup('parts', enemy.x + rand(-12, 12), enemy.y + rand(-12, 12), {
        amount: randInt(1, 3),
        name: 'Linh kiện',
      });
    }
    if (chance(0.2)) {
      const type = this.preferredAmmoType();
      this.dropPickup('ammo', enemy.x + rand(-14, 14), enemy.y + rand(-14, 14), {
        key: type,
        amount: randInt(5, 12),
        name: ammoLabel(type),
      });
    }
    if (chance(0.05)) {
      this.dropPickup('medkit', enemy.x + rand(-8, 8), enemy.y + rand(-8, 8), {
        amount: 1,
        name: 'Bộ sơ cứu',
      });
    }
  }

  spawnBossLoot(x, y) {
    const drops = [
      ['parts', 22, 'Linh kiện'],
      ['scrap', 42, 'Sắt'],
      ['wood', 28, 'Gỗ'],
      ['medkit', 2, 'Bộ sơ cứu'],
      ['ammo', 35, 'Đạn'],
      ['parts', 14, 'Linh kiện'],
    ];
    drops.forEach(([type, amount, name], i) => {
      const a = (i / drops.length) * TAU;
      this.dropPickup(type, x + Math.cos(a) * rand(18, 46), y + Math.sin(a) * rand(18, 46), {
        amount,
        name,
        key: type === 'ammo' ? this.preferredAmmoType() : null,
      });
    });
    this.addXp(120 + this.nightIndex * 20);
  }

  damageBarrel(barrel, amount) {
    if (!barrel || !barrel.alive || barrel.exploding) return;
    barrel.hp -= amount;
    this.spawnSparks(barrel.x, barrel.y, 5, '#ffcf6a');
    if (barrel.hp <= 0) {
      barrel.exploding = true;
      barrel.alive = false;
      this.rebuildSolids();
      this.spawnSmoke(barrel.x, barrel.y, 5);
      this.explode(barrel.x, barrel.y, 118, 46, { hurtPlayer: true, hitStructures: true });
    }
  }

  explode(x, y, radius, damage, opts = {}) {
    this.audio.explosion();
    this.camera.shake = Math.min(32, this.camera.shake + 12 + radius * 0.05);
    this.decals.push({ x, y, r: radius * 0.9, rot: rand(0, TAU), type: 'scorch', alpha: 0.9 });
    this.trimDecals();
    this.spawnSmoke(x, y, Math.round(radius / 12));
    this.spawnSparks(x, y, Math.round(radius / 7), '#ffb45a');
    this.spawnParticle({
      type: 'ring',
      x,
      y,
      vx: 0,
      vy: 0,
      life: 0.32,
      size: radius * 0.5,
      grow: radius * 0.6,
      color: '#ffb454',
      above: true,
    });

    for (const e of this.enemies.slice()) {
      if (!e.alive) continue;
      const d = dist(x, y, e.x, e.y);
      if (d > radius + e.r) continue;
      const falloff = 1 - Math.min(1, d / (radius + e.r)) * 0.55;
      this.damageEnemy(e, damage * falloff, { x, y });
    }

    for (const b of this.world.barrels.slice()) {
      if (!b.alive || b.exploding) continue;
      if (dist(x, y, b.x, b.y) < radius) this.damageBarrel(b, damage * 0.8);
    }

    if (opts.hurtPlayer && this.player.alive) {
      const d = dist(x, y, this.player.x, this.player.y);
      if (d < radius + this.player.r) {
        const falloff = 1 - Math.min(1, d / (radius + this.player.r)) * 0.6;
        this.player.takeDamage(this, damage * falloff * 0.8, x, y);
      }
    }

    if (opts.hitStructures) {
      for (const s of this.structures.slice()) {
        if (!s.alive) continue;
        const d = dist(x, y, s.x, s.y);
        if (d < radius + (s.r || 24)) {
          const falloff = 1 - Math.min(1, d / (radius + (s.r || 24))) * 0.5;
          this.damageStructure(s, damage * falloff * 0.8, { x, y });
        }
      }
    }
  }

  damageCore(amount, source) {
    if (!this.core || this.core.hp <= 0) return;
    this.core.hp -= amount;
    this.camera.shake = Math.min(22, this.camera.shake + 6);
    this.spawnSparks(this.core.x + rand(-30, 30), this.core.y + rand(-30, 30), 5, '#ffcf6a');
    this.audio.hit();
    if (this.core.hp <= 0) {
      this.core.hp = 0;
      this.onBaseDestroyed();
    }
  }

  damageStructure(structure, amount, source) {
    if (!structure || !structure.alive) return;
    structure.hp -= amount;
    structure.hitFlash = 1;
    this.spawnSparks(structure.x + rand(-12, 12), structure.y + rand(-12, 12), 4, '#ffcf6a');
    if (structure.hp <= 0) this.destroyStructure(structure);
  }

  destroyStructure(structure) {
    if (!structure.alive) return;
    structure.alive = false;
    structure.hp = 0;
    this.rebuildSolids();
    this.spawnSmoke(structure.x, structure.y, 4);
    this.decals.push({ x: structure.x, y: structure.y, r: 20, rot: rand(0, TAU), type: 'scorch', alpha: 0.55 });
    this.trimDecals();
    this.ui.toast('CÔNG TRÌNH BỊ PHÁ HỦY', structure.name || 'Một phần phòng tuyến đã sụp đổ.', 'danger', '!');
  }

  onPlayerDeath() {
    if (this.mode !== 'playing') return;
    this.mode = 'dead';
    this.buildMode = false;
    this.buildGhost = null;
    this.nearInteract = null;
    this.menuOpen = null;
    this.ui.closeAllMenus();
    this.ui.el.prompt.classList.add('hidden');
    this.ui.showDeath(this, 'player');
    this.camera.shake = Math.min(30, this.camera.shake + 18);
    this.audio.kill();
  }

  onBaseDestroyed() {
    if (this.mode === 'over') return;
    this.mode = 'over';
    this.buildMode = false;
    this.buildGhost = null;
    this.nearInteract = null;
    this.menuOpen = null;
    this.camera.shake = 32;
    this.audio.explosion();
    this.explode(this.core.x, this.core.y, 150, 30, { hurtPlayer: false, hitStructures: true });
    this.ui.closeAllMenus();
    this.ui.el.prompt.classList.add('hidden');
    this.ui.showDeath(this, 'base');
  }

  respawn() {
    if (this.mode !== 'dead' || this.core.hp <= 0) {
      if (this.core.hp <= 0) this.restartRun();
      return;
    }
    const p = this.player;
    p.alive = true;
    p.x = this.core.x + rand(-50, 50);
    p.y = this.core.y + 105;
    p.hp = Math.max(50, Math.round(p.maxHp * 0.65));
    p.stamina = p.maxStamina;
    p.invuln = 2.6;
    p.lastHurt = this.elapsed;
    const lost = Math.floor(this.materials.scrap * 0.18);
    this.materials.scrap = Math.max(0, this.materials.scrap - lost);
    this.mode = 'playing';
    this.menuOpen = null;
    this.ui.hideDeath();
    this.ui.closeAllMenus();
    this.ui.refreshResources(this);
    this.ui.refreshVitals(this, true);
    this.camera.x = p.x;
    this.camera.y = p.y;
    this.ui.toast('HỒI SINH TẠI CĂN CỨ', lost > 0 ? `Mất ${lost} sắt rơi vãi.` : 'Bạn đã trở lại chiến tuyến.', 'info', '+');
    this.save();
  }

  onSoldierDeath(soldier) {
    this.spawnBlood(soldier.x, soldier.y, 8, rand(0, TAU));
    this.spawnSmoke(soldier.x, soldier.y, 2);
    this.ui.toast('ĐỒNG ĐỘI ĐÃ NGÃ XUỐNG', soldier.name || 'Một người lính đã hy sinh.', 'danger', '×');
  }

  summonMinions(x, y, count) {
    for (let i = 0; i < count; i++) {
      let nx = x + rand(-80, 80);
      let ny = y + rand(-80, 80);
      for (let k = 0; k < 20; k++) {
        nx = x + rand(-95, 95);
        ny = y + rand(-95, 95);
        if (!this.world.hasStaticAt(nx, ny, 20)) break;
      }
      const enemy = new Enemy(nx, ny, chance(0.35) ? 'runner' : 'walker', Math.max(1, this.nightIndex), this.day);
      enemy.spawnT = 0;
      this.enemies.push(enemy);
      this.spawnSmoke(nx, ny, 2);
    }
  }

  // -------------------------------------------------------------------------
  // Structures & base
  // -------------------------------------------------------------------------
  addStructure(kind, x, y, opts = {}) {
    const def = BUILDS[kind];
    if (!def) return null;
    let s;
    if (kind === 'turret') {
      s = new Turret(x, y);
      s.name = def.name;
      s.maxHp = def.hp;
      s.hp = opts.hp || def.hp;
    } else if (kind === 'wall') {
      s = {
        kind: 'wall',
        name: def.name,
        x,
        y,
        w: 56,
        h: 56,
        r: 28,
        maxHp: def.hp,
        hp: opts.hp || def.hp,
        alive: true,
        destructible: true,
        hitFlash: 0,
        sortY: y + 28,
      };
    } else if (kind === 'medbay') {
      s = {
        kind: 'medbay',
        name: def.name,
        x,
        y,
        r: 28,
        w: 54,
        h: 48,
        maxHp: def.hp,
        hp: opts.hp || def.hp,
        alive: true,
        destructible: true,
        hitFlash: 0,
        healTimer: 0,
        sortY: y + 24,
      };
    } else if (kind === 'lamp') {
      s = {
        kind: 'lampbuild',
        name: def.name,
        x,
        y,
        r: 12,
        maxHp: def.hp,
        hp: opts.hp || def.hp,
        alive: true,
        destructible: true,
        hitFlash: 0,
        sortY: y + 8,
      };
    }
    if (!s) return null;
    this.structures.push(s);
    this.rebuildSolids();
    return s;
  }

  updateStructures(dt) {
    for (const s of this.structures) {
      if (!s.alive) continue;
      s.hitFlash = Math.max(0, (s.hitFlash || 0) - dt * 3);
      if (s.kind === 'turret') {
        s.update(dt, this);
      } else if (s.kind === 'medbay') {
        s.healTimer = (s.healTimer || 0) - dt;
        if (s.healTimer <= 0) {
          s.healTimer = 0.8;
          let healed = false;
          if (this.player.alive && dist(s.x, s.y, this.player.x, this.player.y) < 150 && this.player.hp < this.player.maxHp) {
            this.player.hp = Math.min(this.player.maxHp, this.player.hp + 5);
            this.spawnHealBurst(this.player.x, this.player.y);
            healed = true;
          }
          for (const soldier of this.soldiers) {
            if (!soldier.alive || soldier.hp >= soldier.maxHp) continue;
            if (dist(s.x, s.y, soldier.x, soldier.y) < 150) {
              soldier.hp = Math.min(soldier.maxHp, soldier.hp + 7);
              this.spawnHealBurst(soldier.x, soldier.y);
              healed = true;
            }
          }
          if (healed) this.ui.refreshVitals(this);
        }
      }
    }
  }

  structureCount(id) {
    const actual = id === 'lamp' ? 'lampbuild' : id;
    return this.structures.filter((s) => s.alive && s.kind === actual).length;
  }

  structureLimit(id) {
    const def = BUILDS[id];
    if (!def) return 0;
    const lvl = Math.max(0, this.core.level - 1);
    if (id === 'wall') return def.limit + lvl * 10;
    if (id === 'turret') return def.limit + lvl * 2;
    if (id === 'medbay') return def.limit + Math.floor(lvl / 2);
    if (id === 'lamp') return def.limit + lvl;
    return def.limit;
  }

  maxSoldiers() {
    return 3 + this.core.level * 2;
  }

  toggleBuild() {
    if (this.mode !== 'playing' || !this.player.alive) return;
    if (this.buildMode) {
      this.closeBuild();
      return;
    }
    if (this.menuOpen) this.closeMenu();
    const d = dist(this.player.x, this.player.y, this.world.base.x, this.world.base.y);
    if (d > this.world.base.radius + 40) {
      this.ui.toast('KHÔNG THỂ XÂY DỰNG', 'Hãy quay về vùng bảo vệ quanh lõi căn cứ.', 'danger', '!');
      this.audio.denied();
      return;
    }
    this.buildMode = true;
    this.menuOpen = 'build';
    this.selectedBuildData = BUILDS[this.buildKind] || BUILDS.wall;
    this.buildKind = this.selectedBuildData.id;
    this.updateBuildGhost();
    this.ui.openBuild(this);
    this.audio.ui();
  }

  closeBuild() {
    this.buildMode = false;
    this.buildGhost = null;
    if (this.menuOpen === 'build') this.menuOpen = null;
    this.ui.closeBuild();
    this.ui.closeAllMenus();
  }

  selectBuild(id) {
    if (!this.buildMode || !BUILDS[id]) return;
    this.buildKind = id;
    this.selectedBuildData = BUILDS[id];
    this.ui.renderBuild(this, true);
    this.updateBuildGhost();
    this.audio.ui();
  }

  updateBuildGhost() {
    if (!this.buildMode || !this.player.alive) {
      this.buildGhost = null;
      return;
    }
    const def = BUILDS[this.buildKind];
    if (!def) {
      this.buildGhost = null;
      return;
    }
    let x;
    let y;
    if (this.touch) {
      x = this.player.x + Math.cos(this.aimAngle) * 76;
      y = this.player.y + Math.sin(this.aimAngle) * 76;
    } else {
      const m = this.screenToWorld(this.input.mouse.x, this.input.mouse.y);
      x = m.x;
      y = m.y;
      const d = dist(this.player.x, this.player.y, x, y);
      if (d > 310) {
        x = this.player.x + ((x - this.player.x) / d) * 310;
        y = this.player.y + ((y - this.player.y) / d) * 310;
      }
    }
    x = Math.round(x / 8) * 8;
    y = Math.round(y / 8) * 8;

    const half = def.id === 'wall' ? 29 : 27;
    let valid = true;
    let reason = '';
    const fromBase = dist(x, y, this.world.base.x, this.world.base.y);
    if (fromBase > this.world.base.buildRadius - 6) {
      valid = false;
      reason = 'Ngoài vùng xây dựng';
    } else if (dist(x, y, this.core.x, this.core.y) < this.core.r + half + 12) {
      valid = false;
      reason = 'Quá gần lõi căn cứ';
    } else if (dist(this.player.x, this.player.y, x, y) > 330) {
      valid = false;
      reason = 'Quá xa người chơi';
    } else if (this.world.hasStaticAt(x, y, half + 4)) {
      valid = false;
      reason = 'Vướng địa hình hoặc xác xe';
    } else if (this.structures.some((s) => s.alive && dist(x, y, s.x, s.y) < half + (s.r || s.w / 2 || 20) + 4)) {
      valid = false;
      reason = 'Chồng lên công trình khác';
    } else if (this.world.crates.some((c) => !c.opened && dist(x, y, c.x, c.y) < half + 22)) {
      valid = false;
      reason = 'Có thùng tiếp tế tại đây';
    } else if (this.supplyDrop && !this.supplyDrop.opened && dist(x, y, this.supplyDrop.x, this.supplyDrop.y) < half + 30) {
      valid = false;
      reason = 'Có thùng tiếp tế tại đây';
    } else if (this.structureCount(def.id) >= this.structureLimit(def.id)) {
      valid = false;
      reason = 'Đã đạt giới hạn công trình';
    } else if (!this.canAfford(def.cost)) {
      valid = false;
      reason = 'Không đủ vật liệu';
    }

    this.buildGhost = { x, y, valid, reason };
  }

  placeBuild() {
    if (!this.buildMode || !this.buildGhost) return;
    const def = BUILDS[this.buildKind];
    if (!def) return;
    if (!this.buildGhost.valid) {
      this.ui.toast('KHÔNG THỂ ĐẶT', this.buildGhost.reason || 'Vị trí không hợp lệ.', 'danger', '!');
      this.audio.denied();
      return;
    }
    if (this.structureCount(def.id) >= this.structureLimit(def.id)) {
      this.ui.toast('ĐÃ ĐẠT GIỚI HẠN', def.name, 'danger', '!');
      this.audio.denied();
      return;
    }
    if (!this.canAfford(def.cost)) {
      this.ui.toast('THIẾU VẬT LIỆU', 'Hãy lùng sục thêm thùng tiếp tế.', 'danger', '!');
      this.audio.denied();
      return;
    }
    this.spend(def.cost);
    const built = this.addStructure(def.id, this.buildGhost.x, this.buildGhost.y);
    if (!built) return;
    this.stats.built += 1;
    this.questEvent('build', 1);
    this.audio.build();
    this.spawnDust(this.buildGhost.x, this.buildGhost.y, 7);
    this.ui.refreshResources(this);
    this.ui.toast('ĐÃ XÂY DỰNG', def.name, 'good', '+');
    this.ui.renderBuild(this, true);
    this.updateBuildGhost();
    this.save();
  }

  canAfford(cost) {
    if (!cost) return true;
    return Object.entries(cost).every(([k, v]) => (this.materials[k] || 0) >= v);
  }

  spend(cost) {
    if (!cost) return;
    for (const [k, v] of Object.entries(cost)) this.materials[k] = Math.max(0, (this.materials[k] || 0) - v);
  }

  recruitSoldier() {
    if (!this.player.alive) return;
    if (this.soldiers.length >= this.maxSoldiers()) {
      this.ui.toast('KHÔNG THỂ CHIÊU MỘ', 'Đã đạt giới hạn lính. Nâng cấp lõi để mở thêm.', 'danger', '!');
      this.audio.denied();
      return;
    }
    if (!this.canAfford(RECRUIT_COST)) {
      this.ui.toast('THIẾU VẬT LIỆU', 'Cần 20 sắt và 25 linh kiện.', 'danger', '!');
      this.audio.denied();
      return;
    }
    this.spend(RECRUIT_COST);
    this.soldierSeq += 1;
    const a = rand(0, TAU);
    const soldier = new Soldier(
      this.world.base.x + Math.cos(a) * 120,
      this.world.base.y + Math.sin(a) * 120,
      this.soldierSeq,
    );
    this.soldiers.push(soldier);
    this.questEvent('recruit', 1);
    this.audio.build();
    this.spawnHealBurst(soldier.x, soldier.y);
    this.ui.toast('ĐÃ CHIÊU MỘ', `${soldier.name} sẽ bảo vệ căn cứ.`, 'good', '+');
    this.ui.refreshResources(this);
    this.ui.renderBuild(this, true);
    this.save();
  }

  upgradeCore() {
    const next = CORE_UPGRADES[this.core.level];
    if (!next) {
      this.ui.toast('LÕI ĐÃ TỐI ĐA', 'Không thể nâng cấp thêm.', 'info', '!');
      this.audio.denied();
      return;
    }
    if (!this.canAfford(next.cost)) {
      this.ui.toast('THIẾU VẬT LIỆU', 'Cần thêm gỗ, sắt và linh kiện.', 'danger', '!');
      this.audio.denied();
      return;
    }
    this.spend(next.cost);
    const oldMax = this.core.maxHp;
    this.core.level += 1;
    this.core.maxHp = next.hp;
    this.core.hp = Math.min(this.core.maxHp, this.core.hp + (next.hp - oldMax));
    this.audio.build();
    this.spawnHealBurst(this.core.x, this.core.y);
    this.ui.toast('LÕI ĐÃ NÂNG CẤP', `Cấp ${this.core.level} · ${this.core.maxHp} HP · mở thêm giới hạn.`, 'good', '▲');
    this.ui.refreshResources(this);
    this.ui.renderBuild(this, true);
    this.save();
  }

  buyMedkit() {
    if (this.player.medkits >= 9) {
      this.ui.toast('ĐÃ ĐẦY', 'Bạn chỉ mang được 9 bộ sơ cứu.', 'info', '!');
      return;
    }
    if (!this.canAfford(HEAL_KIT_PRICE)) {
      this.ui.toast('THIẾU SẮT', 'Cần 15 sắt để mua sơ cứu.', 'danger', '!');
      this.audio.denied();
      return;
    }
    this.spend(HEAL_KIT_PRICE);
    this.player.medkits += 1;
    this.audio.pickup();
    this.ui.toast('MUA BỘ SƠ CỨU', 'Nhấn H để hồi 45 máu.', 'good', '+');
    this.ui.refreshResources(this);
    this.ui.refreshVitals(this, true);
    this.ui.renderBuild(this, true);
    this.save();
  }

  tryOpenUpgrade() {
    if (!this.player.alive) return;
    const bench = this.world.workbench;
    if (dist(this.player.x, this.player.y, bench.x, bench.y) > 118) {
      this.ui.toast('CẦN BÀN CHẾ TẠO', 'Hãy đến bàn chế tạo cạnh lõi căn cứ.', 'info', '!');
      this.audio.denied();
      return;
    }
    this.openUpgrade();
  }

  upgradeWeapon(id) {
    if (!this.player.unlocked.has(id) || !WEAPONS[id]) return;
    const w = this.player.weapons[id];
    if (!w) return;
    if (w.level >= MAX_WEAPON_LEVEL) {
      this.ui.toast('VŨ KHÍ ĐÃ TỐI ĐA', WEAPONS[id].name, 'info', '!');
      return;
    }
    const bench = this.world.workbench;
    if (dist(this.player.x, this.player.y, bench.x, bench.y) > 118) {
      this.ui.toast('CẦN BÀN CHẾ TẠO', 'Nâng cấp chỉ thực hiện được tại bàn chế tạo.', 'info', '!');
      this.audio.denied();
      return;
    }
    const cost = upgradeCost(w.level);
    if (!this.canAfford(cost)) {
      this.ui.toast('THIẾU VẬT LIỆU', `Cần ${cost.parts} linh kiện và ${cost.scrap} sắt.`, 'danger', '!');
      this.audio.denied();
      return;
    }
    this.spend(cost);
    w.level += 1;
    this.audio.build();
    this.questEvent('upgrade', 1);
    this.ui.toast('NÂNG CẤP THÀNH CÔNG', `${WEAPONS[id].name} · Cấp ${w.level}`, 'good', '▲');
    this.ui.refreshResources(this);
    this.ui.refreshHotbar(this);
    this.ui.renderUpgrades(this);
    this.save();
  }

  // -------------------------------------------------------------------------
  // Menus
  // -------------------------------------------------------------------------
  togglePause() {
    if (this.mode !== 'playing') return;
    if (this.menuOpen === 'pause') {
      this.resume();
      return;
    }
    if (this.menuOpen) {
      this.closeMenu();
      return;
    }
    this.menuOpen = 'pause';
    this.buildMode = false;
    this.buildGhost = null;
    this.ui.closeAllMenus();
    this.ui.openPause(this);
    this.audio.ui();
    this.save();
  }

  resume() {
    this.menuOpen = null;
    this.ui.closeAllMenus();
    this.ui.closeBuild();
    this.audio.ui();
  }

  openQuests() {
    if (this.mode !== 'playing') return;
    if (this.menuOpen === 'quests') {
      this.closeMenu();
      return;
    }
    this.buildMode = false;
    this.buildGhost = null;
    this.ui.closeAllMenus();
    this.ui.closeBuild();
    this.menuOpen = 'quests';
    this.ui.openQuests(this);
    this.audio.ui();
  }

  closeMenu() {
    if (this.menuOpen === 'build') {
      this.closeBuild();
      return;
    }
    this.menuOpen = null;
    this.buildMode = false;
    this.buildGhost = null;
    this.ui.closeAllMenus();
    this.ui.closeBuild();
  }

  openUpgrade() {
    if (this.mode !== 'playing') return;
    this.buildMode = false;
    this.buildGhost = null;
    this.ui.closeAllMenus();
    this.ui.closeBuild();
    this.menuOpen = 'upgrade';
    this.ui.openUpgrade(this);
    this.audio.ui();
  }

  openUpgradeFromPause() {
    this.menuOpen = 'upgrade';
    this.ui.closeAllMenus();
    this.ui.openUpgrade(this);
    this.audio.ui();
  }

  openHelp() {
    if (this.mode === 'title') {
      this.helpReturn = 'title';
    } else {
      this.helpReturn = this.menuOpen || null;
      this.menuOpen = 'help';
    }
    this.ui.openHelp();
    this.audio.ui();
  }

  closeHelp() {
    this.ui.el.helpMenu.classList.add('hidden');
    if (this.helpReturn === 'title') {
      this.helpReturn = null;
      return;
    }
    if (this.helpReturn === 'pause') {
      this.menuOpen = 'pause';
      this.ui.openPause(this);
    } else if (this.helpReturn === 'upgrade') {
      this.menuOpen = 'upgrade';
      this.ui.openUpgrade(this);
    } else if (this.helpReturn === 'quests') {
      this.menuOpen = 'quests';
      this.ui.openQuests(this);
    } else {
      this.menuOpen = null;
    }
    this.helpReturn = null;
    this.audio.ui();
  }

  // -------------------------------------------------------------------------
  // Interaction & loot
  // -------------------------------------------------------------------------
  updateNearInteract() {
    this.nearInteract = null;
    if (this.mode !== 'playing' || !this.player.alive) return;
    const p = this.player;
    let best = null;
    let bestD = 999;

    for (const c of this.world.crates) {
      if (c.opened) continue;
      const d = dist(p.x, p.y, c.x, c.y);
      if (d < 70 && d < bestD) {
        bestD = d;
        best = {
          type: 'crate',
          target: c,
          key: 'E',
          label: 'Mở thùng tiếp tế',
          mobileLabel: 'MỞ',
        };
      }
    }

    const s = this.supplyDrop;
    if (s && !s.opened) {
      const d = dist(p.x, p.y, s.x, s.y);
      if (d < 74 && d < bestD) {
        bestD = d;
        best = {
          type: 'supply',
          target: s,
          key: 'E',
          label: 'Mở thùng tiếp tế đặc biệt',
          mobileLabel: 'MỞ',
        };
      }
    }

    const bench = this.world.workbench;
    const bd = dist(p.x, p.y, bench.x, bench.y);
    if (bd < 112 && bd < bestD) {
      bestD = bd;
      best = {
        type: 'workbench',
        target: bench,
        key: 'E',
        label: 'Chế tạo & nâng cấp vũ khí',
        mobileLabel: 'CHẾ',
      };
    }

    this.nearInteract = best;
  }

  interact() {
    if (this.mode !== 'playing' || !this.player.alive) return;
    if (this.buildMode || this.menuOpen) return;
    const n = this.nearInteract;
    if (!n) {
      this.ui.toast('KHÔNG CÓ GÌ ĐỂ MỞ', 'Hãy đến gần thùng tiếp tế hoặc bàn chế tạo.', 'info', '·');
      return;
    }
    if (n.type === 'crate') this.openCrate(n.target);
    else if (n.type === 'supply') this.openSupply();
    else if (n.type === 'workbench') this.openUpgrade();
    this.updateNearInteract();
  }

  openCrate(crate) {
    if (!crate || crate.opened) return;
    crate.opened = true;
    this.stats.looted += 1;
    this.questEvent('loot', 1);
    this.audio.pickup();
    const label = crate.type === 'weapon' ? 'VŨ KHÍ' : crate.type === 'rare' ? 'TIẾP TẾ QUÝ' : 'TIẾP TẾ';
    const names = [];
    const add = (type, amount, name, key = null, color = null) => {
      this.dropPickup(type, crate.x + rand(-20, 20), crate.y + rand(-20, 20), {
        amount,
        name,
        key,
        color,
      });
      names.push(name);
    };

    if (crate.type === 'weapon') {
      const id = this.chooseWeaponReward();
      if (id) {
        add('weapon', 1, WEAPONS[id].name, id, '#8ee9a0');
      } else {
        const type = this.preferredAmmoType();
        add('ammo', 26, ammoLabel(type), type, '#e8bb6b');
        add('parts', randInt(7, 12), 'Linh kiện', null, '#78d9e0');
      }
      add('parts', randInt(4, 9), 'Linh kiện', null, '#78d9e0');
    } else if (crate.type === 'rare') {
      add('parts', randInt(7, 13), 'Linh kiện', null, '#78d9e0');
      add('scrap', randInt(12, 22), 'Sắt');
      if (chance(0.7)) {
        const type = this.preferredAmmoType();
        add('ammo', randInt(10, 20), ammoLabel(type), type, '#e8bb6b');
      }
      if (chance(0.32)) add('medkit', 1, 'Bộ sơ cứu', null, '#8dff9d');
      if (chance(0.08)) {
        const id = this.chooseWeaponReward();
        if (id) add('weapon', 1, WEAPONS[id].name, id, '#8ee9a0');
      }
    } else {
      add('scrap', randInt(8, 16), 'Sắt');
      add('wood', randInt(7, 15), 'Gỗ');
      if (chance(0.42)) add('parts', randInt(2, 5), 'Linh kiện', null, '#78d9e0');
      if (chance(0.34)) {
        const type = this.preferredAmmoType();
        add('ammo', randInt(6, 12), ammoLabel(type), type, '#e8bb6b');
      }
      if (chance(0.1)) add('medkit', 1, 'Bộ sơ cứu', null, '#8dff9d');
    }

    const summary = [...new Set(names)].slice(0, 4).join(' · ');
    this.ui.toast(label, summary || 'Vật tư đã được chuyển vào túi.', 'good', '▣');
  }

  openSupply() {
    const s = this.supplyDrop;
    if (!s || s.opened) return;
    s.opened = true;
    this.stats.looted += 1;
    this.questEvent('loot', 1);
    this.audio.pickup();
    const id = this.chooseWeaponReward();
    if (id) {
      this.dropPickup('weapon', s.x + rand(-16, 16), s.y + rand(-16, 16), {
        amount: 1,
        name: WEAPONS[id].name,
        key: id,
        color: '#8ee9a0',
      });
    }
    const type = this.preferredAmmoType();
    const drops = [
      ['parts', randInt(18, 28), 'Linh kiện', null, '#78d9e0'],
      ['scrap', randInt(28, 46), 'Sắt'],
      ['ammo', 38, ammoLabel(type), type, '#e8bb6b'],
      ['medkit', 1, 'Bộ sơ cứu', null, '#8dff9d'],
      ['wood', randInt(18, 30), 'Gỗ'],
    ];
    drops.forEach(([t, amount, name, key, color]) => {
      this.dropPickup(t, s.x + rand(-24, 24), s.y + rand(-24, 24), { amount, name, key, color });
    });
    this.ui.toast('THÙNG TIẾP TẾ ĐẶC BIỆT', id ? `Vũ khí: ${WEAPONS[id].name} và vật tư lớn.` : 'Vật tư hạng nặng.', 'good', '✦');
    this.ui.banner('TIẾP TẾ QUÝ', 'VẬT TƯ HẠNG NẶNG', 'Thu thập nhanh trước khi quái vật kéo đến.', 'good');
  }

  chooseWeaponReward() {
    const locked = WEAPON_ORDER.filter(
      (id) => WEAPONS[id].kind === 'ranged' && !this.player.unlocked.has(id),
    );
    if (!locked.length) return null;
    return locked[0];
  }

  preferredAmmoType() {
    const st = this.player.weaponStats(this);
    if (st && st.kind === 'ranged' && st.ammoType) return st.ammoType;
    return 'pistol';
  }

  dropPickup(type, x, y, data = {}) {
    const meta = RESOURCE_META[type];
    const pickup = new Pickup(type, x, y, {
      amount: data.amount || 1,
      key: data.key || null,
      name: data.name || meta?.name || '',
      color: data.color || meta?.color || '#ffcf6a',
      icon: type,
    });
    this.pickups.push(pickup);
    return pickup;
  }

  updatePickups(dt) {
    if (!this.pickups.length) return;
    for (const p of this.pickups) p.update(dt, this);
    this.pickups = this.pickups.filter((p) => !p.dead);
  }

  collectPickup(pickup) {
    const amount = pickup.amount || 1;
    this.audio.pickup();
    let label = pickup.name || '';

    if (pickup.type === 'wood' || pickup.type === 'scrap' || pickup.type === 'parts') {
      this.materials[pickup.type] = (this.materials[pickup.type] || 0) + amount;
      if (pickup.type === 'scrap') this.questEvent('scrap', amount);
      if (!label) label = RESOURCE_META[pickup.type].name;
      this.floatText(pickup.x, pickup.y - 18, `+${amount} ${label}`, pickup.color);
      this.ui.refreshResources(this);
    } else if (pickup.type === 'ammo') {
      const weaponId = this.addAmmo(pickup.key, amount);
      if (weaponId) {
        this.floatText(pickup.x, pickup.y - 18, `+${amount} ${WEAPONS[weaponId].ammoName}`, pickup.color);
      } else {
        this.materials.scrap += Math.ceil(amount * 0.5);
        this.ui.refreshResources(this);
        this.floatText(pickup.x, pickup.y - 18, `+${Math.ceil(amount * 0.5)} Sắt`, '#b8c6bd');
      }
    } else if (pickup.type === 'medkit') {
      this.player.medkits = Math.min(9, this.player.medkits + amount);
      this.floatText(pickup.x, pickup.y - 18, `+${amount} Sơ cứu`, pickup.color);
      this.ui.refreshVitals(this, true);
    } else if (pickup.type === 'weapon') {
      const id = pickup.key;
      if (WEAPONS[id]) {
        const isNew = this.player.unlockWeapon(id);
        if (isNew) {
          this.questEvent('weapon', 1);
          this.ui.toast('VŨ KHÍ MỚI', WEAPONS[id].name, 'good', '✦');
          this.floatText(pickup.x, pickup.y - 24, WEAPONS[id].name, '#8ee9a0', true);
        } else {
          const w = this.player.weapons[id];
          w.reserve += Math.ceil(WEAPONS[id].reserve * 0.5);
          this.floatText(pickup.x, pickup.y - 18, `+${Math.ceil(WEAPONS[id].reserve * 0.5)} đạn dự trữ`, pickup.color);
        }
        this.ui.refreshHotbar(this);
      }
    }

    this.spawnSparks(pickup.x, pickup.y, 2, pickup.color || '#ffcf6a');
  }

  addAmmo(ammoType, amount) {
    if (!ammoType) return null;
    const candidates = this.player.weaponOrder.filter((id) => {
      if (!this.player.unlocked.has(id)) return false;
      const def = WEAPONS[id];
      return def.kind === 'ranged' && def.ammoType === ammoType;
    });
    if (!candidates.length) return null;
    const id = candidates.includes(this.player.current) ? this.player.current : candidates[0];
    const w = this.player.weapons[id];
    if (!w) return null;
    w.reserve += amount;
    this.ui.refreshHotbar(this);
    return id;
  }

  spawnSupplyDrop(announce = true) {
    if (this.supplyDrop && !this.supplyDrop.opened && announce) return;
    const spot = this.world.randomOpenSpot(360, 26);
    this.supplyDrop = {
      x: spot.x,
      y: spot.y,
      type: 'weapon',
      opened: false,
      wobble: Math.random() * 6,
    };
    if (announce) {
      this.ui.toast('TIẾP TẾ QUÝ ĐÃ RƠI', 'Tìm cột sáng xanh trên bản đồ nhỏ.', 'good', '▼');
    }
  }

  // -------------------------------------------------------------------------
  // Progression
  // -------------------------------------------------------------------------
  xpNext() {
    return Math.round(72 + (this.level - 1) * 48);
  }

  addXp(amount) {
    if (!amount) return;
    this.xp += amount;
    let leveled = false;
    while (this.xp >= this.xpNext()) {
      this.xp -= this.xpNext();
      this.level += 1;
      this.player.maxHp += 8;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 16);
      this.player.level = this.level;
      this.materials.parts += 2;
      leveled = true;
    }
    if (leveled) {
      this.audio.levelup();
      this.ui.toast('THĂNG CẤP', `Cấp ${this.level} · +8 máu tối đa · +2 linh kiện`, 'good', '▲');
      this.ui.refreshVitals(this, true);
      this.ui.refreshResources(this);
      this.spawnHealBurst(this.player.x, this.player.y);
    }
  }

  addMaterials(reward) {
    if (!reward) return;
    for (const [key, value] of Object.entries(reward)) {
      if (!['wood', 'scrap', 'parts'].includes(key)) continue;
      this.materials[key] = Math.max(0, Math.round((this.materials[key] || 0) + value));
    }
    this.ui.refreshResources(this);
  }

  initQuests() {
    this.quests = [];
    for (const type of ['kill', 'loot', 'build', 'survive']) {
      this.quests.push(this.makeQuest(type, 0));
    }
  }

  makeQuest(type, tier = 0) {
    const tpl = QUEST_TEMPLATES[type] || QUEST_TEMPLATES.kill;
    const goal = Math.max(1, Math.round(tpl.base + tpl.growth * tier));
    return {
      type,
      title: tpl.title,
      desc: tpl.desc(goal),
      goal,
      progress: 0,
      reward: tpl.reward(goal),
      tier,
    };
  }

  questEvent(type, amount = 1) {
    let changed = false;
    for (const q of this.quests.slice()) {
      if (q.type !== type) continue;
      q.progress = Math.min(q.goal, q.progress + amount);
      changed = true;
      if (q.progress >= q.goal) this.completeQuest(q);
    }
    if (changed) this.ui.refreshQuests(this);
  }

  completeQuest(q) {
    const idx = this.quests.indexOf(q);
    if (idx < 0) return;
    this.stats.quests += 1;
    const reward = q.reward || {};
    for (const key of ['wood', 'scrap', 'parts']) {
      if (reward[key]) this.materials[key] = Math.max(0, Math.round((this.materials[key] || 0) + reward[key]));
    }
    if (reward.medkit) this.player.medkits = Math.min(9, this.player.medkits + reward.medkit);
    if (reward.xp) this.addXp(reward.xp);
    this.audio.levelup();
    this.ui.toast('NHIỆM VỤ HOÀN THÀNH', q.title, 'good', '✓');
    this.ui.refreshResources(this);
    this.ui.refreshVitals(this, true);

    const types = Object.keys(QUEST_TEMPLATES).filter(
      (type) => type !== 'boss' || this.nightIndex >= 3,
    );
    const currentTypes = new Set(this.quests.filter((item) => item !== q).map((item) => item.type));
    let candidates = types.filter((type) => !currentTypes.has(type));
    if (!candidates.length) candidates = types;
    const nextType = pick(candidates);
    this.questTier += 1;
    this.quests[idx] = this.makeQuest(nextType, Math.floor(this.questTier / 2));
    this.save();
  }

  // -------------------------------------------------------------------------
  // Particles / feedback
  // -------------------------------------------------------------------------
  spawnParticle(p) {
    if (this.particles.length > 720) this.particles.shift();
    p.maxLife = p.life;
    p.above = !!p.above;
    this.particles.push(p);
  }

  spawnBlood(x, y, count, angle) {
    for (let i = 0; i < count; i++) {
      const a = angle + rand(-0.85, 0.85);
      const speed = rand(35, 170);
      this.spawnParticle({
        type: 'blood',
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: rand(0.28, 0.62),
        size: rand(1.3, 3.2),
        color: pick(['#741c20', '#8e2527', '#5c1418']),
        drag: 3.2,
      });
    }
  }

  spawnSparks(x, y, count, color = '#ffcf6a') {
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU);
      const speed = rand(75, 300);
      this.spawnParticle({
        type: 'spark',
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: rand(0.12, 0.36),
        size: rand(1, 2.2),
        color,
        drag: 2.4,
        above: true,
      });
    }
  }

  spawnSmoke(x, y, count) {
    for (let i = 0; i < count; i++) {
      this.spawnParticle({
        type: 'smoke',
        x: x + rand(-10, 10),
        y: y + rand(-10, 10),
        vx: rand(-20, 20),
        vy: rand(-45, -10),
        life: rand(0.45, 1.1),
        size: rand(5, 12),
        grow: rand(4, 14),
        color: pick(['#3b3b38', '#4a4740', '#2f302c']),
        drag: 1.1,
      });
    }
  }

  spawnDust(x, y, count) {
    for (let i = 0; i < count; i++) {
      this.spawnParticle({
        type: 'dust',
        x: x + rand(-18, 18),
        y: y + rand(-14, 14),
        vx: rand(-42, 42),
        vy: rand(-28, 8),
        life: rand(0.4, 0.85),
        size: rand(3, 7),
        grow: rand(2, 7),
        color: '#8a7b58',
        drag: 2,
      });
    }
  }

  addMuzzleFlash(x, y, angle, scale = 1) {
    this.spawnParticle({
      type: 'muzzle',
      x,
      y,
      vx: 0,
      vy: 0,
      rot: angle,
      life: 0.075,
      size: 10 * scale,
      color: '#ffe7a6',
      above: true,
    });
  }

  spawnShell(x, y, angle) {
    const a = angle + Math.PI / 2;
    this.spawnParticle({
      type: 'shell',
      x: x + Math.cos(angle) * 16,
      y: y + Math.sin(angle) * 16,
      vx: Math.cos(a) * rand(50, 120),
      vy: Math.sin(a) * rand(50, 120),
      rot: rand(0, TAU),
      life: rand(0.35, 0.7),
      size: 2,
      color: '#c9a35a',
      drag: 2,
    });
  }

  spawnSlash(player) {
    this.spawnParticle({
      type: 'ring',
      x: player.x + Math.cos(player.aimAngle) * 22,
      y: player.y + Math.sin(player.aimAngle) * 22,
      vx: 0,
      vy: 0,
      life: 0.22,
      size: 18,
      grow: 22,
      color: '#ffd9a0',
      above: true,
    });
    this.spawnSparks(player.x + Math.cos(player.aimAngle) * 30, player.y + Math.sin(player.aimAngle) * 30, 3, '#ffd9a0');
  }

  spawnHealBurst(x, y) {
    for (let i = 0; i < 9; i++) {
      this.spawnParticle({
        type: 'heal',
        x: x + rand(-16, 16),
        y: y + rand(-12, 12),
        vx: rand(-14, 14),
        vy: rand(-48, -20),
        life: rand(0.35, 0.7),
        size: 3,
        color: '#8dff9d',
        above: true,
      });
    }
  }

  spawnSpitCharge(x, y) {
    this.spawnParticle({
      type: 'ring',
      x,
      y,
      vx: 0,
      vy: 0,
      life: 0.18,
      size: 12,
      grow: 12,
      color: '#a6ff66',
      above: true,
    });
  }

  spawnClaw(x, y, angle) {
    this.spawnParticle({
      type: 'claw',
      x,
      y,
      vx: 0,
      vy: 0,
      rot: angle,
      life: 0.22,
      size: 20,
      color: '#ffd0a0',
      above: true,
    });
  }

  floatText(x, y, text, color = '#fff2d6', big = false) {
    if (this.floaters.length > 90) this.floaters.shift();
    this.floaters.push({
      x,
      y,
      text,
      color,
      big,
      life: big ? 1.15 : 0.85,
      maxLife: big ? 1.15 : 0.85,
    });
  }

  updateParticles(dt) {
    if (!this.particles.length) return;
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.type === 'shell' && p.life > 0) p.rot += dt * 18;
      const drag = p.drag || 1.6;
      const damp = 1 - Math.min(0.92, dt * drag);
      p.vx *= damp;
      p.vy *= damp;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  updateFloaters(dt) {
    if (!this.floaters.length) return;
    for (const f of this.floaters) {
      f.life -= dt;
      f.y -= 20 * dt;
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
  }
}

const game = new Game();
window.__tantro = game;
