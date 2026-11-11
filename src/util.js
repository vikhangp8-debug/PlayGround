export const TAU = Math.PI * 2;

export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
export const dist2 = (ax, ay, bx, by) => {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
};
export const rand = (min = 0, max = 1) => min + Math.random() * (max - min);
export const randInt = (min, max) => Math.floor(rand(min, max + 1));
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const chance = (p) => Math.random() < p;
export const sign = (v) => (v < 0 ? -1 : 1);

export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function lerpAngle(a, b, t) {
  return a + angleDiff(a, b) * t;
}

export function approach(current, target, amount) {
  if (current < target) return Math.min(current + amount, target);
  return Math.max(current - amount, target);
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function resolveCircleRect(ent, rect) {
  const nx = clamp(ent.x, rect.x, rect.x + rect.w);
  const ny = clamp(ent.y, rect.y, rect.y + rect.h);
  let dx = ent.x - nx;
  let dy = ent.y - ny;
  let d2 = dx * dx + dy * dy;
  if (d2 >= ent.r * ent.r) return false;
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    const push = ent.r - d + 0.01;
    ent.x += (dx / d) * push;
    ent.y += (dy / d) * push;
  } else {
    // Center is inside the rectangle: push out along the shortest axis.
    const left = ent.x - rect.x;
    const right = rect.x + rect.w - ent.x;
    const top = ent.y - rect.y;
    const bottom = rect.y + rect.h - ent.y;
    const m = Math.min(left, right, top, bottom);
    if (m === left) ent.x = rect.x - ent.r;
    else if (m === right) ent.x = rect.x + rect.w + ent.r;
    else if (m === top) ent.y = rect.y - ent.r;
    else ent.y = rect.y + rect.h + ent.r;
  }
  return true;
}

export function resolveCircleCircle(ent, circle) {
  const dx = ent.x - circle.x;
  const dy = ent.y - circle.y;
  const rr = ent.r + circle.r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr) return false;
  const d = Math.sqrt(d2) || 0.001;
  ent.x = circle.x + (dx / d) * rr;
  ent.y = circle.y + (dy / d) * rr;
  return true;
}

export function segmentCircle(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = 0;
  if (len2 > 0) t = clamp(((cx - x1) * dx + (cy - y1) * dy) / len2, 0, 1);
  const px = x1 + dx * t;
  const py = y1 + dy * t;
  const dd = (cx - px) ** 2 + (cy - py) ** 2;
  return dd <= r * r;
}

export function segmentRect(x1, y1, x2, y2, rect) {
  let tmin = 0;
  let tmax = 1;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - rect.x, rect.x + rect.w - x1, y1 - rect.y, rect.y + rect.h - y1];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-9) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > tmax) return false;
        if (t > tmin) tmin = t;
      } else {
        if (t < tmin) return false;
        if (t < tmax) tmax = t;
      }
    }
  }
  return tmin <= tmax;
}

export function formatClock(t) {
  const total = (6 + t * 24) % 24;
  const h = Math.floor(total);
  const m = Math.floor((total - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function initials(text) {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}
