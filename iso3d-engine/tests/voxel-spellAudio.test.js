/**
 * spellAudio — pure API smoke tests (no real AudioContext in node).
 * Verifies exports exist and theme resolution works; playback no-ops without window.AudioContext.
 */
import {
  unlockSpellAudio,
  playSpellCast,
  playSpellImpact,
  themeForSpellAudio,
  setSpellAudioMuted,
  setSpellAudioVolume,
  isSpellAudioMuted,
} from '../src/voxel/spellAudio.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

console.log('themeForSpellAudio');
{
  assert(themeForSpellAudio({ name: 'Fireball' }) === 'fireball', 'fireball');
  assert(themeForSpellAudio({ name: 'Lightning Bolt' }) === 'lightning', 'lightning');
  assert(themeForSpellAudio({ name: 'Web' }) === 'web', 'web');
  assert(themeForSpellAudio({ name: 'Entangle' }) === 'vines', 'vines');
  assert(themeForSpellAudio({ name: 'Gust of Wind' }) === 'wind', 'wind');
  assert(themeForSpellAudio({ name: 'X', fx: { theme: 'ice' } }) === 'ice', 'fx.theme override');
  assert(themeForSpellAudio({ name: 'Blast', damage: [{ type: 'necrotic' }] }) === 'necrotic', 'damage type');
}

console.log('mute / volume API');
{
  setSpellAudioMuted(true);
  assert(isSpellAudioMuted() === true, 'muted');
  setSpellAudioMuted(false);
  assert(isSpellAudioMuted() === false, 'unmuted');
  setSpellAudioVolume(0.3);
  setSpellAudioVolume(2); // clamp
  setSpellAudioVolume(-1);
}

console.log('playback no-ops safely without Web Audio (node)');
{
  // Should not throw even when AudioContext is missing
  unlockSpellAudio();
  playSpellCast('fireball', { intensity: 1.2 });
  playSpellImpact('lightning', { intensity: 1, hitIndex: 0 });
  playSpellImpact('web', { intensity: 0.8, hitIndex: 1 });
  playSpellCast('generic');
  playSpellImpact('unknown_theme');
}

console.log('ok — spellAudio tests passed');
