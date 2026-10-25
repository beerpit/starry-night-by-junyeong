/* 공용 도우미: 난수, 수학, 저장소, 캔버스, 데이터 디코딩 */
(function () {
  'use strict';
  const SNP = (window.SNP = window.SNP || {});

  const PREFIX = 'snp:v1:';

  const util = {
    /** 시드가 같으면 어느 기기에서나 같은 수열을 내는 32비트 난수 생성기 */
    mulberry32(seed) {
      let a = seed >>> 0;
      return function () {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
    newSeed() {
      if (window.crypto && crypto.getRandomValues) {
        const a = new Uint32Array(1);
        crypto.getRandomValues(a);
        return a[0] || 1;
      }
      return (Math.random() * 4294967295) >>> 0 || 1;
    },
    shuffle(arr, rnd) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    },

    clamp: (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v),
    lerp: (a, b, t) => a + (b - a) * t,
    easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
    easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    easeOutBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },

    /** 밀리초 → 「3:07」 또는 「1:02:03」 */
    fmtTime(ms) {
      const s = Math.max(0, Math.floor(ms / 1000));
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
      const p = (n) => (n < 10 ? '0' : '') + n;
      return h > 0 ? `${h}:${p(m)}:${p(ss)}` : `${m}:${p(ss)}`;
    },
    /** 밀리초 → 「3분 7초」 (읽기 쉬운 말) */
    fmtTimeWords(ms) {
      const s = Math.max(0, Math.round(ms / 1000));
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
      const out = [];
      if (h) out.push(h + '시간');
      if (m) out.push(m + '분');
      if (ss || !out.length) out.push(ss + '초');
      return out.join(' ');
    },

    /** localStorage (사파리 사생활 보호 모드 등에서 실패해도 게임은 계속) */
    store: {
      get(key, def) {
        try {
          const v = localStorage.getItem(PREFIX + key);
          return v == null ? def : JSON.parse(v);
        } catch (e) { return def; }
      },
      set(key, val) {
        try { localStorage.setItem(PREFIX + key, JSON.stringify(val)); return true; } catch (e) { return false; }
      },
      del(key) { try { localStorage.removeItem(PREFIX + key); } catch (e) { /* 무시 */ } },
      keys() {
        const out = [];
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.indexOf(PREFIX) === 0) out.push(k.slice(PREFIX.length));
          }
        } catch (e) { /* 무시 */ }
        return out;
      },
    },

    b64ToBytes(b64) {
      const bin = atob(b64);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    },
    /** MSB 먼저 비트 패킹된 base64 → 0/1 배열 */
    decodeBits(b64, n) {
      const bytes = util.b64ToBytes(b64);
      const out = new Uint8Array(n);
      for (let i = 0; i < n; i++) out[i] = (bytes[i >> 3] >> (7 - (i & 7))) & 1;
      return out;
    },

    makeCanvas(w, h) {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.ceil(w));
      c.height = Math.max(1, Math.ceil(h));
      return c;
    },
    /** iOS 사파리는 캔버스 메모리를 늦게 돌려주므로 다 쓴 캔버스는 크기를 0 으로 */
    freeCanvas(c) {
      if (c) { c.width = 0; c.height = 0; }
    },

    /** 작은 DOM 생성 도우미: el('div', {class:'x', onclick:fn}, [자식...]) */
    el(tag, attrs, children) {
      const e = document.createElement(tag);
      if (attrs) {
        for (const k in attrs) {
          const v = attrs[k];
          if (v == null || v === false) continue;
          if (k === 'class') e.className = v;
          else if (k === 'text') e.textContent = v;
          else if (k === 'html') e.innerHTML = v;
          else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
          else e.setAttribute(k, v === true ? '' : v);
        }
      }
      if (children) {
        for (const c of [].concat(children)) {
          if (c == null || c === false) continue;
          e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
        }
      }
      return e;
    },
    icon(name, cls) {
      const ns = 'http://www.w3.org/2000/svg';
      const s = document.createElementNS(ns, 'svg');
      s.setAttribute('class', 'ico' + (cls ? ' ' + cls : ''));
      s.setAttribute('aria-hidden', 'true');
      const u = document.createElementNS(ns, 'use');
      u.setAttribute('href', '#i-' + name);
      s.appendChild(u);
      return s;
    },
    nextFrame() { return new Promise((r) => requestAnimationFrame(() => r())); },
    sleep(ms) { return new Promise((r) => setTimeout(r, ms)); },
    prefersReducedMotion() {
      return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    },
  };

  SNP.util = util;
})();
