# Grimoire — D&D 5e Character Keeper

A self-contained, offline-first PWA for building and running Dungeons & Dragons
5th-edition characters. No backend, no build step — just static files.

## Features

- **Multiple characters** — create, switch and delete; everything is saved in
  your browser's `localStorage`.
- **Bio** — name, race, class/subclass, level, background, alignment, XP, and an
  auto-calculated (or overridable) proficiency bonus.
- **Stats** — ability scores with live modifiers, saving throws, all 18 skills
  with proficiency *and* expertise toggles, and passive Perception/Investigation.
- **Combat** — HP with a damage/heal stepper (temp HP absorbs first), AC, speed,
  initiative, spell save DC / attack, hit dice, and death-save trackers.
- **Spells** — spellcasting ability, save DC & attack bonus, tap-able spell-slot
  pips per level, a long-rest button, and a spellbook grouped by level with a
  "prepared" toggle.
- **Items** — inventory with quantities/notes and a coin purse (cp/sp/ep/gp/pp).
- **Notes** — features & traits plus free-form backstory.
- **Backup** — export all characters to JSON and re-import on any device.
- **Installable** — add to your home screen; works fully offline via a service
  worker.

## Running it

It's plain static HTML — open `index.html` in a browser, or serve the folder:

```sh
cd dnd-character
python3 -m http.server 8080
# then visit http://localhost:8080
```

For the PWA / service worker to register, serve it over `http://localhost` or
HTTPS (opening the file directly with `file://` works for everything except the
offline service worker).
