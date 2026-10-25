/* 효과음: 파일 없이 Web Audio 로 합성 (용량 0, 오프라인 OK). 첫 사용자 입력 때 AudioContext 를 연다(자동 재생 정책). */
'use strict';
(function (SN) {
  let ctx = null, master = null;
  const st = { on: SN.store.get('sound', true) };

  function ensure() {
    if (!st.on) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.55;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp); comp.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  // iOS 는 사용자 제스처 안에서 resume 해야 소리가 난다
  const unlock = () => { if (st.on) ensure(); };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });

  function tone({ f = 440, f2 = null, type = 'sine', t = 0, dur = 0.15, vol = 0.3, attack = 0.005, q = null }) {
    const c = ensure(); if (!c) return;
    const now = c.currentTime + t;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, now);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, now + dur);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    let node = o;
    if (q) { const bq = c.createBiquadFilter(); bq.type = 'lowpass'; bq.frequency.value = q; o.connect(bq); node = bq; }
    node.connect(g); g.connect(master);
    o.start(now); o.stop(now + dur + 0.05);
  }
  function noise({ t = 0, dur = 0.12, vol = 0.15, from = 2000, to = 600 }) {
    const c = ensure(); if (!c) return;
    const now = c.currentTime + t, len = Math.ceil(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(); src.buffer = buf;
    const bq = c.createBiquadFilter(); bq.type = 'bandpass'; bq.Q.value = 1.2;
    bq.frequency.setValueAtTime(from, now); bq.frequency.exponentialRampToValueAtTime(to, now + dur);
    const g = c.createGain(); g.gain.value = vol;
    src.connect(bq); bq.connect(g); g.connect(master);
    src.start(now);
  }
  const bell = (f, t = 0, vol = 0.22, dur = 0.9) => {
    tone({ f, t, dur, vol, type: 'sine' });
    tone({ f: f * 2.01, t, dur: dur * 0.6, vol: vol * 0.35, type: 'sine' });
    tone({ f: f * 3.02, t, dur: dur * 0.3, vol: vol * 0.15, type: 'triangle' });
  };

  const N = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI → Hz

  SN.sfx = {
    get on() { return st.on; },
    set on(v) { st.on = !!v; SN.store.set('sound', st.on); if (st.on) ensure(); else if (ctx) ctx.suspend(); },
    pick() { tone({ f: 880, f2: 1320, dur: 0.07, vol: 0.12, type: 'triangle' }); },
    drop() { tone({ f: 260, f2: 170, dur: 0.09, vol: 0.16, type: 'triangle' }); },
    rotate() { noise({ dur: 0.1, vol: 0.12, from: 1800, to: 3800 }); },
    connect() { bell(N(79), 0, 0.14, 0.4); bell(N(84), 0.06, 0.12, 0.45); },
    place() { bell(N(84), 0, 0.2, 0.7); bell(N(88), 0.07, 0.16, 0.8); tone({ f: 120, f2: 80, dur: 0.08, vol: 0.12, type: 'sine' }); },
    chance() {
      [72, 76, 79, 84, 88, 91].forEach((n, i) => bell(N(n), i * 0.055, 0.12, 0.5));
      noise({ t: 0.05, dur: 0.5, vol: 0.05, from: 3000, to: 9000 });
    },
    denied() { tone({ f: 300, f2: 220, dur: 0.18, vol: 0.12, type: 'square', q: 900 }); },
    click() { tone({ f: 1400, dur: 0.03, vol: 0.06, type: 'sine' }); },
    fanfare() {
      const seq = [[72, 0], [76, 0.14], [79, 0.28], [84, 0.42], [79, 0.62], [84, 0.76]];
      seq.forEach(([n, t]) => { tone({ f: N(n), t, dur: 0.32, vol: 0.16, type: 'triangle' }); bell(N(n + 12), t, 0.08, 0.6); });
      [[60, 64, 67, 72], [65, 69, 72, 77], [67, 71, 74, 79], [72, 76, 79, 84]].forEach((ch, k) => {
        ch.forEach((n) => tone({ f: N(n), t: 1.0 + k * 0.32, dur: k === 3 ? 1.6 : 0.34, vol: 0.07, type: 'sawtooth', q: 2400 }));
      });
      for (let i = 0; i < 14; i++) bell(N(96 + ((i * 5) % 12)), 1.2 + i * 0.12 + Math.random() * 0.05, 0.05, 0.6);
    },
  };
})(window.SN);
