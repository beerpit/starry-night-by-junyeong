/*
 * 시각 효과 — 입자(반짝임·불꽃·소용돌이·색종이)와 완성 후 그림 속 별 반짝임.
 * 입자는 「세계 좌표(그림 위)」와 「화면 좌표(색종이)」 두 공간을 가진다.
 */
(function () {
  'use strict';
  const SNP = (window.SNP = window.SNP || {});
  const U = SNP.util;

  const STAR_COLORS = ['#fff6c2', '#ffe066', '#ffd23f', '#ffffff', '#bfe3ff', '#8fc1ff'];
  const CONFETTI = ['#ffd23f', '#fff1a8', '#5aa2ff', '#2456d6', '#ffffff', '#ff9f43', '#7be0c3'];

  class Fx {
    constructor() {
      this.parts = [];
      this.timers = [];
      this.twinkle = null;     // { lights, t }
      this.reduced = U.prefersReducedMotion();
    }

    active() { return this.parts.length > 0 || this.timers.length > 0 || !!this.twinkle; }

    clear() { this.parts = []; this.timers = []; this.twinkle = null; }

    /** 조각을 맞췄을 때: 작은 별 가루 + 둥근 빛 고리 */
    sparkle(x, y, size) {
      const n = this.reduced ? 6 : 16;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
        const v = size * (0.9 + Math.random() * 1.4);
        this.parts.push({
          sp: 'w', kind: Math.random() < 0.45 ? 'star' : 'dot', x, y,
          vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0, drag: 2.6,
          life: 0, max: 0.55 + Math.random() * 0.35, size: size * (0.05 + Math.random() * 0.06),
          color: STAR_COLORS[(Math.random() * STAR_COLORS.length) | 0], rot: Math.random() * 6, vr: 3,
        });
      }
      this.parts.push({ sp: 'w', kind: 'ring', x, y, life: 0, max: 0.5, size: size * 0.9, color: '#fff3b0' });
    }

    /** 찬스로 날아가는 조각 뒤에 남는 꼬리별 */
    trail(x, y, size) {
      if (this.reduced && Math.random() < 0.6) return;
      this.parts.push({
        sp: 'w', kind: 'star', x: x + (Math.random() - 0.5) * size * 0.3, y: y + (Math.random() - 0.5) * size * 0.3,
        vx: 0, vy: 0, g: 0, drag: 0, life: 0, max: 0.6, size: size * (0.05 + Math.random() * 0.05),
        color: STAR_COLORS[(Math.random() * 3) | 0], rot: Math.random() * 6, vr: 4,
      });
    }

    burst(x, y, size, n) {
      n = this.reduced ? Math.ceil(n / 4) : n;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = size * (0.6 + Math.random() * 2.2);
        this.parts.push({
          sp: 'w', kind: Math.random() < 0.35 ? 'star' : 'dot', x, y,
          vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: size * 0.9, drag: 1.4,
          life: 0, max: 1 + Math.random() * 0.9, size: size * (0.03 + Math.random() * 0.05),
          color: STAR_COLORS[(Math.random() * STAR_COLORS.length) | 0], rot: Math.random() * 6, vr: 2,
        });
      }
      this.parts.push({ sp: 'w', kind: 'ring', x, y, life: 0, max: 0.7, size: size * 1.6, color: '#fff7cf' });
    }

    /** 달 주위를 감도는 고흐풍 소용돌이 */
    swirl(cx, cy, radius) {
      const n = this.reduced ? 20 : 90;
      for (let i = 0; i < n; i++) {
        this.parts.push({
          sp: 'w', kind: 'swirl', cx, cy, a: (i / n) * Math.PI * 6, r: radius * (0.15 + (i / n) * 0.2),
          vr: radius * (0.35 + Math.random() * 0.25), va: 2.4 + Math.random() * 0.8,
          life: -i * 0.012, max: 2.4, size: radius * (0.02 + Math.random() * 0.025),
          color: STAR_COLORS[(Math.random() * STAR_COLORS.length) | 0],
        });
      }
    }

    confetti(vw, vh) {
      if (this.reduced) return;
      const n = Math.round(U.clamp((vw * vh) / 9000, 60, 180));
      for (let i = 0; i < n; i++) {
        this.parts.push({
          sp: 's', kind: 'confetti', x: Math.random() * vw, y: -20 - Math.random() * vh * 0.6,
          vx: (Math.random() - 0.5) * 60, vy: 90 + Math.random() * 120, g: 40, drag: 0.4,
          life: 0, max: 5 + Math.random() * 2, size: 6 + Math.random() * 7,
          color: CONFETTI[(Math.random() * CONFETTI.length) | 0], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10,
          sway: Math.random() * 6, swayA: 30 + Math.random() * 40,
        });
      }
    }

    /** 완성 축하: 그림 속 별에서 차례로 불꽃 + 달 소용돌이 + 색종이 */
    celebrate(lights, W, vw, vh) {
      const size = W * 0.05;
      const order = lights.slice().sort(() => Math.random() - 0.5);
      const shots = this.reduced ? 3 : Math.min(order.length, 12);
      for (let i = 0; i < shots; i++) {
        const L = order[i];
        this.timers.push({ at: 0.15 + i * 0.28, fn: () => this.burst(L[0], L[1], size * U.clamp(L[2] / 60, 0.6, 1.4), 34) });
      }
      const moon = lights[0];
      if (moon) this.timers.push({ at: 0.4, fn: () => this.swirl(moon[0], moon[1], moon[2] * 3.2) });
      this.timers.push({ at: 0.05, fn: () => this.confetti(vw, vh) });
      this.twinkle = { lights, t: 0 };
    }

    update(dt) {
      if (this.twinkle) this.twinkle.t += dt;
      for (let i = this.timers.length - 1; i >= 0; i--) {
        const tm = this.timers[i];
        tm.at -= dt;
        if (tm.at <= 0) { this.timers.splice(i, 1); tm.fn(); }
      }
      const out = [];
      for (const p of this.parts) {
        p.life += dt;
        if (p.life < 0) { out.push(p); continue; }
        if (p.life > p.max) continue;
        if (p.kind === 'swirl') {
          p.a += p.va * dt;
          p.r += p.vr * dt;
        } else if (p.kind !== 'ring') {
          const k = Math.max(0, 1 - p.drag * dt);
          p.vx *= k; p.vy = p.vy * k + p.g * dt;
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.vr) p.rot += p.vr * dt;
          if (p.kind === 'confetti') p.x += Math.sin(p.life * 3 + p.sway) * p.swayA * dt;
        }
        out.push(p);
      }
      this.parts = out;
    }

    /** 세계 좌표 효과(그림 위). ctx 는 이미 세계 변환이 걸린 상태 */
    drawWorld(ctx) {
      if (this.twinkle) this.drawTwinkle(ctx);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const p of this.parts) {
        if (p.sp !== 'w' || p.life < 0) continue;
        const k = p.life / p.max;
        const a = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
        ctx.globalAlpha = U.clamp(a, 0, 1);
        if (p.kind === 'ring') {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size * 0.08 * (1 - k);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (0.3 + k * 0.9), 0, Math.PI * 2);
          ctx.stroke();
        } else if (p.kind === 'swirl') {
          const x = p.cx + Math.cos(p.a) * p.r, y = p.cy + Math.sin(p.a) * p.r * 0.8;
          dot(ctx, x, y, p.size, p.color);
        } else if (p.kind === 'star') {
          star(ctx, p.x, p.y, p.size * 1.6, p.rot, p.color);
        } else {
          dot(ctx, p.x, p.y, p.size, p.color);
        }
      }
      ctx.restore();
    }

    /** 화면 좌표 효과(색종이). ctx 는 CSS 픽셀 단위 변환 상태 */
    drawScreen(ctx) {
      for (const p of this.parts) {
        if (p.sp !== 's' || p.life < 0) continue;
        const k = p.life / p.max;
        ctx.globalAlpha = k > 0.8 ? (1 - k) / 0.2 : 1;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(1, Math.abs(Math.cos(p.rot * 1.3)) * 0.8 + 0.2);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    drawTwinkle(ctx) {
      const t = this.twinkle.t;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const fadeIn = U.clamp(t / 1.2, 0, 1);
      this.twinkle.lights.forEach((L, i) => {
        const [x, y, r] = L;
        const ph = i * 1.7;
        const a = fadeIn * (0.28 + 0.22 * Math.sin(t * 2.2 + ph));
        const R = r * (1.5 + 0.25 * Math.sin(t * 1.4 + ph));
        const g = ctx.createRadialGradient(x, y, 0, x, y, R);
        g.addColorStop(0, `rgba(255,248,200,${a})`);
        g.addColorStop(0.45, `rgba(255,226,120,${a * 0.45})`);
        g.addColorStop(1, 'rgba(255,220,120,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, R, 0, Math.PI * 2);
        ctx.fill();
        if (r > 25) {
          // 큰 별은 십자 빛살
          ctx.globalAlpha = fadeIn * (0.35 + 0.3 * Math.sin(t * 3 + ph));
          star(ctx, x, y, R * 1.25, 0.2 * Math.sin(t * 0.7 + ph), '#fffbe0', 0.07);
          ctx.globalAlpha = 1;
        }
      });
      ctx.restore();
    }
  }

  function dot(ctx, x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  /** 네 갈래 반짝별 */
  function star(ctx, x, y, r, rot, color, thin) {
    const k = thin || 0.22;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot || 0);
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const rr = i % 2 === 0 ? r : r * k;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  SNP.Fx = Fx;
  SNP.fxShapes = { star, dot };
})();
