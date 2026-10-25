/*
 * 조각 굽기 — 조각마다 미리 그려 둔 캔버스 두 장을 만든다.
 *   face   : 그림을 조각 모양으로 오리고 입체감(왼쪽 위 하이라이트·오른쪽 아래 그늘)을 더한 것
 *   shadow : face 에 바닥 그림자를 더한 것(흩어진 조각용)
 * 매 프레임에는 drawImage 한 번씩만 하므로 조각이 200개여도 휴대폰에서 부드럽다.
 */
(function () {
  'use strict';
  const SNP = (window.SNP = window.SNP || {});
  const U = SNP.util;

  function regionCanvas(region) {
    const c = U.makeCanvas(region.w, region.h);
    const ctx = c.getContext('2d');
    const id = ctx.createImageData(region.w, region.h);
    const d = id.data, src = region.data;
    for (let i = 0; i < src.length; i++) {
      if (!src[i]) continue;
      const o = i * 4;
      d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = 255;
    }
    ctx.putImageData(id, 0, 0);
    return c;
  }

  /**
   * @param gen  jigsaw.generate 결과
   * @param img  팔레트 그림(HTMLImageElement)
   */
  async function bake(gen, img, onProgress) {
    const { pieces, cw, ch, step } = gen;
    const cell = Math.min(cw, ch);
    const pad = Math.round(U.clamp(cell * 0.08, 7, 20));
    const bevel = U.clamp(cell / 75, 1.4, 3.2);
    // 작업용 캔버스는 가장 큰 조각 크기로 하나씩만 만들어 재사용
    let maxW = 0, maxH = 0;
    pieces.forEach((p) => { maxW = Math.max(maxW, p.rect.w + pad * 2); maxH = Math.max(maxH, p.rect.h + pad * 2); });
    const sil = U.makeCanvas(maxW, maxH), sctx = sil.getContext('2d');
    const rim = U.makeCanvas(maxW, maxH), rctx = rim.getContext('2d');

    let t0 = performance.now();
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i];
      const w = p.rect.w + pad * 2, h = p.rect.h + pad * 2;
      const face = U.makeCanvas(w, h);
      const f = face.getContext('2d');

      // 1) 이음매 경로로 오린 그림
      f.save();
      f.translate(pad - p.rect.x, pad - p.rect.y);
      f.clip(p.path);
      f.drawImage(img, p.rect.x, p.rect.y, p.rect.w, p.rect.h, p.rect.x, p.rect.y, p.rect.w, p.rect.h);
      f.restore();
      // 2) 조각 영역(마스크 해상도)으로 한 번 더 — 같은 칸이 구멍 때문에 둘로 나뉜 경우 대비
      const rc = regionCanvas(p.region);
      f.globalCompositeOperation = 'destination-in';
      f.imageSmoothingEnabled = true;
      f.drawImage(rc, pad + p.region.x * step - p.rect.x, pad + p.region.y * step - p.rect.y, p.region.w * step, p.region.h * step);
      U.freeCanvas(rc);
      f.globalCompositeOperation = 'source-over';

      // 3) 입체 테두리: 실루엣에서 어긋난 실루엣을 빼면 한쪽 가장자리만 남는다
      sctx.clearRect(0, 0, maxW, maxH);
      sctx.globalCompositeOperation = 'source-over';
      sctx.drawImage(face, 0, 0);
      sctx.globalCompositeOperation = 'source-in';
      sctx.fillStyle = '#fff';
      sctx.fillRect(0, 0, w, h);
      sctx.globalCompositeOperation = 'source-over';
      drawRim(f, rctx, sil, w, h, bevel, bevel, 'rgba(255,255,255,1)', 0.5);   // 왼쪽 위 빛
      drawRim(f, rctx, sil, w, h, -bevel, -bevel, 'rgba(0,0,20,1)', 0.55);     // 오른쪽 아래 그늘

      // 4) 그림자 버전 + 바깥 가는 빛 테두리(검은 나무 조각도 어두운 탁자에서 잘 보이게)
      const shadow = U.makeCanvas(w, h);
      const s = shadow.getContext('2d');
      s.shadowColor = 'rgba(0, 0, 10, 0.55)';
      s.shadowBlur = pad * 0.55;
      s.shadowOffsetX = pad * 0.18;
      s.shadowOffsetY = pad * 0.28;
      s.drawImage(face, 0, 0);
      s.shadowColor = 'transparent';
      rctx.clearRect(0, 0, maxW, maxH);
      rctx.globalCompositeOperation = 'source-over';
      const o = 1.3;
      [[o, 0], [-o, 0], [0, o], [0, -o], [o * 0.7, o * 0.7], [-o * 0.7, o * 0.7], [o * 0.7, -o * 0.7], [-o * 0.7, -o * 0.7]]
        .forEach(([dx, dy]) => rctx.drawImage(sil, dx, dy));
      rctx.globalCompositeOperation = 'destination-out';
      rctx.drawImage(sil, 0, 0);
      rctx.globalCompositeOperation = 'source-in';
      rctx.fillStyle = 'rgba(200, 220, 255, 0.55)';
      rctx.fillRect(0, 0, w, h);
      rctx.globalCompositeOperation = 'source-over';
      s.drawImage(rim, 0, 0, w, h, 0, 0, w, h);

      p.face = face;
      p.shadow = shadow;
      p.pad = pad;

      if (performance.now() - t0 > 24) {
        if (onProgress) onProgress(i / pieces.length);
        await U.nextFrame();
        t0 = performance.now();
      }
    }
    U.freeCanvas(sil);
    U.freeCanvas(rim);
    return { pad };
  }

  function drawRim(f, rctx, sil, w, h, dx, dy, color, alpha) {
    rctx.clearRect(0, 0, rctx.canvas.width, rctx.canvas.height);
    rctx.globalCompositeOperation = 'source-over';
    rctx.drawImage(sil, 0, 0);
    rctx.globalCompositeOperation = 'destination-out';
    rctx.drawImage(sil, dx, dy);
    rctx.globalCompositeOperation = 'source-in';
    rctx.fillStyle = color;
    rctx.fillRect(0, 0, w, h);
    rctx.globalCompositeOperation = 'source-over';
    f.save();
    f.globalCompositeOperation = 'source-atop';
    f.globalAlpha = alpha;
    f.drawImage(rctx.canvas, 0, 0, w, h, 0, 0, w, h);
    f.restore();
  }

  function release(pieces) {
    (pieces || []).forEach((p) => { U.freeCanvas(p.face); U.freeCanvas(p.shadow); p.face = p.shadow = null; });
  }

  SNP.pieces = { bake, release };
})();
