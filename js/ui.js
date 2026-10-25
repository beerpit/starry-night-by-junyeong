/* 화면·창·대화상자: 처음 화면(난이도·옵션·기록·스티커), 게임 도구 막대, 떠 있는 창(원본 보기·도움말), 완성 대화상자, 단축키 */
'use strict';
(function (SN) {
  const $ = (id) => document.getElementById(id);
  const el = SN.el;

  // ───────────────────────── 알림
  let toastTimer = 0;
  SN.toast = function (msg, ms = 1900) {
    const t = $('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  };

  // ───────────────────────── 떠 있는 창: 끌어서 이동, 모서리로 크기 조절, 닫기 전 위치·크기를 기억
  let zTop = 1;
  SN.FloatWin = function ({ id, title, body, w = 360, h = 280, minW = 220, minH = 150, place = 'top-right', onToggle }) {
    const key = 'win.' + id;
    const closeBtn = el('button', { class: 'x-btn', type: 'button', title: '닫기 (Esc)', 'aria-label': '닫기' }, '✕');
    const bar = el('div', { class: 'fw-title' }, el('h3', { text: title }), closeBtn);
    const grip = el('div', { class: 'fw-resize', title: '크기 조절', 'aria-hidden': 'true' });
    const wrap = el('div', { class: 'fw-body' }, body);
    const win = el('div', { class: 'fw', role: 'dialog', 'aria-label': title, hidden: true }, bar, wrap, grip);
    $('windows').append(win);
    let rect = null;

    const viewport = () => ({ W: window.innerWidth, H: window.innerHeight });
    function defaults() {
      const { W, H } = viewport();
      const ww = Math.min(w, W - 24), hh = Math.min(h, H - 90);
      const top = 64 + (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-t')) || 0);
      if (place === 'center') return { x: (W - ww) / 2, y: Math.max(top, (H - hh) / 2), w: ww, h: hh };
      return { x: W - ww - 14, y: top, w: ww, h: hh };
    }
    function clamp(r) {
      const { W, H } = viewport();
      r.w = SN.clamp(r.w, Math.min(minW, W - 8), Math.max(minW, W - 8));
      r.h = SN.clamp(r.h, Math.min(minH, H - 8), Math.max(minH, H - 8));
      r.x = SN.clamp(r.x, 80 - r.w, W - 80);      // 제목 막대가 화면에 조금은 남도록
      r.y = SN.clamp(r.y, 0, H - 38);
      return r;
    }
    function apply() { Object.assign(win.style, { left: rect.x + 'px', top: rect.y + 'px', width: rect.w + 'px', height: rect.h + 'px' }); }
    function persist() { SN.store.set(key, { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) }); }
    function front() { win.style.zIndex = ++zTop; }

    // 이동
    bar.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.x-btn')) return;
      e.preventDefault(); front();
      const sx = e.clientX, sy = e.clientY, r0 = { ...rect };
      bar.setPointerCapture(e.pointerId);
      const mv = (ev) => { rect.x = r0.x + ev.clientX - sx; rect.y = r0.y + ev.clientY - sy; clamp(rect); apply(); };
      const up = () => { bar.removeEventListener('pointermove', mv); bar.removeEventListener('pointerup', up); bar.removeEventListener('pointercancel', up); persist(); };
      bar.addEventListener('pointermove', mv); bar.addEventListener('pointerup', up); bar.addEventListener('pointercancel', up);
    });
    // 크기
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation(); front();
      const sx = e.clientX, sy = e.clientY, r0 = { ...rect };
      grip.setPointerCapture(e.pointerId);
      const mv = (ev) => { rect.w = Math.max(minW, r0.w + ev.clientX - sx); rect.h = Math.max(minH, r0.h + ev.clientY - sy); clamp(rect); apply(); };
      const up = () => { grip.removeEventListener('pointermove', mv); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up); persist(); };
      grip.addEventListener('pointermove', mv); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
    });
    win.addEventListener('pointerdown', front);
    closeBtn.addEventListener('click', () => api.close());
    window.addEventListener('resize', () => { if (!win.hidden) { clamp(rect); apply(); } });

    const api = {
      el: win,
      get isOpen() { return !win.hidden; },
      open() {
        rect = clamp(SN.store.get(key, null) || defaults());
        apply(); win.hidden = false; front(); onToggle && onToggle(true);
      },
      close() { if (win.hidden) return; persist(); win.hidden = true; onToggle && onToggle(false); },
      toggle() { api.isOpen ? api.close() : api.open(); },
    };
    return api;
  };

  // ───────────────────────── 모달 (확인·완성처럼 메시지 성격의 창만)
  let modalStack = [];
  SN.modal = function ({ content, onClose, closable = true, label = '알림' }) {
    const back = el('div', { class: 'modal-back' });
    const box = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': label });
    const close = (why) => {
      if (!back.isConnected) return;
      back.remove(); modalStack = modalStack.filter((m) => m !== entry);
      onClose && onClose(why);
    };
    if (closable) box.append(el('button', { class: 'x-btn', type: 'button', title: '닫기 (Esc)', 'aria-label': '닫기', onclick: () => close('x') }, '✕'));
    box.append(content);
    back.append(box);
    back.addEventListener('pointerdown', (e) => { if (e.target === back && closable) close('back'); });
    $('modal-root').append(back);
    const entry = { close, closable };
    modalStack.push(entry);
    setTimeout(() => { const b = box.querySelector('.row .btn'); b && b.focus({ preventScroll: true }); }, 30);
    return close;
  };
  SN.confirm = function (msg, okLabel = '확인', cancelLabel = '취소') {
    return new Promise((resolve) => {
      let answered = false;
      const done = (v) => { if (!answered) { answered = true; resolve(v); } };
      const close = SN.modal({
        label: '확인',
        onClose: () => done(false),
        content: el('div', null,
          el('p', { style: { color: 'var(--ink)', fontSize: '17px', margin: '18px 8px 4px', lineHeight: '1.5' } }, msg),
          el('div', { class: 'row' },
            el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { done(false); close('no'); } }, cancelLabel),
            el('button', { class: 'btn btn-gold', type: 'button', onclick: () => { done(true); close('yes'); } }, okLabel))),
      });
    });
  };

  // ───────────────────────── 기록·스티커
  const BADGES = [
    { id: 'first', ic: '🧩', nm: '첫 완성', ds: '퍼즐 하나 완성' },
    { id: 'pure', ic: '🌟', nm: '찬스 없이', ds: '별 세 개 받기' },
    { id: 'spin', ic: '🔄', nm: '빙글빙글', ds: '회전 모드로 완성' },
    { id: 'swift', ic: '⚡', nm: '번개 손', ds: '달빛 이상을 빠르게' },
    { id: 'swirl', ic: '🌀', nm: '소용돌이', ds: '4단계 이상 완성' },
    { id: 'master', ic: '🎨', nm: '고흐 마스터', ds: '6단계 완성' },
    { id: 'all', ic: '🏆', nm: '모든 단계', ds: '1~6단계 다 완성' },
  ];
  function records() { return SN.store.get('records', {}); }
  function badges() { return SN.store.get('badges', {}); }
  function recordResult(r) {
    const recs = records(), prev = recs[r.level] || { best: null, stars: 0, plays: 0 };
    const isNew = prev.best == null || r.time < prev.best;
    recs[r.level] = { best: isNew ? r.time : prev.best, stars: Math.max(prev.stars, r.stars), plays: prev.plays + 1 };
    SN.store.set('records', recs);
    const got = badges(), fresh = [];
    const give = (id) => { if (!got[id]) { got[id] = Date.now(); fresh.push(BADGES.find((b) => b.id === id)); } };
    give('first');
    if (r.stars === 3) give('pure');
    if (r.rotate) give('spin');
    if (r.level >= 3 && r.time <= r.pieces * 9) give('swift');
    if (r.level >= 4) give('swirl');
    if (r.level >= 6) give('master');
    if (SN.LEVELS.every((L) => recs[L.id])) give('all');
    SN.store.set('badges', got);
    return { isNew: isNew && prev.best != null, firstClear: prev.best == null, fresh };
  }
  const starsHtml = (n) => '★★★'.split('').map((s, i) => `<span class="${i < n ? '' : 'off'}">★</span>`).join('');

  // ───────────────────────── 처음 화면
  const state = { level: SN.store.get('level', 1), counts: {} };
  let img = null, previewWin = null, helpWin = null;

  function renderLevels() {
    const box = $('levels'); box.textContent = '';
    const recs = records();
    SN.LEVELS.forEach((L) => {
      const rec = recs[L.id];
      const b = el('button', {
        class: 'lv', type: 'button', role: 'radio', 'aria-checked': String(state.level === L.id), tabindex: state.level === L.id ? '0' : '-1',
        'data-level': L.id, title: `${L.name} — ${state.counts[L.id]}조각, 찬스 ${L.chances}번`,
        onclick: () => selectLevel(L.id),
        ondblclick: () => startNew(),
      },
      el('span', { class: 'em', text: L.emoji }),
      el('span', { class: 'nm', text: `${L.id}. ${L.name}` }),
      el('span', { class: 'ct', text: `${state.counts[L.id]}조각 · 찬스 ${L.chances}` }),
      el('span', { class: 'rec', html: rec ? `<span class="stars">${starsHtml(rec.stars)}</span> ${SN.fmtTime(rec.best)}` : `<span style="color:var(--muted)">${L.hint}</span>` }));
      box.append(b);
    });
  }
  function selectLevel(id, focus) {
    state.level = SN.clamp(id, 1, SN.LEVELS.length);
    SN.store.set('level', state.level);
    document.querySelectorAll('.lv').forEach((b) => {
      const on = Number(b.dataset.level) === state.level;
      b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus({ preventScroll: false });
    });
    SN.sfx.click();
  }
  function renderBadges() {
    const got = badges(), box = $('badges'); box.textContent = '';
    BADGES.forEach((b) => box.append(el('div', { class: 'bd' + (got[b.id] ? '' : ' locked'), title: b.ds },
      el('span', { class: 'ic', text: b.ic }), el('span', { class: 'nm', text: b.nm }), el('span', { class: 'ds', text: b.ds }))));
    $('badge-count').textContent = `${Object.keys(got).length} / ${BADGES.length}`;
  }
  function renderResume() {
    const s = SN.store.get('save', null);
    const box = $('resume-box');
    if (!s || !s.pieces) { box.hidden = true; return; }
    const L = SN.LEVELS[s.level - 1];
    $('resume-info').textContent = `${L.emoji} ${L.name} · ${s.placedCount}/${s.total}조각 · ${SN.fmtTime(s.elapsed)}${s.rotate ? ' · 회전' : ''}`;
    box.hidden = false;
  }
  function showHome() {
    SN.game.running && SN.game.stop();
    SN.fx.stop();
    $('play').hidden = true; $('home').hidden = false;
    document.body.style.overflow = '';
    previewWin && previewWin.close();
    $('toast').classList.remove('show');
    renderLevels(); renderBadges(); renderResume();
    document.title = '별이 빛나는 밤 by Junyeong';
  }

  // ───────────────────────── 게임 시작
  async function startNew() {
    const s = SN.store.get('save', null);
    if (s && s.pieces && s.placedCount > 0) {
      const ok = await SN.confirm('진행 중인 퍼즐이 있어요. 새로 시작하면 지금까지 맞춘 것은 사라져요. 새로 시작할까요?', '새로 시작', '그만두기');
      if (!ok) return;
    }
    launch({ level: state.level, rotate: $('opt-rotate').checked, ghost: $('opt-ghost').checked });
  }
  function launch(opts, saved) {
    $('loading').hidden = false;
    $('home').hidden = true; $('play').hidden = false;
    document.body.style.overflow = 'hidden';
    window.scrollTo(0, 0);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      try {
        SN.game.start(opts, saved);
      } catch (e) {
        console.error(e);
        SN.toast('퍼즐을 만들지 못했어요: ' + e.message, 4000);
        $('loading').hidden = true; showHome(); return;
      }
      $('loading').hidden = true;
      SN.fx.resize();
      syncToolbar();
      const L = SN.LEVELS[opts.level - 1];
      document.title = `${L.emoji} ${L.name} — 별이 빛나는 밤 by Junyeong`;
      if (!saved) SN.toast(opts.rotate ? '끌어서 맞추고, 톡 눌러 돌려요!' : '조각을 끌어다 제자리에 놓아요!');
      else SN.toast('이어서 해요! 🧩');
    }));
  }

  // ───────────────────────── 도구 막대
  function syncToolbar() {
    const o = SN.game.opts;
    $('tb-ghost').setAttribute('aria-pressed', String(o.ghost));
    $('tb-sound').setAttribute('aria-pressed', String(SN.sfx.on));
    $('tb-sound').querySelector('i').textContent = SN.sfx.on ? '🔊' : '🔇';
    $('tb-rotate').hidden = !o.rotate;
    $('tb-preview').setAttribute('aria-pressed', String(!!(previewWin && previewWin.isOpen)));
    const L = SN.LEVELS[o.level - 1];
    $('st-level').innerHTML = `${L.emoji}<span class="nm"> ${L.name}</span>`;
    updateProgress(SN.game.progress());
    $('st-time').textContent = SN.fmtTime(SN.game.stats.elapsed);
  }
  function updateProgress(p) {
    $('st-count').textContent = `${p.placed}/${p.total}`;
    $('progress-bar').style.width = (p.total ? (100 * p.placed) / p.total : 0) + '%';
    $('chance-n').textContent = p.chancesLeft;
    $('tb-chance').classList.toggle('empty', p.chancesLeft <= 0);
    $('tb-chance').title = p.chancesLeft > 0 ? `찬스! 조각 하나를 제자리로 (H) — ${p.chancesLeft}번 남음` : '찬스를 모두 썼어요';
  }

  const actions = {
    home() { showHome(); },
    preview() { previewWin.toggle(); },
    ghost() { SN.game.setGhost(!SN.game.opts.ghost); syncToolbar(); SN.toast(SN.game.opts.ghost ? '🖼 밑그림 켜짐' : '밑그림 꺼짐'); },
    tidy() { SN.game.tidy(); SN.sfx.rotate(); SN.toast('🧹 조각을 정리했어요 — 테두리 조각이 앞쪽에!'); },
    fit() { SN.game.fit(); },
    rotate() { SN.game.rotateSelected(); },
    chance() {
      if (SN.game.done) return;
      const r = SN.game.useChance();
      if (!r.ok && r.reason === 'empty') SN.toast('찬스를 모두 썼어요! 👁 원본 보기와 🖼 밑그림을 써 보세요', 2600);
      else if (r.ok) SN.toast('🪄 찬스! 조각이 제자리로 날아가요');
    },
    sound() { SN.sfx.on = !SN.sfx.on; $('opt-sound').checked = SN.sfx.on; syncToolbar(); },
    help() { helpWin.toggle(); },
    full() {
      const d = document, de = d.documentElement;
      const isFull = d.fullscreenElement || d.webkitFullscreenElement;
      if (isFull) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      else (de.requestFullscreen || de.webkitRequestFullscreen).call(de);
    },
  };

  // ───────────────────────── 완성
  function onComplete(r) {
    const rec = recordResult(r);
    const artist = ($('artist').value || '').trim();
    const L = SN.LEVELS[r.level - 1];
    const next = SN.LEVELS[r.level];
    const stars = el('div', { class: 'win-stars', 'aria-label': `별 ${r.stars}개` });
    for (let i = 0; i < 3; i++) stars.append(el('span', { class: i < r.stars ? 'on' : '', style: { animationDelay: 0.25 + i * 0.22 + 's' } }, '★'));
    const content = el('div', null,
      el('h2', null, '🎉 완성했어요!'),
      el('p', { style: { color: 'var(--cream)', fontWeight: '700' } }, artist ? `${artist} 화가의 「별이 빛나는 밤」이 다시 모였어요!` : '「별이 빛나는 밤」이 다시 하나가 됐어요!'),
      stars,
      rec.isNew ? el('span', { class: 'win-new' }, '🏅 새 기록!') : null,
      el('div', { class: 'win-stats' },
        el('div', null, el('b', null, SN.fmtTime(r.time)), el('small', null, '⏱ 걸린 시간')),
        el('div', null, el('b', null, `${L.emoji} ${r.pieces}`), el('small', null, `🧩 ${L.name} 조각`)),
        el('div', null, el('b', null, String(r.moves)), el('small', null, '✋ 움직인 횟수')),
        el('div', null, el('b', null, `${r.chancesUsed} / ${r.chancesMax}`), el('small', null, '🪄 쓴 찬스'))),
      rec.fresh.length ? el('div', null, el('p', { style: { margin: '12px 0 0', color: 'var(--ink)', fontWeight: '700' } }, '새 스티커를 받았어요!'),
        el('div', { class: 'win-badges' }, rec.fresh.map((b) => el('div', { class: 'bd' }, el('span', { class: 'ic', text: b.ic }), el('span', { class: 'nm', text: b.nm }))))) : null,
      el('div', { class: 'row' },
        el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { close('view'); SN.toast('🏠 을 누르면 처음 화면으로 가요', 2600); } }, '🖼 그림 감상'),
        el('button', { class: 'btn btn-blue', type: 'button', onclick: () => { close('again'); launch({ level: r.level, rotate: SN.game.opts.rotate, ghost: SN.game.opts.ghost }); } }, '🔁 다시'),
        next
          ? el('button', { class: 'btn btn-gold', type: 'button', onclick: () => { close('next'); selectLevel(next.id); launch({ level: next.id, rotate: SN.game.opts.rotate, ghost: SN.game.opts.ghost }); } }, `다음: ${next.emoji} ${next.name} ▶`)
          : el('button', { class: 'btn btn-gold', type: 'button', onclick: () => { close('home'); showHome(); } }, '🏠 처음으로')));
    const close = SN.modal({ content, label: '완성' });
  }

  // ───────────────────────── 단축키
  function onKey(e) {
    if (e.target.closest && e.target.closest('input, textarea, [contenteditable]')) return;
    if (e.key === 'Escape') {
      const m = modalStack[modalStack.length - 1];
      if (m) { if (m.closable) m.close('esc'); return; }
      const wins = [helpWin, previewWin].filter((w) => w && w.isOpen).sort((a, b) => (b.el.style.zIndex | 0) - (a.el.style.zIndex | 0));
      if (wins.length) { wins[0].close(); return; }
      return;
    }
    if (modalStack.length) return;
    // 처음 화면: 난이도 목록 키보드 내비게이션
    if (!$('home').hidden) {
      if (!e.target.closest || !e.target.closest('#levels')) return;
      const n = SN.LEVELS.length, cols = getComputedStyle($('levels')).gridTemplateColumns.split(' ').length;
      const map = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols };
      if (map[e.key] != null) { e.preventDefault(); selectLevel(SN.clamp(state.level + map[e.key], 1, n), true); }
      else if (e.key === 'Home' || e.key === 'PageUp') { e.preventDefault(); selectLevel(1, true); }
      else if (e.key === 'End' || e.key === 'PageDown') { e.preventDefault(); selectLevel(n, true); }
      else if (e.key === 'Enter') { e.preventDefault(); startNew(); }
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const map = { p: 'preview', g: 'ghost', t: 'tidy', f: 'fit', '0': 'fit', h: 'chance', r: 'rotate', m: 'sound', '?': 'help' };
    if (map[k]) { e.preventDefault(); actions[map[k]](); }
    else if (k === '+' || k === '=') { e.preventDefault(); SN.game.zoom(1.25); }
    else if (k === '-' || k === '_') { e.preventDefault(); SN.game.zoom(0.8); }
  }

  // ───────────────────────── 도움말 내용
  function helpBody() {
    return el('div', { class: 'help-body', html: `
      <h4>🧩 어떻게 해요?</h4>
      <ul>
        <li>조각을 <b>끌어다</b> 팔레트 판의 제자리에 놓으면 <b>딸깍!</b> 붙어요.</li>
        <li>맞는 조각끼리 가까이 대면 서로 붙어서 <b>한 덩어리</b>로 같이 움직여요.</li>
        <li>빈 곳을 끌면 화면이 움직이고, <b>두 손가락</b>(또는 마우스 휠)로 키우고 줄여요.</li>
        <li>🔄 회전 모드에선 조각을 <b>톡</b> 누르면 90°씩 돌아가요. (마우스: 오른쪽 클릭)</li>
      </ul>
      <h4>🪄 막혔을 땐?</h4>
      <ul>
        <li><b>찬스</b>를 누르면 조각 하나가 제자리로 날아가요. 먼저 조각을 톡 골라 두면 그 조각이 가요.</li>
        <li>찬스는 단계마다 정해진 만큼만! 안 쓰고 끝내면 <b>별 세 개</b> ⭐⭐⭐</li>
        <li>👁 <b>원본</b>으로 그림을 보고, 🖼 <b>밑그림</b>으로 판 위에 흐린 그림을 켜요.</li>
        <li>🧹 <b>정리</b>를 누르면 흩어진 조각이 줄을 서요. 테두리 조각이 맨 앞!</li>
      </ul>
      <h4>⌨️ 단축키</h4>
      <ul>
        <li><kbd>P</kbd> 원본 · <kbd>G</kbd> 밑그림 · <kbd>T</kbd> 정리 · <kbd>F</kbd> 맞춤 · <kbd>H</kbd> 찬스</li>
        <li><kbd>R</kbd> 돌리기 · <kbd>M</kbd> 소리 · <kbd>+</kbd>/<kbd>-</kbd> 확대·축소 · <kbd>Esc</kbd> 창 닫기</li>
      </ul>
      <p style="margin-top:12px">진행 상황은 자동으로 저장돼요. 🏠 를 눌러도 <b>이어 하기</b>로 돌아올 수 있어요.
      <br>자세한 설명: <a href="docs/user-guide.html" target="_blank" rel="noopener">사용자 가이드</a></p>` });
  }

  // ───────────────────────── 초기화
  SN.ui = {
    init(image) {
      img = image;
      $('hero-art').src = image.src;
      // 조각 수 (시드와 무관)
      SN.LEVELS.forEach((L) => { state.counts[L.id] = SN.countPieces(image, L.id); });
      // 옵션 기억
      const o = SN.store.get('opts', { rotate: false, ghost: true });
      $('opt-rotate').checked = !!o.rotate; $('opt-ghost').checked = o.ghost !== false; $('opt-sound').checked = SN.sfx.on;
      const saveOpts = () => SN.store.set('opts', { rotate: $('opt-rotate').checked, ghost: $('opt-ghost').checked });
      $('opt-rotate').addEventListener('change', saveOpts);
      $('opt-ghost').addEventListener('change', saveOpts);
      $('opt-sound').addEventListener('change', () => { SN.sfx.on = $('opt-sound').checked; });
      // 그린 사람 이름 (이 기기에만 저장)
      $('artist').value = SN.store.get('artist', 'Junyeong'); // 기본: 그린 아이 이름 (지우거나 바꿀 수 있음)
      $('artist').addEventListener('input', () => SN.store.set('artist', $('artist').value.trim()));

      $('btn-start').addEventListener('click', startNew);
      $('btn-resume').addEventListener('click', () => {
        const s = SN.store.get('save', null);
        if (!s) return renderResume();
        launch({ level: s.level, rotate: s.rotate, ghost: $('opt-ghost').checked }, s);
      });

      // 떠 있는 창
      const pv = el('div', { class: 'preview-body' }, el('img', { src: image.src, alt: '원본 그림' }));
      previewWin = SN.FloatWin({ id: 'preview', title: '👁 원본 그림', body: pv, w: 380, h: 300, minW: 200, minH: 160, onToggle: () => syncToolbarSafe() });
      helpWin = SN.FloatWin({ id: 'help', title: '❓ 도움말', body: helpBody(), w: 440, h: 520, minW: 260, minH: 200, place: 'center' });
      $('btn-help-home').addEventListener('click', () => helpWin.toggle());

      // 도구 막대
      const bind = { 'tb-home': 'home', 'tb-preview': 'preview', 'tb-ghost': 'ghost', 'tb-tidy': 'tidy', 'tb-fit': 'fit', 'tb-rotate': 'rotate', 'tb-chance': 'chance', 'tb-sound': 'sound', 'tb-help': 'help', 'tb-full': 'full' };
      for (const id in bind) $(id).addEventListener('click', () => actions[bind[id]]());
      if (!SN.env.fullscreen) $('tb-full').hidden = true;
      const fsChange = () => { const f = !!(document.fullscreenElement || document.webkitFullscreenElement); $('tb-full').setAttribute('aria-pressed', String(f)); };
      document.addEventListener('fullscreenchange', fsChange); document.addEventListener('webkitfullscreenchange', fsChange);

      // 더 보기 메뉴 (좁은 화면)
      const menu = $('more-menu'), more = $('tb-more');
      if (!SN.env.fullscreen) $('mm-full').hidden = true;
      const closeMenu = () => { menu.hidden = true; more.setAttribute('aria-expanded', 'false'); };
      more.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!menu.hidden) return closeMenu();
        const r = more.getBoundingClientRect();
        $('mm-sound-i').textContent = SN.sfx.on ? '🔇' : '🔊';
        $('mm-sound-t').textContent = SN.sfx.on ? '소리 끄기' : '소리 켜기';
        menu.hidden = false; more.setAttribute('aria-expanded', 'true');
        menu.style.top = r.bottom + 6 + 'px';
        menu.style.left = Math.max(8, Math.min(window.innerWidth - menu.offsetWidth - 8, r.right - menu.offsetWidth)) + 'px';
        menu.querySelector('button:not([hidden])').focus({ preventScroll: true });
      });
      menu.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; closeMenu(); actions[b.dataset.act](); });
      menu.addEventListener('keydown', (e) => {
        const items = [...menu.querySelectorAll('button:not([hidden])')], i = items.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
        else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
        else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); more.focus(); }
      });
      document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !e.target.closest('#more-menu, #tb-more')) closeMenu(); });
      window.addEventListener('resize', closeMenu);

      window.addEventListener('keydown', onKey);
      SN.on('progress', updateProgress);
      SN.on('tick', (t) => { if (!$('play').hidden) $('st-time').textContent = SN.fmtTime(t); });
      SN.on('complete', onComplete);
      showHome();
    },
    showHome,
  };
  function syncToolbarSafe() { if (!$('play').hidden && SN.game.running) syncToolbar(); }
})(window.SN);
