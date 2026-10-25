/*
 * 조각 생성기 — 팔레트 모양 그림을 직소 조각으로 자른다.
 *
 *  1) 격자: cols×rows 칸, 안쪽 꼭짓점을 살짝 흔들어 손으로 자른 듯한 느낌
 *  2) 이음매: 이웃한 두 칸이 모두 그림 위에 있으면 베지어 곡선 「꼭지(탭)」, 아니면 직선
 *     같은 이음매를 양쪽 칸이 공유하므로(한쪽은 정방향, 한쪽은 역방향) 틈·겹침이 없다
 *  3) 라벨링: 저해상도 팔레트 마스크의 각 칸(그림 4px)이 어느 격자 칸 경로 안에 있는지 판정
 *  4) 연결 성분: 같은 칸 라벨끼리 4-이웃으로 묶은 「파편」 — 엄지 구멍·손잡이 홈 때문에
 *     한 칸이 둘로 끊어질 수 있어서 칸이 아니라 파편 단위로 다룬다
 *  5) 병합: 기준보다 작은 파편은 경계를 가장 길게 맞댄 이웃에 합쳐(작은 것부터) 손으로 집을 수 있는 크기로
 *
 * 결과 조각 = { 칸 경로들의 합집합 ∩ 조각 영역(마스크 해상도, 1칸 팽창) } — 그림의 투명도가 팔레트 윤곽을 만든다.
 * getImageData 를 쓰지 않으므로 file:// 로 열어도(캔버스 오염) 동작한다.
 */
(function () {
  'use strict';
  const SNP = (window.SNP = window.SNP || {});
  const U = SNP.util;

  const MIN_FRAC = 0.3;     // 조각 최소 넓이 = 칸 넓이 × MIN_FRAC
  const JITTER = 0.16;      // 꼭짓점 흔들림(칸 크기 대비)

  /** 직선 이음매도 3차 베지어 하나로 표현(경로 이어 붙이기를 단순하게) */
  function straightEdge(a, b) {
    return [a, [U.lerp(a[0], b[0], 1 / 3), U.lerp(a[1], b[1], 1 / 3)], [U.lerp(a[0], b[0], 2 / 3), U.lerp(a[1], b[1], 2 / 3)], b];
  }

  /**
   * 꼭지가 달린 이음매: 베지어 3개(점 10개). 널리 쓰이는 「직소 베지어 탭」 형태를
   * 이음매 방향(l)·법선(w) 좌표로 정의하고 난수로 모양을 조금씩 다르게 한다.
   */
  function tabEdge(a, b, rnd) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    const ux = dx / len, uy = dy / len;
    const flip = rnd() < 0.5 ? 1 : -1;
    const nx = -uy * flip, ny = ux * flip;
    const t = 0.085 + rnd() * 0.03;                     // 꼭지 크기
    const j = () => (rnd() * 2 - 1) * 0.035;            // 모양 흔들기
    const A = j(), B = j(), C = j(), D = j(), E = j();
    const P = (l, w) => [a[0] + ux * l * len + nx * w * len, a[1] + uy * l * len + ny * w * len];
    return [
      P(0, 0),
      P(0.2, A), P(0.5 + B + D, -t + C), P(0.5 - t + B, t + C),
      P(0.5 - 2 * t + B - D, 3 * t + C), P(0.5 + 2 * t + B - D, 3 * t + C), P(0.5 + t + B, t + C),
      P(0.5 + B + D, -t + C), P(0.8, E), P(1, 0),
    ];
  }

  function reversed(e) { return e.slice().reverse(); }

  function appendEdge(path, e, first) {
    if (first) path.moveTo(e[0][0], e[0][1]);
    for (let k = 1; k < e.length; k += 3) {
      path.bezierCurveTo(e[k][0], e[k][1], e[k + 1][0], e[k + 1][1], e[k + 2][0], e[k + 2][1]);
    }
  }

  /**
   * @param o {W,H, mask(Uint8Array), maskW, maskH, step, cols, rows, seed, luma, lumaW, lumaH, lumaStep}
   * @param onProgress (0~1) 진행 알림(선택)
   */
  async function generate(o, onProgress) {
    const { W, H, mask, maskW, maskH, step, cols, rows } = o;
    const rnd = U.mulberry32(o.seed);
    const cw = W / cols, ch = H / rows;
    const NX = cols + 1;

    // ---------- 1) 꼭짓점 ----------
    const corner = [];
    for (let jy = 0; jy <= rows; jy++) {
      for (let ix = 0; ix <= cols; ix++) {
        const inX = ix > 0 && ix < cols, inY = jy > 0 && jy < rows;
        corner.push([
          ix * cw + (inX ? (rnd() - 0.5) * JITTER * cw : 0),
          jy * ch + (inY ? (rnd() - 0.5) * JITTER * ch : 0),
        ]);
      }
    }
    const C = (ix, jy) => corner[jy * NX + ix];
    const cellIdx = (ix, jy) => jy * cols + ix;

    // ---------- 칸별 그림 덮임 비율(시드와 무관) ----------
    const cov = coverage(o);
    const active = (c) => c >= 0 && cov[c] > 0;

    // ---------- 2) 이음매 ----------
    const hE = [], vE = [];
    for (let jy = 0; jy <= rows; jy++) {
      hE.push([]);
      for (let ix = 0; ix < cols; ix++) {
        const up = jy > 0 ? cellIdx(ix, jy - 1) : -1, dn = jy < rows ? cellIdx(ix, jy) : -1;
        const tab = active(up) && active(dn);
        hE[jy].push(tab ? tabEdge(C(ix, jy), C(ix + 1, jy), rnd) : straightEdge(C(ix, jy), C(ix + 1, jy)));
      }
    }
    for (let ix = 0; ix <= cols; ix++) {
      vE.push([]);
      for (let jy = 0; jy < rows; jy++) {
        const lf = ix > 0 ? cellIdx(ix - 1, jy) : -1, rt = ix < cols ? cellIdx(ix, jy) : -1;
        const tab = active(lf) && active(rt);
        vE[ix].push(tab ? tabEdge(C(ix, jy), C(ix, jy + 1), rnd) : straightEdge(C(ix, jy), C(ix, jy + 1)));
      }
    }
    // 칸 윤곽 = 위(→) 오른쪽(↓) 아래(←) 왼쪽(↑): 모든 칸이 같은 방향(시계)이라 합집합이 nonzero 로 깔끔
    function cellEdges(ix, jy) {
      return [hE[jy][ix], vE[ix + 1][jy], reversed(hE[jy + 1][ix]), reversed(vE[ix][jy])];
    }
    function appendCell(path, c) {
      const ix = c % cols, jy = (c / cols) | 0;
      const es = cellEdges(ix, jy);
      for (let k = 0; k < 4; k++) appendEdge(path, es[k], k === 0);
      path.closePath();
    }
    const cellPath = new Array(cols * rows);
    const cellBox = new Array(cols * rows);
    for (let c = 0; c < cols * rows; c++) {
      if (!active(c)) continue;
      const p = new Path2D();
      appendCell(p, c);
      cellPath[c] = p;
      // 칸 안쪽 「안전 영역」: 꼭지가 닿을 수 없는 곳은 경로 판정 없이 바로 라벨
      const ix = c % cols, jy = (c / cols) | 0;
      // 꼭지 최대 돌출 ≈ 이음매 길이 × (2.5t + C) ≤ 0.32 → 여유를 두어 0.36
      // 세로 이음매(길이 ch)의 꼭지는 가로로, 가로 이음매(길이 cw)의 꼭지는 세로로 튀어나온다
      const reachFromV = 0.36 * ch, reachFromH = 0.36 * cw;
      cellBox[c] = {
        x0: Math.max(C(ix, jy)[0], C(ix, jy + 1)[0]) + reachFromV,
        x1: Math.min(C(ix + 1, jy)[0], C(ix + 1, jy + 1)[0]) - reachFromV,
        y0: Math.max(C(ix, jy)[1], C(ix + 1, jy)[1]) + reachFromH,
        y1: Math.min(C(ix, jy + 1)[1], C(ix + 1, jy + 1)[1]) - reachFromH,
      };
    }

    // ---------- 3) 라벨링 ----------
    const hitCanvas = U.makeCanvas(W, H);
    const hit = hitCanvas.getContext('2d');
    const N = maskW * maskH;
    const label = new Int32Array(N).fill(-1);
    const ORDER = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
    let t0 = performance.now();
    for (let my = 0; my < maskH; my++) {
      const py = (my + 0.5) * step;
      for (let mx = 0; mx < maskW; mx++) {
        const k = my * maskW + mx;
        if (!mask[k]) continue;
        const px = (mx + 0.5) * step;
        const i0 = U.clamp(Math.floor(px / cw), 0, cols - 1), j0 = U.clamp(Math.floor(py / ch), 0, rows - 1);
        const c0 = cellIdx(i0, j0);
        const bx = cellBox[c0];
        if (bx && px > bx.x0 && px < bx.x1 && py > bx.y0 && py < bx.y1) { label[k] = c0; continue; }
        let found = -1;
        for (let q = 0; q < ORDER.length; q++) {
          const ix = i0 + ORDER[q][0], jy = j0 + ORDER[q][1];
          if (ix < 0 || jy < 0 || ix >= cols || jy >= rows) continue;
          const c = cellIdx(ix, jy);
          if (cellPath[c] && hit.isPointInPath(cellPath[c], px, py)) { found = c; break; }
        }
        if (found < 0) found = cellPath[c0] ? c0 : -1;
        label[k] = found;
      }
      if (performance.now() - t0 > 24) {      // 화면이 멈추지 않게 틈틈이 양보
        if (onProgress) onProgress(0.6 * my / maskH);
        await U.nextFrame();
        t0 = performance.now();
      }
    }
    U.freeCanvas(hitCanvas);

    // ---------- 4) 파편(연결 성분) ----------
    const frag = new Int32Array(N).fill(-1);
    const frags = [];
    const stack = new Int32Array(N);
    for (let k = 0; k < N; k++) {
      if (label[k] < 0 || frag[k] >= 0) continue;
      const id = frags.length, lab = label[k];
      const f = { id, cell: lab, area: 0, x0: 1e9, y0: 1e9, x1: -1, y1: -1, sx: 0, sy: 0 };
      let sp = 0;
      stack[sp++] = k; frag[k] = id;
      while (sp) {
        const q = stack[--sp];
        const x = q % maskW, y = (q / maskW) | 0;
        f.area++; f.sx += x; f.sy += y;
        if (x < f.x0) f.x0 = x; if (x > f.x1) f.x1 = x;
        if (y < f.y0) f.y0 = y; if (y > f.y1) f.y1 = y;
        if (x > 0 && frag[q - 1] < 0 && label[q - 1] === lab) { frag[q - 1] = id; stack[sp++] = q - 1; }
        if (x < maskW - 1 && frag[q + 1] < 0 && label[q + 1] === lab) { frag[q + 1] = id; stack[sp++] = q + 1; }
        if (y > 0 && frag[q - maskW] < 0 && label[q - maskW] === lab) { frag[q - maskW] = id; stack[sp++] = q - maskW; }
        if (y < maskH - 1 && frag[q + maskW] < 0 && label[q + maskW] === lab) { frag[q + maskW] = id; stack[sp++] = q + maskW; }
      }
      frags.push(f);
    }
    if (onProgress) onProgress(0.7);

    // 파편 사이 맞닿은 경계 길이
    const border = new Map();
    const addB = (a, b) => {
      if (a === b || a < 0 || b < 0) return;
      const key = a < b ? a * 65536 + b : b * 65536 + a;
      border.set(key, (border.get(key) || 0) + 1);
    };
    for (let y = 0; y < maskH; y++) {
      for (let x = 0; x < maskW; x++) {
        const k = y * maskW + x;
        const f = frag[k];
        if (f < 0) continue;
        if (x < maskW - 1) addB(f, frag[k + 1]);
        if (y < maskH - 1) addB(f, frag[k + maskW]);
      }
    }

    // ---------- 5) 작은 파편 병합(union-find, 작은 것부터) ----------
    const parent = frags.map((f) => f.id);
    const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    const area = frags.map((f) => f.area);
    const minArea = (MIN_FRAC * cw * ch) / (step * step);
    for (let guard = 0; guard < frags.length; guard++) {
      // 묶음 사이 인접 길이
      const adj = new Map();
      border.forEach((cnt, key) => {
        const ra = find(Math.floor(key / 65536)), rb = find(key % 65536);
        if (ra === rb) return;
        if (!adj.has(ra)) adj.set(ra, new Map());
        if (!adj.has(rb)) adj.set(rb, new Map());
        adj.get(ra).set(rb, (adj.get(ra).get(rb) || 0) + cnt);
        adj.get(rb).set(ra, (adj.get(rb).get(ra) || 0) + cnt);
      });
      let small = -1;
      for (let i = 0; i < frags.length; i++) {
        if (find(i) !== i || area[i] >= minArea || !adj.has(i)) continue;
        if (small < 0 || area[i] < area[small] || (area[i] === area[small] && i < small)) small = i;
      }
      if (small < 0) break;
      let best = -1, bestLen = -1;
      adj.get(small).forEach((len, other) => {
        if (len > bestLen || (len === bestLen && other < best)) { best = other; bestLen = len; }
      });
      parent[small] = best;
      area[best] += area[small];
    }

    // 이웃이 하나도 없는 아주 작은 섬은 버린다(손가락으로 집을 수 없음, 완성 때는 원본 그림이 덮음)
    const roots = [];
    for (let i = 0; i < frags.length; i++) {
      if (find(i) !== i) continue;
      if (area[i] < minArea * 0.15) continue;
      roots.push(i);
    }
    if (onProgress) onProgress(0.8);

    // ---------- 6) 조각 객체 ----------
    const rootInfo = new Map();
    for (const r of roots) rootInfo.set(r, { frags: [], x0: 1e9, y0: 1e9, x1: -1, y1: -1, sx: 0, sy: 0, area: 0 });
    for (const f of frags) {
      const info = rootInfo.get(find(f.id));
      if (!info) continue;
      info.frags.push(f);
      info.x0 = Math.min(info.x0, f.x0); info.y0 = Math.min(info.y0, f.y0);
      info.x1 = Math.max(info.x1, f.x1); info.y1 = Math.max(info.y1, f.y1);
      info.sx += f.sx; info.sy += f.sy; info.area += f.area;
    }
    // 조각 번호: 위→아래, 왼→오른 순(시드가 같으면 늘 같은 번호 → 저장·재개에 필요)
    const ordered = roots.map((r) => ({ r, info: rootInfo.get(r) }));
    ordered.forEach((o2) => { o2.cy = o2.info.sy / o2.info.area; o2.cx = o2.info.sx / o2.info.area; });
    ordered.sort((a, b) => Math.floor(a.cy / (ch / step)) - Math.floor(b.cy / (ch / step)) || a.cx - b.cx);
    const pieceOfRoot = new Map();
    ordered.forEach((o2, i) => pieceOfRoot.set(o2.r, i));

    const pieceAt = new Int32Array(N).fill(-1);
    for (let k = 0; k < N; k++) {
      if (frag[k] < 0) continue;
      const p = pieceOfRoot.get(find(frag[k]));
      if (p !== undefined) pieceAt[k] = p;
    }

    const lumaBytes = o.luma;
    const pieces = ordered.map((o2, id) => {
      const info = o2.info;
      // 영역 비트맵: 경계 상자 + 2칸 여유, 1칸 팽창(잘린 선 근처 칸이 빠지지 않게)
      const rx = Math.max(0, info.x0 - 2), ry = Math.max(0, info.y0 - 2);
      const rx1 = Math.min(maskW - 1, info.x1 + 2), ry1 = Math.min(maskH - 1, info.y1 + 2);
      const rw = rx1 - rx + 1, rh = ry1 - ry + 1;
      const raw = new Uint8Array(rw * rh);
      let isEdge = false, lumaSum = 0, lumaN = 0;
      for (let y = info.y0; y <= info.y1; y++) {
        for (let x = info.x0; x <= info.x1; x++) {
          const k = y * maskW + x;
          if (pieceAt[k] !== id) continue;
          raw[(y - ry) * rw + (x - rx)] = 1;
          if (!isEdge && (x === 0 || y === 0 || x === maskW - 1 || y === maskH - 1 ||
            !mask[k - 1] || !mask[k + 1] || !mask[k - maskW] || !mask[k + maskW])) isEdge = true;
          if (lumaBytes && ((x + y) & 1) === 0) {
            const lx = Math.min(o.lumaW - 1, Math.floor((x * step) / o.lumaStep));
            const ly = Math.min(o.lumaH - 1, Math.floor((y * step) / o.lumaStep));
            lumaSum += lumaBytes[ly * o.lumaW + lx]; lumaN++;
          }
        }
      }
      const region = new Uint8Array(rw * rh);
      for (let y = 0; y < rh; y++) {
        for (let x = 0; x < rw; x++) {
          if (raw[y * rw + x]) { region[y * rw + x] = 1; continue; }
          let on = 0;
          for (let dy = -1; dy <= 1 && !on; dy++) {
            const yy = y + dy;
            if (yy < 0 || yy >= rh) continue;
            for (let dx = -1; dx <= 1; dx++) {
              const xx = x + dx;
              if (xx >= 0 && xx < rw && raw[yy * rw + xx]) { on = 1; break; }
            }
          }
          region[y * rw + x] = on;
        }
      }
      const cells = Array.from(new Set(info.frags.map((f) => f.cell))).sort((a, b) => a - b);
      const path = new Path2D();
      cells.forEach((c) => appendCell(path, c));
      // 그림 좌표(px) 경계 상자: 팽창한 영역 범위
      const x0 = Math.max(0, (info.x0 - 1) * step), y0 = Math.max(0, (info.y0 - 1) * step);
      const x1 = Math.min(W, (info.x1 + 2) * step), y1 = Math.min(H, (info.y1 + 2) * step);
      return {
        id, cells, path, isEdge,
        luma: lumaN ? lumaSum / lumaN : 128,
        area: info.area * step * step,
        rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
        region: { x: rx, y: ry, w: rw, h: rh, data: region },
        neighbors: new Set(),
      };
    });

    // 조각 이웃(찬스가 「이미 맞춘 조각 옆」을 고를 때 사용)
    border.forEach((cnt, key) => {
      const pa = pieceOfRoot.get(find(Math.floor(key / 65536))), pb = pieceOfRoot.get(find(key % 65536));
      if (pa === undefined || pb === undefined || pa === pb) return;
      pieces[pa].neighbors.add(pb);
      pieces[pb].neighbors.add(pa);
    });
    if (onProgress) onProgress(0.85);

    return { pieces, cols, rows, cw, ch, step };
  }

  /** 칸마다 그림이 덮는 비율(0~1). 시드와 무관 → 시작 화면의 「약 N조각」 추정에도 사용 */
  function coverage(o) {
    const { W, H, mask, maskW, maskH, step, cols, rows } = o;
    const cw = W / cols, ch = H / rows;
    const cov = new Float32Array(cols * rows);
    for (let my = 0; my < maskH; my++) {
      const j = Math.min(rows - 1, Math.floor(((my + 0.5) * step) / ch));
      for (let mx = 0; mx < maskW; mx++) {
        if (!mask[my * maskW + mx]) continue;
        const i = Math.min(cols - 1, Math.floor(((mx + 0.5) * step) / cw));
        cov[j * cols + i]++;
      }
    }
    const per = (cw * ch) / (step * step);
    for (let c = 0; c < cov.length; c++) cov[c] /= per;
    return cov;
  }

  /** 조각 수 추정(시작 화면 표시용) */
  function estimateCount(o) {
    const cov = coverage(o);
    let n = 0;
    for (let c = 0; c < cov.length; c++) if (cov[c] >= MIN_FRAC) n++;
    return n;
  }

  SNP.jigsaw = { generate, estimateCount };
})();
