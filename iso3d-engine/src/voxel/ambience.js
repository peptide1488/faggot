/**
 * ambience.js — generative ambience beds + one-shot sound effects.
 *
 * Deliberately PROCEDURAL (Web Audio graphs built at runtime), for the same reason
 * spellAudio.js is: this engine ships as a static page, and a library of recorded
 * ambience loops would add megabytes of binary to a deploy that currently has none.
 * Everything here is a few oscillators and a noise buffer, so the whole sound design
 * costs ~0 bytes of transfer and works offline in the service-worker cache.
 *
 * Two layers:
 *
 *   startAmbience(kind)   a CONTINUOUS bed that keeps generating: cave rumble and
 *                         drips for 'dungeon', wind and birdsong for 'outdoor'.
 *                         Events are scheduled on a slow timer rather than baked into
 *                         one long buffer, so a bed never audibly loops.
 *   playSfx(name)         one-shots — doors, footsteps, splashes, chests, combat.
 *
 * Browser autoplay policy: an AudioContext created before a user gesture starts
 * 'suspended' and stays silent. unlockAmbience() must be called from a real input
 * handler — voxel.html already does exactly this for spell audio, and the same click
 * that starts the map is enough for both.
 */

let _ctx = null;
let _master = null;
let _muted = false;
let _volume = 0.35;

function ensureCtx() {
  if (_ctx) return _ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  _ctx = new AC();
  _master = _ctx.createGain();
  _master.gain.value = _muted ? 0 : _volume;
  _master.connect(_ctx.destination);
  return _ctx;
}

/** Call from a real user gesture (click/keydown) or everything stays silent. */
export function unlockAmbience() {
  const ctx = ensureCtx();
  if (ctx && ctx.state === 'suspended') ctx.resume();
  return !!ctx;
}

export function setAmbienceMuted(m) {
  _muted = !!m;
  if (_master) _master.gain.value = _muted ? 0 : _volume;
}

export function isAmbienceMuted() {
  return _muted;
}

export function setAmbienceVolume(v) {
  _volume = Math.max(0, Math.min(1, v));
  if (_master && !_muted) _master.gain.value = _volume;
}

const now = () => (_ctx ? _ctx.currentTime : 0);
const out = () => _master;

// ── primitives ────────────────────────────────────────────────────────────────

let _noiseBuf = null;
/** 2 s of white noise, generated once and reused by every noise voice. */
function noiseBuffer(ctx) {
  if (_noiseBuf) return _noiseBuf;
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  _noiseBuf = buf;
  return buf;
}

/**
 * A filtered noise burst with an ADSR-ish gain envelope. `type`/`freq`/`q` shape the
 * band; `attack`/`decay` shape the hit. Used for everything percussive and airy.
 */
function noiseBurst(ctx, dest, { t0, dur = 0.3, freq = 1000, q = 1, type = 'bandpass', gain = 0.2, attack = 0.005 }) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const filt = ctx.createBiquadFilter();
  filt.type = type;
  filt.frequency.value = freq;
  filt.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filt).connect(g).connect(dest);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

/** A simple enveloped oscillator, optionally gliding from freq -> freqEnd. */
function tone(ctx, dest, { t0, dur = 0.3, freq = 440, freqEnd = null, type = 'sine', gain = 0.2, attack = 0.005 }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(dest);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

/**
 * A feedback delay standing in for cave reverb. Real convolution would need an impulse
 * response file — the one asset this module is trying not to ship — and for a stone
 * corridor a couple of decaying repeats reads as "underground" perfectly well.
 */
function makeCaveEcho(ctx, dest, { time = 0.28, feedback = 0.45, wet = 0.5 } = {}) {
  const input = ctx.createGain();
  const delay = ctx.createDelay(1.5);
  delay.delayTime.value = time;
  const fb = ctx.createGain();
  fb.gain.value = feedback;
  const wetGain = ctx.createGain();
  wetGain.gain.value = wet;
  const damp = ctx.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.value = 1800; // stone soaks up the highs on each bounce
  input.connect(dest);
  input.connect(delay);
  delay.connect(damp).connect(fb).connect(delay);
  delay.connect(wetGain).connect(dest);
  return input;
}

// ── ambience beds ─────────────────────────────────────────────────────────────

let _bed = null; // { kind, nodes:[], timers:[] }

function stopBed() {
  if (!_bed) return;
  for (const t of _bed.timers) clearInterval(t);
  for (const n of _bed.nodes) {
    try { n.stop ? n.stop() : n.disconnect(); } catch { /* already stopped */ }
  }
  _bed = null;
}

export function stopAmbience() {
  stopBed();
}

export function currentAmbience() {
  return _bed ? _bed.kind : null;
}

/**
 * Start (or swap to) a continuous ambience bed. Safe to call repeatedly with the same
 * kind — it no-ops rather than stacking a second copy of the drone on top of the first,
 * which is the classic way generative beds turn into a wall of noise.
 */
export function startAmbience(kind = 'dungeon') {
  const ctx = ensureCtx();
  if (!ctx) return false;
  if (_bed && _bed.kind === kind) return true;
  stopBed();
  _bed = { kind, nodes: [], timers: [] };
  if (kind === 'dungeon') startDungeonBed(ctx);
  else if (kind === 'outdoor') startOutdoorBed(ctx);
  return true;
}

function startDungeonBed(ctx) {
  const dest = out();
  const echo = makeCaveEcho(ctx, dest, { time: 0.31, feedback: 0.5, wet: 0.55 });

  // Sub-bass drone — two detuned oscillators beating slowly against each other, which
  // is what stops a single sine from sounding like a test tone.
  for (const f of [38, 38.7]) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = 0.055;
    osc.connect(g).connect(dest);
    osc.start();
    _bed.nodes.push(osc);
  }

  // A continuous breath of air moving through stone: heavily lowpassed noise whose
  // cutoff drifts, so it swells rather than hissing flatly.
  const air = ctx.createBufferSource();
  air.buffer = noiseBuffer(ctx);
  air.loop = true;
  const airFilt = ctx.createBiquadFilter();
  airFilt.type = 'lowpass';
  airFilt.frequency.value = 320;
  const airGain = ctx.createGain();
  airGain.gain.value = 0.05;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.06;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 140;
  lfo.connect(lfoGain).connect(airFilt.frequency);
  air.connect(airFilt).connect(airGain).connect(dest);
  air.start();
  lfo.start();
  _bed.nodes.push(air, lfo);

  // Water drips, irregularly spaced, through the cave echo.
  _bed.timers.push(setInterval(() => {
    if (_muted || Math.random() > 0.45) return;
    const t0 = now() + Math.random() * 0.4;
    const f = 900 + Math.random() * 1400;
    tone(ctx, echo, { t0, dur: 0.11, freq: f, freqEnd: f * 0.35, type: 'sine', gain: 0.16, attack: 0.001 });
  }, 1700));

  // Distant settling / rock groans — rare, low, and long.
  _bed.timers.push(setInterval(() => {
    if (_muted || Math.random() > 0.3) return;
    const t0 = now() + Math.random() * 2;
    noiseBurst(ctx, echo, { t0, dur: 2.2, freq: 90 + Math.random() * 60, q: 3, gain: 0.07, attack: 0.6 });
  }, 9000));

  // Torch crackle — a scatter of tiny high bursts, dry (no echo) so it reads as close by.
  _bed.timers.push(setInterval(() => {
    if (_muted) return;
    const t0 = now();
    for (let i = 0; i < 3 + Math.floor(Math.random() * 4); i++) {
      noiseBurst(ctx, dest, {
        t0: t0 + Math.random() * 0.5,
        dur: 0.04,
        freq: 2600 + Math.random() * 2600,
        q: 1.5,
        gain: 0.035,
      });
    }
  }, 900));
}

function startOutdoorBed(ctx) {
  const dest = out();

  // Wind — bandpassed noise with a drifting centre frequency and a slow gain swell.
  const wind = ctx.createBufferSource();
  wind.buffer = noiseBuffer(ctx);
  wind.loop = true;
  const wf = ctx.createBiquadFilter();
  wf.type = 'bandpass';
  wf.frequency.value = 500;
  wf.Q.value = 0.7;
  const wg = ctx.createGain();
  wg.gain.value = 0.06;
  const wlfo = ctx.createOscillator();
  wlfo.frequency.value = 0.08;
  const wlfoGain = ctx.createGain();
  wlfoGain.gain.value = 260;
  wlfo.connect(wlfoGain).connect(wf.frequency);
  const glfo = ctx.createOscillator();
  glfo.frequency.value = 0.05;
  const glfoGain = ctx.createGain();
  glfoGain.gain.value = 0.035;
  glfo.connect(glfoGain).connect(wg.gain);
  wind.connect(wf).connect(wg).connect(dest);
  wind.start();
  wlfo.start();
  glfo.start();
  _bed.nodes.push(wind, wlfo, glfo);

  // Leaf rustle riding on top of the wind, a touch brighter.
  const leaves = ctx.createBufferSource();
  leaves.buffer = noiseBuffer(ctx);
  leaves.loop = true;
  const lf = ctx.createBiquadFilter();
  lf.type = 'highpass';
  lf.frequency.value = 3200;
  const lg = ctx.createGain();
  lg.gain.value = 0.018;
  leaves.connect(lf).connect(lg).connect(dest);
  leaves.start();
  _bed.nodes.push(leaves);

  // Birdsong — a short phrase of 2-5 chirps, each a fast upward glide.
  _bed.timers.push(setInterval(() => {
    if (_muted || Math.random() > 0.5) return;
    const t0 = now() + Math.random() * 1.5;
    const n = 2 + Math.floor(Math.random() * 4);
    const base = 2200 + Math.random() * 1800;
    for (let i = 0; i < n; i++) {
      tone(ctx, dest, {
        t0: t0 + i * (0.07 + Math.random() * 0.06),
        dur: 0.07,
        freq: base * (0.9 + Math.random() * 0.3),
        freqEnd: base * (1.3 + Math.random() * 0.4),
        type: 'sine',
        gain: 0.05,
        attack: 0.008,
      });
    }
  }, 3800));

  // Distant crows / low calls, much rarer.
  _bed.timers.push(setInterval(() => {
    if (_muted || Math.random() > 0.25) return;
    const t0 = now() + Math.random();
    for (let i = 0; i < 2; i++) {
      tone(ctx, dest, {
        t0: t0 + i * 0.22,
        dur: 0.18,
        freq: 700,
        freqEnd: 480,
        type: 'sawtooth',
        gain: 0.025,
        attack: 0.02,
      });
    }
  }, 11000));

  // Crickets at a steady pulse — thin, high, and short.
  _bed.timers.push(setInterval(() => {
    if (_muted || Math.random() > 0.35) return;
    const t0 = now();
    for (let i = 0; i < 3; i++) {
      noiseBurst(ctx, dest, { t0: t0 + i * 0.05, dur: 0.03, freq: 6200, q: 12, gain: 0.02 });
    }
  }, 2600));
}

// ── one-shot SFX ──────────────────────────────────────────────────────────────

/**
 * Named one-shots. Every name here is a real recipe — an unknown name is a silent
 * no-op that returns false, so a typo in a caller shows up as "no sound" rather than
 * an exception in the middle of a render loop.
 */
export function playSfx(name, { gain = 1 } = {}) {
  const ctx = ensureCtx();
  if (!ctx || _muted) return false;
  const dest = out();
  const t0 = now();
  const g = gain;

  switch (name) {
    case 'door_open': {
      // Creak: a rising sawtooth scrape, then the thud of the door meeting the stop.
      tone(ctx, dest, { t0, dur: 0.55, freq: 150, freqEnd: 260, type: 'sawtooth', gain: 0.05 * g, attack: 0.08 });
      noiseBurst(ctx, dest, { t0: t0 + 0.05, dur: 0.5, freq: 900, q: 6, gain: 0.03 * g, attack: 0.1 });
      noiseBurst(ctx, dest, { t0: t0 + 0.6, dur: 0.18, freq: 120, q: 1.5, gain: 0.16 * g });
      return true;
    }
    case 'door_close': {
      noiseBurst(ctx, dest, { t0, dur: 0.22, freq: 110, q: 1.2, gain: 0.22 * g });
      tone(ctx, dest, { t0, dur: 0.2, freq: 90, freqEnd: 55, type: 'sine', gain: 0.12 * g });
      return true;
    }
    case 'step_stone': {
      noiseBurst(ctx, dest, { t0, dur: 0.09, freq: 1400, q: 1.4, gain: 0.09 * g });
      tone(ctx, dest, { t0, dur: 0.07, freq: 150, freqEnd: 80, type: 'sine', gain: 0.06 * g });
      return true;
    }
    case 'step_grass': {
      noiseBurst(ctx, dest, { t0, dur: 0.13, freq: 3400, q: 0.8, gain: 0.06 * g, attack: 0.01 });
      return true;
    }
    case 'step_wood': {
      noiseBurst(ctx, dest, { t0, dur: 0.1, freq: 800, q: 3, gain: 0.09 * g });
      tone(ctx, dest, { t0, dur: 0.09, freq: 220, freqEnd: 120, type: 'triangle', gain: 0.07 * g });
      return true;
    }
    case 'step_water': {
      noiseBurst(ctx, dest, { t0, dur: 0.26, freq: 1100, q: 0.7, gain: 0.11 * g, attack: 0.006 });
      tone(ctx, dest, { t0, dur: 0.16, freq: 500, freqEnd: 190, type: 'sine', gain: 0.05 * g });
      return true;
    }
    case 'splash': {
      noiseBurst(ctx, dest, { t0, dur: 0.6, freq: 900, q: 0.5, gain: 0.2 * g, attack: 0.005 });
      tone(ctx, dest, { t0, dur: 0.32, freq: 620, freqEnd: 150, type: 'sine', gain: 0.1 * g });
      return true;
    }
    case 'torch_light': {
      // The whoosh of catching, then settling crackle.
      noiseBurst(ctx, dest, { t0, dur: 0.5, freq: 700, q: 0.6, gain: 0.16 * g, attack: 0.03 });
      for (let i = 0; i < 8; i++) {
        noiseBurst(ctx, dest, { t0: t0 + 0.15 + Math.random() * 0.5, dur: 0.04, freq: 3000 + Math.random() * 2500, q: 2, gain: 0.05 * g });
      }
      return true;
    }
    case 'chest_open': {
      tone(ctx, dest, { t0, dur: 0.12, freq: 900, freqEnd: 1400, type: 'square', gain: 0.04 * g });
      noiseBurst(ctx, dest, { t0: t0 + 0.1, dur: 0.4, freq: 600, q: 4, gain: 0.05 * g, attack: 0.08 });
      tone(ctx, dest, { t0: t0 + 0.45, dur: 0.5, freq: 1200, type: 'sine', gain: 0.05 * g, attack: 0.01 });
      return true;
    }
    case 'coin': {
      for (let i = 0; i < 3; i++) {
        tone(ctx, dest, { t0: t0 + i * 0.06, dur: 0.25, freq: 2200 + i * 500, type: 'triangle', gain: 0.05 * g, attack: 0.002 });
      }
      return true;
    }
    case 'sword': {
      noiseBurst(ctx, dest, { t0, dur: 0.18, freq: 4200, q: 1.2, gain: 0.13 * g, attack: 0.002 });
      tone(ctx, dest, { t0, dur: 0.14, freq: 1800, freqEnd: 700, type: 'sawtooth', gain: 0.05 * g });
      return true;
    }
    case 'hit': {
      noiseBurst(ctx, dest, { t0, dur: 0.2, freq: 260, q: 1, gain: 0.2 * g });
      tone(ctx, dest, { t0, dur: 0.16, freq: 180, freqEnd: 60, type: 'square', gain: 0.09 * g });
      return true;
    }
    case 'stone_grind': {
      // A secret door / portcullis moving.
      noiseBurst(ctx, dest, { t0, dur: 1.4, freq: 300, q: 2.5, gain: 0.12 * g, attack: 0.25 });
      tone(ctx, dest, { t0, dur: 1.3, freq: 70, freqEnd: 48, type: 'sawtooth', gain: 0.05 * g, attack: 0.3 });
      return true;
    }
    case 'chasm_fall': {
      // A long falling whistle that never lands — the bottomless-pit cue.
      tone(ctx, dest, { t0, dur: 2.6, freq: 900, freqEnd: 40, type: 'sine', gain: 0.09 * g, attack: 0.02 });
      noiseBurst(ctx, dest, { t0, dur: 2.6, freq: 400, q: 0.6, gain: 0.05 * g, attack: 0.2 });
      return true;
    }
    default:
      return false;
  }
}

/** Every name playSfx understands — handy for building a test/preview UI. */
export const SFX_NAMES = [
  'door_open', 'door_close', 'step_stone', 'step_grass', 'step_wood', 'step_water',
  'splash', 'torch_light', 'chest_open', 'coin', 'sword', 'hit', 'stone_grind', 'chasm_fall',
];
