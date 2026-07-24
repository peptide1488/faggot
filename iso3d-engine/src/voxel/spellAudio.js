/**
 * Procedural spell SFX via Web Audio API — no external samples.
 *
 * Themes match spellFx.js (fireball, lightning, web, vines, …). Sounds are short
 * synthesized one-shots: noise bursts, detuned oscillators, filtered whooshes.
 *
 * AudioContext starts suspended until unlockSpellAudio() runs (must be from a
 * user gesture). muteSpellAudio / setSpellAudioVolume control playback.
 */

/** @type {AudioContext|null} */
let _ctx = null;
let _master = null;
let _muted = false;
let _volume = 0.55;

function ensureCtx() {
  if (_ctx) return _ctx;
  const g = typeof globalThis !== 'undefined' ? globalThis : null;
  const AC = g && (g.AudioContext || g.webkitAudioContext);
  if (!AC) return null;
  _ctx = new AC();
  _master = _ctx.createGain();
  _master.gain.value = _muted ? 0 : _volume;
  _master.connect(_ctx.destination);
  return _ctx;
}

/** Call from a click/keydown so the browser allows audio. Safe to call often. */
export function unlockSpellAudio() {
  const ctx = ensureCtx();
  if (!ctx) return false;
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  return true;
}

export function setSpellAudioMuted(m) {
  _muted = !!m;
  if (_master) _master.gain.value = _muted ? 0 : _volume;
}

export function setSpellAudioVolume(v) {
  _volume = Math.max(0, Math.min(1, Number(v) || 0));
  if (_master && !_muted) _master.gain.value = _volume;
}

export function isSpellAudioMuted() {
  return _muted;
}

function now() {
  const ctx = ensureCtx();
  return ctx ? ctx.currentTime : 0;
}

function out() {
  ensureCtx();
  return _master;
}

/** White-noise buffer (shared, 1s). */
let _noiseBuf = null;
function noiseBuffer(ctx) {
  if (_noiseBuf && _noiseBuf.sampleRate === ctx.sampleRate) return _noiseBuf;
  const len = ctx.sampleRate;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  _noiseBuf = buf;
  return buf;
}

function noiseBurst(ctx, dest, {
  t0 = now(),
  duration = 0.2,
  gain = 0.4,
  freq = 800,
  q = 1,
  type = 'bandpass',
  attack = 0.005,
  decayExp = 4,
} = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const filt = ctx.createBiquadFilter();
  filt.type = type;
  filt.frequency.setValueAtTime(freq, t0);
  filt.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  src.connect(filt);
  filt.connect(g);
  g.connect(dest);
  src.start(t0);
  src.stop(t0 + duration + 0.05);
  // Optional freq sweep for whooshes
  return { filt, g, src };
}

function tone(ctx, dest, {
  t0 = now(),
  freq = 220,
  freqEnd = null,
  duration = 0.25,
  gain = 0.2,
  type = 'sine',
  attack = 0.01,
  detune = 0,
} = {}) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd != null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + duration);
  if (detune) osc.detune.setValueAtTime(detune, t0);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g);
  g.connect(dest);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
  return { osc, g };
}

function boom(ctx, dest, t0, gain = 0.5) {
  // Low thump
  tone(ctx, dest, {
    t0, freq: 90, freqEnd: 35, duration: 0.45, gain: gain * 0.7, type: 'sine', attack: 0.005,
  });
  noiseBurst(ctx, dest, {
    t0, duration: 0.35, gain: gain * 0.45, freq: 120, q: 0.6, type: 'lowpass', attack: 0.003,
  });
}

function crackle(ctx, dest, t0, n = 6, gain = 0.15) {
  for (let i = 0; i < n; i++) {
    const dt = Math.random() * 0.18;
    noiseBurst(ctx, dest, {
      t0: t0 + dt,
      duration: 0.04 + Math.random() * 0.05,
      gain: gain * (0.5 + Math.random() * 0.5),
      freq: 1500 + Math.random() * 4000,
      q: 2 + Math.random() * 4,
      type: 'bandpass',
      attack: 0.001,
    });
  }
}

/** Launch / cast whoosh (projectile leave caster). */
export function playSpellCast(theme, { intensity = 1 } = {}) {
  if (_muted) return;
  const ctx = ensureCtx();
  if (!ctx || ctx.state === 'suspended') return;
  const dest = out();
  if (!dest) return;
  const t0 = ctx.currentTime;
  const g = Math.min(1.4, Math.max(0.4, intensity));
  const th = String(theme || 'generic').toLowerCase();

  switch (th) {
    case 'fireball':
    case 'fire':
    case 'meteor':
      noiseBurst(ctx, dest, {
        t0, duration: 0.28, gain: 0.28 * g, freq: 600, q: 0.8, type: 'bandpass',
      });
      tone(ctx, dest, {
        t0, freq: 180, freqEnd: 90, duration: 0.3, gain: 0.12 * g, type: 'sawtooth', attack: 0.02,
      });
      break;
    case 'lightning':
      noiseBurst(ctx, dest, {
        t0, duration: 0.08, gain: 0.25 * g, freq: 2500, q: 3, type: 'bandpass', attack: 0.001,
      });
      tone(ctx, dest, {
        t0, freq: 900, freqEnd: 200, duration: 0.12, gain: 0.1 * g, type: 'square', attack: 0.001,
      });
      break;
    case 'ice':
      tone(ctx, dest, {
        t0, freq: 1200, freqEnd: 600, duration: 0.2, gain: 0.08 * g, type: 'triangle',
      });
      noiseBurst(ctx, dest, {
        t0: t0 + 0.02, duration: 0.15, gain: 0.12 * g, freq: 4000, q: 2, type: 'highpass',
      });
      break;
    case 'poison':
    case 'fog':
      noiseBurst(ctx, dest, {
        t0, duration: 0.4, gain: 0.15 * g, freq: 300, q: 0.5, type: 'lowpass',
      });
      tone(ctx, dest, {
        t0, freq: 70, freqEnd: 50, duration: 0.45, gain: 0.08 * g, type: 'sine',
      });
      break;
    case 'radiant':
    case 'faerie':
    case 'spirit':
      tone(ctx, dest, {
        t0, freq: 660, freqEnd: 990, duration: 0.25, gain: 0.1 * g, type: 'sine',
      });
      tone(ctx, dest, {
        t0, freq: 990, freqEnd: 1320, duration: 0.28, gain: 0.07 * g, type: 'sine', detune: 8,
      });
      break;
    case 'necrotic':
      tone(ctx, dest, {
        t0, freq: 55, freqEnd: 40, duration: 0.4, gain: 0.18 * g, type: 'sine',
      });
      tone(ctx, dest, {
        t0, freq: 82, freqEnd: 60, duration: 0.35, gain: 0.08 * g, type: 'triangle',
      });
      break;
    case 'wind':
      noiseBurst(ctx, dest, {
        t0, duration: 0.35, gain: 0.22 * g, freq: 900, q: 0.7, type: 'bandpass',
      });
      {
        const nb = noiseBurst(ctx, dest, {
          t0, duration: 0.4, gain: 0.18 * g, freq: 400, q: 0.5, type: 'bandpass',
        });
        nb.filt.frequency.linearRampToValueAtTime(1400, t0 + 0.35);
      }
      break;
    case 'web':
    case 'vines':
    case 'grease':
    case 'spikes':
    case 'swarm':
      // Soft place — short rustle, impact carries the character
      noiseBurst(ctx, dest, {
        t0, duration: 0.15, gain: 0.12 * g, freq: 500, q: 1, type: 'bandpass',
      });
      break;
    default:
      noiseBurst(ctx, dest, {
        t0, duration: 0.18, gain: 0.15 * g, freq: 700, q: 1, type: 'bandpass',
      });
  }
}

/** Impact / multi-hit sound at target. */
export function playSpellImpact(theme, { intensity = 1, hitIndex = 0 } = {}) {
  if (_muted) return;
  const ctx = ensureCtx();
  if (!ctx || ctx.state === 'suspended') return;
  const dest = out();
  if (!dest) return;
  const t0 = ctx.currentTime;
  const g = Math.min(1.5, Math.max(0.35, intensity)) * (hitIndex === 0 ? 1 : 0.7);
  const th = String(theme || 'generic').toLowerCase();

  switch (th) {
    case 'fireball':
    case 'meteor':
      boom(ctx, dest, t0, 0.55 * g);
      noiseBurst(ctx, dest, {
        t0, duration: 0.4, gain: 0.4 * g, freq: 400, q: 0.7, type: 'lowpass', attack: 0.002,
      });
      noiseBurst(ctx, dest, {
        t0: t0 + 0.02, duration: 0.25, gain: 0.25 * g, freq: 1800, q: 1.2, type: 'bandpass',
      });
      crackle(ctx, dest, t0 + 0.05, 8, 0.12 * g);
      if (th === 'meteor') {
        boom(ctx, dest, t0 + 0.08, 0.4 * g);
      }
      break;

    case 'fire':
      boom(ctx, dest, t0, 0.35 * g);
      crackle(ctx, dest, t0, 10, 0.14 * g);
      noiseBurst(ctx, dest, {
        t0, duration: 0.3, gain: 0.28 * g, freq: 500, q: 0.8, type: 'bandpass',
      });
      break;

    case 'lightning':
      // Sharp electric crack + after-zap
      noiseBurst(ctx, dest, {
        t0, duration: 0.06, gain: 0.55 * g, freq: 3500, q: 4, type: 'bandpass', attack: 0.0005,
      });
      tone(ctx, dest, {
        t0, freq: 2000, freqEnd: 120, duration: 0.15, gain: 0.2 * g, type: 'square', attack: 0.001,
      });
      noiseBurst(ctx, dest, {
        t0: t0 + 0.04, duration: 0.12, gain: 0.3 * g, freq: 800, q: 1.5, type: 'highpass',
      });
      crackle(ctx, dest, t0 + 0.02, 5, 0.1 * g);
      break;

    case 'thunder':
      boom(ctx, dest, t0, 0.65 * g);
      noiseBurst(ctx, dest, {
        t0, duration: 0.55, gain: 0.4 * g, freq: 100, q: 0.4, type: 'lowpass',
      });
      noiseBurst(ctx, dest, {
        t0: t0 + 0.05, duration: 0.3, gain: 0.2 * g, freq: 600, q: 0.8, type: 'bandpass',
      });
      break;

    case 'ice':
      noiseBurst(ctx, dest, {
        t0, duration: 0.12, gain: 0.35 * g, freq: 5000, q: 2, type: 'highpass', attack: 0.001,
      });
      tone(ctx, dest, {
        t0, freq: 1400, freqEnd: 400, duration: 0.2, gain: 0.12 * g, type: 'triangle',
      });
      tone(ctx, dest, {
        t0: t0 + 0.03, freq: 2200, freqEnd: 800, duration: 0.18, gain: 0.08 * g, type: 'sine',
      });
      noiseBurst(ctx, dest, {
        t0: t0 + 0.05, duration: 0.25, gain: 0.15 * g, freq: 2000, q: 1, type: 'bandpass',
      });
      break;

    case 'web':
      // Sticky twang + soft thwip
      tone(ctx, dest, {
        t0, freq: 280, freqEnd: 140, duration: 0.2, gain: 0.12 * g, type: 'triangle',
      });
      noiseBurst(ctx, dest, {
        t0, duration: 0.18, gain: 0.18 * g, freq: 900, q: 2, type: 'bandpass',
      });
      tone(ctx, dest, {
        t0: t0 + 0.06, freq: 400, freqEnd: 200, duration: 0.15, gain: 0.08 * g, type: 'sine',
      });
      break;

    case 'vines':
      noiseBurst(ctx, dest, {
        t0, duration: 0.25, gain: 0.22 * g, freq: 400, q: 1.2, type: 'bandpass',
      });
      crackle(ctx, dest, t0, 6, 0.1 * g);
      tone(ctx, dest, {
        t0, freq: 120, freqEnd: 80, duration: 0.3, gain: 0.1 * g, type: 'sine',
      });
      break;

    case 'grease':
      noiseBurst(ctx, dest, {
        t0, duration: 0.3, gain: 0.2 * g, freq: 250, q: 0.6, type: 'lowpass',
      });
      tone(ctx, dest, {
        t0, freq: 90, freqEnd: 50, duration: 0.35, gain: 0.1 * g, type: 'sine',
      });
      break;

    case 'spikes':
      noiseBurst(ctx, dest, {
        t0, duration: 0.1, gain: 0.3 * g, freq: 1800, q: 3, type: 'bandpass', attack: 0.001,
      });
      tone(ctx, dest, {
        t0, freq: 300, freqEnd: 100, duration: 0.15, gain: 0.12 * g, type: 'square', attack: 0.002,
      });
      break;

    case 'swarm':
      for (let i = 0; i < 12; i++) {
        noiseBurst(ctx, dest, {
          t0: t0 + Math.random() * 0.25,
          duration: 0.05,
          gain: 0.08 * g,
          freq: 2000 + Math.random() * 3000,
          q: 5,
          type: 'bandpass',
          attack: 0.001,
        });
      }
      noiseBurst(ctx, dest, {
        t0, duration: 0.35, gain: 0.12 * g, freq: 600, q: 0.8, type: 'bandpass',
      });
      break;

    case 'poison':
    case 'fog':
      noiseBurst(ctx, dest, {
        t0, duration: 0.45, gain: 0.22 * g, freq: 200, q: 0.5, type: 'lowpass',
      });
      for (let i = 0; i < 5; i++) {
        tone(ctx, dest, {
          t0: t0 + i * 0.06,
          freq: 140 + Math.random() * 40,
          freqEnd: 60,
          duration: 0.2,
          gain: 0.05 * g,
          type: 'sine',
        });
      }
      break;

    case 'wind':
      {
        const n = noiseBurst(ctx, dest, {
          t0, duration: 0.5, gain: 0.3 * g, freq: 500, q: 0.6, type: 'bandpass',
        });
        n.filt.frequency.linearRampToValueAtTime(1800, t0 + 0.25);
        n.filt.frequency.linearRampToValueAtTime(400, t0 + 0.5);
      }
      noiseBurst(ctx, dest, {
        t0: t0 + 0.05, duration: 0.4, gain: 0.15 * g, freq: 1200, q: 0.8, type: 'highpass',
      });
      break;

    case 'radiant':
    case 'faerie':
    case 'spirit':
    case 'psychic':
      tone(ctx, dest, {
        t0, freq: 523, freqEnd: 1046, duration: 0.35, gain: 0.12 * g, type: 'sine',
      });
      tone(ctx, dest, {
        t0, freq: 659, freqEnd: 1318, duration: 0.4, gain: 0.09 * g, type: 'sine', detune: 5,
      });
      tone(ctx, dest, {
        t0: t0 + 0.05, freq: 784, duration: 0.3, gain: 0.07 * g, type: 'triangle',
      });
      noiseBurst(ctx, dest, {
        t0, duration: 0.2, gain: 0.1 * g, freq: 3000, q: 1, type: 'highpass',
      });
      break;

    case 'necrotic':
      tone(ctx, dest, {
        t0, freq: 48, freqEnd: 30, duration: 0.55, gain: 0.28 * g, type: 'sine',
      });
      tone(ctx, dest, {
        t0, freq: 72, freqEnd: 45, duration: 0.5, gain: 0.12 * g, type: 'triangle',
      });
      noiseBurst(ctx, dest, {
        t0, duration: 0.4, gain: 0.2 * g, freq: 150, q: 0.5, type: 'lowpass',
      });
      break;

    case 'disintegrate':
      noiseBurst(ctx, dest, {
        t0, duration: 0.15, gain: 0.3 * g, freq: 2200, q: 2, type: 'bandpass', attack: 0.001,
      });
      tone(ctx, dest, {
        t0, freq: 800, freqEnd: 60, duration: 0.35, gain: 0.15 * g, type: 'sawtooth', attack: 0.005,
      });
      boom(ctx, dest, t0 + 0.05, 0.25 * g);
      break;

    default:
      boom(ctx, dest, t0, 0.3 * g);
      noiseBurst(ctx, dest, {
        t0, duration: 0.2, gain: 0.2 * g, freq: 700, q: 1, type: 'bandpass',
      });
  }
}

/**
 * Theme from spell (same idea as spellFx.themeForSpell — kept local to avoid a cycle).
 * Prefer spell.fx.theme when set.
 */
export function themeForSpellAudio(spell) {
  if (spell && spell.fx && spell.fx.theme) return String(spell.fx.theme).toLowerCase();
  const name = String((spell && spell.name) || '').toLowerCase();
  if (name.includes('fireball')) return 'fireball';
  if (name.includes('meteor')) return 'meteor';
  if (name.includes('lightning')) return 'lightning';
  if (name.includes('web')) return 'web';
  if (name.includes('entangle')) return 'vines';
  if (name.includes('grease')) return 'grease';
  if (name.includes('insect')) return 'swarm';
  if (name.includes('spike')) return 'spikes';
  if (name.includes('sleet') || name.includes('ice') || name.includes('cold')) return 'ice';
  if (name.includes('cloudkill') || name.includes('stinking')) return 'poison';
  if (name.includes('gust') || name.includes('wind')) return 'wind';
  if (name.includes('thunder') || name.includes('shatter')) return 'thunder';
  if (name.includes('sun') || name.includes('moon') || name.includes('radiant')) return 'radiant';
  if (name.includes('death') || name.includes('necrotic')) return 'necrotic';
  if (name.includes('disintegrate')) return 'disintegrate';
  if (name.includes('burning') || name.includes('flame')) return 'fire';
  const dtype = String((spell && spell.damage && spell.damage[0] && spell.damage[0].type) || '').toLowerCase();
  if (dtype.includes('fire')) return 'fire';
  if (dtype.includes('lightning')) return 'lightning';
  if (dtype.includes('cold')) return 'ice';
  if (dtype.includes('thunder')) return 'thunder';
  if (dtype.includes('poison')) return 'poison';
  if (dtype.includes('necrotic')) return 'necrotic';
  if (dtype.includes('radiant')) return 'radiant';
  return 'generic';
}
