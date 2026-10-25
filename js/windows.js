/*
 * 창 관리 — UI 원칙:
 *  · 확인·결과 같은 메시지 상자만 모달, 나머지(미리보기·도움말·설정)는 떠 있는 창
 *  · 떠 있는 창은 제목줄로 옮기고 오른쪽 아래 손잡이로 크기 조절, 마지막 위치·크기를 영구 기억
 *  · 모든 창은 같은 제목줄(글자 크기·높이)과 우상단의 색 다른 닫기 버튼
 */
(function () {
  'use strict';
  const SNP = (window.SNP = window.SNP || {});
  const U = SNP.util;
  const el = U.el;

  let zTop = 60;
  const openWins = new Set();
  const MARGIN = 6;

  function viewport() {
    const vv = window.visualViewport;
    return { w: vv ? vv.width : window.innerWidth, h: vv ? vv.height : window.innerHeight };
  }

  function closeButton(onClick) {
    const b = el('button', { class: 'win-close', type: 'button', 'aria-label': '닫기', title: '닫기 (Esc)', onclick: onClick });
    b.appendChild(U.icon('close'));
    return b;
  }

  /**
   * 떠 있는 창
   * @param o.id 저장 키, o.title, o.body(Element), o.defaultRect(vp) → {x,y,w,h}, o.minW, o.minH, o.onToggle(open)
   */
  function floatWin(o) {
    const key = 'win:' + o.id;
    const titleEl = el('div', { class: 'win-title', text: o.title });
    const bar = el('div', { class: 'win-bar' }, [titleEl]);
    const body = el('div', { class: 'win-body' }, [o.body]);
    const grip = el('div', { class: 'win-grip', 'aria-hidden': 'true', title: '크기 조절' });
    const root = el('section', { class: 'win', role: 'dialog', 'aria-label': o.title, hidden: true }, [bar, body, grip]);
    bar.appendChild(closeButton(() => api.close()));
    document.getElementById('windows').appendChild(root);

    let rect = null;
    const minW = o.minW || 220, minH = o.minH || 160;

    function clampRect(r) {
      const vp = viewport();
      const w = U.clamp(r.w, Math.min(minW, vp.w - MARGIN * 2), vp.w - MARGIN * 2);
      const h = U.clamp(r.h, Math.min(minH, vp.h - MARGIN * 2), vp.h - MARGIN * 2);
      // 제목줄이 늘 화면 안에 있어 다시 잡을 수 있게
      const x = U.clamp(r.x, MARGIN - w + 80, vp.w - 80);
      const y = U.clamp(r.y, MARGIN, vp.h - 44);
      return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
    }
    function apply() {
      root.style.left = rect.x + 'px';
      root.style.top = rect.y + 'px';
      root.style.width = rect.w + 'px';
      root.style.height = rect.h + 'px';
    }
    function save() { U.store.set(key, rect); }
    function front() { root.style.zIndex = ++zTop; }

    // ---- 옮기기 ----
    bar.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      e.preventDefault();
      front();
      const sx = e.clientX, sy = e.clientY, r0 = Object.assign({}, rect);
      bar.setPointerCapture(e.pointerId);
      const move = (ev) => { rect = clampRect({ x: r0.x + ev.clientX - sx, y: r0.y + ev.clientY - sy, w: r0.w, h: r0.h }); apply(); };
      const up = () => {
        bar.removeEventListener('pointermove', move);
        bar.removeEventListener('pointerup', up);
        bar.removeEventListener('pointercancel', up);
        save();
      };
      bar.addEventListener('pointermove', move);
      bar.addEventListener('pointerup', up);
      bar.addEventListener('pointercancel', up);
    });
    // ---- 크기 조절 ----
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      front();
      const sx = e.clientX, sy = e.clientY, r0 = Object.assign({}, rect);
      grip.setPointerCapture(e.pointerId);
      const move = (ev) => { rect = clampRect({ x: r0.x, y: r0.y, w: r0.w + ev.clientX - sx, h: r0.h + ev.clientY - sy }); apply(); o.onResize && o.onResize(); };
      const up = () => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        grip.removeEventListener('pointercancel', up);
        save();
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
      grip.addEventListener('pointercancel', up);
    });
    root.addEventListener('pointerdown', front, true);

    const api = {
      el: root,
      body,
      isOpen: () => !root.hidden,
      open() {
        if (!root.hidden) { front(); return; }
        const saved = U.store.get(key, null);
        rect = clampRect(saved && saved.w ? saved : o.defaultRect(viewport()));
        apply();
        root.hidden = false;
        front();
        openWins.add(api);
        o.onToggle && o.onToggle(true);
      },
      close() {
        if (root.hidden) return;
        save();
        root.hidden = true;
        openWins.delete(api);
        o.onToggle && o.onToggle(false);
      },
      toggle() { if (root.hidden) api.open(); else api.close(); },
      reclamp() { if (!root.hidden) { rect = clampRect(rect); apply(); } },
      z: () => Number(root.style.zIndex || 0),
    };
    return api;
  }

  // ------------------------------------------------------------------ 모달(메시지 상자)
  let modalStack = [];
  /**
   * @param o.title, o.body(Element|string), o.buttons [{label, kind:'primary'|'ghost'|'danger', onClick, keep}], o.closable, o.onClose, o.className
   */
  function modal(o) {
    const body = typeof o.body === 'string' ? el('p', { text: o.body }) : o.body;
    const btns = el('div', { class: 'modal-actions' });
    const bar = el('div', { class: 'win-bar' }, [el('div', { class: 'win-title', text: o.title })]);
    const box = el('section', { class: 'modal ' + (o.className || ''), role: 'alertdialog', 'aria-modal': 'true', 'aria-label': o.title }, [bar, el('div', { class: 'modal-body' }, [body]), btns]);
    const back = el('div', { class: 'modal-back' }, [box]);
    const prevFocus = document.activeElement;
    let closed = false;
    function close(reason) {
      if (closed) return;
      closed = true;
      back.classList.add('closing');
      setTimeout(() => back.remove(), 160);
      modalStack = modalStack.filter((m) => m !== api);
      if (prevFocus && prevFocus.focus) try { prevFocus.focus({ preventScroll: true }); } catch (e) { /* 무시 */ }
      o.onClose && o.onClose(reason);
    }
    if (o.closable !== false) bar.appendChild(closeButton(() => close('x')));
    (o.buttons || []).forEach((b) => {
      const btn = el('button', { class: 'btn ' + (b.kind || 'ghost'), type: 'button' }, [b.icon ? U.icon(b.icon) : null, el('span', { text: b.label })]);
      btn.addEventListener('click', () => { if (!b.keep) close('button'); if (b.onClick) b.onClick(); });
      btns.appendChild(btn);
    });
    back.addEventListener('pointerdown', (e) => { if (e.target === back && o.closable !== false && o.backdropClose) close('backdrop'); });
    document.body.appendChild(back);
    const api = { close, el: box, closable: o.closable !== false };
    modalStack.push(api);
    const first = btns.querySelector('.btn.primary') || btns.querySelector('.btn');
    if (first) setTimeout(() => first.focus({ preventScroll: true }), 30);
    return api;
  }

  function confirmBox(title, text, okLabel, onOk, danger) {
    return modal({
      title, body: text, buttons: [
        { label: '취소', kind: 'ghost' },
        { label: okLabel, kind: danger ? 'danger' : 'primary', onClick: onOk },
      ],
    });
  }

  // ------------------------------------------------------------------ 알림 띠(토스트)
  /** @param key 같은 key 의 알림은 쌓지 않고 새 것으로 바꾼다(연속 맞추기 등) */
  function toast(text, kind, key) {
    const box = document.getElementById('toasts');
    if (!box) return;
    if (key) Array.from(box.children).forEach((c) => { if (c.dataset.key === key) c.remove(); });
    const icons = { star: 'star', combo: 'spark', gift: 'gift', warn: 'info', info: 'info' };
    const t = el('div', { class: 'toast ' + (kind || 'info'), role: 'status', 'data-key': key || null }, [U.icon(icons[kind] || 'info'), el('span', { text })]);
    box.appendChild(t);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 2600);
  }

  // Esc: 모달 → 가장 위 떠 있는 창 순으로 닫기
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (modalStack.length) {
      const m = modalStack[modalStack.length - 1];
      if (m.closable) { m.close('esc'); e.preventDefault(); }
      return;
    }
    let top = null;
    openWins.forEach((w) => { if (!top || w.z() > top.z()) top = w; });
    if (top) { top.close(); e.preventDefault(); }
  });
  const reclampAll = () => openWins.forEach((w) => w.reclamp());
  window.addEventListener('resize', reclampAll);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', reclampAll);

  SNP.ui = { floatWin, modal, confirmBox, toast, hasModal: () => modalStack.length > 0 };
})();
