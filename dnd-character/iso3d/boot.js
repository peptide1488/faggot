/**
 * Loads Iso3D host for Grimoire and exposes window.Iso3D.
 * index.html includes: <script type="module" src="iso3d/boot.js"></script>
 */
// ?v= busts browser module cache when Iso3D ships a fix (black screen / mesh crashes)
import { Iso3DHost, APP_VERSION, makeDemoGrimoireSession } from './src/host.js?v=0.5.98';

window.Iso3D = {
  Host: Iso3DHost,
  version: APP_VERSION,
  makeDemoSession: makeDemoGrimoireSession,
  ready: true,
};

window.dispatchEvent(new CustomEvent('iso3d-ready', { detail: { version: APP_VERSION } }));
console.log('[Iso3D] host ready', APP_VERSION);
