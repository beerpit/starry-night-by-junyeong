/*
 * 퍼즐 판 엔진 — 탁자 배치, 화면 변환(확대·이동), 입력(마우스·터치·펜), 맞추기, 찬스, 정리, 완성, 저장.
 *
 * 좌표계
 *   세계(world) = 그림 픽셀 좌표. 그림(판)은 (0,0)~(W,H), 흩어진 조각은 판 바깥 「탁자」 위에 놓인다.
 *   화면(screen) = CSS 픽셀. screen = world × view.s + (view.ox, view.oy)
 *   조각 위치 p.x, p.y = 조각 경계 상자(rect)의 왼쪽 위가 놓인 세계 좌표. 제자리 = (rect.x, rect.y)
 */
(function () {
  'use strict';
  const SNP = (window.SNP = window.SNP || {});
  const U = SNP.util;

  const TAP_MOVE = 7;       // 이 거리(CSS px) 안에서 떼면 「탭」
  const TAP_TIME = 350;

  class Game {
    /**
     * @param o.canvas, o.board(디코딩된 판 데이터), o.img, o.level, o.seed, o.rotate, o.saved, o.cb(콜백 모음)
     */
    constructor(o) {
      this.canvas = o.canvas;
      this.ctx = this.canvas.getContext('2d');
      this.board = o.board;
      this.img = o.img;
      this.level = o.level;
      this.seed = o.seed;
      this.rotate = !!o.rotate;
      this.saved = o.saved || null;
      this.cb = o.cb || {};
      this.W = this.board.W;
      this.H = this.board.H;

      this.pieces = [];
      this.order = [];           // 흩어진 조각의 쌓인 순서(뒤 → 앞)
      this.placedCount = 0;
      this.view = { s: 1, ox: 0, oy: 0 };
      this.fitScale = 1;
      this.vw = 1; this.vh = 1; this.dpr = 1;
      this.layout = null;
      this.pointers = new Map();
      this.drag = null; this.pan = null; this.pinch = null;
      this.tweens = [];
      this.fx = new SNP.Fx();
      this.selected = -1;
      this.ghost = 0;            // 밑그림: 0 끔, 1 연하게, 2 진하게
      this.elapsed = 0;
      this.running = false;
      this.completed = false;
      this.reveal = -1;          // 완성 후 원본 그림이 서서히 드러나는 정도(0~1)
      this.chancesMax = this.level.chances;
      this.chancesLeft = this.level.chances;
      this.chancesUsed = 0;
      this.combo = 0;
      this.lastPlaceAt = 0;
      this.raf = 0;
      this.lastFrame = 0;
      this.destroyed = false;
      this._bind();
    }

    // ===================================================================== 준비
    async init(onLoading) {
      const B = this.board;
      const gen = await SNP.jigsaw.generate({
        W: B.W, H: B.H, mask: B.mask, maskW: B.maskW, maskH: B.maskH, step: B.step,
        cols: this.level.cols, rows: this.level.rows, seed: this.seed,
        luma: B.luma, lumaW: B.lumaW, lumaH: B.lumaH, lumaStep: B.lumaStep,
      }, (k) => onLoading && onLoading(k * 0.7));
      if (this.destroyed) return;
      this.gen = gen;
      this.pieces = gen.pieces;
      const baked = await SNP.pieces.bake(gen, this.img, (k) => onLoading && onLoading(0.7 + k * 0.28));
      if (this.destroyed) return;
      this.pad = baked.pad;
      this.cell = Math.min(gen.cw, gen.ch);
      this.hitCanvas = U.makeCanvas(this.W, this.H);
      this.hit = this.hitCanvas.getContext('2d');
      this.placedLayer = U.makeCanvas(this.W, this.H);
      this.placedCtx = this.placedLayer.getContext('2d');
      this._buildSlot();
      let avgW = 0, avgH = 0, need = 0;
      this.pieces.forEach((p) => {
        p.x = p.rect.x; p.y = p.rect.y; p.rot = 0; p.placed = false; p.anim = false;
        avgW += p.rect.w; avgH += p.rect.h;
        need += p.rect.w * p.rect.h;
      });
      this.avgW = avgW / this.pieces.length;
      this.avgH = avgH / this.pieces.length;
      // 자리 크기는 큰 조각(상위 25%) 기준 → 합쳐진 큰 조각도 이웃과 덜 겹친다
      const p75 = (arr) => { const a = arr.slice().sort((x, y) => x - y); return a[Math.floor(a.length * 0.75)]; };
      this.slotW = p75(this.pieces.map((p) => p.rect.w));
      this.slotH = p75(this.pieces.map((p) => p.rect.h));
      // 탁자에 필요한 빈 넓이: 자리 넓이 × 조각 수 × 0.82 (꼭지끼리 살짝 맞물려 놓여도 괜찮은 정도)
      this.needArea = Math.max(need * 0.95, this.pieces.length * this.slotW * this.slotH * 0.82);
      this.order = this.pieces.map((p) => p.id);

      this.ready = true;      // 이 시점부터 resize·그리기 허용(굽기 도중 ResizeObserver 가 불러도 안전)
      this.resize(true);
      const restored = this.saved && this._restore(this.saved);
      if (!restored) {
        this.arrange(this._shuffledIds(), { jitter: true, randomRotate: this.rotate, animate: false });
      }
      this.running = !this.completed;
      this.lastTick = performance.now();
      this.timer = setInterval(() => this._tick(), 250);
      if (onLoading) onLoading(1);
      this._emitProgress();
      this.requestRender();
    }

    _shuffledIds() {
      const rnd = U.mulberry32(this.seed ^ 0x9e3779b9);
      return U.shuffle(this.pieces.map((p) => p.id), rnd);
    }

    /** 판 자리: 팔레트 실루엣(어두운 안쪽 + 밝은 테두리). 반 해상도로 만들어 메모리 절약 */
    _buildSlot() {
      const k = 0.5, sp = 10;
      const w = (this.W + sp * 2) * k, h = (this.H + sp * 2) * k;
      const make = (color) => {
        const c = U.makeCanvas(w, h), x = c.getContext('2d');
        x.drawImage(this.img, sp * k, sp * k, this.W * k, this.H * k);
        x.globalCompositeOperation = 'source-in';
        x.fillStyle = color;
        x.fillRect(0, 0, w, h);
        return c;
      };
      const light = make('rgba(170, 200, 255, 0.55)');
      const dark = make('rgba(2, 8, 32, 0.6)');
      const slot = U.makeCanvas(w, h), s = slot.getContext('2d');
      const o = 2.2;
      [[o, 0], [-o, 0], [0, o], [0, -o], [o * 0.7, o * 0.7], [-o * 0.7, o * 0.7], [o * 0.7, -o * 0.7], [-o * 0.7, -o * 0.7]]
        .forEach(([dx, dy]) => s.drawImage(light, dx, dy));
      s.globalCompositeOperation = 'destination-out';
      s.drawImage(dark, 0, 0);
      s.globalCompositeOperation = 'source-over';
      s.drawImage(dark, 0, 0);
      U.freeCanvas(light); U.freeCanvas(dark);
      this.slot = slot;
      this.slotPad = sp;
    }

    // ===================================================================== 배치·화면
    /** 화면 비율에 맞춰 판 옆(가로 화면) 또는 아래(세로 화면)에 조각 놓을 탁자를 만든다 */
    computeLayout(vw, vh) {
      const W = this.W, H = this.H;
      const g = Math.max(W, H) * 0.035;
      const A = vw / Math.max(1, vh);
      const need = this.needArea;
      const fitTo = (tw, th) => { if (tw / th < A) tw = A * th; else th = tw / A; return [tw, th]; };

      let [sw, sh] = fitTo(W + 2 * g + need / (H + 2 * g), H + 2 * g);
      let [bw, bh] = fitTo(W + 2 * g, H + 2 * g + need / (W + 2 * g));
      const sideScale = vw / sw, bottomScale = vw / bw;
      let mode, T;
      if (sideScale >= bottomScale) {
        mode = 'side';
        T = { x: W / 2 - sw / 2, y: H / 2 - sh / 2, w: sw, h: sh };
      } else {
        mode = 'bottom';
        // 판은 위쪽, 남는 공간은 아래로
        T = { x: W / 2 - bw / 2, y: -g * 1.2, w: bw, h: bh };
      }
      const Bx = -g, By = -g, Bw = W + 2 * g, Bh = H + 2 * g;
      const free = [
        { x: T.x, y: T.y, w: Bx - T.x, h: T.h },                                  // 왼쪽
        { x: Bx + Bw, y: T.y, w: T.x + T.w - (Bx + Bw), h: T.h },                 // 오른쪽
        { x: Bx, y: T.y, w: Bw, h: By - T.y },                                    // 위
        { x: Bx, y: By + Bh, w: Bw, h: T.y + T.h - (By + Bh) },                   // 아래
      ].map((r) => {
        // 탁자 바깥 가장자리에 닿는 변은 조금 안으로(조각이 화면 끝에서 잘리지 않게)
        const m = this.cell * 0.15;
        const x0 = r.x + (Math.abs(r.x - T.x) < 1 ? m : 0), y0 = r.y + (Math.abs(r.y - T.y) < 1 ? m : 0);
        const x1 = r.x + r.w - (Math.abs(r.x + r.w - (T.x + T.w)) < 1 ? m : 0);
        const y1 = r.y + r.h - (Math.abs(r.y + r.h - (T.y + T.h)) < 1 ? m : 0);
        return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      }).filter((r) => r.w > this.cell * 0.6 && r.h > this.cell * 0.6);
      return { mode, table: T, free, gap: g };
    }

    resize(initial) {
      const r = this.canvas.parentElement.getBoundingClientRect();
      const vw = Math.max(1, Math.round(r.width)), vh = Math.max(1, Math.round(r.height));
      // 아이폰 등 캔버스 최대 면적(약 1,670만 화소) 아래로 기기 배율 제한
      let dpr = window.devicePixelRatio || 1;
      while (vw * vh * dpr * dpr > 16e6 && dpr > 1) dpr -= 0.25;
      const changed = vw !== this.vw || vh !== this.vh || dpr !== this.dpr;
      this.vw = vw; this.vh = vh; this.dpr = dpr;
      this.canvas.width = Math.round(vw * dpr);
      this.canvas.height = Math.round(vh * dpr);
      this.canvas.style.width = vw + 'px';
      this.canvas.style.height = vh + 'px';
      if (!this.ready) return;
      const prev = this.layout;
      this.layout = this.computeLayout(vw, vh);
      if (!initial && prev && changed) {
        // 화면 방향이 바뀌었거나 탁자 밖으로 밀려난 조각이 있으면 흩어진 조각을 새 탁자로 정리
        const out = this._looseIds().some((id) => !this._insideTable(this.pieces[id]));
        if (prev.mode !== this.layout.mode || out) this.arrange(this._sortedForTidy(), { animate: true });
      }
      this.fit();
    }

    fit() {
      if (!this.layout) return;
      const T = this.layout.table;
      const s = Math.min(this.vw / T.w, this.vh / T.h);
      this.fitScale = s;
      this.view = { s, ox: (this.vw - T.w * s) / 2 - T.x * s, oy: (this.vh - T.h * s) / 2 - T.y * s };
      this.requestRender();
    }

    _clampView() {
      const T = this.layout.table, v = this.view;
      v.s = U.clamp(v.s, this.fitScale * 0.9, this.fitScale * 6);
      // 화면 가운데가 늘 탁자 안에 있게
      const cx = (this.vw / 2 - v.ox) / v.s, cy = (this.vh / 2 - v.oy) / v.s;
      const ncx = U.clamp(cx, T.x, T.x + T.w), ncy = U.clamp(cy, T.y, T.y + T.h);
      v.ox = this.vw / 2 - ncx * v.s;
      v.oy = this.vh / 2 - ncy * v.s;
    }

    zoomBy(f, sx, sy) {
      if (!this.layout) return;
      if (sx == null) { sx = this.vw / 2; sy = this.vh / 2; }
      const v = this.view;
      const wx = (sx - v.ox) / v.s, wy = (sy - v.oy) / v.s;
      v.s *= f;
      v.s = U.clamp(v.s, this.fitScale * 0.9, this.fitScale * 6);
      v.ox = sx - wx * v.s;
      v.oy = sy - wy * v.s;
      this._clampView();
      this.requestRender();
    }

    toWorld(sx, sy) { return { x: (sx - this.view.ox) / this.view.s, y: (sy - this.view.oy) / this.view.s }; }
    toScreen(wx, wy) { return { x: wx * this.view.s + this.view.ox, y: wy * this.view.s + this.view.oy }; }

    _insideTable(p) {
      const T = this.layout.table;
      const cx = p.x + p.rect.w / 2, cy = p.y + p.rect.h / 2;
      return cx >= T.x && cx <= T.x + T.w && cy >= T.y && cy <= T.y + T.h;
    }

    _looseIds() { return this.order.filter((id) => !this.pieces[id].placed); }

    /** 정리 순서: 팔레트 테두리 조각 먼저, 그 안에서는 밝기 순(어두운 나무 ↔ 밝은 하늘이 모인다) */
    _sortedForTidy() {
      return this._looseIds()
        .map((id) => this.pieces[id])
        .sort((a, b) => (b.isEdge - a.isEdge) || (a.luma - b.luma) || (a.id - b.id))
        .map((p) => p.id);
    }

    /**
     * 조각들을 탁자 빈자리에 격자로 놓는다. 판에 가까운 자리부터 채운다.
     * @param opt.jitter 살짝 흐트러지게, opt.randomRotate 무작위 회전, opt.animate 움직임
     */
    arrange(ids, opt) {
      opt = opt || {};
      if (!ids.length) return;
      const L = this.layout;
      const rnd = U.mulberry32((this.seed + ids.length * 7919) >>> 0);
      let slots = [];
      for (let f = 1.0; f >= 0.4; f -= 0.06) {
        slots = [];
        const sw = this.slotW * f, sh = this.slotH * f;
        L.free.forEach((r) => {
          const nc = Math.floor(r.w / sw), nr = Math.floor(r.h / sh);
          if (nc < 1 || nr < 1) return;
          const stx = r.w / nc, sty = r.h / nr;
          for (let j = 0; j < nr; j++) for (let i = 0; i < nc; i++) slots.push({ x: r.x + (i + 0.5) * stx, y: r.y + (j + 0.5) * sty, sw: stx, sh: sty });
        });
        if (slots.length >= ids.length) break;
      }
      if (!slots.length) {
        const T = L.table;
        slots.push({ x: T.x + T.w / 2, y: T.y + T.h - this.avgH, sw: this.avgW, sh: this.avgH });
      }
      const bcx = this.W / 2, bcy = this.H / 2;
      const distToBoard = (s) => {
        const dx = Math.max(0 - s.x, 0, s.x - this.W), dy = Math.max(0 - s.y, 0, s.y - this.H);
        return Math.hypot(dx, dy) + Math.hypot(s.x - bcx, s.y - bcy) * 0.05;
      };
      slots.sort((a, b) => distToBoard(a) - distToBoard(b));
      const use = slots.slice(0, Math.min(ids.length, slots.length));
      // 고른 자리는 읽는 순서(위→아래, 왼→오른)로 다시 정렬 → 정리 결과가 눈으로 따라가기 쉽다
      use.sort((a, b) => (Math.round(a.y / (this.avgH * 0.5)) - Math.round(b.y / (this.avgH * 0.5))) || (a.x - b.x));
      ids.forEach((id, i) => {
        const p = this.pieces[id];
        const s = use[i % use.length];
        const lap = Math.floor(i / use.length);      // 자리가 모자라면 겹쳐 쌓기
        let x = s.x - p.rect.w / 2 + lap * this.avgW * 0.18;
        let y = s.y - p.rect.h / 2 + lap * this.avgH * 0.18;
        if (opt.jitter) { x += (rnd() - 0.5) * s.sw * 0.22; y += (rnd() - 0.5) * s.sh * 0.22; }
        let rot = p.rot;
        if (opt.randomRotate) rot = [0, 90, 180, 270][Math.floor(rnd() * 4)];
        if (opt.animate) this._tween(p, x, y, rot, 420 + i * 4, U.easeInOutCubic);
        else { p.x = x; p.y = y; p.rot = rot; }
      });
      // 정리한 순서대로 쌓기(앞 조각이 위)
      const rest = this.order.filter((id) => ids.indexOf(id) < 0);
      this.order = rest.concat(ids.slice().reverse());
      this.requestRender();
    }

    tidy() {
      if (this.completed || !this.ready) return;
      this.arrange(this._sortedForTidy(), { animate: true });
      this.cb.onChange && this.cb.onChange();
    }

    setGhost(n) { this.ghost = n; this.requestRender(); }

    // ===================================================================== 입력
    _bind() {
      const c = this.canvas;
      this._h = {
        down: (e) => this._onDown(e),
        move: (e) => this._onMove(e),
        up: (e) => this._onUp(e),
        wheel: (e) => this._onWheel(e),
        ctx: (e) => e.preventDefault(),
        gest: (e) => e.preventDefault(),
      };
      c.addEventListener('pointerdown', this._h.down);
      c.addEventListener('pointermove', this._h.move);
      c.addEventListener('pointerup', this._h.up);
      c.addEventListener('pointercancel', this._h.up);
      c.addEventListener('lostpointercapture', this._h.up);
      c.addEventListener('wheel', this._h.wheel, { passive: false });
      c.addEventListener('contextmenu', this._h.ctx);
      c.addEventListener('gesturestart', this._h.gest);   // 사파리 핀치가 페이지를 확대하지 않게
    }

    _local(e) {
      const r = this.canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    _onDown(e) {
      if (!this.ready) return;
      e.preventDefault();
      try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
      const pt = this._local(e);
      this.pointers.set(e.pointerId, { x: pt.x, y: pt.y });
      if (this.pointers.size === 1) {
        const w = this.toWorld(pt.x, pt.y);
        const p = this.completed ? null : this.hitTest(w.x, w.y, e.pointerType !== 'mouse');
        if (p) {
          this.drag = { id: p.id, pid: e.pointerId, offX: w.x - p.x, offY: w.y - p.y, sx: pt.x, sy: pt.y, t0: performance.now(), moved: false };
          this.order = this.order.filter((id) => id !== p.id).concat(p.id);
          this.selected = p.id;
          SNP.sound.play('pick');
          this.canvas.style.cursor = 'grabbing';
        } else {
          this.pan = { pid: e.pointerId, x: pt.x, y: pt.y };
        }
      } else if (this.pointers.size === 2) {
        if (this.drag) this._drop(false);     // 두 번째 손가락 → 조각 내려놓고 확대 모드
        this.pan = null;
        const [a, b] = Array.from(this.pointers.values());
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        this.pinch = { d0: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), s0: this.view.s, w: this.toWorld(mid.x, mid.y) };
      }
      this.requestRender();
    }

    _onMove(e) {
      const pt = this._local(e);
      if (!this.pointers.has(e.pointerId)) {
        if (e.pointerType === 'mouse' && !this.completed) {
          const w = this.toWorld(pt.x, pt.y);
          this.canvas.style.cursor = this.hitTest(w.x, w.y, false) ? 'grab' : 'default';
        }
        return;
      }
      const prev = this.pointers.get(e.pointerId);
      this.pointers.set(e.pointerId, { x: pt.x, y: pt.y });
      if (this.drag && this.drag.pid === e.pointerId) {
        const d = this.drag, p = this.pieces[d.id];
        if (!d.moved && Math.hypot(pt.x - d.sx, pt.y - d.sy) > TAP_MOVE) d.moved = true;
        if (d.moved) {
          const w = this.toWorld(pt.x, pt.y);
          p.x = w.x - d.offX;
          p.y = w.y - d.offY;
          this.requestRender();
        }
      } else if (this.pinch && this.pointers.size >= 2) {
        const [a, b] = Array.from(this.pointers.values());
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const d = Math.max(10, Math.hypot(a.x - b.x, a.y - b.y));
        const v = this.view;
        v.s = U.clamp(this.pinch.s0 * (d / this.pinch.d0), this.fitScale * 0.9, this.fitScale * 6);
        v.ox = mid.x - this.pinch.w.x * v.s;
        v.oy = mid.y - this.pinch.w.y * v.s;
        this._clampView();
        this.requestRender();
      } else if (this.pan && this.pan.pid === e.pointerId) {
        this.view.ox += pt.x - prev.x;
        this.view.oy += pt.y - prev.y;
        this._clampView();
        this.requestRender();
      }
    }

    _onUp(e) {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.delete(e.pointerId);
      if (this.drag && this.drag.pid === e.pointerId) {
        const d = this.drag;
        const tap = !d.moved && performance.now() - d.t0 < TAP_TIME;
        this._drop(tap);
      }
      if (this.pan && this.pan.pid === e.pointerId) this.pan = null;
      if (this.pinch && this.pointers.size < 2) {
        this.pinch = null;
        if (this.pointers.size === 1) {
          const [id, q] = Array.from(this.pointers.entries())[0];
          this.pan = { pid: id, x: q.x, y: q.y };
        }
      }
      this.requestRender();
    }

    _drop(tap) {
      const d = this.drag;
      this.drag = null;
      this.canvas.style.cursor = 'default';
      if (!d) return;
      const p = this.pieces[d.id];
      if (tap && this.rotate) {
        this._tween(p, p.x, p.y, p.rot + 90, 160, U.easeOutCubic, () => this._checkSnap(p));
        SNP.sound.play('rotate');
        return;
      }
      if (!d.moved) return;
      // 탁자 밖으로 나가지 않게
      const T = this.layout.table;
      p.x = U.clamp(p.x, T.x - p.rect.w * 0.3, T.x + T.w - p.rect.w * 0.7);
      p.y = U.clamp(p.y, T.y - p.rect.h * 0.3, T.y + T.h - p.rect.h * 0.7);
      if (!this._checkSnap(p)) {
        SNP.sound.play('drop');
        this.cb.onChange && this.cb.onChange();
      }
    }

    _onWheel(e) {
      e.preventDefault();
      const pt = this._local(e);
      // 트랙패드 핀치는 ctrlKey 와 함께 작은 값으로 온다
      const k = e.ctrlKey ? 0.012 : (e.deltaMode === 1 ? 0.05 : 0.0018);
      this.zoomBy(Math.exp(-e.deltaY * k), pt.x, pt.y);
    }

    /** 맨 위 조각부터 판정. 손가락이면 주변 18px 안의 조각도 잡히게(뭉툭한 손가락 보정) */
    hitTest(wx, wy, fat) {
      for (let i = this.order.length - 1; i >= 0; i--) {
        const p = this.pieces[this.order[i]];
        if (!p.placed && !p.anim && this._hitPiece(p, wx, wy)) return p;
      }
      if (!fat) return null;
      const r = 18 / this.view.s;
      let best = null, bestZ = -1;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const rr = k % 2 ? r : r * 0.55;
        const x = wx + Math.cos(a) * rr, y = wy + Math.sin(a) * rr;
        for (let i = this.order.length - 1; i > bestZ; i--) {
          const p = this.pieces[this.order[i]];
          if (!p.placed && !p.anim && this._hitPiece(p, x, y)) { best = p; bestZ = i; break; }
        }
      }
      return best;
    }

    _hitPiece(p, wx, wy) {
      const w = p.rect.w, h = p.rect.h;
      let dx = wx - (p.x + w / 2), dy = wy - (p.y + h / 2);
      const rot = ((p.rot % 360) + 360) % 360;
      if (rot) {
        const a = (-rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
        const rx = dx * c - dy * s, ry = dx * s + dy * c;
        dx = rx; dy = ry;
      }
      const lx = dx + w / 2, ly = dy + h / 2;
      if (lx < 0 || ly < 0 || lx > w || ly > h) return false;
      const bx = p.rect.x + lx, by = p.rect.y + ly;
      const st = this.board.step, R = p.region;
      const mx = Math.floor(bx / st) - R.x, my = Math.floor(by / st) - R.y;
      if (mx < 0 || my < 0 || mx >= R.w || my >= R.h || !R.data[my * R.w + mx]) return false;
      return this.hit.isPointInPath(p.path, bx, by);
    }

    // ===================================================================== 맞추기
    _snapRadius() {
      return Math.max(this.level.snap * this.cell, 16 / this.view.s);
    }

    _checkSnap(p) {
      if (p.placed || ((p.rot % 360) + 360) % 360 !== 0) return false;
      const d = Math.hypot(p.x - p.rect.x, p.y - p.rect.y);
      if (d > this._snapRadius()) return false;
      this._place(p, false);
      return true;
    }

    _place(p, byChance) {
      p.anim = true;
      this._tween(p, p.rect.x, p.rect.y, 0, byChance ? 0 : 110, U.easeOutCubic, () => {
        p.anim = false;
        p.placed = true;
        p.rot = 0;
        this.order = this.order.filter((id) => id !== p.id);
        this.placedCtx.drawImage(p.face, p.rect.x - this.pad, p.rect.y - this.pad);
        U.freeCanvas(p.shadow); p.shadow = null;
        this.placedCount++;
        if (this.selected === p.id) this.selected = -1;
        this.fx.sparkle(p.rect.x + p.rect.w / 2, p.rect.y + p.rect.h / 2, Math.max(p.rect.w, p.rect.h) * 0.9);
        SNP.sound.play(byChance ? 'snapChance' : 'snap');
        if (!byChance) this._combo();
        this._milestone();
        this._emitProgress();
        if (this.placedCount >= this.pieces.length) this._complete();
        else this.cb.onChange && this.cb.onChange();
      });
    }

    _combo() {
      const now = Date.now();
      this.combo = now - this.lastPlaceAt <= SNP.config.comboWindow ? this.combo + 1 : 1;
      this.lastPlaceAt = now;
      const n = SNP.config.comboRefill;
      if (this.combo >= 2 && this.combo % n === 0 && this.chancesLeft < this.chancesMax) {
        this.chancesLeft++;
        this.cb.onToast && this.cb.onToast(`연속 ${this.combo}개! 찬스가 1개 생겼어요`, 'gift');
        SNP.sound.play('gift');
        this.cb.onChances && this.cb.onChances();
      } else if (this.combo === 3 || (this.combo >= n && this.combo % n === 0)) {
        this.cb.onToast && this.cb.onToast(`연속 ${this.combo}개! 멋져요`, 'combo');
      }
    }

    _milestone() {
      const n = this.pieces.length;
      if (n < 8) return;
      const marks = [[0.25, '4분의 1 완성! 잘하고 있어요'], [0.5, '절반 완성! 반짝반짝'], [0.75, '거의 다 왔어요! 조금만 더']];
      for (const [k, msg] of marks) {
        if (this.placedCount === Math.ceil(n * k)) { this.cb.onToast && this.cb.onToast(msg, 'star'); break; }
      }
    }

    /**
     * 찬스: 고른(마지막으로 만진) 조각, 없으면 이미 맞춘 조각 옆 조각을 제자리로 날려 보낸다.
     * @returns 사용했으면 true
     */
    useChance() {
      if (this.completed || !this.ready) return false;
      if (this.chancesLeft <= 0) {
        this.cb.onToast && this.cb.onToast('찬스를 모두 썼어요. 미리보기와 밑그림을 써 보세요!', 'warn');
        SNP.sound.play('nope');
        return false;
      }
      const loose = this._looseIds().map((id) => this.pieces[id]).filter((p) => !p.anim);
      if (!loose.length) return false;
      let p = this.selected >= 0 ? this.pieces[this.selected] : null;
      if (!p || p.placed || p.anim) {
        const rnd = Math.random;
        let best = null, bestScore = -1;
        loose.forEach((q) => {
          let placedN = 0;
          q.neighbors.forEach((n) => { if (this.pieces[n].placed) placedN++; });
          const score = placedN * 10 + (q.isEdge ? 3 : 0) + rnd() * 2;
          if (score > bestScore) { best = q; bestScore = score; }
        });
        p = best;
      }
      if (this.drag && this.drag.id === p.id) this.drag = null;
      this.chancesLeft--;
      this.chancesUsed++;
      this.combo = 0;
      p.anim = true;
      this.order = this.order.filter((id) => id !== p.id).concat(p.id);
      this.chanceTarget = p;
      // 가장 가까운 0° 방향으로(시계 방향 회전만)
      const r = ((p.rot % 360) + 360) % 360;
      const toRot = p.rot + (r === 0 ? 0 : 360 - r);
      const dist = Math.hypot(p.x - p.rect.x, p.y - p.rect.y);
      const dur = U.clamp(500 + dist * 0.35, 650, 1300);
      this._tween(p, p.rect.x, p.rect.y, toRot, dur, U.easeInOutCubic, () => {
        this.chanceTarget = null;
        this._place(p, true);
      }, true);
      SNP.sound.play('chance');
      this.cb.onChances && this.cb.onChances();
      return true;
    }

    rotateSelected() {
      if (!this.ready || !this.rotate || this.selected < 0) return;
      const p = this.pieces[this.selected];
      if (p.placed || p.anim) return;
      this._tween(p, p.x, p.y, p.rot + 90, 160, U.easeOutCubic, () => this._checkSnap(p));
      SNP.sound.play('rotate');
    }

    _complete() {
      this.completed = true;
      this.running = false;
      this.drag = null;
      this.reveal = 0;
      this.fx.celebrate(this.board.lights, this.W, this.vw, this.vh);
      SNP.sound.play('complete');
      this.fit();
      this.requestRender();
      setTimeout(() => {
        if (!this.destroyed) this.cb.onComplete && this.cb.onComplete(this.stats());
      }, 1700);
    }

    stats() {
      return {
        pieces: this.pieces.length, placed: this.placedCount, elapsed: this.elapsed,
        chancesUsed: this.chancesUsed, chancesLeft: this.chancesLeft, chancesMax: this.chancesMax,
        completed: this.completed,
      };
    }

    _emitProgress() { this.cb.onProgress && this.cb.onProgress(this.placedCount, this.pieces.length); }

    _tick() {
      const now = performance.now();
      if (this.running && !document.hidden) this.elapsed += Math.min(1000, now - this.lastTick);
      this.lastTick = now;
      this.cb.onTime && this.cb.onTime(this.elapsed);
    }

    // ===================================================================== 움직임
    _tween(p, x, y, rot, dur, ease, done, trail) {
      this.tweens = this.tweens.filter((t) => t.p !== p);
      if (!dur) {
        p.x = x; p.y = y; p.rot = rot;
        if (done) done();
        this.requestRender();
        return;
      }
      this.tweens.push({ p, x0: p.x, y0: p.y, r0: p.rot, x1: x, y1: y, r1: rot, t: 0, dur: dur / 1000, ease, done, trail });
      this.requestRender();
    }

    _updateTweens(dt) {
      if (!this.tweens.length) return;
      const finished = [];
      this.tweens.forEach((t) => {
        t.t = Math.min(t.dur, t.t + dt);
        const k = t.ease(t.t / t.dur);
        t.p.x = U.lerp(t.x0, t.x1, k);
        t.p.y = U.lerp(t.y0, t.y1, k);
        t.p.rot = U.lerp(t.r0, t.r1, k);
        if (t.trail) this.fx.trail(t.p.x + t.p.rect.w / 2, t.p.y + t.p.rect.h / 2, Math.max(t.p.rect.w, t.p.rect.h));
        if (t.t >= t.dur) finished.push(t);
      });
      if (finished.length) {
        this.tweens = this.tweens.filter((t) => finished.indexOf(t) < 0);
        finished.forEach((t) => {
          t.p.rot = ((Math.round(t.r1 / 90) * 90) % 360 + 360) % 360;
          if (t.done) t.done();
        });
      }
    }

    // ===================================================================== 그리기
    requestRender() {
      if (this.raf || this.destroyed) return;
      this.raf = requestAnimationFrame((ts) => this._frame(ts));
    }

    _frame(ts) {
      this.raf = 0;
      const dt = this.lastFrame ? Math.min(0.05, (ts - this.lastFrame) / 1000) : 0.016;
      this.lastFrame = ts;
      this._updateTweens(dt);
      this.fx.update(dt);
      if (this.reveal >= 0 && this.reveal < 1) this.reveal = Math.min(1, this.reveal + dt / 1.1);
      this._render(ts);
      const busy = this.tweens.length || this.fx.active() || this.drag || this.pinch || this.chanceTarget ||
        (this.reveal >= 0 && this.reveal < 1);
      if (busy) this.requestRender();
      else this.lastFrame = 0;
    }

    _render(ts) {
      const ctx = this.ctx, dpr = this.dpr, v = this.view;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      if (!this.ready) return;
      ctx.setTransform(dpr * v.s, 0, 0, dpr * v.s, dpr * v.ox, dpr * v.oy);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const sp = this.slotPad;
      ctx.drawImage(this.slot, -sp, -sp, this.W + sp * 2, this.H + sp * 2);
      if (this.ghost && !this.completed) {
        ctx.globalAlpha = this.ghost === 1 ? 0.2 : 0.42;
        ctx.drawImage(this.img, 0, 0, this.W, this.H);
        ctx.globalAlpha = 1;
      }
      ctx.drawImage(this.placedLayer, 0, 0);
      if (this.reveal > 0) {
        ctx.globalAlpha = this.reveal;
        ctx.drawImage(this.img, 0, 0, this.W, this.H);
        ctx.globalAlpha = 1;
      }

      // 찬스: 도착할 자리를 반짝이며 보여 준다
      if (this.chanceTarget) {
        const p = this.chanceTarget;
        ctx.save();
        ctx.globalAlpha = 0.35 + 0.25 * Math.sin(ts / 90);
        ctx.shadowColor = 'rgba(255, 220, 90, 1)';
        ctx.shadowBlur = 24 * dpr;
        ctx.drawImage(p.face, p.rect.x - this.pad, p.rect.y - this.pad);
        ctx.restore();
      }

      const dragId = this.drag && this.drag.moved ? this.drag.id : -1;
      for (let i = 0; i < this.order.length; i++) {
        const id = this.order[i];
        if (id === dragId) continue;
        const p = this.pieces[id];
        if (p.placed) continue;
        if (id === this.selected) this._drawSelected(ctx, p);
        else this._drawPiece(ctx, p, p.shadow || p.face, 1);
      }
      if (dragId >= 0) {
        const p = this.pieces[dragId];
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 10, 0.5)';
        ctx.shadowBlur = 18 * dpr;
        ctx.shadowOffsetY = 10 * dpr;
        this._drawPiece(ctx, p, p.face, 1.05);
        ctx.restore();
      }
      this.fx.drawWorld(ctx);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.fx.drawScreen(ctx);
    }

    _drawSelected(ctx, p) {
      ctx.save();
      ctx.shadowColor = 'rgba(255, 214, 80, 0.95)';
      ctx.shadowBlur = 14 * this.dpr;
      this._drawPiece(ctx, p, p.face, 1);
      ctx.restore();
    }

    _drawPiece(ctx, p, canvas, scale) {
      const pad = this.pad;
      const rot = p.rot % 360;
      if (!rot && scale === 1) { ctx.drawImage(canvas, p.x - pad, p.y - pad); return; }
      const cx = p.x + p.rect.w / 2, cy = p.y + p.rect.h / 2;
      ctx.save();
      ctx.translate(cx, cy);
      if (rot) ctx.rotate((rot * Math.PI) / 180);
      if (scale !== 1) ctx.scale(scale, scale);
      ctx.drawImage(canvas, -p.rect.w / 2 - pad, -p.rect.h / 2 - pad);
      ctx.restore();
    }

    // ===================================================================== 저장·복원
    serialize() {
      return {
        f: SNP.config.saveFormat, level: this.level.id, seed: this.seed, rotate: this.rotate,
        n: this.pieces.length, el: Math.round(this.elapsed), cl: this.chancesLeft, cu: this.chancesUsed,
        ps: this.pieces.map((p) => (p.placed || p.anim && this.chanceTarget === p ? 1 : [Math.round(p.x), Math.round(p.y), ((Math.round(p.rot / 90) * 90) % 360 + 360) % 360])),
        z: this.order.slice(), ghost: this.ghost, at: Date.now(),
      };
    }

    _restore(s) {
      if (!s || s.f !== SNP.config.saveFormat || s.n !== this.pieces.length || s.seed !== this.seed) return false;
      this.elapsed = s.el || 0;
      this.chancesLeft = U.clamp(s.cl, 0, this.chancesMax);
      this.chancesUsed = s.cu || 0;
      this.ghost = s.ghost || 0;
      const outside = [];
      s.ps.forEach((v, id) => {
        const p = this.pieces[id];
        if (v === 1) {
          p.placed = true;
          this.placedCtx.drawImage(p.face, p.rect.x - this.pad, p.rect.y - this.pad);
          U.freeCanvas(p.shadow); p.shadow = null;
          this.placedCount++;
        } else {
          p.x = v[0]; p.y = v[1]; p.rot = v[2] || 0;
          if (!this._insideTable(p)) outside.push(id);
        }
      });
      const z = (s.z || []).filter((id) => id >= 0 && id < this.pieces.length && !this.pieces[id].placed);
      const missing = this.pieces.filter((p) => !p.placed && z.indexOf(p.id) < 0).map((p) => p.id);
      this.order = missing.concat(z);
      if (outside.length) this.arrange(this._sortedForTidy(), { animate: false });
      if (this.placedCount >= this.pieces.length) { this.completed = true; this.reveal = 1; }
      return true;
    }

    // ===================================================================== 정리
    destroy() {
      this.destroyed = true;
      if (this.raf) cancelAnimationFrame(this.raf);
      clearInterval(this.timer);
      const c = this.canvas;
      c.removeEventListener('pointerdown', this._h.down);
      c.removeEventListener('pointermove', this._h.move);
      c.removeEventListener('pointerup', this._h.up);
      c.removeEventListener('pointercancel', this._h.up);
      c.removeEventListener('lostpointercapture', this._h.up);
      c.removeEventListener('wheel', this._h.wheel);
      c.removeEventListener('contextmenu', this._h.ctx);
      c.removeEventListener('gesturestart', this._h.gest);
      SNP.pieces.release(this.pieces);
      U.freeCanvas(this.placedLayer); U.freeCanvas(this.slot); U.freeCanvas(this.hitCanvas);
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.clearRect(0, 0, c.width, c.height);
      this.fx.clear();
    }

    // ===================================================================== 시험용(자동 검증)
    debugInfo() {
      return {
        n: this.pieces.length, placed: this.placedCount, loose: this._looseIds().length,
        view: Object.assign({}, this.view), layout: this.layout && { mode: this.layout.mode, table: this.layout.table, free: this.layout.free.length },
        chancesLeft: this.chancesLeft, completed: this.completed, rotate: this.rotate,
      };
    }
    /** 조각 id 의 화면 위치(가운데)와 제자리 화면 위치 */
    debugPiece(id) {
      const p = this.pieces[id];
      if (!p) return null;
      // 실제로 그 조각이 잡히는 점을 찾는다(조각 가운데가 구멍일 수 있음)
      const st = this.board.step, R = p.region;
      let gx = p.rect.w / 2, gy = p.rect.h / 2, bestD = 1e9;
      for (let y = 0; y < R.h; y += 1) {
        for (let x = 0; x < R.w; x += 1) {
          if (!R.data[y * R.w + x]) continue;
          const bx = (R.x + x + 0.5) * st, by = (R.y + y + 0.5) * st;
          if (!this.hit.isPointInPath(p.path, bx, by)) continue;
          // 가장자리에서 먼 점을 고르기 위해 영역 중심과의 거리로
          const d = Math.hypot(bx - (p.rect.x + p.rect.w / 2), by - (p.rect.y + p.rect.h / 2));
          if (d < bestD && this._insideRegion(R, x, y, 2)) { bestD = d; gx = bx - p.rect.x; gy = by - p.rect.y; }
        }
      }
      const a = ((p.rot % 360) * Math.PI) / 180;
      const lx = gx - p.rect.w / 2, ly = gy - p.rect.h / 2;
      const cur = this.toScreen(p.x + p.rect.w / 2 + lx * Math.cos(a) - ly * Math.sin(a), p.y + p.rect.h / 2 + lx * Math.sin(a) + ly * Math.cos(a));
      const home = this.toScreen(p.rect.x + gx, p.rect.y + gy);
      return { id, placed: p.placed, rot: p.rot, x: cur.x, y: cur.y, hx: home.x, hy: home.y };
    }
    _insideRegion(R, x, y, m) {
      for (let dy = -m; dy <= m; dy++) for (let dx = -m; dx <= m; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= R.w || yy >= R.h || !R.data[yy * R.w + xx]) return false;
      }
      return true;
    }
    debugPlace(id) { const p = this.pieces[id]; if (p && !p.placed && !p.anim) this._place(p, true); }
  }

  SNP.Game = Game;
})();
