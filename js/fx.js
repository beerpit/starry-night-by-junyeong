/* 효과: 조각 맞춤 반짝임, 완성 축하(그림 속 별 반짝임 · 빛줄기 · 별 꽃가루 · 불꽃). 게임 캔버스 위의 별도 캔버스에 그린다. */
'use strict';
(function (SN) {
  const COLORS = ['#ffd84a', '#fff3b0', '#ffe98a', '#7ec8ff', '#3a6df0', '#ffffff', '#ffb3d9', '#9ff0c9'];
  let cv = null, g = null, dpr = 1, raf = 0;
  let parts = [];
  let cele = null; // 축하 상태

  function resize() {
    if (!cv) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(cv.clientWidth * dpr);
    cv.height = Math.round(cv.clientHeight * dpr);
  }

  function starPath(ctx, r, spikes = 5, inner = 0.45) {
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const rr = i % 2 ? r * inner : r, a = (i * Math.PI) / spikes - Math.PI / 2;
      i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
  }

  function loop(ts) {
    raf = 0;
    const W = cv.width / dpr, H = cv.height / dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const now = performance.now();
    // 축하: 빛줄기·그림 속 별
    if (cele) {
      const t = (now - cele.t0) / 1000;
      drawCelebration(t, W, H);
      if (!SN.env.reducedMotion && t < cele.fireworksFor && now - cele.lastBurst > cele.burstEvery) {
        cele.lastBurst = now;
        burst(W * (0.12 + Math.random() * 0.76), H * (0.1 + Math.random() * 0.4), 46);
      }
      if (t < 2.6 && Math.random() < (SN.env.reducedMotion ? 0.15 : 0.9)) confetti(W, 3);
    }
    // 입자
    const dt = 1 / 60;
    parts = parts.filter((p) => (p.life -= dt) > 0);
    for (const p of parts) {
      p.vx *= p.drag; p.vy = p.vy * p.drag + p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
      const a = Math.min(1, p.life / p.fade);
      g.save();
      g.globalAlpha = a;
      g.translate(p.x, p.y); g.rotate(p.rot);
      g.fillStyle = p.color;
      if (p.kind === 'star') { starPath(g, p.size); g.fill(); }
      else if (p.kind === 'rect') { g.scale(1, Math.abs(Math.cos(p.rot * 2.3))); g.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size); }
      else { g.globalCompositeOperation = 'lighter'; g.beginPath(); g.arc(0, 0, p.size, 0, Math.PI * 2); g.fill(); }
      g.restore();
    }
    if (parts.length || cele) raf = requestAnimationFrame(loop);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };

  function burst(x, y, n) {
    const hue = COLORS[Math.floor(Math.random() * COLORS.length)];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.2, sp = 140 + Math.random() * 160;
      parts.push({ kind: 'dot', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, grav: 120, drag: 0.965, size: 1.6 + Math.random() * 1.6, rot: 0, spin: 0, life: 1.1 + Math.random() * 0.5, fade: 0.6, color: Math.random() < 0.3 ? '#fff' : hue });
    }
  }
  function confetti(W, n) {
    for (let i = 0; i < n; i++) {
      parts.push({
        kind: Math.random() < 0.55 ? 'star' : 'rect', x: Math.random() * W, y: -12,
        vx: (Math.random() - 0.5) * 60, vy: 60 + Math.random() * 90, grav: 60, drag: 0.995,
        size: 4 + Math.random() * 5, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 8,
        life: 4 + Math.random() * 2, fade: 1, color: COLORS[Math.floor(Math.random() * COLORS.length)],
      });
    }
  }

  function drawCelebration(t, W, H) {
    const c = cele;
    const r = c.getRect(); // 화면상의 그림 사각형 (카메라가 바뀌어도 따라감)
    // 1) 그림 위를 지나가는 빛줄기 (팔레트 모양으로 잘라서)
    const sweep = (t % 3.2) / 1.6; // 0~2 : 앞 1.6초 동안 지나감
    if (sweep <= 1 && r.w > 4) {
      const sw = Math.ceil(r.w), sh = Math.ceil(r.h);
      if (!c.sheen || c.sheen.width !== sw || c.sheen.height !== sh) c.sheen = SN.canvas(sw, sh);
      const sg = c.sheen.getContext('2d');
      sg.globalCompositeOperation = 'source-over';
      sg.clearRect(0, 0, sw, sh);
      sg.drawImage(c.img, 0, 0, sw, sh);
      sg.globalCompositeOperation = 'source-in';
      const x = SN.lerp(-0.4, 1.4, SN.easeInOutCubic(sweep)) * sw;
      const grad = sg.createLinearGradient(x - sw * 0.18, 0, x + sw * 0.18, sh * 0.3);
      grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(0.5, 'rgba(255,250,215,0.55)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
      sg.fillStyle = grad; sg.fillRect(0, 0, sw, sh);
      g.save(); g.globalCompositeOperation = 'lighter'; g.drawImage(c.sheen, r.x, r.y, r.w, r.h); g.restore();
    }
    // 2) 그림 속 별과 달이 차례로 반짝반짝
    const unit = r.w / 1000;
    c.stars.forEach((s, i) => {
      const local = t - i * 0.18;
      if (local < 0) return;
      const pop = Math.min(1, local / 0.5);
      const pulse = 0.75 + 0.25 * Math.sin(local * 3.2 + i);
      const x = r.x + s[0] * r.w, y = r.y + s[1] * r.h, R = s[2] * unit * (0.8 + 0.4 * SN.easeOutBack(pop)) * pulse;
      g.save();
      g.globalCompositeOperation = 'lighter';
      const rg = g.createRadialGradient(x, y, 0, x, y, R * 2.4);
      rg.addColorStop(0, 'rgba(255,250,210,0.85)'); rg.addColorStop(0.35, 'rgba(255,225,120,0.35)'); rg.addColorStop(1, 'rgba(255,220,120,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(x, y, R * 2.4, 0, Math.PI * 2); g.fill();
      // 빛살
      g.translate(x, y); g.rotate(local * 0.6 + i);
      g.fillStyle = 'rgba(255,245,200,0.55)';
      for (let k = 0; k < 4; k++) {
        g.rotate(Math.PI / 4);
        g.beginPath(); g.moveTo(0, -R * 3.2 * pulse); g.lineTo(R * 0.12, 0); g.lineTo(0, R * 3.2 * pulse); g.lineTo(-R * 0.12, 0); g.closePath(); g.fill();
      }
      g.restore();
      if (local > 0.2 && Math.random() < 0.06) SN.fx.sparkle(x + (Math.random() - 0.5) * R * 2, y + (Math.random() - 0.5) * R * 2, 2);
    });
  }

  SN.fx = {
    init(canvas) {
      cv = canvas; g = cv.getContext('2d');
      resize(); window.addEventListener('resize', () => { resize(); kick(); });
    },
    resize,
    // 조각이 제자리에 들어갔을 때
    sparkle(x, y, n = 14, big = false) {
      if (!cv) return;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, sp = (big ? 120 : 60) + Math.random() * (big ? 160 : 90);
        parts.push({ kind: Math.random() < 0.5 ? 'star' : 'dot', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, grav: 90, drag: 0.94, size: 2 + Math.random() * (big ? 5 : 3.5), rot: Math.random() * 6, spin: (Math.random() - 0.5) * 10, life: 0.6 + Math.random() * 0.5, fade: 0.4, color: COLORS[Math.floor(Math.random() * 3)] });
      }
      kick();
    },
    // 완성 축하 시작. getRect(): 화면상의 그림 사각형, stars: [[x비율, y비율, 반지름(그림폭 1000 기준)]...]
    celebrate({ getRect, img, stars }) {
      if (!cv) return;
      cele = { t0: performance.now(), getRect, img, stars, lastBurst: 0, burstEvery: 380, fireworksFor: 4.2, sheen: null };
      kick();
    },
    stop() { cele = null; parts = []; if (g) { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); } },
    get active() { return !!cele; },
  };
})(window.SN);
