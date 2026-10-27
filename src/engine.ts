// Betting rules for Corellian Spike Sabacc. Every function is pure: it takes a
// game and returns a new one, so the UI can keep old states for undo.

export interface Settings {
  /** Bets and raises go up in steps of this amount. */
  base: number;
  /** Paid into the main pot by every player at the start of each hand. */
  mainAnte: number;
  /** Paid into the Sabacc pot by every player at the start of each hand. */
  sabaccAnte: number;
  startingChips: number;
}

export interface Player {
  id: string;
  name: string;
  chips: number;
}

/**
 * Gain draws the top card of the draw pile, either keeping it as an extra card or
 * after first discarding a card from hand. Swap takes the top card of the discard
 * pile in exchange for a card in hand.
 */
export type TurnAction = "gain" | "gainDiscard" | "swap" | "stand" | "junk";
export type BetAction =
  | { type: "check" }
  | { type: "call" }
  | { type: "raise"; to: number }
  | { type: "allin" }
  | { type: "fold" };

export const ROUNDS = 3;

export interface Pot {
  amount: number;
  eligible: string[];
}

export interface Hand {
  number: number;
  round: number;
  phase: "turns" | "betting" | "dice" | "showdown" | "sabacc" | "over";
  /** Players dealt in, in acting order: left of the dealer first, dealer last. */
  order: string[];
  folded: string[];
  /** Chips each player has put in the main pot this hand, antes included. */
  contributed: Record<string, number>;
  /** Chips each player has put in during the current betting round. */
  roundBet: Record<string, number>;
  currentBet: number;
  /** Who still has to act in the current phase, in order. */
  queue: string[];
  /** Main pot and side pots, filled in at the showdown. */
  pots: Pot[];
  potIndex: number;
  /** Winners of the first (main) pot; only they can take the Sabacc pot. */
  mainWinners: string[];
  /** Chips each player won this hand. */
  won: Record<string, number>;
  sabaccWon: boolean;
}

export interface Game {
  settings: Settings;
  players: Player[];
  /** Index into players of the current (or next) dealer. */
  dealer: number;
  sabaccPot: number;
  handsPlayed: number;
  hand: Hand | null;
  /** Readable record of every hand, newest last. */
  log: string[];
}

export const DEFAULT_SETTINGS: Settings = { base: 10, mainAnte: 10, sabaccAnte: 10, startingChips: 500 };

export function newGame(names: string[], settings: Settings = DEFAULT_SETTINGS, dealer = 0): Game {
  if (names.length < 2 || names.length > 8) throw new Error("Sabacc needs 2 to 8 players.");
  return {
    settings: { ...settings },
    players: names.map((name, i) => ({ id: `p${i + 1}`, name, chips: settings.startingChips })),
    dealer,
    sabaccPot: 0,
    handsPlayed: 0,
    hand: null,
    log: [],
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function player(game: Game, id: string): Player {
  const p = game.players.find((x) => x.id === id);
  if (!p) throw new Error(`No player ${id}`);
  return p;
}

const nameOf = (game: Game, id: string) => player(game, id).name;

export function mainPot(hand: Hand): number {
  return Object.values(hand.contributed).reduce((a, b) => a + b, 0);
}

export function activeIds(hand: Hand): string[] {
  return hand.order.filter((id) => !hand.folded.includes(id));
}

/** Players still in the hand who have chips left to bet. */
function bettors(game: Game, hand: Hand): string[] {
  return activeIds(hand).filter((id) => player(game, id).chips > 0);
}

/** The player who must act now, if any. */
export function actor(game: Game): string | null {
  return game.hand?.queue[0] ?? null;
}

export function toCall(game: Game, id: string): number {
  const hand = game.hand!;
  return Math.min(hand.currentBet - (hand.roundBet[id] ?? 0), player(game, id).chips);
}

/** Smallest legal "raise to" total for the current actor. */
export function minRaiseTo(game: Game): number {
  return game.hand!.currentBet + game.settings.base;
}

/** Most the given player can make the bet this round (their all-in total). */
export function maxRaiseTo(game: Game, id: string): number {
  return (game.hand!.roundBet[id] ?? 0) + player(game, id).chips;
}

/** Players who can sit down for the next hand. */
export function seated(game: Game): Player[] {
  return game.players.filter((p) => p.chips > 0);
}

export function canDeal(game: Game): boolean {
  return game.hand === null && seated(game).length >= 2;
}

function nextSeatedIndex(game: Game, from: number): number {
  const n = game.players.length;
  for (let step = 1; step <= n; step++) {
    const i = (from + step) % n;
    if (game.players[i].chips > 0) return i;
  }
  return from;
}

/** Index of the player who deals the next hand (skipping anyone out of chips). */
export function dealerFor(game: Game): number {
  return game.players[game.dealer].chips > 0 ? game.dealer : nextSeatedIndex(game, game.dealer);
}

/** Deals a hand: everyone antes into both pots and the first round begins. */
export function startHand(prev: Game): Game {
  if (!canDeal(prev)) throw new Error("Need at least two players with chips.");
  const game = clone(prev);
  game.dealer = dealerFor(game);
  const n = game.players.length;
  const order: string[] = [];
  for (let step = 1; step <= n; step++) {
    const p = game.players[(game.dealer + step) % n];
    if (p.chips > 0) order.push(p.id);
  }
  const hand: Hand = {
    number: game.handsPlayed + 1,
    round: 1,
    phase: "turns",
    order,
    folded: [],
    contributed: {},
    roundBet: {},
    currentBet: 0,
    queue: [...order],
    pots: [],
    potIndex: 0,
    mainWinners: [],
    won: {},
    sabaccWon: false,
  };
  for (const id of order) {
    const p = player(game, id);
    const main = Math.min(p.chips, game.settings.mainAnte);
    p.chips -= main;
    const sabacc = Math.min(p.chips, game.settings.sabaccAnte);
    p.chips -= sabacc;
    hand.contributed[id] = main;
    game.sabaccPot += sabacc;
  }
  game.hand = hand;
  game.log.push(`Hand ${hand.number}: ${nameOf(game, game.players[game.dealer].id)} deals. Antes ${game.settings.mainAnte} + ${game.settings.sabaccAnte}.`);
  return game;
}

const ACTION_LABEL: Record<TurnAction, string> = {
  gain: "gains (draws and keeps)",
  gainDiscard: "gains (discards, then draws)",
  swap: "swaps",
  stand: "stands",
  junk: "junks (folds)",
};

/** Records the current player's turn action (Gain, Swap, Stand, Junk). */
export function turnAction(prev: Game, action: TurnAction): Game {
  const game = clone(prev);
  const hand = requirePhase(game, "turns");
  const id = hand.queue.shift()!;
  game.log.push(`  R${hand.round} ${nameOf(game, id)} ${ACTION_LABEL[action]}.`);
  if (action === "junk") {
    hand.folded.push(id);
    if (activeIds(hand).length === 1) return winByFold(game);
  }
  if (hand.queue.length === 0) beginBetting(game);
  return game;
}

function beginBetting(game: Game): void {
  const hand = game.hand!;
  hand.phase = "betting";
  hand.roundBet = {};
  hand.currentBet = 0;
  const canBet = bettors(game, hand);
  hand.queue = canBet.length >= 2 ? canBet : [];
  if (hand.queue.length === 0) {
    game.log.push(`  R${hand.round} no betting (all in).`);
    hand.phase = "dice";
  }
}

export function bet(prev: Game, action: BetAction): Game {
  const game = clone(prev);
  const hand = requirePhase(game, "betting");
  const id = hand.queue[0];
  const p = player(game, id);
  const already = hand.roundBet[id] ?? 0;
  const put = (amount: number) => {
    p.chips -= amount;
    hand.roundBet[id] = already + amount;
    hand.contributed[id] = (hand.contributed[id] ?? 0) + amount;
  };
  const who = `  R${hand.round} ${p.name}`;
  let reopened = false;

  switch (action.type) {
    case "check":
      if (hand.currentBet > already) throw new Error("Can't check facing a bet.");
      game.log.push(`${who} checks.`);
      break;
    case "call": {
      const amount = toCall(game, id);
      if (amount <= 0) throw new Error("Nothing to call.");
      put(amount);
      game.log.push(`${who} calls ${amount}${p.chips === 0 ? " (all in)" : ""}.`);
      break;
    }
    case "raise": {
      const { to } = action;
      const step = game.settings.base;
      if (to < hand.currentBet + step || (to - hand.currentBet) % step !== 0) {
        throw new Error(`Raise in steps of ${step}.`);
      }
      if (to - already > p.chips) throw new Error("Not enough chips.");
      const verb = hand.currentBet === 0 ? "bets" : "raises to";
      put(to - already);
      hand.currentBet = to;
      reopened = true;
      game.log.push(`${who} ${verb} ${to}${p.chips === 0 ? " (all in)" : ""}.`);
      break;
    }
    case "allin": {
      const amount = p.chips;
      if (amount <= 0) throw new Error("No chips left.");
      put(amount);
      if (hand.roundBet[id] > hand.currentBet) {
        hand.currentBet = hand.roundBet[id];
        reopened = true;
      }
      game.log.push(`${who} goes all in (${hand.roundBet[id]}).`);
      break;
    }
    case "fold":
      hand.folded.push(id);
      game.log.push(`${who} folds.`);
      break;
  }

  hand.queue.shift();
  if (activeIds(hand).length === 1) return winByFold(game);
  if (reopened) {
    // Everyone else still holding chips gets to respond, in order after the raiser.
    const at = hand.order.indexOf(id);
    const after = [...hand.order.slice(at + 1), ...hand.order.slice(0, at)];
    hand.queue = after.filter((x) => !hand.folded.includes(x) && player(game, x).chips > 0);
  }
  // A lone player with chips doesn't need to act if nobody can bet against them.
  if (hand.queue.length === 1 && toCall(game, hand.queue[0]) === 0 && bettors(game, hand).length === 1) {
    hand.queue = [];
  }
  if (hand.queue.length === 0) hand.phase = "dice";
  return game;
}

/** The spike dice have been rolled (physically); doubles mean a Sabacc Shift. */
export function diceRolled(prev: Game, doubles: boolean): Game {
  const game = clone(prev);
  const hand = requirePhase(game, "dice");
  game.log.push(`  R${hand.round} dice: ${doubles ? "doubles, Sabacc Shift!" : "no doubles."}`);
  if (hand.round < ROUNDS) {
    hand.round += 1;
    hand.phase = "turns";
    hand.roundBet = {};
    hand.currentBet = 0;
    hand.queue = activeIds(hand);
  } else {
    hand.phase = "showdown";
    hand.queue = [];
    hand.pots = buildPots(hand);
    hand.potIndex = 0;
    autoAward(game);
  }
  return game;
}

/**
 * Splits the main pot into a main pot and side pots by how much each player
 * put in, so an all-in player can only win what they matched.
 */
export function buildPots(hand: Hand): Pot[] {
  const live = activeIds(hand);
  const levels = [...new Set(live.map((id) => hand.contributed[id] ?? 0))].sort((a, b) => a - b);
  const pots: Pot[] = [];
  let prevLevel = 0;
  for (const level of levels) {
    let amount = 0;
    for (const id of hand.order) {
      const c = hand.contributed[id] ?? 0;
      amount += Math.max(0, Math.min(c, level) - prevLevel);
    }
    const eligible = live.filter((id) => (hand.contributed[id] ?? 0) >= level);
    const last = pots[pots.length - 1];
    if (last && last.eligible.length === eligible.length) last.amount += amount;
    else if (amount > 0) pots.push({ amount, eligible });
    prevLevel = level;
  }
  // Chips folded players put in above the biggest live stake go to the last pot.
  const leftover = mainPot(hand) - pots.reduce((a, p) => a + p.amount, 0);
  if (leftover > 0) {
    if (pots.length) pots[pots.length - 1].amount += leftover;
    else pots.push({ amount: leftover, eligible: live });
  }
  return pots;
}

/** Hands out pots with a single eligible player (such as an uncalled bet). */
function autoAward(game: Game): void {
  const hand = game.hand!;
  while (hand.potIndex < hand.pots.length && hand.pots[hand.potIndex].eligible.length === 1) {
    payPot(game, hand.pots[hand.potIndex].eligible);
  }
  if (hand.potIndex >= hand.pots.length) {
    hand.phase = hand.mainWinners.length ? "sabacc" : "over";
    if (hand.phase === "over") finishHand(game);
  }
}

function payPot(game: Game, winners: string[]): void {
  const hand = game.hand!;
  const pot = hand.pots[hand.potIndex];
  const ordered = hand.order.filter((id) => winners.includes(id));
  const share = Math.floor(pot.amount / ordered.length);
  let odd = pot.amount - share * ordered.length;
  for (const id of ordered) {
    const amount = share + (odd > 0 ? 1 : 0);
    if (odd > 0) odd--;
    player(game, id).chips += amount;
    hand.won[id] = (hand.won[id] ?? 0) + amount;
  }
  const label = hand.potIndex === 0 ? "main pot" : `side pot ${hand.potIndex}`;
  game.log.push(`  ${ordered.map((id) => nameOf(game, id)).join(" & ")} win${ordered.length === 1 ? "s" : ""} the ${label} (${pot.amount}).`);
  if (hand.potIndex === 0) hand.mainWinners = ordered;
  hand.potIndex += 1;
}

/** Awards the pot currently being decided at the showdown to one or more winners (a split). */
export function awardPot(prev: Game, winners: string[]): Game {
  const game = clone(prev);
  const hand = requirePhase(game, "showdown");
  const pot = hand.pots[hand.potIndex];
  if (winners.length === 0 || winners.some((id) => !pot.eligible.includes(id))) {
    throw new Error("Pick a winner from the players in this pot.");
  }
  payPot(game, winners);
  autoAward(game);
  return game;
}

/** Whoever among the main pot winners had a pure Sabacc takes the Sabacc pot; otherwise it carries over. */
export function awardSabacc(prev: Game, winners: string[]): Game {
  const game = clone(prev);
  const hand = requirePhase(game, "sabacc");
  if (winners.some((id) => !hand.mainWinners.includes(id))) throw new Error("Only the hand's winner can take the Sabacc pot.");
  if (winners.length === 0) {
    game.log.push(`  No Sabacc. The Sabacc pot (${game.sabaccPot}) carries over.`);
  } else {
    const amount = game.sabaccPot;
    const share = Math.floor(amount / winners.length);
    let odd = amount - share * winners.length;
    for (const id of hand.order.filter((x) => winners.includes(x))) {
      const pay = share + (odd > 0 ? 1 : 0);
      if (odd > 0) odd--;
      player(game, id).chips += pay;
      hand.won[id] = (hand.won[id] ?? 0) + pay;
    }
    game.sabaccPot = 0;
    hand.sabaccWon = true;
    game.log.push(`  Sabacc! ${winners.map((id) => nameOf(game, id)).join(" & ")} take${winners.length === 1 ? "s" : ""} the Sabacc pot (${amount}).`);
  }
  hand.phase = "over";
  finishHand(game);
  return game;
}

function winByFold(game: Game): Game {
  const hand = game.hand!;
  const [winner] = activeIds(hand);
  hand.queue = [];
  hand.pots = [{ amount: mainPot(hand), eligible: [winner] }];
  hand.potIndex = 0;
  payPot(game, [winner]);
  game.log.push(`  Everyone else folded. The Sabacc pot (${game.sabaccPot}) carries over.`);
  hand.phase = "over";
  finishHand(game);
  return game;
}

function finishHand(game: Game): void {
  game.handsPlayed += 1;
}

/** Clears the finished hand and passes the deal to the left. */
export function nextHand(prev: Game): Game {
  const game = clone(prev);
  requirePhase(game, "over");
  game.hand = null;
  game.dealer = nextSeatedIndex(game, game.dealer);
  return game;
}

function requirePhase(game: Game, phase: Hand["phase"]): Hand {
  if (game.hand?.phase !== phase) throw new Error(`Not in the ${phase} phase.`);
  return game.hand;
}

