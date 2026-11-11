/* ============================================================
   TÀN TÍCH: VÙNG ĐẤT CHẾT
   data.js — tiện ích, dữ liệu vũ khí, công trình, nhiệm vụ
   ============================================================ */
window.TT = window.TT || {};

(function () {
  'use strict';
  const TAU = Math.PI * 2;

  const U = {
    TAU,
    clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
    lerp(a, b, t) { return a + (b - a) * t; },
    invLerp(a, b, v) { return U.clamp((v - a) / (b - a), 0, 1); },
    smoothstep(a, b, v) { const t = U.clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); },
    dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); },
    dist2(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; },
    angleDiff(a, b) { let d = (b - a + Math.PI) % TAU; if (d < 0) d += TAU; return d - Math.PI; },
    rand(a, b) { return a + Math.random() * (b - a); },
    randInt(a, b) { return Math.floor(U.rand(a, b + 1)); },
    choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
    chance(p) { return Math.random() < p; },
    clampCircleToRect(cx, cy, r, rect) {
      const nx = U.clamp(cx, rect.x, rect.x + rect.w);
      const ny = U.clamp(cy, rect.y, rect.y + rect.h);
      return { x: nx, y: ny, d: Math.hypot(cx - nx, cy - ny) };
    },
    circleRect(cx, cy, r, rect) {
      const nx = U.clamp(cx, rect.x, rect.x + rect.w);
      const ny = U.clamp(cy, rect.y, rect.y + rect.h);
      return U.dist2(cx, cy, nx, ny) < r * r;
    },
    hash(x, y, seed) {
      let h = x * 374761393 + y * 668265263 + seed * 1442695040;
      h = (h ^ (h >> 13)) * 1274126177;
      return ((h ^ (h >> 16)) >>> 0) / 4294967296;
    },
    mulberry32(a) {
      return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
    fmt(n) { return Math.round(n).toLocaleString('vi-VN'); },
    pad2(n) { return n < 10 ? '0' + n : '' + n; },
  };
  TT.U = U;
  TT.TAU = TAU;

  /* ---------------- VŨ KHÍ ---------------- */
  TT.WEAPONS = [
    {
      id: 'knife', slot: 1, name: 'DAO GĂM', short: 'DAO', icon: '†', type: 'melee',
      damage: 34, rate: 0.34, reach: 66, arc: 2.05, mag: 0,
      desc: 'Vũ khí cận chiến im lặng. Không cần đạn, sát thương cao khi áp sát.',
      level: 1, owned: true,
    },
    {
      id: 'pistol', slot: 2, name: 'SÚNG LỤC', short: 'LỤC', icon: '⌐', type: 'gun',
      damage: 18, rate: 0.2, magSize: 12, reloadTime: 1.25, spread: 0.035, bulletSpeed: 1280,
      pellets: 1, auto: false, ammoType: '9mm', range: 620,
      desc: 'Bền bỉ, dễ tìm đạn. Vũ khí chủ lực cho những ngày đầu.',
      level: 1, owned: true,
    },
    {
      id: 'shotgun', slot: 3, name: 'SÚNG SĂN', short: 'SĂN', icon: '≡', type: 'gun',
      damage: 11, rate: 0.72, magSize: 6, reloadTime: 2.15, spread: 0.21, bulletSpeed: 1050,
      pellets: 7, auto: false, ammoType: 'shell', range: 360,
      desc: 'Xé nát bầy dị biến ở cự ly gần. Chỉ hiệu quả khi áp sát.',
      level: 1, owned: false,
    },
    {
      id: 'rifle', slot: 4, name: 'SÚNG TRƯỜNG', short: 'TRƯỜNG', icon: '≫', type: 'gun',
      damage: 27, rate: 0.112, magSize: 30, reloadTime: 1.85, spread: 0.055, bulletSpeed: 1560,
      pellets: 1, auto: true, ammoType: '556', range: 900,
      desc: 'Hỏa lực liên tục tầm xa. Vũ khí tối thượng của vùng đất chết.',
      level: 1, owned: false,
    },
  ];

  TT.AMMO = {
    '9mm': { name: 'ĐẠN 9MM', short: '9MM', color: '#e0b15c' },
    shell: { name: 'ĐẠN GHÉM', short: 'GHÉM', color: '#d97a4d' },
    '556': { name: 'ĐẠN 5.56', short: '5.56', color: '#83b874' },
  };

  TT.RES = {
    scrap: { name: 'PHẾ LIỆU', short: 'PHẾ LIỆU', icon: '⚙' },
    wood: { name: 'GỖ', short: 'GỖ', icon: '▤' },
    food: { name: 'LƯƠNG THỰC', short: 'LƯƠNG', icon: '◒' },
    parts: { name: 'LINH KIỆN', short: 'LINH KIỆN', icon: '✦' },
    medkit: { name: 'BỘ Y TẾ', short: 'Y TẾ', icon: '✚' },
  };

  /* ---------------- CÔNG TRÌNH ---------------- */
  TT.BUILD = {
    wall: {
      id: 'wall', key: '1', name: 'TƯỜNG GỖ', icon: '▬',
      desc: 'Chắn đường và hút đòn. Nâng cấp bằng cách tương tác.',
      cost: { wood: 12 }, w: 84, h: 26, hp: 400, rotatable: true,
    },
    barricade: {
      id: 'barricade', key: '2', name: 'RÀO CHẮN', icon: '⚏',
      desc: 'Rẻ, thấp, làm chậm bước tiến của dị biến.',
      cost: { wood: 7, scrap: 4 }, w: 68, h: 32, hp: 240, rotatable: true,
    },
    turret: {
      id: 'turret', key: '3', name: 'THÁP SÚNG', icon: '⌖',
      desc: 'Tự động khóa mục tiêu trong tầm 500. Có thể nâng cấp.',
      cost: { scrap: 55, parts: 2 }, w: 44, h: 44, hp: 300, rotatable: false,
    },
    medic: {
      id: 'medic', key: '4', name: 'TRẠM Y TẾ', icon: '✚',
      desc: 'Hồi máu cho bạn và đồng đội trong bán kính 150.',
      cost: { scrap: 35, wood: 10, parts: 1 }, w: 46, h: 46, hp: 200, rotatable: false,
    },
  };

  /* ---------------- KẺ ĐỊCH ---------------- */
  TT.ENEMIES = {
    walker: {
      name: 'DỊ BIẾN', hp: 48, speed: 74, damage: 9, r: 15, xp: 14,
      attackRange: 30, attackRate: 0.95, color: '#596947', dark: '#3c4933', eye: '#ffab45',
    },
    runner: {
      name: 'KẺ CHẠY', hp: 30, speed: 146, damage: 7, r: 12, xp: 12,
      attackRange: 26, attackRate: 0.7, color: '#6c6243', dark: '#443d2b', eye: '#ff8c42',
    },
    brute: {
      name: 'GÃ KHỔNG LỒ', hp: 280, speed: 50, damage: 27, r: 27, xp: 65,
      attackRange: 44, attackRate: 1.35, color: '#5d5544', dark: '#3b3429', eye: '#ff5e35',
    },
    spitter: {
      name: 'KẺ PHUN AXIT', hp: 64, speed: 62, damage: 8, r: 15, xp: 28,
      attackRange: 34, attackRate: 1.2, color: '#4e6548', dark: '#35452f', eye: '#b6e35c',
      ranged: true, range: 390, rangedRate: 2.4, projDamage: 12,
    },
    boss: {
      name: 'QUÁI VẬT CHÚA', hp: 1500, speed: 45, damage: 38, r: 42, xp: 420,
      attackRange: 62, attackRate: 1.5, color: '#6b473a', dark: '#422a22', eye: '#ff4b2e', boss: true,
    },
  };

  /* ---------------- NHIỆM VỤ ---------------- */
  TT.QUEST_DEFS = [
    {
      title: 'Máu và phế liệu', tag: 'KHỞI ĐẦU',
      desc: 'Hạ 8 dị biến quanh khu căn cứ để dọn đường.',
      stat: 'kills', target: 8, reward: { xp: 60, scrap: 30 },
    },
    {
      title: 'Nhặt nhạnh', tag: 'KHÁM PHÁ',
      desc: 'Mở 5 thùng tiếp tế, hòm hoặc xác xe trong đổ nát.',
      stat: 'loots', target: 5, reward: { xp: 75, scrap: 20, ammo9: 24 },
    },
    {
      title: 'Kho bãi', tag: 'THU THẬP',
      desc: 'Thu thập tổng cộng 80 phế liệu.',
      stat: 'scrap', target: 80, reward: { xp: 90, wood: 25, parts: 1 },
    },
    {
      title: 'Bức tường thép', tag: 'PHÒNG THỦ',
      desc: 'Xây dựng 4 công trình phòng thủ quanh căn cứ.',
      stat: 'builds', target: 4, reward: { xp: 100, wood: 30, scrap: 20 },
    },
    {
      title: 'Đêm đầu tiên', tag: 'SINH TỒN',
      desc: 'Sống sót qua đợt tấn công ban đêm đầu tiên.',
      stat: 'nights', target: 1, reward: { xp: 150, parts: 2, medkit: 1 },
    },
    {
      title: 'Người dẫn đường', tag: 'CĂN CỨ',
      desc: 'Chiêu mộ 1 người lính tại bàn chỉ huy.',
      stat: 'soldiers', target: 1, reward: { xp: 110, scrap: 35, food: 10 },
    },
    {
      title: 'Hỏa lực yểm trợ', tag: 'PHÒNG THỦ',
      desc: 'Xây dựng 2 tháp súng tự động.',
      stat: 'turrets', target: 2, reward: { xp: 160, parts: 2, scrap: 25 },
    },
    {
      title: 'Thợ săn', tag: 'CHIẾN ĐẤU',
      desc: 'Hạ tổng cộng 30 dị biến.',
      stat: 'kills', target: 30, reward: { xp: 180, ammo9: 48, scrap: 40 },
    },
    {
      title: 'Cải tiến', tag: 'NÂNG CẤP',
      desc: 'Nâng cấp vũ khí 2 lần tại căn cứ.',
      stat: 'upgrades', target: 2, reward: { xp: 170, parts: 2, scrap: 50 },
    },
    {
      title: 'Đêm thứ hai', tag: 'SINH TỒN',
      desc: 'Sống sót qua đêm thứ hai liên tiếp.',
      stat: 'nights', target: 2, reward: { xp: 240, parts: 3, wood: 40 },
    },
    {
      title: 'Kẻ khổng lồ', tag: 'NGUY HIỂM',
      desc: 'Hạ một Quái Vật Chúa xuất hiện vào đêm thứ 5.',
      stat: 'bosses', target: 1, reward: { xp: 320, scrap: 120, parts: 4, medkit: 2 },
    },
    {
      title: 'Thép và lửa', tag: 'PHÒNG THỦ',
      desc: 'Xây dựng tổng cộng 8 công trình.',
      stat: 'builds', target: 8, reward: { xp: 210, wood: 50, parts: 2 },
    },
    {
      title: 'Xác thối chất đống', tag: 'CHIẾN ĐẤU',
      desc: 'Hạ tổng cộng 70 dị biến.',
      stat: 'kills', target: 70, reward: { xp: 280, ammo9: 60, parts: 2 },
    },
    {
      title: 'Tiền tuyến', tag: 'CĂN CỨ',
      desc: 'Chiêu mộ tổng cộng 2 người lính.',
      stat: 'soldiers', target: 2, reward: { xp: 240, scrap: 70, food: 20 },
    },
  ];

  TT.QUEST_ENDLESS = [
    { title: 'Đêm không ngủ', tag: 'SINH TỒN', desc: 'Sống sót qua thêm {n} đêm nữa.', stat: 'nights', target: 2, reward: { xp: 300, parts: 3, scrap: 80 } },
    { title: 'Bãi tha ma', tag: 'CHIẾN ĐẤU', desc: 'Hạ thêm {n} dị biến.', stat: 'kills', target: 40, reward: { xp: 300, ammo9: 70, scrap: 80 } },
    { title: 'Pháo đài', tag: 'PHÒNG THỦ', desc: 'Xây thêm {n} công trình.', stat: 'builds', target: 6, reward: { xp: 280, wood: 70, parts: 3 } },
    { title: 'Tích trữ', tag: 'THU THẬP', desc: 'Thu thập thêm {n} phế liệu.', stat: 'scrap', target: 150, reward: { xp: 300, parts: 4, medkit: 1 } },
  ];

  TT.SOLDIER_NAMES = ['BẢO', 'LINH', 'HÙNG', 'MAI', 'SƠN', 'TRANG', 'KHOA', 'YẾN', 'TÙNG', 'HẠNH', 'NAM', 'THẢO'];

  TT.TIPS = [
    'Ban đêm, dị biến sẽ tấn công căn cứ theo từng đợt. Hãy xây tháp súng trước khi trời tối.',
    'Bạn có thể lướt né bằng SPACE để thoát khỏi vòng vây.',
    'Thùng vũ khí màu cam chứa súng mới. Hãy tìm chúng ở những khu đổ nát xa căn cứ.',
    'Nâng cấp vũ khí tại bàn chỉ huy giúp tăng sát thương đáng kể.',
    'Lửa trại hồi máu. Hãy quay về căn cứ khi bị thương nặng.',
    'Tường gỗ có thể sửa chữa bằng phế liệu khi bị dị biến phá hỏng.',
    'Mỗi 5 đêm, Quái Vật Chúa sẽ xuất hiện. Chuẩn bị thật nhiều đạn.',
  ];

  TT.WEAPON_UPGRADE_COST = (weapon) => ({
    scrap: 30 + weapon.level * 28,
    parts: weapon.level >= 2 ? 1 : 0,
  });
})();
