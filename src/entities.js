import {
  clamp, dist, lerpAngle, resolveCircleRect, resolveCircleCircle,
  angleDiff, rand, TAU,
} from './util.js';
import { ENEMIES, WEAPONS, weaponStats } from './data.js';

const WORLD_PAD = 26;

export function moveEntity(ent, dx, dy, solids, worldSize = 2800) {
  ent.x += dx;
  ent.y += dy;
  const loops = solids.length > 60 ? 1 : 2;
  for (let pass = 0; pass < loops; pass++) {
    for (let i = 0; i < solids.length; i++) {
      const s = solids[i];
      if (s.shape === 'rect') resolveCircleRect(ent, s);
      else resolveCircleCircle(ent, s);
    }
  }
  ent.x = clamp(ent.x, WORLD_PAD, worldSize - WORLD_PAD);
  ent.y = clamp(ent.y, WORLD_PAD, worldSize - WORLD_PAD);
}

export class Pickup {
  constructor(type, x, y, data = {}) {
    this.type = type;
    this.x = x;
    this.y = y;
    this.vx = rand(-55, 55);
    this.vy = rand(-55, 55);
    this.life = 42;
    this.born = 0;
    this.bob = Math.random() * TAU;
    this.dead = false;
    this.amount = data.amount || 1;
    this.key = data.key || null;
    this.name = data.name || '';
    this.color = data.color || '#ffcf6a';
    this.icon = data.icon || 'ammo';
  }

  update(dt, game) {
    this.born += dt;
    this.life -= dt;
    this.bob += dt * 3;
    if (this.life <= 0) {
      this.dead = true;
      return;
    }
    this.vx *= 1 - Math.min(1, dt * 4);
    this.vy *= 1 - Math.min(1, dt * 4);
    const p = game.player;
    const d = p && p.alive ? dist(this.x, this.y, p.x, p.y) : 999;
    if (d < 135 && this.born > 0.25) {
      const f = (1 - d / 135) * 1500;
      const inv = 1 / (d || 1);
      this.vx += (p.x - this.x) * inv * f * dt;
      this.vy += (p.y - this.y) * inv * f * dt;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (p && p.alive && d < 26) {
      this.dead = true;
      game.collectPickup(this);
    }
  }
}

export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.r = 14;
    this.maxHp = 100;
    this.hp = 100;
    this.maxStamina = 100;
    this.stamina = 100;
    this.speed = 216;
    this.aimAngle = -Math.PI / 2;
    this.facing = -Math.PI / 2;
    this.walkPhase = 0;
    this.moving = 0;
    this.current = 'pistol';
    this.weapons = {};
    this.weaponOrder = ['knife', 'pistol'];
    this.fireTimer = 0;
    this.reloadTimer = 0;
    this.meleeTimer = 0;
    this.meleeCooldown = 0;
    this.slashTimer = 0;
    this.slashAngle = 0;
    this.medkits = 1;
    this.healCooldown = 0;
    this.invuln = 0;
    this.lastHurt = -99;
    this.alive = true;
    this.recoil = 0;
    this.muzzle = 0;
    this.unlocked = new Set(['knife', 'pistol']);
    this.initWeapon('knife');
    this.initWeapon('pistol');
    this.mag = 12;
    this.magSize = 12;
    this.critFlash = 0;
  }

  initWeapon(id) {
    const def = WEAPONS[id];
    if (!def) return;
    if (!this.weapons[id]) {
      if (def.kind === 'melee') {
        this.weapons[id] = { level: 0, mag: 0, reserve: 0, reloading: 0 };
      } else {
        this.weapons[id] = {
          level: 0,
          mag: def.mag,
          reserve: def.reserve,
          reloading: 0,
        };
      }
    }
    if (!this.weaponOrder.includes(id)) this.weaponOrder.push(id);
    this.unlocked.add(id);
  }

  unlockWeapon(id) {
    if (!WEAPONS[id]) return false;
    if (this.unlocked.has(id)) {
      const w = this.weapons[id];
      if (w) w.reserve += Math.ceil(WEAPONS[id].reserve * 0.5);
      return false;
    }
    this.initWeapon(id);
    return true;
  }

  get state() {
    return this.weapons[this.current];
  }

  weaponStats(game, id = this.current) {
    const w = this.weapons[id];
    return weaponStats(id, w ? w.level : 0);
  }

  switchWeapon(id, game) {
    if (!this.unlocked.has(id) || this.current === id) return false;
    this.current = id;
    this.reloadTimer = 0;
    const w = this.weapons[id];
    if (w) w.reloading = 0;
    this.fireTimer = 0;
    if (game) {
      game.audio.ui();
      game.ui.refreshHotbar(game);
    }
    return true;
  }

  cycleWeapon(dir, game) {
    const order = this.weaponOrder.filter((id) => this.unlocked.has(id));
    if (!order.length) return;
    let idx = order.indexOf(this.current);
    idx = (idx + dir + order.length) % order.length;
    this.switchWeapon(order[idx], game);
  }

  reload(game, silent = false) {
    const st = this.weaponStats(game);
    if (st.kind === 'melee') return;
    const w = this.state;
    if (!w || w.reloading > 0 || w.mag >= st.mag || w.reserve <= 0) return;
    w.reloading = st.reload;
    if (!silent) game.audio.reload();
  }

  update(dt, game) {
    if (!this.alive) return;
    this.invuln = Math.max(0, this.invuln - dt);
    this.fireTimer = Math.max(0, this.fireTimer - dt);
    this.meleeCooldown = Math.max(0, this.meleeCooldown - dt);
    this.slashTimer = Math.max(0, this.slashTimer - dt);
    this.healCooldown = Math.max(0, this.healCooldown - dt);
    this.muzzle = Math.max(0, this.muzzle - dt * 8);
    this.recoil = Math.max(0, this.recoil - dt * 30);

    const w = this.state;
    if (w && w.reloading > 0) {
      w.reloading -= dt;
      if (w.reloading <= 0) {
        const st = this.weaponStats(game);
        const need = st.mag - w.mag;
        const take = Math.min(need, w.reserve);
        w.mag += take;
        w.reserve -= take;
        w.reloading = 0;
        game.ui.refreshHotbar(game);
      }
    }

    const mv = game.input.moveVector;
    const sprinting = game.input.sprint && this.stamina > 3 && mv.magnitude > 0.1 && !game.buildMode;
    let speed = this.speed;
    if (sprinting) {
      speed *= 1.45;
      this.stamina = Math.max(0, this.stamina - 24 * dt);
    } else {
      this.stamina = Math.min(this.maxStamina, this.stamina + 19 * dt);
    }
    const len = Math.hypot(mv.x, mv.y);
    if (len > 0.05) {
      const nx = mv.x / len;
      const ny = mv.y / len;
      const scale = Math.min(1, mv.magnitude * 1.15);
      moveEntity(this, nx * speed * scale * dt, ny * speed * scale * dt, game.getSolids(), game.world.size);
      this.moving = Math.min(1, this.moving + dt * 8);
      this.walkPhase += dt * (sprinting ? 16 : 11) * (0.4 + scale);
    } else {
      this.moving = Math.max(0, this.moving - dt * 8);
    }

    this.aimAngle = game.aimAngle;
    this.facing = lerpAngle(this.facing, this.aimAngle, 1 - Math.pow(0.0001, dt));
    if (this.moving > 0.1) {
      const moveAngle = Math.atan2(mv.y, mv.x);
      if (mv.magnitude > 0.6 && game.settings.aimAssist && !game.input.firing) {
        this.facing = lerpAngle(this.facing, moveAngle, 1 - Math.pow(0.05, dt));
      }
    }

    // Out of combat daytime regeneration
    if (game.timeOfDay > 0.05 && game.timeOfDay < 0.5 && game.elapsed - this.lastHurt > 7) {
      this.hp = Math.min(this.maxHp, this.hp + dt * 0.9);
    }

    if (game.canAct() && game.input.firing && !game.buildMode && game.menuOpen === null) {
      this.tryAttack(game);
    }
  }

  tryAttack(game) {
    const st = this.weaponStats(game);
    if (st.kind === 'melee') {
      if (this.meleeCooldown <= 0) this.melee(game, st);
      return;
    }
    if (this.fireTimer > 0) return;
    const w = this.state;
    if (w.reloading > 0) return;
    if (w.mag <= 0) {
      if (w.reserve > 0) this.reload(game);
      else if (this.fireTimer <= 0) {
        game.audio.dryFire();
        this.fireTimer = 0.35;
      }
      return;
    }
    const interval = 1 / st.rate;
    this.fireTimer = interval;
    w.mag--;
    const pellets = st.pellets || 1;
    for (let i = 0; i < pellets; i++) {
      const spread = (Math.random() - 0.5) * st.spread * 2;
      game.spawnPlayerBullet(this.x, this.y, this.aimAngle + spread, st);
    }
    game.audio.shoot(st.sound);
    game.camera.shake = Math.min(14, game.camera.shake + st.kick);
    this.recoil = 1;
    this.muzzle = 1;
    const mx = this.x + Math.cos(this.aimAngle) * 26;
    const my = this.y + Math.sin(this.aimAngle) * 26;
    game.addMuzzleFlash(mx, my, this.aimAngle, st.kind === 'ranged' ? 1 : 0.6);
    game.spawnShell(this.x, this.y, this.aimAngle);
    game.stats.shots++;
    game.ui.refreshHotbar(game);
  }

  quickMelee(game) {
    if (this.meleeCooldown > 0 || !this.alive) return;
    this.melee(game, weaponStats('knife', this.weapons.knife?.level || 0));
  }

  melee(game, st) {
    this.meleeCooldown = 1 / st.rate;
    this.slashTimer = 0.18;
    this.slashAngle = this.aimAngle;
    const range = st.range;
    let hit = false;
    for (const e of game.enemies) {
      if (!e.alive) continue;
      const d = dist(this.x, this.y, e.x, e.y);
      if (d > range + e.r) continue;
      const a = Math.atan2(e.y - this.y, e.x - this.x);
      if (Math.abs(angleDiff(this.aimAngle, a)) > st.arc / 2) continue;
      game.damageEnemy(e, st.dmg, { x: this.x, y: this.y, melee: true });
      hit = true;
    }
    for (const b of game.world.barrels) {
      if (!b.alive) continue;
      const d = dist(this.x, this.y, b.x, b.y);
      if (d < range + 12) {
        const a = Math.atan2(b.y - this.y, b.x - this.x);
        if (Math.abs(angleDiff(this.aimAngle, a)) < st.arc / 2) {
          game.damageBarrel(b, 30);
          hit = true;
        }
      }
    }
    if (hit) {
      game.audio.flesh();
      game.camera.shake = Math.min(10, game.camera.shake + 4);
    } else {
      game.audio.hit();
    }
    game.spawnSlash(this);
    this.fireTimer = 0;
    game.ui.refreshHotbar(game);
  }

  useMedkit(game) {
    if (this.medkits <= 0 || this.healCooldown > 0 || this.hp >= this.maxHp) return false;
    this.medkits--;
    this.healCooldown = 1.2;
    this.hp = Math.min(this.maxHp, this.hp + 45);
    game.audio.heal();
    game.floatText(this.x, this.y - 26, '+45', '#8dff9d');
    game.spawnHealBurst(this.x, this.y);
    game.ui.refreshVitals(game, true);
    game.questEvent('heal', 1);
    return true;
  }

  takeDamage(game, amount, sx, sy) {
    if (!this.alive || this.invuln > 0 || game.mode !== 'playing') return;
    this.hp -= amount;
    this.invuln = 0.42;
    this.lastHurt = game.elapsed;
    game.camera.shake = Math.min(22, game.camera.shake + 7);
    game.hitFlash = Math.min(1, game.hitFlash + 0.7);
    game.audio.hurt();
    const a = Math.atan2(this.y - sy, this.x - sx);
    game.spawnBlood(this.x, this.y, 8, a);
    game.floatText(this.x, this.y - 30, `-${Math.round(amount)}`, '#ff6b5c');
    game.ui.refreshVitals(game, true);
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      game.onPlayerDeath();
    }
  }
}

function aliveEnemies(game) {
  return game.enemies.filter((e) => e.alive);
}

export class Enemy {
  constructor(x, y, typeId, night = 1, day = 1, opts = {}) {
    const def = ENEMIES[typeId];
    this.type = typeId;
    this.def = def;
    this.x = x;
    this.y = y;
    this.homeX = x;
    this.homeY = y;
    this.r = def.r;
    const hpScale = 1 + Math.max(0, night - 1) * 0.3 + Math.max(0, day - 1) * 0.045;
    this.maxHp = Math.round(def.hp * hpScale * (opts.hpMult || 1));
    this.hp = this.maxHp;
    this.speed = def.speed * (1 + Math.min(0.5, Math.max(0, night - 1) * 0.035)) * (opts.speedMult || 1) * rand(0.93, 1.08);
    this.dmg = def.dmg * (1 + Math.max(0, night - 1) * 0.14) * (opts.dmgMult || 1);
    this.alive = true;
    this.angle = rand(0, TAU);
    this.anim = rand(0, TAU);
    this.attackTimer = rand(0.2, 1);
    this.hitFlash = 0;
    this.state = 'idle';
    this.wander = rand(0, TAU);
    this.wanderTimer = rand(1, 3);
    this.targetKind = 'base';
    this.blockedStructure = null;
    this.specialTimer = rand(3, 6);
    this.spawnT = 0;
    this.boss = !!def.boss;
    this.roamer = !!opts.roamer;
    this.summonTimer = 7;
    this.poisonTimer = 0;
    this.stuck = 0;
    this.lastX = x;
    this.lastY = y;
    this.slow = 0;
  }

  update(dt, game) {
    if (!this.alive) return;
    this.spawnT += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 3.5);
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    this.specialTimer = Math.max(0, this.specialTimer - dt);
    this.summonTimer = Math.max(0, this.summonTimer - dt);
    this.slow = Math.max(0, this.slow - dt);
    this.anim += dt * (this.type === 'runner' ? 13 : this.boss ? 5 : 7);
    const player = game.player;
    const core = game.core;
    const dPlayer = player.alive ? dist(this.x, this.y, player.x, player.y) : 9999;
    const dCore = dist(this.x, this.y, core.x, core.y);
    const isNight = game.isNight;

    let targetX = core.x;
    let targetY = core.y;
    let mode = 'base';

    if (this.roamer && !isNight) {
      if (dPlayer < 300) {
        mode = 'player';
        targetX = player.x;
        targetY = player.y;
      } else {
        mode = 'wander';
      }
    } else if (player.alive && dPlayer < (isNight ? 640 : 420)) {
      mode = 'player';
      targetX = player.x;
      targetY = player.y;
    } else {
      mode = 'base';
    }

    this.targetKind = mode;
    const aggression = isNight ? 1 : 0.7;
    let speed = this.speed * aggression * (1 - Math.min(0.45, this.slow));
    let moveX = 0;
    let moveY = 0;

    if (mode === 'wander') {
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = rand(2, 5);
        this.wander = rand(0, TAU);
        if (Math.random() < 0.25) this.wanderTimer = rand(1, 2);
      }
      const dHome = dist(this.x, this.y, this.homeX, this.homeY);
      const dir = dHome > 160 ? Math.atan2(this.homeY - this.y, this.homeX - this.x) : this.wander;
      moveX = Math.cos(dir) * speed * 0.32;
      moveY = Math.sin(dir) * speed * 0.32;
      this.angle = lerpAngle(this.angle, dir, 1 - Math.pow(0.02, dt));
    } else {
      let dirX = 0;
      let dirY = 0;
      let travelDist = 0;
      if (mode === 'player') {
        dirX = targetX - this.x;
        dirY = targetY - this.y;
        travelDist = dPlayer;
      } else {
        travelDist = dCore;
        const flow = game.world.flowAt(this.x, this.y);
        if (flow) {
          dirX = flow.x;
          dirY = flow.y;
        } else {
          dirX = core.x - this.x;
          dirY = core.y - this.y;
        }
      }
      const len = Math.hypot(dirX, dirY) || 1;
      dirX /= len;
      dirY /= len;
      const attackRange = this.r + (mode === 'player' ? player.r : 64);
      if (travelDist > attackRange) {
        moveX = dirX * speed;
        moveY = dirY * speed;
      }
      this.angle = lerpAngle(this.angle, Math.atan2(dirY, dirX), 1 - Math.pow(0.005, dt));
    }

    // Separation from other enemies
    let sepX = 0;
    let sepY = 0;
    const enemies = game.enemies;
    for (let i = 0; i < enemies.length; i++) {
      const o = enemies[i];
      if (o === this || !o.alive) continue;
      const dx = this.x - o.x;
      const dy = this.y - o.y;
      const dd = dx * dx + dy * dy;
      const rr = this.r + o.r;
      if (dd < rr * rr * 1.6 && dd > 0.001) {
        const d = Math.sqrt(dd);
        const f = (1 - d / (rr * 1.3)) * 44;
        sepX += (dx / d) * f;
        sepY += (dy / d) * f;
      }
    }
    if (this.boss) {
      sepX *= 0.2;
      sepY *= 0.2;
    }

    const beforeX = this.x;
    const beforeY = this.y;
    moveEntity(this, (moveX + sepX) * dt, (moveY + sepY) * dt, game.getSolids(), game.world.size);
    const moved = dist(beforeX, beforeY, this.x, this.y);
    if (moved < 0.4 && (moveX || moveY)) this.stuck += dt;
    else this.stuck = Math.max(0, this.stuck - dt * 2);
    this.lastX = this.x;
    this.lastY = this.y;

    // Spitter ranged attack
    if (this.type === 'spitter' && mode === 'player' && dPlayer < this.def.range && this.attackTimer <= 0) {
      if (game.hasLOS(this.x, this.y, player.x, player.y, true)) {
        this.attackTimer = this.def.attackRate;
        const a = Math.atan2(player.y - this.y, player.x - this.x) + rand(-0.07, 0.07);
        game.spawnAcid(this.x + Math.cos(a) * this.r, this.y + Math.sin(a) * this.r, a, 260, this.dmg * 0.9);
        game.audio.spit?.();
        game.spawnSpitCharge(this.x, this.y);
        this.angle = a;
      }
    }

    // Basic melee attack
    if (this.attackTimer <= 0 && mode === 'player' && dPlayer < this.r + player.r + 12) {
      this.attackTimer = this.def.attackRate;
      player.takeDamage(game, this.dmg, this.x, this.y);
      game.spawnClaw(this.x, this.y, Math.atan2(player.y - this.y, player.x - this.x));
      this.attackLunge = 1;
    }

    // Attacking the base core
    if (this.attackTimer <= 0 && dCore < this.r + core.r + 14) {
      this.attackTimer = this.def.attackRate;
      game.damageCore(this.dmg, this);
      game.spawnClaw(this.x, this.y, Math.atan2(core.y - this.y, core.x - this.x));
    }

    // Walls and buildings in the way
    if (this.attackTimer <= 0 && mode === 'base') {
      const wall = game.nearestStructure(
        this.x,
        this.y,
        this.r + 20,
        (s) => s.destructible && s.hp > 0,
      );
      if (wall) {
        this.attackTimer = this.def.attackRate;
        game.damageStructure(wall, this.dmg, this);
        const a = Math.atan2(wall.y - this.y, wall.x - this.x);
        game.spawnClaw(this.x, this.y, a);
      }
    }
    if (this.stuck > 0.15 && this.attackTimer <= 0) {
      const wall = game.nearestStructure(this.x, this.y, this.r + 46, (s) => s.destructible && s.hp > 0);
      if (wall) {
        this.attackTimer = this.def.attackRate;
        game.damageStructure(wall, this.dmg, this);
        const a = Math.atan2(wall.y - this.y, wall.x - this.x);
        game.spawnClaw(this.x, this.y, a);
      }
    }

    // Boss abilities
    if (this.boss) {
      if (this.summonTimer <= 0) {
        this.summonTimer = 10;
        game.summonMinions(this.x, this.y, 2);
        game.floatText(this.x, this.y - 50, 'TRIỆU HỒI!', '#ff6b5c');
      }
      if (this.specialTimer <= 0 && dPlayer < 780) {
        this.specialTimer = rand(4.5, 6.5);
        const baseA = Math.atan2(player.y - this.y, player.x - this.x);
        game.spawnAcidFan(this.x, this.y, baseA, 5, 0.55, 210, this.dmg * 0.55);
        game.audio.bossRoar();
        game.floatText(this.x, this.y - 55, 'CUỒNG NỘ!', '#ff8a3d');
      }
    }
  }

  takeDamage(game, amount, opts = {}) {
    if (!this.alive) return;
    this.hp -= amount;
    this.hitFlash = 1;
    const a = opts.x != null ? Math.atan2(this.y - opts.y, this.x - opts.x) : rand(0, TAU);
    game.spawnBlood(this.x, this.y, opts.melee ? 10 : 5, a);
    game.floatText(this.x + rand(-8, 8), this.y - this.r - 6, String(Math.round(amount)), opts.crit ? '#ffd166' : '#ffb0a0');
    if (this.hp <= 0) {
      this.alive = false;
      game.killEnemy(this, opts);
    } else if (opts.melee) {
      this.slow = Math.max(this.slow, 0.35);
    }
  }
}

export class Soldier {
  constructor(x, y, id) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.r = 13;
    this.maxHp = 110;
    this.hp = 110;
    this.speed = 150;
    this.angle = -Math.PI / 2;
    this.aimAngle = -Math.PI / 2;
    this.cooldown = rand(0, 0.4);
    this.alive = true;
    this.anim = 0;
    this.moving = 0;
    this.hitFlash = 0;
    this.muzzle = 0;
    this.name = ['Tân', 'Hùng', 'Linh', 'Bảo', 'Trang', 'Khoa', 'Mai', 'Dũng'][id % 8];
    this.state = 'guard';
    this.reloadTimer = 0;
  }

  update(dt, game) {
    if (!this.alive) return;
    this.cooldown -= dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 3);
    this.muzzle = Math.max(0, this.muzzle - dt * 8);
    this.anim += dt * 8;
    const player = game.player;
    const base = game.world.base;
    const playerNearBase = player.alive && dist(player.x, player.y, base.x, base.y) < 560;
    const target = game.nearestEnemy(this.x, this.y, 430);
    let destX = base.x + Math.cos((this.id / 5) * TAU) * 120;
    let destY = base.y + Math.sin((this.id / 5) * TAU) * 120;
    if (playerNearBase) {
      const offset = (this.id - 1) * 0.9;
      destX = player.x + Math.cos(offset + 2.2) * 74;
      destY = player.y + Math.sin(offset + 2.2) * 74;
    }
    if (target) {
      const d = dist(this.x, this.y, target.x, target.y);
      if (d > 250) {
        destX = target.x;
        destY = target.y;
      } else {
        destX = this.x;
        destY = this.y;
      }
      this.aimAngle = Math.atan2(target.y - this.y, target.x - this.x);
      if (this.cooldown <= 0 && d < 430 && game.hasLOS(this.x, this.y, target.x, target.y, true)) {
        this.cooldown = 0.62 + rand(0, 0.18);
        game.spawnSoldierBullet(this.x, this.y, this.aimAngle, 13);
        game.audio.shoot('turret');
        this.muzzle = 1;
        this.recoil = 1;
      }
    } else if (this.reloadTimer <= 0) {
      this.aimAngle = lerpAngle(this.aimAngle, this.angle, dt * 2);
    }
    const dx = destX - this.x;
    const dy = destY - this.y;
    const d = Math.hypot(dx, dy);
    if (d > 18) {
      const sp = this.speed * (target && d < 250 ? 0.25 : 1);
      moveEntity(this, (dx / d) * sp * dt, (dy / d) * sp * dt, game.getSolids(), game.world.size);
      this.angle = lerpAngle(this.angle, Math.atan2(dy, dx), 1 - Math.pow(0.001, dt));
      this.moving = Math.min(1, this.moving + dt * 8);
    } else {
      this.moving = Math.max(0, this.moving - dt * 8);
    }
    this.facing = lerpAngle(this.angle, this.aimAngle, 0.85);

    // Medbay aura handled by game.
  }

  takeDamage(game, amount, sx, sy) {
    if (!this.alive) return;
    this.hp -= amount;
    this.hitFlash = 1;
    game.spawnBlood(this.x, this.y, 5, Math.atan2(this.y - sy, this.x - sx));
    game.floatText(this.x, this.y - 24, `-${Math.round(amount)}`, '#ff6b5c');
    if (this.hp <= 0) {
      this.alive = false;
      game.onSoldierDeath(this);
    }
  }
}

export class Turret {
  constructor(x, y) {
    this.kind = 'turret';
    this.x = x;
    this.y = y;
    this.r = 25;
    this.w = 50;
    this.h = 50;
    this.maxHp = 170;
    this.hp = 170;
    this.angle = -Math.PI / 2;
    this.cooldown = 0;
    this.target = null;
    this.alive = true;
    this.destructible = true;
    this.muzzle = 0;
    this.hitFlash = 0;
    this.sortY = y + 24;
    this.dmg = 14;
  }

  update(dt, game) {
    if (!this.alive) return;
    this.cooldown -= dt;
    this.muzzle = Math.max(0, this.muzzle - dt * 9);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 3);
    if (!this.target || !this.target.alive || dist(this.x, this.y, this.target.x, this.target.y) > 440) {
      this.target = game.nearestEnemy(this.x, this.y, 430);
    }
    const target = this.target;
    if (target && target.alive) {
      const desired = Math.atan2(target.y - this.y, target.x - this.x);
      this.angle = lerpAngle(this.angle, desired, 1 - Math.pow(0.0001, dt));
      const d = dist(this.x, this.y, target.x, target.y);
      if (this.cooldown <= 0 && d < 430 && Math.abs(angleDiff(this.angle, desired)) < 0.25) {
        this.cooldown = 0.5;
        const spread = (Math.random() - 0.5) * 0.06;
        game.spawnTurretBullet(this.x + Math.cos(this.angle) * 24, this.y + Math.sin(this.angle) * 24, this.angle + spread, this.dmg + (game.core.level - 1) * 3);
        game.audio.shoot('turret');
        this.muzzle = 1;
      }
    } else {
      this.angle += dt * 0.25;
    }
  }

  takeDamage(game, amount) {
    this.hp -= amount;
    this.hitFlash = 1;
    if (this.hp <= 0) {
      this.alive = false;
      game.destroyStructure(this);
      game.explode(this.x, this.y, 60, 12, { source: 'enemy', friendly: false });
    }
  }
}
