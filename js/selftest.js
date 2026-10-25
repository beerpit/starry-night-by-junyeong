/* 자체 점검: ?selftest[=단계] 로 열면 실제 PointerEvent 를 캔버스에 보내 퍼즐을 끝까지 푼 뒤 결과를 화면에 띄운다.
 * (게임 기능이 아니라 사파리·WebKit 처럼 원격 자동화가 어려운 브라우저에서 동작을 확인하는 용도) */
'use strict';
(async function (SN) {
  const m = location.search.match(/selftest=(\d)/);
  const level = m ? Number(m[1]) : 2;
  const rotate = /[?&]rotate\b/.test(location.search);
  const out = [];
  const log = (ok, msg) => out.push((ok ? '✓ ' : '✗ ') + msg);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const panel = document.createElement('pre');
  Object.assign(panel.style, { position: 'fixed', left: '8px', bottom: '8px', zIndex: 99, margin: 0, padding: '10px 12px', borderRadius: '10px', background: 'rgba(0,0,0,0.8)', color: '#fff', font: '13px/1.45 ui-monospace, Menlo, monospace', maxWidth: '96vw', whiteSpace: 'pre-wrap', pointerEvents: 'none' });
  document.body.append(panel);
  const show = (extra = '') => { panel.textContent = ['[selftest] ' + navigator.userAgent.replace(/^.*?\) /, ''), ...out, extra].join('\n'); };
  try {
    SN.store.del('save');
    SN.sfx.on = false; // 점검 중엔 소리 끔
    document.getElementById('opt-rotate').checked = rotate;
    document.querySelector('.lv[data-level="' + level + '"]').click();
    document.getElementById('btn-start').click();
    for (let i = 0; i < 100 && !(SN.game.running && document.getElementById('loading').hidden); i++) await sleep(50);
    log(SN.game.running, '게임 시작 (' + level + '단계, ' + SN.G.pieces.length + '조각' + (rotate ? ', 회전' : '') + ')');
    const cv = document.getElementById('board');
    let id = 900;
    const fire = (type, x, y, pid) => cv.dispatchEvent(new PointerEvent(type, { pointerId: pid, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true, buttons: type === 'pointerup' ? 0 : 1 }));
    const fireWin = (type, x, y, pid) => window.dispatchEvent(new PointerEvent(type, { pointerId: pid, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true, buttons: type === 'pointerup' ? 0 : 1 }));
    const tap = async (x, y) => { const p = ++id; fire('pointerdown', x, y, p); fireWin('pointerup', x, y, p); await sleep(16); };
    const drag = async (x1, y1, x2, y2) => {
      const p = ++id; fire('pointerdown', x1, y1, p);
      for (let i = 1; i <= 6; i++) { fireWin('pointermove', x1 + (x2 - x1) * i / 6, y1 + (y2 - y1) * i / 6, p); await sleep(8); }
      fireWin('pointerup', x2, y2, p); await sleep(16);
    };
    // 찬스 1번
    const before = SN.G.loose.length;
    SN.game.useChance();
    for (let i = 0; i < 60 && SN.G.anims.length; i++) await sleep(50);
    log(SN.G.loose.length === before - 1 || SN.G.loose.length < before, '찬스로 한 조각 자동 배치');
    for (let round = 0; round < 6 && SN.G.loose.length; round++) {
      for (let k = 0; k < SN.G.pieces.length; k++) {
        let pr = SN.game.probe(k);
        if (!pr || pr.placed || !pr.top) continue;
        for (let s = 0; s < 4 && pr.rot !== 0 && !pr.placed; s++) { await tap(pr.grab[0], pr.grab[1]); pr = SN.game.probe(k); }
        if (pr.placed) continue;
        await drag(pr.grab[0], pr.grab[1], pr.home[0], pr.home[1]);
        show('… 남은 조각 ' + SN.G.loose.length);
      }
    }
    log(SN.G.loose.length === 0, '포인터 끌기로 모두 맞춤 (남은 ' + SN.G.loose.length + ')');
    for (let i = 0; i < 60 && !document.querySelector('.modal'); i++) await sleep(50);
    log(!!document.querySelector('.modal'), '완성 대화상자');
    log(!!SN.store.get('records', {})[level], '기록 저장');
  } catch (e) {
    log(false, '예외: ' + e.message);
  }
  show();
  document.title = 'SELFTEST ' + (out.every((l) => l.startsWith('✓')) ? 'PASS' : 'FAIL');
})(window.SN);
