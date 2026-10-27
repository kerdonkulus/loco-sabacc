# Loco Sabacc

Chip and betting tracker for Corellian Spike Sabacc. One shared phone, no server.

## Stack

- TypeScript + Vite, plain DOM (no framework). `h()` in `src/ui.ts` builds elements.
- State is a single `Game` object saved to localStorage (`loco-sabacc` key) together
  with an undo stack of previous `Game`s.
- Hosted on Cloudflare Workers static assets (`wrangler.jsonc`, no Worker code).
  URLs are relative (`base: "./"` in `vite.config.ts`, `./` paths in `index.html`,
  the manifest and `public/sw.js`), so the app works from any path.

## Layout

- `src/engine.ts`: all game and betting rules as pure functions `(game, ...) => game`.
  Never mutate the input; the UI keeps old states for undo.
- `src/main.ts`: rendering. `act(fn)` applies an engine function, pushes undo, saves
  and re-renders. Screen-only state (raise amount, picked winners, open sheet) lives
  in module variables.
- `test/engine.test.ts`: Vitest tests for the engine.

## Rules decisions

- Acting order every phase: left of the dealer first, dealer last.
- Turn actions are Gain (keep, or discard first then draw), Swap (top of the discard
  pile for a card in hand), Stand and Junk (fold). There is no standalone Discard.
  The app only records them; it doesn't track cards.
- Each round: turn actions → betting → spike dice (physical; the app records
  doubles). Three rounds, then the showdown.
- Bets and raises are "raise to" totals in steps of `settings.base`. Any raise,
  including an all-in above the current bet, reopens action for everyone else.
- Side pots are built from each player's total contribution (`buildPots`).
- Only a winner of the main pot can take the Sabacc pot; otherwise it carries over.
  A hand won by everyone folding never pays the Sabacc pot.

## Commands

```sh
npm test
npm run typecheck
npm run build
```

Run all three before pushing; CI runs the same on pull requests and deploys
from `main`.

## Working constraints

Connor develops from a phone: no local machine. Changes go through branches and
pull requests, and merging to `main` deploys. Don't rely on anything that needs a
local terminal.
