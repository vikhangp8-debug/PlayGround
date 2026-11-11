import { clamp } from './util.js';

class Stick {
  constructor(el) {
    this.el = el;
    this.thumb = el.querySelector('.stick-thumb');
    this.x = 0;
    this.y = 0;
    this.active = false;
    this.pointerId = null;
    this.radius = 44;
    this.bind();
  }

  bind() {
    const el = this.el;
    el.addEventListener('pointerdown', (e) => {
      if (this.pointerId !== null) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = el.getBoundingClientRect();
      this.radius = Math.max(30, Math.min(rect.width, rect.height) * 0.33);
      this.baseX = rect.left + rect.width / 2;
      this.baseY = rect.top + rect.height / 2;
      this.pointerId = e.pointerId;
      this.active = true;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      this.updateFrom(e.clientX, e.clientY);
      el.classList.add('active');
    });
    const move = (e) => {
      if (e.pointerId !== this.pointerId) return;
      e.preventDefault();
      this.updateFrom(e.clientX, e.clientY);
    };
    const end = (e) => {
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = null;
      this.active = false;
      this.x = 0;
      this.y = 0;
      el.classList.remove('active');
      this.renderThumb();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
  }

  updateFrom(cx, cy) {
    const dx = cx - this.baseX;
    const dy = cy - this.baseY;
    const len = Math.hypot(dx, dy);
    const max = this.radius;
    const scale = len > max ? max / len : 1;
    this.x = (dx * scale) / max;
    this.y = (dy * scale) / max;
    this.renderThumb();
  }

  renderThumb() {
    if (!this.thumb) return;
    const travel = this.radius * 0.92;
    this.thumb.style.transform = `translate(calc(-50% + ${this.x * travel}px), calc(-50% + ${this.y * travel}px))`;
  }

  get magnitude() {
    return Math.min(1, Math.hypot(this.x, this.y));
  }
}

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2, down: false, pressed: false };
    this.wheel = 0;
    this.touch = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    this.moveStick = null;
    this.aimStick = null;
    this.bind();
  }

  bind() {
    window.addEventListener('keydown', (e) => {
      if (['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        if (document.activeElement?.tagName !== 'INPUT') e.preventDefault();
      }
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    }, { passive: false });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.down = false;
    });

    const rectPos = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      return { x: ((e.clientX - rect.left) / rect.width) * rect.width, y: ((e.clientY - rect.top) / rect.height) * rect.height };
    };
    this.canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const p = rectPos(e);
      this.mouse.x = p.x;
      this.mouse.y = p.y;
    });
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      const p = rectPos(e);
      this.mouse.x = p.x;
      this.mouse.y = p.y;
      if (e.button === 0) {
        this.mouse.down = true;
        this.mouse.pressed = true;
      }
      this.canvas.setPointerCapture?.(e.pointerId);
    });
    window.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') return;
      if (e.button === 0) this.mouse.down = false;
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.wheel += Math.sign(e.deltaY);
    }, { passive: false });
  }

  attachSticks() {
    const move = document.getElementById('moveStick');
    const aim = document.getElementById('aimStick');
    if (move) this.moveStick = new Stick(move);
    if (aim) this.aimStick = new Stick(aim);
  }

  wasPressed(code) {
    return this.pressed.has(code);
  }

  get moveVector() {
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;
    if (this.moveStick && this.moveStick.active) {
      const sx = this.moveStick.x;
      const sy = this.moveStick.y;
      const m = Math.hypot(sx, sy);
      if (m > 0.16) {
        x = sx;
        y = sy;
      }
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y, magnitude: Math.min(1, len) };
  }

  get aimVector() {
    if (this.aimStick && this.aimStick.active && this.aimStick.magnitude > 0.2) {
      return { x: this.aimStick.x, y: this.aimStick.y, active: true };
    }
    return { x: 0, y: 0, active: false };
  }

  get firing() {
    if (this.aimStick && this.aimStick.active && this.aimStick.magnitude > 0.22) return true;
    return this.mouse.down || this.keys.has('Space');
  }

  get sprint() {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  consumeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  endFrame() {
    this.pressed.clear();
    this.mouse.pressed = false;
  }

  clear() {
    this.keys.clear();
    this.pressed.clear();
    this.mouse.down = false;
    this.wheel = 0;
  }
}

export { clamp };
