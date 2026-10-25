/* 별이 빛나는 밤 퍼즐 — 공통 유틸리티
 * 모든 스크립트는 빌드 도구 없이 file:// 에서도 돌도록 고전 스크립트 + 전역 이름공간(window.SN)을 쓴다. */
'use strict';
window.SN = window.SN || {};

(function (SN) {
  // ── 시드 난수 (mulberry32): 같은 시드 → 같은 조각 모양 (이어 하기 복원용)
  SN.rng = function (seed) {
    let a = seed >>> 0;
    const f = function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.range = (lo, hi) => lo + (hi - lo) * f();
    f.int = (n) => Math.floor(f() * n);
    f.pick = (arr) => arr[Math.floor(f() * arr.length)];
    f.shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(f() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
    return f;
  };
  SN.newSeed = () => (Math.random() * 0x7fffffff) | 0;

  SN.clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  SN.lerp = (a, b, t) => a + (b - a) * t;
  SN.easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  SN.easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  SN.easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

  // 90° 단위 회전: r ∈ {0,1,2,3} (시계 방향)
  SN.rot90 = function (x, y, r) {
    switch (((r % 4) + 4) % 4) {
      case 1: return [-y, x];
      case 2: return [-x, -y];
      case 3: return [y, -x];
      default: return [x, y];
    }
  };

  SN.fmtTime = function (sec) {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const mm = String(m).padStart(h ? 2 : 1, '0'), ss = String(s).padStart(2, '0');
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  };

  // ── 저장소 (localStorage, 실패해도 게임은 계속)
  const PREFIX = 'sn.';
  SN.store = {
    get(key, def) {
      try { const v = localStorage.getItem(PREFIX + key); return v == null ? def : JSON.parse(v); } catch (e) { return def; }
    },
    set(key, val) {
      try { localStorage.setItem(PREFIX + key, JSON.stringify(val)); return true; } catch (e) { return false; }
    },
    del(key) { try { localStorage.removeItem(PREFIX + key); } catch (e) { /* 무시 */ } },
  };

  SN.el = function (tag, attrs, ...children) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
    return e;
  };

  SN.canvas = function (w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  };

  // 환경 판별
  SN.env = {
    touch: ('ontouchstart' in window) || navigator.maxTouchPoints > 0,
    // iPadOS 사파리는 UA 가 Macintosh — 터치 점 수로 판별
    ios: /iP(hone|od|ad)/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1),
    reducedMotion: window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    fullscreen: !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen),
  };

  // 간단한 이벤트 버스
  const handlers = {};
  SN.on = (name, f) => { (handlers[name] = handlers[name] || []).push(f); };
  SN.emit = (name, ...args) => { (handlers[name] || []).forEach((f) => { try { f(...args); } catch (e) { console.error(e); } }); };
})(window.SN);
