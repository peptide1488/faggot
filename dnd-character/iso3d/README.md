# Iso3D (vendored into Grimoire)

WebGL isometric battle host used when **🕹 3D** is on (requires **🧊 Isometric** first).

Source of truth for engine development: `../iso3d-engine/`.  
Copy `src/*.js` here after engine changes:

```powershell
Copy-Item -Force ..\iso3d-engine\src\*.js .\src\
```

## How it connects

- `boot.js` (ES module) → `window.Iso3D.Host`
- Grimoire `mapGridHTML` emits `#iso3dMount` when `iso3dView`
- `syncIso3DHost(session)` builds terrain + sprite overlay from session map/units
- Tile clicks go back into existing `.mcell` handlers — **rules stay in Grimoire**

## Standalone engine demo

Serve `iso3d-engine` and open `bridge.html` for a Grimoire-shaped session without the full app.
