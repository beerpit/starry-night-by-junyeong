/* 조각 생성: 격자 → 직소 탭 곡선 → 팔레트 마스크와 겹침(coverage) 계산 → 자투리 병합 → 스프라이트 굽기 */
'use strict';
(function (SN) {
  // 난이도: 격자(열×행)는 그림 비율(약 1.5:1)에 맞춰 칸이 거의 정사각형이 되게 골랐다.
  SN.LEVELS = [
    { id: 1, key: 'sprout', name: '새싹', emoji: '🌱', cols: 3, rows: 2, chances: 1, hint: '처음 해 보는 친구' },
    { id: 2, key: 'star', name: '별빛', emoji: '⭐', cols: 4, rows: 3, chances: 2, hint: '조금 더 작게' },
    { id: 3, key: 'moon', name: '달빛', emoji: '🌙', cols: 6, rows: 4, chances: 3, hint: '진짜 퍼즐 시작' },
    { id: 4, key: 'swirl', name: '소용돌이', emoji: '🌀', cols: 8, rows: 5, chances: 4, hint: '집중력 필요' },
    { id: 5, key: 'galaxy', name: '은하수', emoji: '🌌', cols: 11, rows: 7, chances: 6, hint: '가족과 함께' },
    { id: 6, key: 'master', name: '고흐 마스터', emoji: '🎨', cols: 15, rows: 10, chances: 8, hint: '최고 난이도' },
  ];

  const MIN_COVER = 0.32;  // 칸 넓이 대비 그림이 이보다 적게 걸친 칸은 이웃 조각에 붙인다
  const EMPTY_COVER = 0.004; // 이보다 적으면 그림이 없는 칸 → 조각 없음

  // ── 팔레트 마스크(알파) 저해상도 정보 + 적분 영상 (칸별 넓이 계산을 O(1)로)
  let maskCache = null;
  SN.maskInfo = function (img) {
    if (maskCache && maskCache.img === img) return maskCache;
    const IW = img.naturalWidth || img.width, IH = img.naturalHeight || img.height;
    const w = 500, h = Math.round((w * IH) / IW);
    const c = SN.canvas(w, h), g = c.getContext('2d');
    g.drawImage(img, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    const integ = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) {
        row += d[(y * w + x) * 4 + 3] / 255;
        integ[(y + 1) * (w + 1) + (x + 1)] = integ[y * (w + 1) + (x + 1)] + row;
      }
    }
    maskCache = { img, IW, IH, w, h, sx: w / IW, sy: h / IH, integ, alpha: d };
    return maskCache;
  };
  // 이미지 좌표 사각형의 덮임 비율(0~1)
  function coverage(M, x0, y0, x1, y1) {
    const ax = SN.clamp(Math.round(x0 * M.sx), 0, M.w), ay = SN.clamp(Math.round(y0 * M.sy), 0, M.h);
    const bx = SN.clamp(Math.round(x1 * M.sx), 0, M.w), by = SN.clamp(Math.round(y1 * M.sy), 0, M.h);
    const W1 = M.w + 1, area = (bx - ax) * (by - ay);
    if (area <= 0) return 0;
    const s = M.integ[by * W1 + bx] - M.integ[ay * W1 + bx] - M.integ[by * W1 + ax] + M.integ[ay * W1 + ax];
    return s / area;
  }
  // 선분 위 알파 평균 (두 칸이 실제로 맞닿아 보이는지)
  function lineAlpha(M, x0, y0, x1, y1) {
    let s = 0; const n = 24;
    for (let i = 0; i <= n; i++) {
      const x = SN.clamp(Math.floor(SN.lerp(x0, x1, i / n) * M.sx), 0, M.w - 1);
      const y = SN.clamp(Math.floor(SN.lerp(y0, y1, i / n) * M.sy), 0, M.h - 1);
      s += M.alpha[(y * M.w + x) * 4 + 3] / 255;
    }
    return s / (n + 1);
  }

  // 조각 수만 미리 계산 (시작 화면 표시용, 탭 모양과 무관하므로 시드 불필요)
  SN.countPieces = function (img, level) {
    const L = SN.LEVELS[level - 1];
    return planCells(SN.maskInfo(img), L.cols, L.rows).pieceCells.length;
  };

  // 칸 → 조각 묶음 계획
  function planCells(M, cols, rows) {
    const cw = M.IW / cols, ch = M.IH / rows;
    const cov = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      cov.push(coverage(M, c * cw, r * ch, (c + 1) * cw, (r + 1) * ch));
    }
    const owner = cov.map((v, i) => (v < EMPTY_COVER ? -1 : i)); // 칸 → 대표 칸
    const find = (i) => { while (owner[i] !== i) i = owner[i] = owner[owner[i]]; return i; };
    const sum = cov.map((v) => v); // 대표 칸 기준 누적 덮임
    const nb = (i) => {
      const r = Math.floor(i / cols), c = i % cols, out = [];
      if (c > 0) out.push([i - 1, 'v', r, c]); if (c < cols - 1) out.push([i + 1, 'v', r, c + 1]);
      if (r > 0) out.push([i - cols, 'h', r, c]); if (r < rows - 1) out.push([i + cols, 'h', r + 1, c]);
      return out;
    };
    const order = cov.map((v, i) => i).filter((i) => owner[i] >= 0 && cov[i] < MIN_COVER).sort((a, b) => cov[a] - cov[b]);
    for (const i of order) {
      const ri = find(i);
      if (sum[ri] >= MIN_COVER) continue;
      let best = -1, bestScore = -1;
      for (const [j, kind, er, ec] of nb(i)) {
        if (owner[j] < 0) continue;
        const rj = find(j);
        if (rj === ri) continue;
        // 맞닿은 변이 실제로 보이는 쪽을 우선, 그다음 덮임이 큰 이웃
        const seen = kind === 'v'
          ? lineAlpha(M, ec * cw, er * ch, ec * cw, (er + 1) * ch)
          : lineAlpha(M, ec * cw, er * ch, (ec + 1) * cw, er * ch);
        const score = seen * 10 + sum[rj];
        if (score > bestScore) { bestScore = score; best = rj; }
      }
      if (best >= 0) { owner[ri] = best; sum[best] += sum[ri]; }
    }
    const groups = new Map();
    cov.forEach((v, i) => { if (owner[i] < 0) return; const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); });
    return { cw, ch, cov, pieceCells: [...groups.values()] };
  }

  // ── 직소 탭 곡선 (Draradech 의 jigsaw 생성식을 변형) : A→B 직선에 수직 방향 탭
  function bezierPts(p0, p1, p2, p3, n, out) {
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      out.push([
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
      ]);
    }
  }
  function tabEdge(ax, ay, bx, by, S, rnd, straight) {
    if (straight) return [[ax, ay], [bx, by]];
    const L = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / L, uy = (by - ay) / L;
    const nx = -uy, ny = ux; // 진행 방향의 왼쪽(화면 좌표에선 아래/오른쪽 방향이 될 수 있음)
    const flip = rnd() < 0.5 ? -1 : 1;
    const t = rnd.range(0.082, 0.098), j = 0.025;
    const a = rnd.range(-j, j), b = rnd.range(-j, j), c = rnd.range(-j, j), d = rnd.range(-j, j), e = rnd.range(-j, j);
    // (l: 진행 방향 비율, w: 수직 방향 — S 기준)
    const P = (l, w) => [ax + ux * l * L + nx * w * S * flip, ay + uy * l * L + ny * w * S * flip];
    const k = S / L; // 수직 오프셋을 진행 방향 비율로 쓰는 항목 보정
    const p0 = P(0, 0), p1 = P(0.2, a), p2 = P(0.5 + (b + d) * k, -t + c), p3 = P(0.5 + (-t + b) * k, t + c);
    const p4 = P(0.5 + (-2 * t + b - d) * k, 3 * t + c), p5 = P(0.5 + (2 * t + b - d) * k, 3 * t + c);
    const p6 = P(0.5 + (t + b) * k, t + c), p7 = P(0.5 + (b + d) * k, -t + c), p8 = P(0.8, e), p9 = P(1, 0);
    const pts = [p0];
    bezierPts(p0, p1, p2, p3, 10, pts);
    bezierPts(p3, p4, p5, p6, 14, pts);
    bezierPts(p6, p7, p8, p9, 10, pts);
    return pts;
  }

  // ── 퍼즐 생성
  //   opts: { img, level, seed, rotate }
  SN.generatePuzzle = function (opts) {
    const L = SN.LEVELS[opts.level - 1];
    const M = SN.maskInfo(opts.img);
    const { cols, rows } = L;
    const plan = planCells(M, cols, rows);
    const { cw, ch } = plan;
    const S = Math.min(cw, ch);
    const rnd = SN.rng(opts.seed);
    // 가로 변 h[r][c]: y=r*ch, x: c*cw→(c+1)*cw / 세로 변 v[r][c]: x=c*cw, y: r*ch→(r+1)*ch
    const h = [], v = [];
    for (let r = 0; r <= rows; r++) {
      h.push([]);
      for (let c = 0; c < cols; c++) h[r].push(tabEdge(c * cw, r * ch, (c + 1) * cw, r * ch, S, rnd, r === 0 || r === rows));
    }
    for (let r = 0; r < rows; r++) {
      v.push([]);
      for (let c = 0; c <= cols; c++) v[r].push(tabEdge(c * cw, r * ch, c * cw, (r + 1) * ch, S, rnd, c === 0 || c === cols));
    }
    const cellPoly = (i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const top = h[r][c], right = v[r][c + 1], bottom = h[r + 1][c].slice().reverse(), left = v[r][c].slice().reverse();
      return [...top, ...right.slice(1), ...bottom.slice(1), ...left.slice(1, -1)];
    };

    const cellPiece = new Array(cols * rows).fill(-1);
    const pieces = plan.pieceCells.map((cells, id) => {
      cells.forEach((i) => (cellPiece[i] = id));
      const polys = cells.map(cellPoly);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const poly of polys) for (const [x, y] of poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      x0 = Math.floor(Math.max(0, x0)); y0 = Math.floor(Math.max(0, y0));
      x1 = Math.ceil(Math.min(M.IW, x1)); y1 = Math.ceil(Math.min(M.IH, y1));
      const covArea = cells.reduce((s, i) => s + plan.cov[i], 0);
      return {
        id, cells, polys,
        bx: x0, by: y0, bw: x1 - x0, bh: y1 - y0,
        hx: (x0 + x1) / 2, hy: (y0 + y1) / 2, // 제자리(중심) 좌표
        edge: covArea / cells.length < 0.985, // 팔레트 윤곽·엄지 구멍에 닿는 조각
        neighbors: [],
        x: 0, y: 0, rot: 0, placed: false, group: id, z: 0,
      };
    });
    // 이웃 (칸 4-이웃 중 다른 조각)
    for (let i = 0; i < cols * rows; i++) {
      const p = cellPiece[i]; if (p < 0) continue;
      const r = Math.floor(i / cols), c = i % cols;
      for (const j of [c < cols - 1 ? i + 1 : -1, r < rows - 1 ? i + cols : -1]) {
        if (j < 0) continue; const q = cellPiece[j];
        if (q < 0 || q === p) continue;
        if (!pieces[p].neighbors.includes(q)) pieces[p].neighbors.push(q);
        if (!pieces[q].neighbors.includes(p)) pieces[q].neighbors.push(p);
      }
    }
    return { level: L, cols, rows, cw, ch, S, IW: M.IW, IH: M.IH, pieces, seed: opts.seed };
  };

  SN.piecePath = function (p, dx = 0, dy = 0) {
    const path = new Path2D();
    for (const poly of p.polys) {
      path.moveTo(poly[0][0] + dx, poly[0][1] + dy);
      for (let k = 1; k < poly.length; k++) path.lineTo(poly[k][0] + dx, poly[k][1] + dy);
      path.closePath();
    }
    return path;
  };

  // ── 스프라이트 굽기: 잘린 그림 + 입체 테두리(빛/그늘) + 그림자. 맞힘 판정용 저해상도 알파도 만든다.
  SN.bakeSprites = function (puzzle, img) {
    const S = puzzle.S;
    const k = Math.max(1.5, S * 0.014);               // 입체 테두리 두께
    const blur = SN.clamp(S * 0.06, 4, 16);            // 그림자 번짐
    const pad = Math.ceil(blur * 1.6 + 2);
    puzzle.pad = pad;
    for (const p of puzzle.pieces) {
      const base = SN.canvas(p.bw, p.bh), g = base.getContext('2d');
      g.save();
      g.clip(SN.piecePath(p, -p.bx, -p.by));
      g.drawImage(img, -p.bx, -p.by);
      g.restore();
      // 빛(왼쪽 위 테두리)
      const rim = SN.canvas(p.bw, p.bh), rg = rim.getContext('2d');
      const bevel = (color, ox, oy, alpha) => {
        rg.globalCompositeOperation = 'source-over';
        rg.clearRect(0, 0, p.bw, p.bh);
        rg.drawImage(base, 0, 0);
        rg.globalCompositeOperation = 'source-in';
        rg.fillStyle = color; rg.fillRect(0, 0, p.bw, p.bh);
        rg.globalCompositeOperation = 'destination-out';
        rg.drawImage(base, ox, oy);
        g.globalAlpha = alpha; g.drawImage(rim, 0, 0); g.globalAlpha = 1;
      };
      bevel('#ffffff', k, k, 0.42);
      bevel('#000000', -k, -k, 0.38);
      // 맞힘 판정 알파 (4px 간격)
      const step = 4, aw = Math.ceil(p.bw / step), ah = Math.ceil(p.bh / step);
      const small = SN.canvas(aw, ah), sg = small.getContext('2d');
      sg.drawImage(base, 0, 0, aw, ah);
      const ad = sg.getImageData(0, 0, aw, ah).data;
      const hit = new Uint8Array(aw * ah);
      for (let i = 0; i < aw * ah; i++) hit[i] = ad[i * 4 + 3];
      p.hit = { step, aw, ah, a: hit };
      // 최종 스프라이트 (그림자 포함)
      const sp = SN.canvas(p.bw + pad * 2, p.bh + pad * 2), spg = sp.getContext('2d');
      spg.shadowColor = 'rgba(0, 0, 20, 0.55)';
      spg.shadowBlur = blur; spg.shadowOffsetX = 0; spg.shadowOffsetY = blur * 0.35;
      spg.drawImage(base, pad, pad);
      p.sprite = sp;
    }
  };

  // 화면 맞힘: 월드 좌표(wx, wy)가 조각의 보이는 부분 위인지
  SN.hitPiece = function (p, wx, wy) {
    let dx = wx - p.x, dy = wy - p.y;
    [dx, dy] = SN.rot90(dx, dy, -p.rot);
    const lx = dx + p.bw / 2, ly = dy + p.bh / 2;
    if (lx < 0 || ly < 0 || lx >= p.bw || ly >= p.bh) return false;
    const H = p.hit;
    return H.a[Math.floor(ly / H.step) * H.aw + Math.floor(lx / H.step)] > 70;
  };
})(window.SN);
