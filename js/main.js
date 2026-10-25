/* 시작: 그림 불러오기 → 엔진·효과·UI 초기화 → (http/https 일 때) 오프라인용 서비스 워커 등록 */
'use strict';
(function (SN) {
  // 배경 별
  function makeSky() {
    const sky = document.getElementById('sky');
    const rnd = SN.rng(20261024);
    const n = SN.env.reducedMotion ? 24 : 46;
    for (let i = 0; i < n; i++) {
      const s = document.createElement('i');
      const size = 1.5 + rnd() * 2.5;
      Object.assign(s.style, {
        left: (rnd() * 100).toFixed(2) + '%', top: (rnd() * 100).toFixed(2) + '%',
        width: size + 'px', height: size + 'px', animationDelay: (-rnd() * 3.2).toFixed(2) + 's', animationDuration: (2.4 + rnd() * 2.6).toFixed(2) + 's',
      });
      sky.append(s);
    }
  }

  async function boot() {
    makeSky();
    const meta = window.SN_PAINTING;
    if (!meta) { document.body.textContent = '그림 파일(assets/painting-data.js)을 찾지 못했어요.'; return; }
    const img = new Image();
    img.decoding = 'async';
    img.src = meta.src;
    try { await img.decode(); } catch (e) { await new Promise((r) => { img.onload = r; img.onerror = r; }); }
    SN.game.init(document.getElementById('board'), img);
    SN.fx.init(document.getElementById('fx'));
    SN.ui.init(img);
    document.documentElement.classList.add('ready');
    // 자동 점검 (주소에 ?selftest 가 있을 때만 — 사파리/WebKit 등 자동화 도구가 없는 브라우저 확인용)
    if (/[?&]selftest\b/.test(location.search)) {
      const s = document.createElement('script'); s.src = 'js/selftest.js'; document.body.append(s);
    }
  }

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !/[?&]nosw\b/.test(location.search)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { /* 오프라인 기능만 빠짐 */ }));
  }
  boot();
})(window.SN);
