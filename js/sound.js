/*
 * 효과음 — 음원 파일 없이 Web Audio 로 합성(용량 0, 오프라인 가능).
 * 브라우저 정책상 첫 터치/클릭 뒤에만 소리가 난다(unlock).
 */
(function () {
  'use strict';
  const SNP = (window.SNP = window.SNP || {});

  const sound = {
    enabled: true,
    ctx: null,
    master: null,

    unlock() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.22;
        this.master.connect(this.ctx.destination);
      } catch (e) { this.ctx = null; }
    },

    tone(freq, start, dur, opt) {
      opt = opt || {};
      const c = this.ctx;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = opt.type || 'sine';
      o.frequency.setValueAtTime(freq, start);
      if (opt.slide) o.frequency.exponentialRampToValueAtTime(opt.slide, start + dur);
      const peak = opt.gain == null ? 0.5 : opt.gain;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(peak, start + (opt.attack || 0.008));
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      o.connect(g);
      g.connect(this.master);
      o.start(start);
      o.stop(start + dur + 0.02);
    },

    play(name) {
      if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
      const t = this.ctx.currentTime + 0.005;
      const T = (f, s, d, o) => this.tone(f, t + s, d, o);
      switch (name) {
        case 'pick': T(740, 0, 0.06, { gain: 0.18, type: 'triangle' }); break;
        case 'drop': T(260, 0, 0.12, { gain: 0.25, slide: 180 }); break;
        case 'rotate': T(560, 0, 0.05, { gain: 0.16, type: 'triangle' }); T(840, 0.03, 0.05, { gain: 0.1 }); break;
        case 'snap':
          T(784, 0, 0.22, { gain: 0.45, type: 'triangle' });
          T(1175, 0.05, 0.3, { gain: 0.3 });
          break;
        case 'snapChance':
          T(988, 0, 0.22, { gain: 0.35, type: 'triangle' });
          T(1480, 0.05, 0.3, { gain: 0.25 });
          break;
        case 'chance':
          [1047, 1319, 1568, 2093, 2637].forEach((f, i) => T(f, i * 0.06, 0.35, { gain: 0.22 }));
          break;
        case 'gift':
          [880, 1109, 1319, 1760].forEach((f, i) => T(f, i * 0.07, 0.3, { gain: 0.25, type: 'triangle' }));
          break;
        case 'nope': T(392, 0, 0.14, { gain: 0.3, type: 'triangle' }); T(311, 0.12, 0.2, { gain: 0.3, type: 'triangle' }); break;
        case 'click': T(1200, 0, 0.03, { gain: 0.08 }); break;
        case 'complete': {
          const seq = [523, 659, 784, 1047, 784, 1047, 1319];
          seq.forEach((f, i) => T(f, i * 0.11, 0.35, { gain: 0.32, type: 'triangle' }));
          [523, 659, 784, 1047].forEach((f) => T(f, 0.85, 1.6, { gain: 0.16 }));
          const pent = [1568, 1760, 2093, 2349, 2637, 3136];
          for (let i = 0; i < 10; i++) T(pent[(Math.random() * pent.length) | 0], 1.0 + i * 0.16 + Math.random() * 0.05, 0.4, { gain: 0.1 });
          break;
        }
        default: break;
      }
    },
  };

  // 첫 조작에서 오디오 잠금 해제(iOS·안드로이드 정책)
  const unlock = () => sound.unlock();
  ['pointerdown', 'keydown', 'touchend'].forEach((ev) => window.addEventListener(ev, unlock, { capture: true, passive: true }));

  SNP.sound = sound;
})();
