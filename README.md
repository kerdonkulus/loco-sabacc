# Loco Sabacc

A chip and betting tracker for **Corellian Spike Sabacc**, played on one phone
that sits on the table. Poker chip apps don't follow Sabacc's turn order; this one
does: turn action, then betting, then the spike dice, three times per hand.

Play it at **https://loco-sabacc.<your-subdomain>.workers.dev** (the same Cloudflare
subdomain as Loco Stratego). Add it to your Home Screen and it works offline.

## How a hand goes

1. **Deal.** Every player antes into the **main pot** and the **Sabacc pot**
   (amounts set in Settings). The deal passes to the left each hand.
2. **Three rounds**, each one:
   - **Turn actions**, starting with the player left of the dealer (in a 2-player
     game, the player being dealt to goes first):
     - **Gain**: take the top card of the draw pile. Either keep it as an extra card
       (**Gain: keep**), or discard a card from your hand first and then draw
       (**Gain: discard**).
     - **Swap**: take the top card of the discard pile in exchange for a card in your hand.
     - **Stand**: do nothing.
     - **Junk**: fold.
   - **Betting**, in the same order: Check, Bet, Call, Raise, Fold, or All in. Bets
     and raises go up in steps of the **bet step**. A raise gives everyone else a
     chance to respond, and the round ends when everyone still in has matched.
   - **Roll the spike dice** (real dice). Tap whether you rolled doubles (a Sabacc
     Shift). The app just records it.
3. **Reveal.** Tap who won the main pot (pick several to split). If a player went all
   in for less, the app makes side pots and asks about each one. Then tap whether the
   winner had a **Sabacc** (a hand totalling zero): if so, they take the Sabacc pot,
   otherwise it carries over to the next hand.

If everyone else folds, the last player takes the main pot and the Sabacc pot carries
over. **Undo** takes back any tap. Players who run out of chips sit out; you can give
them a rebuy under **Menu → Players & chips**.

## Development

Everything runs in the browser: TypeScript + Vite, no server. The game is saved in
the phone's local storage.

```sh
npm install
npm test          # betting rules tests
npm run typecheck
npm run dev       # http://localhost:5173
```

- `src/engine.ts`: the betting rules (pure functions, tested in `test/engine.test.ts`)
- `src/main.ts`: the screens
- `public/sw.js`: offline support

## Deploying

Every push to `main` deploys to Cloudflare Workers as a static site
(`.github/workflows/deploy.yml`, `wrangler.jsonc`). The workflow needs two repository
secrets, the same as Loco Stratego: `CLOUDFLARE_API_TOKEN` (the "Edit Cloudflare
Workers" token template) and `CLOUDFLARE_ACCOUNT_ID`.
