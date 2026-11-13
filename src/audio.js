// 외부 음원 없이 브라우저에서 직접 만드는 짧은 효과음입니다. 기본값은 꺼짐이며, 사용자가 켜야만 소리가 납니다.
export function createAudio() {
  let ctx = null;
  let enabled = false;

  function context() {
    if (!ctx) {
      const Ctor = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
      if (!Ctor) return null;
      try { ctx = new Ctor(); } catch { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function tone({ freq, to = freq, dur = 0.1, type = 'sine', vol = 0.06, delay = 0 }) {
    const c = context();
    if (!c) return;
    const start = c.currentTime + delay;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + dur);
    gain.gain.setValueAtTime(vol, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  const SCALE = [523, 587, 659, 784, 880, 1047, 1175, 1319]; // 도 레 미 솔 라 도 레 미

  const effects = {
    pick: () => tone({ freq: 420, to: 520, dur: 0.05, type: 'triangle', vol: 0.05 }),
    place: () => { tone({ freq: 300, to: 190, dur: 0.09, type: 'triangle', vol: 0.09 }); },
    nope: () => tone({ freq: 170, to: 120, dur: 0.12, type: 'square', vol: 0.04 }),
    // 줄을 지우면 소리가 올라갑니다. 콤보가 길수록 더 높은 음에서 시작합니다.
    clear: (arg = {}) => {
      const start = Math.min(4, Math.max(0, (arg.streak || 1) - 1));
      const notes = Math.min(5, 2 + (arg.lines || 1));
      for (let i = 0; i < notes; i += 1) tone({ freq: SCALE[Math.min(SCALE.length - 1, start + i)], dur: 0.14, type: 'triangle', vol: 0.07, delay: i * 0.06 });
    },
    allclear: () => { [523, 659, 784, 1047, 1319, 1568].forEach((freq, i) => tone({ freq, dur: 0.18, type: 'triangle', vol: 0.07, delay: i * 0.07 })); },
    over: () => { [440, 370, 311, 262].forEach((freq, i) => tone({ freq, dur: 0.2, type: 'sine', vol: 0.07, delay: i * 0.13 })); },
    best: () => { [660, 880, 1100, 1320].forEach((freq, i) => tone({ freq, dur: 0.12, type: 'triangle', vol: 0.06, delay: i * 0.09 })); }
  };

  return {
    get enabled() { return enabled; },
    setEnabled(value) {
      enabled = Boolean(value) && Boolean(context()); // 켤 때 사용자 조작 안에서 오디오를 깨웁니다.
      return enabled;
    },
    play(name, arg) {
      if (!enabled) return;
      try { effects[name]?.(arg); } catch { /* 소리 실패는 게임에 영향을 주지 않습니다. */ }
    }
  };
}
