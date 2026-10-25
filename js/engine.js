/* 게임 엔진: 월드(그림 픽셀 좌표) ↔ 화면 카메라, 그리기, 포인터 입력(끌기·탭·회전·이동·핀치·휠), 스냅·그룹 결합, 찬스, 저장/복원 */
'use strict';
(function (SN) {
  // 완성 때 반짝일 그림 속 별·달 위치 (잘라 낸 그림 기준 비율, 반지름은 그림 폭 1000 기준)
  const PAINTED_STARS = [
    [0.217, 0.158, 30], [0.389, 0.082, 26], [0.494, 0.12, 32], [0.617, 0.141, 34],
    [0.794, 0.186, 58], [0.122, 0.491, 30], [0.035, 0.516, 22],
  ];

  const G = {
    cv: null, ctx: null, dpr: 1, W: 0, H: 0,
    img: null, puzzle: null, pieces: [], loose: [], groups: new Map(),
    cam: { s: 1, ox: 0, oy: 0 }, fitS: 1,
    table: null,
    layers: null,        // { bg, ghost, placed } — 그림 크기 캔버스
    opts: { level: 1, rotate: false, ghost: true },
    drag: null, pan: null, pinch: null, pointers: new Map(),
    anims: [], selected: null, hintGlow: null,
    stats: { elapsed: 0, moves: 0, chancesUsed: 0, started: false, startedAt: 0, done: false },
    running: false, dirty: true, raf: 0, lastTick: 0,
  };
  SN.G = G; // 디버그·테스트용

  // ───────────────────────── 카메라
  const w2s = (x, y) => [x * G.cam.s + G.cam.ox, y * G.cam.s + G.cam.oy];
  const s2w = (x, y) => [(x - G.cam.ox) / G.cam.s, (y - G.cam.oy) / G.cam.s];

  function contentRect() {
    let x0 = G.table.x, y0 = G.table.y, x1 = G.table.x + G.table.w, y1 = G.table.y + G.table.h;
    const P = G.puzzle.pad;
    for (const p of G.loose) {
      const r = Math.max(p.bw, p.bh) / 2 + P;
      x0 = Math.min(x0, p.x - r); y0 = Math.min(y0, p.y - r); x1 = Math.max(x1, p.x + r); y1 = Math.max(y1, p.y + r);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function fitScaleFor(r) { const pad = Math.min(G.W, G.H) * 0.03 + 6; return Math.min((G.W - pad * 2) / r.w, (G.H - pad * 2) / r.h); }
  function fitTo(r) {
    const s = fitScaleFor(r);
    G.cam.s = s; G.fitS = s;
    G.cam.ox = G.W / 2 - (r.x + r.w / 2) * s;
    G.cam.oy = G.H / 2 - (r.y + r.h / 2) * s;
    G.dirty = true;
  }
  function zoomAt(sx, sy, factor) {
    const minS = G.fitS * 0.6, maxS = Math.max(G.fitS * 8, 1.6);
    const ns = SN.clamp(G.cam.s * factor, minS, maxS);
    const [wx, wy] = s2w(sx, sy);
    G.cam.s = ns; G.cam.ox = sx - wx * ns; G.cam.oy = sy - wy * ns;
    clampCam(); G.dirty = true;
  }
  // 내용이 화면 밖으로 완전히 사라지지 않게
  function clampCam() {
    const r = contentRect();
    const [ax, ay] = w2s(r.x, r.y), [bx, by] = w2s(r.x + r.w, r.y + r.h);
    const keep = 80;
    if (bx < keep) G.cam.ox += keep - bx; if (ax > G.W - keep) G.cam.ox -= ax - (G.W - keep);
    if (by < keep) G.cam.oy += keep - by; if (ay > G.H - keep) G.cam.oy -= ay - (G.H - keep);
  }

  // ───────────────────────── 탁자(조각 흩어 둘 곳) 배치
  // 화면 비율에 맞춰 「아래」「양옆」「사방」 중 가장 크게 보이는 배치를 고른다.
  function planTrays(n, spread = 1.22) {
    const P = G.puzzle, IW = P.IW, IH = P.IH;
    const m = P.S * 0.28;
    const sw = P.cw * spread, sh = P.ch * spread; // 칸 크기 (흩기: 탭이 조금 겹칠 만큼 촘촘 / 정리: 탭까지 다 보이게 넉넉히)
    const aspectW = G.W || 1000, aspectH = G.H || 700;
    const options = [];
    const board = { x: -m, y: -m, w: IW + 2 * m, h: IH + 2 * m };
    const add = (trays) => {
      let x0 = board.x, y0 = board.y, x1 = board.x + board.w, y1 = board.y + board.h;
      for (const t of trays) { x0 = Math.min(x0, t.x - m * 0.4); y0 = Math.min(y0, t.y); x1 = Math.max(x1, t.x + t.w + m * 0.4); y1 = Math.max(y1, t.y + t.h + m * 0.4); }
      options.push({ trays, table: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } });
    };
    const cap = (rect) => Math.max(1, Math.floor(rect.w / sw)) * Math.max(1, Math.floor(rect.h / sh));
    // A) 아래 (세로 화면)
    {
      const w = board.w, per = Math.max(1, Math.floor(w / sw)), rowsN = Math.ceil(n / per);
      add([{ x: -m, y: IH + m, w, h: rowsN * sh }]);
    }
    // B) 양옆 (가로 화면)
    {
      const h = board.h, per = Math.max(1, Math.floor(h / sh)), colsN = Math.ceil(n / per);
      const lc = Math.ceil(colsN / 2), rc = colsN - lc;
      const trays = [{ x: -m - lc * sw, y: -m, w: lc * sw, h }];
      if (rc) trays.push({ x: IW + m, y: -m, w: rc * sw, h });
      add(trays);
    }
    // C) 사방 (양옆 + 아래) — 조각이 아주 많을 때
    for (let k = 1; k <= 12; k++) {
      const h = board.h, sideW = k * sw;
      const left = { x: -m - sideW, y: -m, w: sideW, h }, right = { x: IW + m, y: -m, w: sideW, h };
      const rest = n - cap(left) - cap(right);
      const bw = board.w + 2 * sideW;
      const perB = Math.max(1, Math.floor(bw / sw)), rowsB = rest > 0 ? Math.ceil(rest / perB) : 0;
      add(rowsB ? [left, right, { x: left.x, y: IH + m, w: bw, h: rowsB * sh }] : [left, right]);
      if (rest <= 0) break;
    }
    let best = null, bestS = -1;
    for (const o of options) {
      const s = Math.min(aspectW / o.table.w, aspectH / o.table.h);
      if (s > bestS) { bestS = s; best = o; }
    }
    // 칸 목록
    const slots = [];
    for (const t of best.trays) {
      const per = Math.max(1, Math.floor(t.w / sw)), rowsN = Math.max(1, Math.floor(t.h / sh));
      const ox = t.x + (t.w - per * sw) / 2 + sw / 2, oy = t.y + (t.h - rowsN * sh) / 2 + sh / 2;
      for (let r = 0; r < rowsN; r++) for (let c = 0; c < per; c++) slots.push([ox + c * sw, oy + r * sh]);
    }
    // 그림에서 가까운 칸부터
    const cx = IW / 2, cy = IH / 2;
    slots.sort((a, b) => Math.hypot((a[0] - cx) / IW, (a[1] - cy) / IH) - Math.hypot((b[0] - cx) / IW, (b[1] - cy) / IH));
    return { table: best.table, slots, sw, sh };
  }

  // 낱개 조각(묶이지 않은 조각)을 칸에 배치. tidy=true 면 가장자리 조각 먼저, 반듯하게.
  function arrange({ tidy = false, rnd = Math.random } = {}) {
    const singles = G.loose.filter((p) => G.groups.get(p.group).length === 1);
    const plan = planTrays(singles.length, tidy ? 1.42 : 1.22);
    G.table = plan.table;
    let list = singles.slice();
    if (tidy) list.sort((a, b) => (b.edge - a.edge) || (a.id - b.id));
    else for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    list.forEach((p, i) => {
      const s = plan.slots[i % plan.slots.length];
      const jx = tidy ? 0 : (rnd() - 0.5) * plan.sw * 0.22, jy = tidy ? 0 : (rnd() - 0.5) * plan.sh * 0.22;
      p.x = s[0] + jx; p.y = s[1] + jy;
    });
    // 낱개 조각은 묶음보다 아래에 깔리도록 순서 정리
    const groupsFirst = G.loose.filter((p) => G.groups.get(p.group).length > 1);
    G.loose = [...list.slice().reverse(), ...groupsFirst];
    G.dirty = true;
  }

  // ───────────────────────── 그림 레이어
  function buildLayers() {
    const IW = G.puzzle.IW, IH = G.puzzle.IH;
    // 빈 판: 팔레트 모양 실루엣 + 은은한 빛 테두리
    const pad = 40;
    const bg = SN.canvas(IW + pad * 2, IH + pad * 2), bgc = bg.getContext('2d');
    const sil = SN.canvas(IW, IH), sc = sil.getContext('2d');
    sc.drawImage(G.img, 0, 0); sc.globalCompositeOperation = 'source-in';
    sc.fillStyle = '#0d1d4d'; sc.fillRect(0, 0, IW, IH);
    bgc.shadowColor = 'rgba(140, 180, 255, 0.45)'; bgc.shadowBlur = 36;
    bgc.drawImage(sil, pad, pad);
    bgc.shadowColor = 'transparent';
    // 안쪽 결(얇은 나무판 느낌의 가로 줄무늬)
    bgc.globalCompositeOperation = 'source-atop';
    for (let y = 0; y < IH; y += 9) { bgc.fillStyle = `rgba(255,255,255,${0.012 + 0.012 * Math.sin(y * 0.07)})`; bgc.fillRect(pad, pad + y, IW, 4); }
    bgc.globalCompositeOperation = 'source-over';
    // 밑그림: 흑백·어둡게
    const gh = SN.canvas(IW, IH), gc = gh.getContext('2d');
    gc.drawImage(G.img, 0, 0);
    const id = gc.getImageData(0, 0, IW, IH), d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
      d[i] = 20 + l * 0.35; d[i + 1] = 36 + l * 0.45; d[i + 2] = 80 + l * 0.6; d[i + 3] = d[i + 3] * 0.55;
    }
    gc.putImageData(id, 0, 0);
    const placed = SN.canvas(IW, IH);
    G.layers = { bg, bgPad: pad, ghost: gh, placed };
  }
  function drawPlaced(p) {
    const c = G.layers.placed.getContext('2d');
    c.save(); c.clip(SN.piecePath(p)); c.drawImage(G.img, 0, 0); c.restore();
  }

  // ───────────────────────── 그리기
  function render() {
    G.raf = 0;
    const now = performance.now();
    const animating = stepAnims(now);
    const c = G.ctx, d = G.dpr;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, G.cv.width, G.cv.height);
    if (!G.puzzle) return;
    c.setTransform(G.cam.s * d, 0, 0, G.cam.s * d, G.cam.ox * d, G.cam.oy * d);
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    const L = G.layers, IW = G.puzzle.IW, IH = G.puzzle.IH;
    c.drawImage(L.bg, -L.bgPad, -L.bgPad);
    if (G.opts.ghost && !G.stats.done) c.drawImage(L.ghost, 0, 0);
    c.drawImage(L.placed, 0, 0);
    if (G.stats.done) c.drawImage(G.img, 0, 0, IW, IH);
    // 찬스 목표 자리 표시
    if (G.hintGlow) {
      const t = (now - G.hintGlow.t0) / 1000;
      const p = G.hintGlow.p;
      c.save(); c.translate(p.hx, p.hy);
      c.lineWidth = 6 / G.cam.s; c.strokeStyle = `rgba(255, 220, 90, ${0.5 + 0.4 * Math.sin(t * 10)})`;
      c.stroke(centeredPath(p)); c.restore();
    }
    const pad = G.puzzle.pad;
    const dragSet = G.drag ? new Set(G.drag.members) : null;
    for (const p of G.loose) {
      c.save();
      c.translate(p.x, p.y);
      if (p.rot) c.rotate((p.rot * Math.PI) / 2);
      if (dragSet && dragSet.has(p) && G.drag.members.length === 1) c.scale(1.035, 1.035);
      c.drawImage(p.sprite, -p.bw / 2 - pad, -p.bh / 2 - pad);
      if (p === G.selected) {
        c.lineWidth = 4 / G.cam.s; c.strokeStyle = 'rgba(255, 216, 74, 0.95)';
        c.stroke(centeredPath(p));
      }
      c.restore();
    }
    if (animating || G.hintGlow) G.dirty = true;
    if (G.hintGlow && now - G.hintGlow.t0 > 1600) G.hintGlow = null;
  }
  function centeredPath(p) {
    if (!p.cpath) p.cpath = SN.piecePath(p, -p.bx - p.bw / 2, -p.by - p.bh / 2);
    return p.cpath;
  }
  function frame() {
    if (G.dirty) { G.dirty = false; render(); }
    G.raf = requestAnimationFrame(frame);
  }

  // ───────────────────────── 애니메이션 (찬스로 날아가기 등)
  function stepAnims(now) {
    if (!G.anims.length) return false;
    G.anims = G.anims.filter((a) => {
      const t = SN.clamp((now - a.t0) / a.dur, 0, 1), e = SN.easeInOutCubic(t);
      a.items.forEach((it) => {
        it.p.x = SN.lerp(it.x0, it.x1, e); it.p.y = SN.lerp(it.y0, it.y1, e);
        it.p.rot = t < 1 ? it.r0 : it.r1; // 회전은 끝에서 맞춤 (사분면 단위 상태 유지)
      });
      if (t >= 1) { a.done(); return false; }
      return true;
    });
    return true;
  }

  // ───────────────────────── 그룹
  function groupOf(p) { return G.groups.get(p.group); }
  function moveGroup(members, dx, dy) { for (const m of members) { m.x += dx; m.y += dy; } }
  function bringToTop(members) {
    const set = new Set(members);
    G.loose = [...G.loose.filter((p) => !set.has(p)), ...G.loose.filter((p) => set.has(p))];
  }
  function mergeInto(target, src) { // src 그룹을 target 그룹으로
    const tg = G.groups.get(target), sg = G.groups.get(src);
    if (!tg || !sg || target === src) return;
    for (const p of sg) { p.group = target; tg.push(p); }
    G.groups.delete(src);
  }
  function rotateGroup(members, pivot) {
    for (const m of members) {
      const [dx, dy] = SN.rot90(m.x - pivot.x, m.y - pivot.y, 1);
      m.x = pivot.x + dx; m.y = pivot.y + dy; m.rot = (m.rot + 1) % 4;
    }
  }

  // 놓았을 때: 판 위 제자리 → 고정, 아니면 이웃 조각과 결합
  function tolerance() { return Math.max(G.puzzle.S * 0.2, 16 / G.cam.s); }
  function afterDrop(members) {
    const tol = tolerance();
    let gid = members[0].group;
    let merged = false;
    for (let guard = 0; guard < 50; guard++) {
      const mem = G.groups.get(gid);
      const a = mem[0];
      if (a.rot === 0 && Math.hypot(a.x - a.hx, a.y - a.hy) < tol) { placeGroup(mem); return 'placed'; }
      let found = null;
      outer: for (const p of mem) {
        for (const qi of p.neighbors) {
          const q = G.pieces[qi];
          if (q.placed || q.group === gid || q.rot !== p.rot) continue;
          const [ex, ey] = SN.rot90(q.hx - p.hx, q.hy - p.hy, p.rot);
          const dx = q.x - (p.x + ex), dy = q.y - (p.y + ey);
          if (Math.hypot(dx, dy) < tol) { found = { q, dx, dy }; break outer; }
        }
      }
      if (!found) break;
      moveGroup(mem, found.dx, found.dy);
      const tgt = found.q.group;
      mergeInto(tgt, gid);
      gid = tgt; merged = true;
      bringToTop(G.groups.get(gid));
    }
    if (merged) {
      SN.sfx.connect();
      const mem = G.groups.get(gid);
      const [sx, sy] = w2s(mem[0].x, mem[0].y);
      SN.fx.sparkle(sx, sy, 8);
      return 'merged';
    }
    return 'none';
  }

  function placeGroup(members) {
    let cx = 0, cy = 0;
    for (const p of members) {
      p.x = p.hx; p.y = p.hy; p.rot = 0; p.placed = true; drawPlaced(p);
      cx += p.hx; cy += p.hy;
    }
    const set = new Set(members);
    G.loose = G.loose.filter((p) => !set.has(p));
    G.groups.delete(members[0].group);
    if (G.selected && set.has(G.selected)) G.selected = null;
    SN.sfx.place();
    if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) { /* 무시 */ } }
    const [sx, sy] = w2s(cx / members.length, cy / members.length);
    SN.fx.sparkle(sx, sy, 16 + members.length * 2, true);
    G.dirty = true;
    SN.emit('progress', progress());
    if (!G.loose.length) complete();
  }

  function progress() {
    const total = G.pieces.length, placed = total - G.loose.length;
    return { placed, total, chancesLeft: chancesLeft(), chancesMax: G.puzzle.level.chances };
  }
  const chancesLeft = () => Math.max(0, G.puzzle.level.chances - G.stats.chancesUsed);

  // ───────────────────────── 입력
  function hitTest(wx, wy) {
    for (let i = G.loose.length - 1; i >= 0; i--) { const p = G.loose[i]; if (SN.hitPiece(p, wx, wy)) return p; }
    return null;
  }
  function localXY(e) { const r = G.cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }

  function onDown(e) {
    if (!G.running || G.stats.done) return;
    if (e.pointerType === 'mouse' && e.button === 2) return; // 오른쪽 단추는 contextmenu 에서
    e.preventDefault();
    const [sx, sy] = localXY(e);
    G.pointers.set(e.pointerId, { x: sx, y: sy });
    try { G.cv.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    if (G.drag) {
      // 첫 손가락이 조각에 닿았지만 아직 움직이지 않았다면 → 두 손가락 확대로 전환
      if (!G.drag.moved && G.pointers.size === 2) { G.drag = null; startPinch(); G.dirty = true; }
      return; // 끄는 중엔 다른 손가락 무시
    }
    if (G.pointers.size === 2) { startPinch(); return; }
    if (G.pointers.size > 2) return;
    const [wx, wy] = s2w(sx, sy);
    const p = G.anims.length ? null : hitTest(wx, wy);
    if (p) {
      const members = groupOf(p);
      bringToTop(members);
      G.drag = { id: e.pointerId, p, members, off: members.map((m) => [m.x - wx, m.y - wy]), sx, sy, t0: performance.now(), moved: false };
      SN.sfx.pick();
      startClock();
      G.dirty = true;
    } else {
      G.pan = { id: e.pointerId, sx, sy, ox: G.cam.ox, oy: G.cam.oy, moved: false };
    }
  }
  function onMove(e) {
    if (!G.pointers.has(e.pointerId)) return;
    const [sx, sy] = localXY(e);
    G.pointers.set(e.pointerId, { x: sx, y: sy });
    if (G.drag && G.drag.id === e.pointerId) {
      const d = G.drag;
      if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) > 6) d.moved = true;
      if (d.moved) {
        const [wx, wy] = s2w(sx, sy);
        d.members.forEach((m, i) => { m.x = wx + d.off[i][0]; m.y = wy + d.off[i][1]; });
        G.dirty = true;
      }
    } else if (G.pinch) {
      movePinch();
    } else if (G.pan && G.pan.id === e.pointerId) {
      const P = G.pan;
      if (!P.moved && Math.hypot(sx - P.sx, sy - P.sy) > 6) P.moved = true;
      if (P.moved) { G.cam.ox = P.ox + (sx - P.sx); G.cam.oy = P.oy + (sy - P.sy); clampCam(); G.dirty = true; }
    }
  }
  function onUp(e) {
    if (!G.pointers.has(e.pointerId)) return;
    G.pointers.delete(e.pointerId);
    if (G.drag && G.drag.id === e.pointerId) {
      const d = G.drag; G.drag = null;
      const quick = performance.now() - d.t0 < 400;
      if (!d.moved && e.type !== 'pointercancel') {
        // 탭: 선택(찬스 대상) + 회전 모드면 90° 돌리기
        G.selected = d.p;
        if (G.opts.rotate && quick) { rotateGroup(d.members, { x: d.p.x, y: d.p.y }); SN.sfx.rotate(); G.stats.moves++; afterDrop(d.members); }
        else SN.sfx.click();
      } else {
        G.stats.moves++;
        G.selected = d.p;
        const r = afterDrop(d.members);
        if (r === 'none') SN.sfx.drop();
      }
      G.dirty = true;
      scheduleSave();
      SN.emit('progress', progress());
    }
    if (G.pinch && G.pointers.size < 2) G.pinch = null;
    if (G.pan && G.pan.id === e.pointerId) {
      if (!G.pan.moved && G.selected) { G.selected = null; G.dirty = true; }
      G.pan = null;
    }
  }
  function startPinch() {
    const [a, b] = [...G.pointers.values()];
    G.pan = null;
    G.pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, s0: G.cam.s, ox: G.cam.ox, oy: G.cam.oy };
  }
  function movePinch() {
    const [a, b] = [...G.pointers.values()];
    if (!a || !b) return;
    const P = G.pinch;
    const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const minS = G.fitS * 0.6, maxS = Math.max(G.fitS * 8, 1.6);
    const ns = SN.clamp(P.s0 * (d / P.d0), minS, maxS);
    // 처음 두 손가락 가운데의 월드 점이 지금 가운데에 오도록
    const wx = (P.mx - P.ox) / P.s0, wy = (P.my - P.oy) / P.s0;
    G.cam.s = ns; G.cam.ox = mx - wx * ns; G.cam.oy = my - wy * ns;
    clampCam(); G.dirty = true;
  }
  function onWheel(e) {
    if (!G.running) return;
    e.preventDefault();
    const [sx, sy] = localXY(e);
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const dx = e.deltaX * unit, dy = e.deltaY * unit;
    const mouseWheel = e.deltaMode !== 0 || (dx === 0 && Math.abs(dy) >= 40 && Number.isInteger(dy));
    if (e.ctrlKey || mouseWheel) zoomAt(sx, sy, Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015)));
    else { G.cam.ox -= dx; G.cam.oy -= dy; clampCam(); G.dirty = true; }
  }
  function onContext(e) {
    e.preventDefault();
    if (!G.running || G.stats.done || !G.opts.rotate) return;
    const [sx, sy] = localXY(e);
    const [wx, wy] = s2w(sx, sy);
    const p = hitTest(wx, wy);
    if (p) { const mem = groupOf(p); bringToTop(mem); rotateGroup(mem, { x: p.x, y: p.y }); G.selected = p; SN.sfx.rotate(); G.stats.moves++; afterDrop(mem); scheduleSave(); G.dirty = true; startClock(); }
  }

  // ───────────────────────── 시간
  function startClock() { if (!G.stats.started) { G.stats.started = true; } }
  function tick() {
    const now = performance.now();
    const dt = (now - G.lastTick) / 1000; G.lastTick = now;
    if (G.running && G.stats.started && !G.stats.done && document.visibilityState === 'visible' && dt < 5) {
      G.stats.elapsed += dt;
    }
    SN.emit('tick', G.stats.elapsed);
  }

  // ───────────────────────── 저장
  let saveTimer = 0;
  function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 400); }
  function save() {
    if (!G.puzzle || G.stats.done) return;
    SN.store.set('save', {
      v: 1, level: G.opts.level, seed: G.puzzle.seed, rotate: G.opts.rotate, at: Date.now(),
      elapsed: Math.round(G.stats.elapsed), moves: G.stats.moves, chancesUsed: G.stats.chancesUsed, started: G.stats.started,
      table: G.table, total: G.pieces.length, placedCount: G.pieces.length - G.loose.length,
      pieces: G.pieces.map((p) => [Math.round(p.x), Math.round(p.y), p.rot, p.group, p.placed ? 1 : 0]),
      order: G.loose.map((p) => p.id),
    });
  }

  // ───────────────────────── 완성
  function complete() {
    G.stats.done = true;
    G.selected = null; G.hintGlow = null;
    SN.store.del('save');
    const L = G.puzzle.level;
    const used = G.stats.chancesUsed;
    const stars = used === 0 ? 3 : used <= Math.ceil(L.chances / 2) ? 2 : 1;
    const result = { level: L.id, time: Math.round(G.stats.elapsed), moves: G.stats.moves, chancesUsed: used, chancesMax: L.chances, stars, rotate: G.opts.rotate, pieces: G.pieces.length };
    // 그림만 크게 보이게
    const IW = G.puzzle.IW, IH = G.puzzle.IH;
    fitTo({ x: -IW * 0.04, y: -IH * 0.06, w: IW * 1.08, h: IH * 1.12 });
    G.dirty = true;
    SN.sfx.fanfare();
    SN.fx.celebrate({
      img: G.img, stars: PAINTED_STARS,
      getRect: () => { const [x, y] = w2s(0, 0); return { x, y, w: IW * G.cam.s, h: IH * G.cam.s }; },
    });
    setTimeout(() => SN.emit('complete', result), 1400);
  }

  // ───────────────────────── 크기
  function resize() {
    if (!G.cv) return;
    const r = G.cv.getBoundingClientRect();
    const oldW = G.W, oldH = G.H;
    G.W = Math.max(1, r.width); G.H = Math.max(1, r.height);
    G.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    G.cv.width = Math.round(G.W * G.dpr); G.cv.height = Math.round(G.H * G.dpr);
    if (G.puzzle && oldW) {
      // 화면 가운데에 있던 지점을 유지하며, 맞춤 배율의 변화만큼 같이 키우고 줄인다
      const [cx, cy] = [(oldW / 2 - G.cam.ox) / G.cam.s, (oldH / 2 - G.cam.oy) / G.cam.s];
      const rel = G.cam.s / G.fitS;
      G.fitS = fitScaleFor(G.stats.done ? { x: 0, y: 0, w: G.puzzle.IW, h: G.puzzle.IH } : contentRect());
      G.cam.s = G.fitS * rel;
      G.cam.ox = G.W / 2 - cx * G.cam.s; G.cam.oy = G.H / 2 - cy * G.cam.s;
      clampCam();
    }
    G.dirty = true;
  }

  // ───────────────────────── 공개 API
  SN.game = {
    init(canvas, img) {
      G.cv = canvas; G.ctx = canvas.getContext('2d'); G.img = img;
      canvas.addEventListener('pointerdown', onDown);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      canvas.addEventListener('wheel', onWheel, { passive: false });
      canvas.addEventListener('contextmenu', onContext);
      // iOS 사파리: 화면 전체 확대 제스처 막기 (캔버스 위 핀치는 게임이 처리)
      document.addEventListener('gesturestart', (e) => { if (G.running) e.preventDefault(); });
      window.addEventListener('resize', resize);
      document.addEventListener('visibilitychange', () => { G.lastTick = performance.now(); if (document.visibilityState === 'hidden') save(); });
      window.addEventListener('pagehide', save);
      G.lastTick = performance.now();
      setInterval(tick, 250);
      resize();
      frame();
    },

    // opts: { level, seed?, rotate, ghost }, saved?: 저장 데이터
    start(opts, saved) {
      SN.fx.stop();
      G.opts = { level: opts.level, rotate: !!opts.rotate, ghost: opts.ghost !== false };
      const seed = saved ? saved.seed : (opts.seed ?? SN.newSeed());
      resize();
      G.puzzle = SN.generatePuzzle({ img: G.img, level: opts.level, seed });
      SN.bakeSprites(G.puzzle, G.img);
      G.pieces = G.puzzle.pieces;
      buildLayers();
      G.groups = new Map(G.pieces.map((p) => [p.id, [p]]));
      G.loose = G.pieces.slice();
      G.stats = { elapsed: 0, moves: 0, chancesUsed: 0, started: false, done: false };
      G.selected = null; G.hintGlow = null; G.anims = []; G.drag = null; G.pan = null; G.pinch = null; G.pointers.clear();
      const rnd = SN.rng(seed ^ 0x5eed);
      if (saved && saved.pieces && saved.pieces.length === G.pieces.length) {
        G.groups = new Map();
        saved.pieces.forEach(([x, y, rot, group, placed], i) => {
          const p = G.pieces[i]; p.x = x; p.y = y; p.rot = rot; p.group = group; p.placed = !!placed;
          if (p.placed) { p.x = p.hx; p.y = p.hy; p.rot = 0; drawPlaced(p); }
          else { if (!G.groups.has(group)) G.groups.set(group, []); G.groups.get(group).push(p); }
        });
        const order = (saved.order || []).map((id) => G.pieces[id]).filter((p) => p && !p.placed);
        G.loose = order.length === G.pieces.filter((p) => !p.placed).length ? order : G.pieces.filter((p) => !p.placed);
        G.table = saved.table || planTrays(G.loose.length).table;
        Object.assign(G.stats, { elapsed: saved.elapsed || 0, moves: saved.moves || 0, chancesUsed: saved.chancesUsed || 0, started: !!saved.started });
      } else {
        if (G.opts.rotate) G.pieces.forEach((p) => { p.rot = Math.floor(rnd() * 4); });
        arrange({ rnd });
      }
      fitTo(contentRect());
      G.running = true;
      G.lastTick = performance.now();
      save();
      SN.emit('progress', progress());
      return { pieces: G.pieces.length };
    },
    stop() { save(); G.running = false; SN.fx.stop(); },
    get running() { return G.running; },
    get done() { return G.stats.done; },
    get stats() { return G.stats; },
    get opts() { return G.opts; },
    progress,

    setGhost(v) { G.opts.ghost = !!v; G.dirty = true; },
    fit() { fitTo(G.stats.done ? { x: 0, y: 0, w: G.puzzle.IW, h: G.puzzle.IH } : contentRect()); },
    zoom(f) { zoomAt(G.W / 2, G.H / 2, f); },
    tidy() { if (!G.running || G.stats.done || G.anims.length) return; arrange({ tidy: true }); fitTo(contentRect()); scheduleSave(); },

    // 찬스: 선택한 조각(없으면 이미 맞춘 조각 옆에 갈 조각)을 제자리로 날려 보낸다
    useChance() {
      if (!G.running || G.stats.done || G.anims.length || G.drag) return { ok: false, reason: 'busy' };
      if (chancesLeft() <= 0) { SN.sfx.denied(); return { ok: false, reason: 'empty' }; }
      let target = G.selected && !G.selected.placed ? G.selected : null;
      if (!target) {
        let best = -1;
        for (const p of G.loose) {
          const score = p.neighbors.filter((q) => G.pieces[q].placed).length * 10 + (p.edge ? 3 : 0) + Math.random();
          if (score > best) { best = score; target = p; }
        }
      }
      if (!target) return { ok: false, reason: 'none' };
      const members = groupOf(target);
      G.stats.chancesUsed++;
      startClock();
      bringToTop(members);
      SN.sfx.chance();
      G.hintGlow = { p: target, t0: performance.now() };
      const dist = Math.hypot(target.x - target.hx, target.y - target.hy) * G.cam.s;
      G.anims.push({
        t0: performance.now() + 250, dur: SN.clamp(dist * 1.1, 450, 1000),
        items: members.map((m) => ({ p: m, x0: m.x, y0: m.y, x1: m.hx, y1: m.hy, r0: m.rot, r1: 0 })),
        done: () => { placeGroup(members); scheduleSave(); },
      });
      G.dirty = true;
      SN.emit('progress', progress());
      return { ok: true };
    },
    rotateSelected() {
      if (!G.opts.rotate || !G.selected || G.selected.placed || G.stats.done) return;
      const mem = groupOf(G.selected); rotateGroup(mem, { x: G.selected.x, y: G.selected.y }); SN.sfx.rotate(); G.stats.moves++; afterDrop(mem); scheduleSave(); G.dirty = true;
    },
    resize,
    save,

    // 테스트·자동 검증용: 조각을 화면에서 잡을 수 있는 점과 제자리(화면 좌표)
    probe(id) {
      const p = G.pieces[id];
      if (!p) return null;
      // 조각의 보이는 픽셀 중 중심에서 가장 가까운 점
      const H = p.hit; let best = null, bd = Infinity;
      for (let y = 0; y < H.ah; y++) for (let x = 0; x < H.aw; x++) {
        if (H.a[y * H.aw + x] < 200) continue;
        const lx = (x + 0.5) * H.step - p.bw / 2, ly = (y + 0.5) * H.step - p.bh / 2, dd = lx * lx + ly * ly;
        if (dd < bd) { bd = dd; best = [lx, ly]; }
      }
      const [rx, ry] = SN.rot90(best[0], best[1], p.rot);
      const [gx, gy] = w2s(p.x + rx, p.y + ry);
      const [tx, ty] = w2s(p.hx + best[0], p.hy + best[1]);
      const r = G.cv.getBoundingClientRect();
      return { grab: [gx + r.left, gy + r.top], home: [tx + r.left, ty + r.top], placed: p.placed, rot: p.rot, top: hitTest(p.x + rx, p.y + ry) === p };
    },
  };
})(window.SN);
