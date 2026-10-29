# Ur

Prototype of a turn-based, hex-map civilization game where people are the scarce resource.
Design: [docs/DESIGN.md](docs/DESIGN.md) · progress: [docs/CHECKLIST.md](docs/CHECKLIST.md).

## Run

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # rule tests + a headless 150-turn AI-vs-AI game
npm run check    # svelte-check / TypeScript
npm run build    # static site in dist/
```

## Layout

- `src/core` — deterministic game rules; every change goes through `applyAction` in `game.ts`.
- `src/mapgen` — seeded map generation.
- `src/ai` — rule-based AI (`runUntilHuman` drives AI turns).
- `src/render` — PixiJS map renderer.
- `src/ui` — Svelte 5 panels and screens; autosaves to IndexedDB each turn.
