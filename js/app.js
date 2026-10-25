/*
 * 앱 흐름 — 시작 화면(단계 카드·기록·이어하기) ↔ 게임 화면(도구줄·판), 저장, 완성 결과, 설정·도움말 창.
 */
(function () {
  'use strict';
  const SNP = window.SNP;
  const U = SNP.util, C = SNP.config, ui = SNP.ui;
  const el = U.el;
  const $ = (id) => document.getElementById(id);

  // ------------------------------------------------------------------ 판 데이터
  const BD = window.BOARD_DATA;
  const board = {
    W: BD.width, H: BD.height, step: BD.maskStep, maskW: BD.maskW, maskH: BD.maskH,
    mask: U.decodeBits(BD.maskBits, BD.maskW * BD.maskH),
    luma: U.b64ToBytes(BD.luma), lumaW: BD.lumaW, lumaH: BD.lumaH, lumaStep: BD.lumaStep,
    lights: BD.lights || [],
  };

  // ------------------------------------------------------------------ 설정·기록
  const prefs = Object.assign({ sound: true, rotate: false, artist: C.artist || '' }, U.store.get('prefs', {}));
  const params = new URLSearchParams(location.search);
  if (params.has('artist')) { prefs.artist = params.get('artist').slice(0, 20); savePrefs(); }
  SNP.sound.enabled = prefs.sound;
  function savePrefs() { U.store.set('prefs', prefs); }
  function records() { return U.store.get('records', {}); }
  function saveOf(id) {
    const s = U.store.get('save:' + id, null);
    return s && s.f === C.saveFormat ? s : null;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('그림을 불러오지 못했어요: ' + src));
      im.src = src;
    });
  }
  const imgPromise = loadImage(C.assets.painting);
  const thumbPromise = loadImage(C.assets.thumb);

  function creditText() {
    const who = prefs.artist ? `그림: ${prefs.artist}` : '어린이 화가의 그림';
    return `${who} (팔레트 유화) · 원작 빈센트 반 고흐 「별이 빛나는 밤」(1889)`;
  }
  /** 제목: 「별이 빛나는 밤 by 이름」, 이름이 없으면 「별이 빛나는 밤 퍼즐」 */
  function titleText() { return prefs.artist ? `별이 빛나는 밤 by ${prefs.artist}` : '별이 빛나는 밤 퍼즐'; }
  function renderTitle() {
    const h = $('titleText');
    h.textContent = '별이 빛나는 밤 ';
    h.appendChild(el('span', { class: 'h1-sub', text: prefs.artist ? `by ${prefs.artist}` : '퍼즐' }));
    document.title = titleText();
  }
  function starsFor(used, max) {
    if (used === 0) return 3;
    if (used <= Math.ceil(max / 2)) return 2;
    return 1;
  }
  function starText(n) { return '★★★'.slice(0, n) + '☆☆☆'.slice(0, 3 - n); }

  // ------------------------------------------------------------------ 시작 화면
  const estimates = {};
  function estimate(lv) {
    if (estimates[lv.id] == null) {
      estimates[lv.id] = SNP.jigsaw.estimateCount({ W: board.W, H: board.H, mask: board.mask, maskW: board.maskW, maskH: board.maskH, step: board.step, cols: lv.cols, rows: lv.rows });
    }
    return estimates[lv.id];
  }

  function renderHome() {
    $('credit').textContent = creditText();
    renderTitle();
    $('ver').textContent = 'v' + C.version;
    $('optRotate').checked = !!prefs.rotate;
    renderSoundChip();
    const box = $('levels');
    box.textContent = '';
    const recs = records();
    C.levels.forEach((lv, i) => {
      const sv = saveOf(lv.id);
      const rec = recs[lv.id];
      const thumb = el('canvas', { class: 'lv-thumb', width: 360, height: 240, 'aria-hidden': 'true' });
      drawLevelThumb(thumb, lv);
      const status = sv
        ? el('span', { class: 'lv-status going' }, [U.icon('play', 'sm'), `이어하기 ${countPlaced(sv)}/${sv.n} · ${U.fmtTime(sv.el)}`])
        : rec
          ? el('span', { class: 'lv-status done', title: `최고 기록 ${U.fmtTimeWords(rec.best)} · ${rec.clears}번 완성` }, [el('b', { class: 'stars', text: starText(rec.stars) }), ` ${U.fmtTime(rec.best)}`])
          : el('span', { class: 'lv-status', text: '아직 안 해 봤어요' });
      const card = el('button', {
        type: 'button', class: 'lv-card' + (sv ? ' has-save' : ''), 'data-level': lv.id,
        'aria-label': `${i + 1}단계 ${lv.name}, ${lv.tag}, 약 ${estimate(lv)}조각, 찬스 ${lv.chances}개${sv ? ', 이어하기' : ''}`,
        onclick: () => startLevel(lv, false),
      }, [
        thumb,
        el('span', { class: 'lv-top' }, [el('span', { class: 'lv-num', text: String(i + 1) }), el('span', { class: 'lv-name', text: lv.name }), el('span', { class: 'lv-tag t' + (i + 1), text: lv.tag })]),
        el('span', { class: 'lv-meta' }, [U.icon('puzzle', 'sm'), `약 ${estimate(lv)}조각`, el('span', { class: 'dot' }), U.icon('spark', 'sm'), `찬스 ${lv.chances}`]),
        status,
      ]);
      const wrap = el('div', { class: 'lv-wrap' }, [card]);
      if (sv) {
        wrap.appendChild(el('button', {
          type: 'button', class: 'lv-new', title: '진행을 버리고 처음부터',
          onclick: () => ui.confirmBox('처음부터 할까요?', `「${lv.name}」에서 맞추던 퍼즐(${countPlaced(sv)}/${sv.n})을 버리고 새로 섞어요.`, '새로 시작', () => startLevel(lv, true), true),
        }, [U.icon('restart', 'sm'), el('span', { text: '새로' })]));
      }
      box.appendChild(wrap);
    });
  }
  function countPlaced(sv) { return sv.ps.filter((v) => v === 1).length; }

  async function drawLevelThumb(cv, lv) {
    const im = await thumbPromise.catch(() => null);
    if (!im) return;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const s = Math.min(W / im.width, H / im.height) * 0.94;
    const w = im.width * s, h = im.height * s, x = (W - w) / 2, y = (H - h) / 2;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(im, x, y, w, h);
    // 자르는 선(어림): 그림 위에만
    ctx.globalCompositeOperation = 'source-atop';
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 1; i < lv.cols; i++) { const xx = x + (w * i) / lv.cols; ctx.moveTo(xx, y); ctx.lineTo(xx, y + h); }
    for (let j = 1; j < lv.rows; j++) { const yy = y + (h * j) / lv.rows; ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); }
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  function renderSoundChip() {
    const b = $('homeSound');
    b.textContent = '';
    b.appendChild(U.icon(prefs.sound ? 'sound' : 'mute'));
    b.appendChild(el('span', { text: prefs.sound ? '소리 켬' : '소리 끔' }));
    b.setAttribute('aria-pressed', String(prefs.sound));
    const t = $('btnSound');
    t.querySelector('use').setAttribute('href', prefs.sound ? '#i-sound' : '#i-mute');
    t.setAttribute('aria-pressed', String(prefs.sound));
    t.setAttribute('aria-label', prefs.sound ? '소리 끄기' : '소리 켜기');
  }
  function toggleSound() {
    prefs.sound = !prefs.sound;
    SNP.sound.enabled = prefs.sound;
    savePrefs();
    renderSoundChip();
    if (prefs.sound) { SNP.sound.unlock(); SNP.sound.play('click'); }
  }

  // ------------------------------------------------------------------ 게임 화면
  let game = null;
  let level = null;
  let saveTimer = 0;
  let resultBar = null;
  let startToken = 0;

  function show(screen) {
    $('home').hidden = screen !== 'home';
    $('play').hidden = screen !== 'play';
    document.body.classList.toggle('playing', screen === 'play');
  }

  /** 단계 시작. 여러 번 눌려도 마지막 요청만 유효(startToken) — 로딩 중 「처음」 뒤 바로 다른 카드도 OK */
  async function startLevel(lv, fresh) {
    const token = ++startToken;
    {
      if (game) endGame(false);
      level = lv;
      let saved = fresh ? null : saveOf(lv.id);
      if (fresh) U.store.del('save:' + lv.id);
      const seed = saved ? saved.seed : U.newSeed();
      const rotate = saved ? !!saved.rotate : !!prefs.rotate;
      show('play');
      if (!history.state || !history.state.play) history.pushState({ play: lv.id }, '');
      $('lvName').textContent = lv.name;
      $('progText').textContent = '…';
      $('progBar').style.width = '0%';
      $('timeText').textContent = U.fmtTime(saved ? saved.el : 0);
      $('btnRotate').hidden = !rotate;
      setLoading(0);
      let img;
      try { img = await imgPromise; } catch (e) { setLoading(-1); ui.modal({ title: '앗!', body: e.message, buttons: [{ label: '처음으로', kind: 'primary', onClick: () => endGame(true) }] }); return; }
      if (token !== startToken) return;
      const g = new SNP.Game({
        canvas: $('board'), board, img, level: lv, seed, rotate, saved,
        cb: {
          onProgress: (n, total) => {
            $('progText').textContent = `${n}/${total}`;
            $('progBar').style.width = (total ? (100 * n) / total : 0) + '%';
          },
          onTime: (ms) => { $('timeText').textContent = U.fmtTime(ms); },
          onChange: () => scheduleSave(),
          onToast: (msg, kind) => ui.toast(msg, kind, kind === 'combo' || kind === 'gift' ? 'combo' : null),
          onChances: () => { updateChance(); scheduleSave(); },
          onComplete: (st) => finish(st),
        },
      });
      game = g;
      await g.init((k) => setLoading(k));
      if (game !== g) return;
      setLoading(-1);
      updateChance();
      updateGhost();
      if (g.completed) finish(g.stats());
      else if (!saved) ui.toast(rotate ? '조각을 톡 치면 돌아가요. 바른 방향일 때만 붙어요!' : '조각을 끌어서 팔레트 자리에 맞춰 보세요!', 'info');
      else ui.toast('지난번에 하던 곳부터 이어서 해요', 'info');
    }
  }

  function setLoading(k) {
    const box = $('loading');
    if (k < 0) { box.hidden = true; return; }
    box.hidden = false;
    $('loadBar').style.width = Math.round(k * 100) + '%';
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 400);
  }
  function saveNow() {
    clearTimeout(saveTimer);
    if (!game || !game.ready || game.completed) return;   // 굽는 중(위치 미정)에는 저장하지 않음
    U.store.set('save:' + level.id, game.serialize());
  }

  function endGame(goHome) {
    saveNow();
    if (goHome) startToken++;          // 아직 그림을 기다리는 시작 요청 취소
    setLoading(-1);
    if (resultBar) { resultBar.remove(); resultBar = null; }
    if (game) { game.destroy(); game = null; }
    previewWin.close();
    if (goHome) {
      show('home');
      renderHome();
      if (history.state && history.state.play) history.back();
    }
  }

  function updateChance() {
    if (!game) return;
    ['chanceBadge', 'fabBadge'].forEach((id) => { $(id).textContent = String(game.chancesLeft); });
    ['btnChance', 'fabChance'].forEach((id) => {
      $(id).classList.toggle('empty', game.chancesLeft <= 0);
      $(id).setAttribute('aria-label', `찬스, ${game.chancesLeft}개 남음`);
    });
  }
  function updateGhost() {
    const n = game ? game.ghost : 0;
    $('btnGhost').setAttribute('aria-pressed', String(n > 0));
    $('btnGhost').dataset.level = String(n);
    $('ghostLbl').textContent = ['밑그림', '연하게', '진하게'][n];
  }

  // ------------------------------------------------------------------ 완성
  function finish(st) {
    if (!game) return;
    U.store.del('save:' + level.id);
    const recs = records();
    const prev = recs[level.id];
    const stars = starsFor(st.chancesUsed, st.chancesMax);
    const newBest = !prev || st.elapsed < prev.best;
    recs[level.id] = {
      best: prev ? Math.min(prev.best, st.elapsed) : st.elapsed,
      stars: Math.max(prev ? prev.stars : 0, stars),
      clears: (prev ? prev.clears : 0) + 1,
      last: Date.now(),
    };
    U.store.set('records', recs);
    showResult(st, stars, newBest && !!prev, !prev);
  }

  function showResult(st, stars, newBest, first) {
    const idx = C.levels.indexOf(level);
    const next = C.levels[idx + 1];
    const starRow = el('div', { class: 'res-stars', 'aria-label': `별 ${stars}개` });
    for (let i = 0; i < 3; i++) {
      const s = U.icon('star', 'res-star' + (i < stars ? ' on' : ''));
      s.style.animationDelay = 0.15 + i * 0.22 + 's';
      starRow.appendChild(s);
    }
    const why = stars === 3 ? '찬스 없이 완성!' : stars === 2 ? `찬스 ${st.chancesUsed}개로 완성` : `찬스 ${st.chancesUsed}개로 완성 — 다음엔 찬스를 아껴 봐요`;
    const body = el('div', { class: 'result' }, [
      starRow,
      el('p', { class: 'res-why', text: why }),
      el('dl', { class: 'res-stats' }, [
        el('div', null, [el('dt', { text: '걸린 시간' }), el('dd', { text: U.fmtTimeWords(st.elapsed) })]),
        el('div', null, [el('dt', { text: '조각' }), el('dd', { text: st.pieces + '개' })]),
        el('div', null, [el('dt', { text: '쓴 찬스' }), el('dd', { text: `${st.chancesUsed}개` })]),
      ]),
      newBest ? el('p', { class: 'res-badge', text: '최고 기록을 깼어요!' }) : first ? el('p', { class: 'res-badge', text: '이 단계 첫 완성!' }) : null,
    ]);
    const buttons = [
      { label: '그림 감상', kind: 'ghost', icon: 'eye', onClick: () => showResultBar(st, stars) },
      { label: '완성 카드 저장', kind: 'ghost', icon: 'download', keep: true, onClick: () => saveCard(st, stars) },
      { label: '다시 하기', kind: 'ghost', icon: 'restart', onClick: () => startLevel(level, true) },
    ];
    if (next) buttons.push({ label: '다음 단계', kind: 'primary', icon: 'next', onClick: () => startLevel(next, false) });
    else buttons.push({ label: '처음으로', kind: 'primary', icon: 'home', onClick: () => endGame(true) });
    ui.modal({ title: `완성했어요! · ${level.name}`, body, buttons, className: 'result-modal', onClose: (why2) => { if (why2 !== 'button') showResultBar(st, stars); } });
  }

  /** 결과 창을 닫은 뒤 그림을 감상하는 동안 아래에 뜨는 작은 행동 줄 */
  function showResultBar(st, stars) {
    if (resultBar || !game) return;
    const idx = C.levels.indexOf(level);
    const next = C.levels[idx + 1];
    resultBar = el('div', { class: 'result-bar' }, [
      el('span', { class: 'rb-stars', text: starText(stars) }),
      el('button', { type: 'button', class: 'btn ghost', onclick: () => saveCard(st, stars) }, [U.icon('download'), el('span', { text: '카드 저장' })]),
      el('button', { type: 'button', class: 'btn ghost', onclick: () => startLevel(level, true) }, [U.icon('restart'), el('span', { text: '다시' })]),
      next ? el('button', { type: 'button', class: 'btn primary', onclick: () => startLevel(next, false) }, [U.icon('next'), el('span', { text: '다음 단계' })]) : null,
    ]);
    $('stage').appendChild(resultBar);
  }

  /** 완성 기념 카드(PNG): 그림 + 단계·시간·별점·날짜 */
  async function saveCard(st, stars) {
    try {
      const img = await imgPromise;
      const W = 1600, H = 1200;
      const c = U.makeCanvas(W, H), x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#0b1640'); g.addColorStop(1, '#1d3a8a');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      for (let i = 0; i < 120; i++) {
        x.fillStyle = `rgba(255,255,230,${Math.random() * 0.6})`;
        x.beginPath(); x.arc(Math.random() * W, Math.random() * H, Math.random() * 2.2, 0, Math.PI * 2); x.fill();
      }
      const s = Math.min((W - 160) / img.width, (H - 330) / img.height);
      const w = img.width * s, h = img.height * s;
      x.shadowColor = 'rgba(0,0,0,0.5)'; x.shadowBlur = 40; x.shadowOffsetY = 16;
      x.drawImage(img, (W - w) / 2, 90, w, h);
      x.shadowColor = 'transparent';
      x.textAlign = 'center';
      x.fillStyle = '#ffe27a';
      x.font = '700 56px "Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",system-ui,sans-serif';
      x.fillText(`${starText(stars)}  ${titleText()} 완성!`, W / 2, H - 150, W - 80);
      x.fillStyle = '#dfe8ff';
      x.font = '500 38px "Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",system-ui,sans-serif';
      const d = new Date();
      const date = `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
      x.fillText(`${level.name} 단계 · ${st.pieces}조각 · ${U.fmtTimeWords(st.elapsed)} · ${date}`, W / 2, H - 88);
      x.font = '400 28px "Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",system-ui,sans-serif';
      x.fillStyle = 'rgba(223,232,255,0.75)';
      x.fillText(creditText(), W / 2, H - 40);
      const blob = await new Promise((res, rej) => {
        try { c.toBlob((b) => (b ? res(b) : rej(new Error('blob'))), 'image/png'); } catch (e) { rej(e); }
      });
      U.freeCanvas(c);
      const name = `starry-night-${level.id}-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.png`;
      const file = typeof File === 'function' ? new File([blob], name, { type: 'image/png' }) : null;
      if (file && navigator.canShare && navigator.canShare({ files: [file] }) && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        try { await navigator.share({ files: [file], title: titleText() + ' 완성!' }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
      }
      const a = el('a', { href: URL.createObjectURL(blob), download: name });
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
      ui.toast('완성 카드를 저장했어요', 'star');
    } catch (e) {
      ui.toast('이 방식으로 연 파일에서는 카드를 저장할 수 없어요. 웹 주소로 열어 주세요.', 'warn');
    }
  }

  // ------------------------------------------------------------------ 떠 있는 창들
  const previewImg = el('img', { src: C.assets.painting, alt: '완성 그림', draggable: 'false' });
  const previewWin = ui.floatWin({
    id: 'preview', title: '완성 그림 미리보기',
    body: el('div', { class: 'preview' }, [previewImg]),
    minW: 180, minH: 150,
    defaultRect: (vp) => {
      const w = Math.round(U.clamp(vp.w * 0.32, 220, 420));
      return { x: vp.w - w - 12, y: 64, w, h: Math.round(w * 0.72) + 40 };
    },
    onToggle: (open) => $('btnPreview').setAttribute('aria-pressed', String(open)),
  });

  const helpWin = ui.floatWin({
    id: 'help', title: '놀이 방법',
    body: helpBody(),
    minW: 260, minH: 220,
    defaultRect: (vp) => {
      const w = Math.round(U.clamp(vp.w * 0.9, 280, 460));
      const h = Math.round(U.clamp(vp.h * 0.75, 300, 620));
      return { x: Math.round((vp.w - w) / 2), y: Math.round(Math.max(56, (vp.h - h) / 2)), w, h };
    },
  });

  function helpBody() {
    const item = (icon, title, text) => el('li', null, [U.icon(icon, 'help-ico'), el('div', null, [el('b', { text: title }), el('p', { text })])]);
    return el('div', { class: 'help' }, [
      el('ol', { class: 'help-list' }, [
        item('puzzle', '조각 옮기기', '조각을 손가락(마우스)으로 끌어서 팔레트 모양 자리의 알맞은 곳에 놓아요. 가까이 가면 「착!」 붙어요.'),
        item('image', '미리보기', '완성 그림을 작은 창으로 띄워요. 창은 제목줄을 끌어 옮기고, 오른쪽 아래 모서리로 크기를 바꿔요.'),
        item('ghost', '밑그림', '판에 흐린 그림을 깔아 줘요. 누를 때마다 끔 → 연하게 → 진하게.'),
        item('spark', '찬스', '막혔을 때! 고른 조각(반짝이는 조각)을, 고른 게 없으면 알맞은 조각 하나를 제자리로 보내 줘요. 개수가 정해져 있어요. 빠르게 5개를 연달아 맞추면 1개가 다시 생겨요.'),
        item('tidy', '정리', '흩어진 조각을 테두리 조각 먼저, 비슷한 색끼리 가지런히 모아요.'),
        item('fit', '크게 보기', '두 손가락으로 벌리거나 마우스 휠로 확대, 빈 곳을 끌면 이동, 「전체」 버튼으로 원래대로.'),
        item('rotate', '조각 돌리기(어렵게)', '시작 화면에서 켜면 조각이 돌아간 채로 섞여요. 조각을 톡 치면 90°씩 돌고, 바른 방향일 때만 붙어요.'),
        item('star', '별점', '찬스를 안 쓰면 ★★★, 절반 이하로 쓰면 ★★, 그보다 많이 쓰면 ★. 진행은 자동 저장돼서 언제든 이어서 할 수 있어요.'),
      ]),
      el('p', { class: 'help-keys', text: '키보드: P 미리보기 · G 밑그림 · T 정리 · C 찬스 · R 돌리기 · F 전체 · +/- 확대 · M 소리 · Esc 창 닫기' }),
      el('a', { class: 'btn ghost help-more', href: 'docs/user-guide.html', target: '_blank', rel: 'noopener' }, [U.icon('book'), el('span', { text: '그림으로 보는 사용 설명서' })]),
    ]);
  }

  const settingsWin = ui.floatWin({
    id: 'settings', title: '설정',
    body: settingsBody(),
    minW: 260, minH: 240,
    defaultRect: (vp) => {
      const w = Math.round(U.clamp(vp.w * 0.9, 280, 420));
      return { x: Math.round((vp.w - w) / 2), y: Math.round(Math.max(40, vp.h * 0.12)), w, h: 420 };
    },
    onToggle: (open) => { if (open) syncSettings(); },
  });
  function settingsBody() {
    const name = el('input', { type: 'text', id: 'setArtist', maxlength: '20', placeholder: '예: 별님', autocomplete: 'off', spellcheck: 'false' });
    let t = 0;
    name.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => { prefs.artist = name.value.trim(); savePrefs(); $('credit').textContent = creditText(); renderTitle(); }, 250);
    });
    const rot = el('input', { type: 'checkbox', id: 'setRotate' });
    rot.addEventListener('change', () => { prefs.rotate = rot.checked; savePrefs(); $('optRotate').checked = rot.checked; });
    const snd = el('input', { type: 'checkbox', id: 'setSound' });
    snd.addEventListener('change', () => { if (snd.checked !== prefs.sound) toggleSound(); });
    const sw = (input, label) => el('label', { class: 'switch' }, [input, el('span', { class: 'track', 'aria-hidden': 'true' }), el('span', { class: 'sw-label', text: label })]);
    return el('div', { class: 'settings' }, [
      el('label', { class: 'field' }, [el('span', { text: '그린 사람 이름 (화면 아래 작품 설명에 나와요)' }), name]),
      sw(rot, '조각 돌리기 — 새로 시작하는 퍼즐부터'),
      sw(snd, '소리'),
      el('button', {
        type: 'button', class: 'btn danger', onclick: () => ui.confirmBox('기록을 모두 지울까요?', '모든 단계의 최고 기록과 이어하기 저장이 지워져요. 되돌릴 수 없어요.', '모두 지우기', () => {
          U.store.keys().forEach((k) => { if (k === 'records' || k.indexOf('save:') === 0) U.store.del(k); });
          renderHome();
          ui.toast('기록을 지웠어요', 'info');
        }, true),
      }, [U.icon('restart'), el('span', { text: '기록 지우기' })]),
      el('p', { class: 'about', text: `${C.title} v${C.version} · 원작: 빈센트 반 고흐 「별이 빛나는 밤」(1889, 뉴욕 현대미술관) · 이 그림: 어린이 화가가 팔레트 모양 나무판에 그린 유화` }),
    ]);
  }
  function syncSettings() {
    $('setArtist').value = prefs.artist || '';
    $('setRotate').checked = !!prefs.rotate;
    $('setSound').checked = !!prefs.sound;
  }

  // ------------------------------------------------------------------ 도구줄·단축키
  function bindToolbar() {
    $('btnHome').addEventListener('click', () => endGame(true));
    $('btnPreview').addEventListener('click', () => previewWin.toggle());
    $('btnGhost').addEventListener('click', cycleGhost);
    $('btnTidy').addEventListener('click', () => { if (game && game.ready && !game.completed) { game.tidy(); ui.toast('테두리 조각 먼저, 비슷한 색끼리 모았어요', 'info'); } });
    $('btnRotate').addEventListener('click', () => game && game.rotateSelected());
    $('btnFit').addEventListener('click', () => game && game.fit());
    $('btnChance').addEventListener('click', useChance);
    $('btnSound').addEventListener('click', toggleSound);
    $('btnHelp').addEventListener('click', () => helpWin.toggle());
    $('zoomIn').addEventListener('click', () => game && game.zoomBy(1.3));
    $('zoomOut').addEventListener('click', () => game && game.zoomBy(1 / 1.3));
    $('zoomFit').addEventListener('click', () => game && game.fit());
    $('fabChance').addEventListener('click', useChance);
    $('homeSound').addEventListener('click', toggleSound);
    $('homeHelp').addEventListener('click', () => helpWin.toggle());
    $('homeSettings').addEventListener('click', () => settingsWin.toggle());
    $('optRotate').addEventListener('change', (e) => { prefs.rotate = e.target.checked; savePrefs(); });

    const fsEl = document.documentElement;
    const canFs = !!(fsEl.requestFullscreen || fsEl.webkitRequestFullscreen);
    $('btnFull').hidden = !canFs;
    $('btnFull').addEventListener('click', () => {
      const cur = document.fullscreenElement || document.webkitFullscreenElement;
      if (cur) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else (fsEl.requestFullscreen || fsEl.webkitRequestFullscreen).call(fsEl);
    });
    const onFs = () => {
      const cur = document.fullscreenElement || document.webkitFullscreenElement;
      $('btnFull').querySelector('use').setAttribute('href', cur ? '#i-full-exit' : '#i-full');
    };
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);

    window.addEventListener('keydown', (e) => {
      if (!game || $('play').hidden || ui.hasModal()) return;
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const map = {
        p: () => previewWin.toggle(), g: cycleGhost, t: () => $('btnTidy').click(), c: useChance,
        r: () => game.rotateSelected(), f: () => game.fit(), '0': () => game.fit(), m: toggleSound,
        '+': () => game.zoomBy(1.3), '=': () => game.zoomBy(1.3), '-': () => game.zoomBy(1 / 1.3), '?': () => helpWin.toggle(),
      };
      if (map[k]) { map[k](); e.preventDefault(); }
    });
  }

  function cycleGhost() {
    if (!game) return;
    game.setGhost((game.ghost + 1) % 3);
    updateGhost();
    scheduleSave();
  }
  function useChance() {
    if (!game) return;
    const ok = game.useChance();
    updateChance();
    if (!ok) {
      ['btnChance', 'fabChance'].forEach((id) => {
        const b = $(id);
        b.classList.remove('shake');
        void b.offsetWidth;
        b.classList.add('shake');
      });
    }
  }

  // ------------------------------------------------------------------ 시작
  function boot() {
    renderTitle();
    bindToolbar();
    renderHome();
    show('home');

    // 화면 크기 변화(회전·창 크기·주소창) → 판 다시 맞춤
    let rt = 0;
    const onResize = () => { clearTimeout(rt); rt = setTimeout(() => game && !$('play').hidden && game.resize(false), 60); };
    if (window.ResizeObserver) new ResizeObserver(onResize).observe($('stage'));
    else window.addEventListener('resize', onResize);

    // 앱을 떠나거나 숨길 때 바로 저장
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
    window.addEventListener('pagehide', saveNow);

    // 안드로이드 뒤로 가기·iOS 쓸어 넘기기 → 게임에서 시작 화면으로
    window.addEventListener('popstate', () => { if (game || !$('play').hidden) endGame(false), show('home'), renderHome(); });

    // 주소 ?play=l3 → 바로 그 단계(시험·공유용)
    const lvId = params.get('play');
    const lv = lvId && C.levels.find((l) => l.id === lvId);
    if (lv) startLevel(lv, params.has('fresh'));

    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !window.SNP_SINGLE_FILE) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* 오프라인 캐시 없이도 동작 */ });
    }
  }

  SNP.app = { startLevel, endGame, game: () => game, board, prefs };
  boot();
})();
