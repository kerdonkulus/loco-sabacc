import "@fontsource/orbitron/latin-600.css";
import "@fontsource/orbitron/latin-800.css";
import "@fontsource/rajdhani/latin-500.css";
import "@fontsource/rajdhani/latin-700.css";
import "./style.css";
import {
  type BetAction,
  DEFAULT_SETTINGS,
  type Game,
  type Settings,
  type TurnAction,
  ROUNDS,
  actor,
  awardPot,
  awardSabacc,
  bet,
  canDeal,
  canRaise,
  dealerFor,
  diceRolled,
  mainPot,
  maxRaiseTo,
  minRaiseTo,
  newGame,
  nextHand,
  player,
  seated,
  startHand,
  toCall,
  turnAction,
} from "./engine";
import { type Sound, isMuted, play, setMuted } from "./sound";
import { h, storageGet, storageSet, toast } from "./ui";

const STORE_KEY = "loco-sabacc";
const UNDO_LIMIT = 200;

interface Saved {
  game: Game | null;
  undo: Game[];
  /** The last names and settings used, to prefill the next new game. */
  names: string[];
  settings: Settings;
}

const saved = storageGet<Saved>(STORE_KEY);
const state: Saved = {
  game: saved?.game ?? null,
  undo: saved?.undo ?? [],
  names: saved?.names ?? ["", ""],
  settings: { ...DEFAULT_SETTINGS, ...saved?.settings },
};

// Screen-only state, reset whenever the game moves on.
let raiseTo = 0;
let picked: string[] = [];
let sheet: "menu" | "log" | "settings" | "players" | null = null;

const root = document.getElementById("app")!;

function save(): void {
  storageSet(STORE_KEY, state);
}

/** Applies a game action, keeping the previous state for undo, and plays its sound. */
function act(fn: (game: Game) => Game, sound?: Sound): void {
  if (!state.game) return;
  const before = state.game;
  try {
    const next = fn(state.game);
    state.undo.push(state.game);
    if (state.undo.length > UNDO_LIMIT) state.undo.shift();
    state.game = next;
  } catch (err) {
    toast((err as Error).message);
    return;
  }
  raiseTo = 0;
  picked = [];
  navigator.vibrate?.(15);
  save();
  render();
  if (sound) playAfter(before, state.game, sound);
}

function playAfter(before: Game, after: Game, sound: Sound): void {
  play(sound);
  const ended = before.hand?.phase !== "over" && after.hand?.phase === "over";
  // Everyone else folded: the last player standing collects.
  if (ended && (sound === "fold" || sound === "chips" || sound === "allin")) play("win", 0.35);
  else if (actor(after) && actor(after) !== actor(before)) play("turn", 0.4);
}

function undo(): void {
  const prev = state.undo.pop();
  if (!prev) return;
  state.game = prev;
  raiseTo = 0;
  picked = [];
  save();
  render();
  toast("Undone.");
}

function render(): void {
  root.replaceChildren(state.game ? tableEl(state.game) : setupEl());
  if (sheet && state.game) root.append(sheetEl(state.game));
  keepAwake(!!state.game);
}

// ---------- New game ----------

function numberField(label: string, key: keyof Settings, settings: Settings, hint = ""): HTMLElement {
  return h("label", { class: "field" },
    h("span", {}, label, hint ? h("small", {}, hint) : null),
    h("input", {
      type: "number",
      inputMode: "numeric",
      min: key === "base" || key === "startingChips" ? "1" : "0",
      value: String(settings[key]),
      oninput: (e: Event) => {
        const n = Math.floor(Number((e.target as HTMLInputElement).value));
        if (Number.isFinite(n) && n >= 0) settings[key] = n;
      },
    }));
}

function settingsFields(settings: Settings, withStart: boolean): HTMLElement[] {
  return [
    numberField("Bet step", "base", settings, "Bets and raises go up by this much"),
    numberField("Main pot ante", "mainAnte", settings, "Each player, every hand"),
    numberField("Sabacc pot ante", "sabaccAnte", settings, "Each player, every hand"),
    withStart ? numberField("Starting credits", "startingChips", settings) : null,
  ].filter((x): x is HTMLElement => x !== null);
}

function validSettings(s: Settings): boolean {
  if (s.base < 1 || s.startingChips < 1) {
    toast("Bet step and starting credits must be at least 1.");
    return false;
  }
  return true;
}

function setupEl(): HTMLElement {
  const names = state.names;
  const settings = state.settings;
  const list = h("div", { class: "names" });
  const dealerSelect = h("select", {});

  const refreshDealers = () => {
    const current = dealerSelect.value;
    dealerSelect.replaceChildren(...names.map((n, i) => h("option", { value: String(i) }, n.trim() || `Player ${i + 1}`)));
    dealerSelect.value = current && Number(current) < names.length ? current : "0";
  };

  const drawNames = () => {
    list.replaceChildren(...names.map((name, i) =>
      h("div", { class: "name-row" },
        h("input", {
          type: "text",
          value: name,
          placeholder: `Player ${i + 1}`,
          autocomplete: "off",
          maxLength: 20,
          oninput: (e: Event) => {
            names[i] = (e.target as HTMLInputElement).value;
            refreshDealers();
          },
        }),
        names.length > 2
          ? h("button", { type: "button", class: "icon", "aria-label": "Remove player", onclick: () => {
            names.splice(i, 1);
            drawNames();
          } }, "✕")
          : null)));
    addButton.hidden = names.length >= 8;
    refreshDealers();
  };

  const addButton = h("button", { type: "button", class: "secondary", onclick: () => {
    names.push("");
    drawNames();
    (list.lastElementChild?.querySelector("input") as HTMLInputElement | null)?.focus();
  } }, "+ Add player");
  drawNames();

  const start = () => {
    if (!validSettings(settings)) return;
    const final = names.map((n, i) => n.trim() || `Player ${i + 1}`);
    state.game = newGame(final, settings, Number(dealerSelect.value) || 0);
    state.undo = [];
    sheet = null;
    save();
    render();
  };

  return h("main", { class: "setup" },
    h("header", { class: "brand" },
      h("div", { class: "suits", "aria-hidden": "true" }, h("i", { class: "suit circle" }), h("i", { class: "suit triangle" }), h("i", { class: "suit square" })),
      h("h1", {}, "Loco Sabacc"),
      h("p", { class: "tagline" }, "Corellian Spike · cantina table")),
    h("section", { class: "card" },
      h("h2", {}, "Players"),
      h("p", { class: "muted small" }, "Seat order around the table, clockwise."),
      list,
      addButton,
      h("label", { class: "field" }, h("span", {}, "First dealer"), dealerSelect)),
    h("section", { class: "card" },
      h("h2", {}, "Credits"),
      ...settingsFields(settings, true)),
    h("button", { type: "button", class: "primary big", onclick: start }, "Start game"));
}

// ---------- Table ----------

function tableEl(game: Game): HTMLElement {
  const hand = game.hand;
  const status = hand
    ? hand.phase === "showdown" || hand.phase === "sabacc"
      ? `Hand ${hand.number} · Reveal`
      : hand.phase === "over" ? `Hand ${hand.number} · Done` : `Hand ${hand.number} · Round ${hand.round} of ${ROUNDS}`
    : `Before hand ${game.handsPlayed + 1}`;

  return h("main", { class: "table" },
    h("header", { class: "bar" },
      h("button", { type: "button", class: "icon", disabled: state.undo.length === 0, onclick: undo, "aria-label": "Undo" }, "↶ Undo"),
      h("span", { class: "status" }, status),
      h("div", { class: "bar-right" },
        h("button", {
          type: "button",
          class: "icon",
          "aria-label": isMuted() ? "Turn sound on" : "Turn sound off",
          "aria-pressed": String(!isMuted()),
          onclick: () => {
            setMuted(!isMuted());
            render();
            play("tap");
          },
        }, isMuted() ? "🔇" : "🔊"),
        h("button", { type: "button", class: "icon", onclick: () => openSheet("menu"), "aria-label": "Menu" }, "☰"))),
    h("section", { class: "pots" },
      h("div", { class: "pot" }, h("small", {}, "Main pot"), h("strong", {}, String(hand && hand.phase !== "over" ? unpaid(game) : 0))),
      h("div", { class: "pot sabacc" }, h("small", {}, "Sabacc pot"), h("strong", {}, String(game.sabaccPot)))),
    h("ul", { class: "players" }, ...game.players.map((p, i) => playerRow(game, p.id, i))),
    h("section", { class: "panel" }, panelEl(game)));
}

/** Main pot credits not yet paid out at the showdown. */
function unpaid(game: Game): number {
  const hand = game.hand!;
  return mainPot(hand) - hand.pots.slice(0, hand.potIndex).reduce((a, p) => a + p.amount, 0);
}

function playerRow(game: Game, id: string, index: number): HTMLElement {
  const p = player(game, id);
  const hand = game.hand;
  const inHand = hand?.order.includes(id) ?? false;
  const folded = hand?.folded.includes(id) ?? false;
  const acting = actor(game) === id;
  const roundBet = hand?.phase === "betting" || hand?.phase === "dice" ? hand.roundBet[id] ?? 0 : 0;
  const won = hand?.phase === "over" ? hand.won[id] ?? 0 : 0;

  let tag = "";
  if (hand && !inHand) tag = "Sitting out";
  else if (!hand && p.chips === 0) tag = "Out";
  else if (folded) tag = "Folded";
  else if (inHand && p.chips === 0 && hand?.phase !== "over") tag = "All in";

  return h("li", { class: `player${acting ? " acting" : ""}${folded || tag === "Out" || tag === "Sitting out" ? " dim" : ""}` },
    h("div", { class: "who" },
      index === game.dealer ? h("span", { class: "dealer", title: "Dealer", "aria-label": "Dealer" }) : null,
      h("span", { class: "name" }, p.name),
      tag ? h("span", { class: "tag" }, tag) : null),
    h("div", { class: "nums" },
      roundBet ? h("span", { class: "bet" }, `bet ${roundBet}`) : null,
      won ? h("span", { class: "won" }, `+${won}`) : null,
      h("span", { class: "chips" }, String(p.chips))));
}

function panelEl(game: Game): HTMLElement {
  const hand = game.hand;
  if (!hand) return dealPanel(game);
  switch (hand.phase) {
    case "turns": return turnPanel(game);
    case "betting": return betPanel(game);
    case "dice": return dicePanel(game);
    case "showdown": return showdownPanel(game);
    case "sabacc": return sabaccPanel(game);
    case "over": return overPanel(game);
  }
}

function heading(title: string, sub = ""): HTMLElement {
  return h("div", { class: "heading" }, h("h2", {}, title), sub ? h("p", { class: "muted" }, sub) : null);
}

function button(label: string, onclick: () => void, cls = "secondary", disabled = false): HTMLButtonElement {
  return h("button", { type: "button", class: cls, onclick, disabled }, label);
}

function dealPanel(game: Game): HTMLElement {
  const players = seated(game);
  if (players.length < 2) {
    const winner = players[0];
    return h("div", {},
      heading(winner ? `${winner.name} wins the game!` : "Game over", "Everyone else is out of credits."),
      button("New game", () => endGame(), "primary big"));
  }
  const dealer = game.players[dealerFor(game)];
  const { mainAnte, sabaccAnte } = game.settings;
  return h("div", {},
    heading(`${dealer.name} deals`, `Everyone antes ${mainAnte} to the main pot and ${sabaccAnte} to the Sabacc pot.`),
    button(`Deal hand ${game.handsPlayed + 1}`, () => act(startHand, "deal"), "primary big", !canDeal(game)));
}

const TURN_ACTIONS: { action: TurnAction; label: string; hint: string }[] = [
  { action: "gain", label: "Gain: keep", hint: "Draw from the pile and keep it" },
  { action: "gainDiscard", label: "Gain: discard", hint: "Discard a card, then draw" },
  { action: "swap", label: "Swap", hint: "Take the top discard for a card" },
  { action: "stand", label: "Stand", hint: "Do nothing" },
];

function turnPanel(game: Game): HTMLElement {
  const hand = game.hand!;
  const p = player(game, hand.queue[0]);
  return h("div", {},
    heading(`${p.name}'s turn`, `Round ${hand.round}: choose a turn action.`),
    h("div", { class: "grid" },
      ...TURN_ACTIONS.map(({ action, label, hint }) =>
        h("button", { type: "button", class: "secondary action", onclick: () => act((g) => turnAction(g, action), "card") },
          label, h("small", {}, hint)))),
    button("Junk (fold)", () => act((g) => turnAction(g, "junk"), "fold"), "danger wide"));
}

function betPanel(game: Game): HTMLElement {
  const hand = game.hand!;
  const id = hand.queue[0];
  const p = player(game, id);
  const owe = toCall(game, id);
  const already = hand.roundBet[id] ?? 0;
  const min = minRaiseTo(game);
  const max = maxRaiseTo(game, id);
  const raiseAllowed = canRaise(game, id);
  // The stepper is for bets of at least a full step; smaller stacks just use All in.
  const showStepper = raiseAllowed && min < max;
  const step = game.settings.base;
  // Highest total reachable in whole steps. Past it, the stepper's last stop is the whole stack.
  const cap = max - ((max - hand.currentBet) % step);
  const opening = hand.currentBet === 0;
  if (!raiseTo || raiseTo < min || raiseTo > max) raiseTo = min;

  const BET_SOUND: Record<BetAction["type"], Sound> = { check: "tap", call: "chips", raise: "chips", allin: "allin", fold: "fold" };
  const pay = (a: BetAction) => () => act((g) => bet(g, a), BET_SOUND[a.type]);
  const callOrCheck = owe > 0
    ? button(owe >= p.chips ? `Call ${owe} (all in)` : `Call ${owe}`, pay({ type: "call" }), "primary")
    : button("Check", pay({ type: "check" }), "primary");

  const amount = h("strong", { class: "amount" }, String(raiseTo));
  const raiseButton = h("button", { type: "button", class: "primary" }, "");
  const minus = button("−", () => setRaise(raiseTo === max && max !== cap ? cap : raiseTo - step), "secondary step");
  const plus = button("+", () => setRaise(raiseTo + step > cap ? max : raiseTo + step), "secondary step");
  function setRaise(to: number): void {
    raiseTo = Math.max(min, Math.min(to, max));
    amount.textContent = String(raiseTo);
    const extra = raiseTo - already;
    raiseButton.textContent = raiseTo === max
      ? `All in (${p.chips})`
      : `${opening ? "Bet" : "Raise to"} ${raiseTo}${extra !== raiseTo ? ` (+${extra})` : ""}`;
    minus.disabled = raiseTo <= min;
    plus.disabled = raiseTo >= max;
  }
  // Betting the whole stack is an all in, however the player got there.
  raiseButton.addEventListener("click", () => act((g) => bet(g, { type: "raise", to: raiseTo }), raiseTo === max ? "allin" : "chips"));
  setRaise(raiseTo);

  const facts = [`Round ${hand.round} betting`, owe > 0 ? `${owe} to call` : "nothing to call", `${p.chips} credits`];
  return h("div", {},
    heading(`${p.name} to bet`, facts.join(" · ")),
    h("div", { class: "row" }, callOrCheck),
    showStepper
      ? h("div", { class: "raise" }, minus, amount, plus, raiseButton)
      : null,
    h("div", { class: "row" },
      button("Fold", pay({ type: "fold" }), "danger"),
      raiseAllowed ? button(`All in (${p.chips})`, pay({ type: "allin" }), "secondary") : null));
}

function dicePanel(game: Game): HTMLElement {
  const hand = game.hand!;
  const last = hand.round === ROUNDS;
  return h("div", {},
    heading("Roll the spike dice", last ? "Last roll. Then everyone reveals their hand." : `End of round ${hand.round}. Doubles mean a Sabacc Shift.`),
    h("div", { class: "row" },
      button("No doubles", () => act((g) => diceRolled(g, false), "dice"), "primary"),
      button("Doubles: Sabacc Shift", () => act((g) => diceRolled(g, true), "shift"), "secondary")));
}

function pickList(game: Game, ids: string[]): HTMLElement {
  return h("div", { class: "picks" }, ...ids.map((id) =>
    h("button", {
      type: "button",
      class: `pick${picked.includes(id) ? " on" : ""}`,
      "aria-pressed": String(picked.includes(id)),
      onclick: () => {
        picked = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
        render();
      },
    }, player(game, id).name)));
}

function names(game: Game, ids: string[]): string {
  return ids.map((id) => player(game, id).name).join(" & ");
}

function showdownPanel(game: Game): HTMLElement {
  const hand = game.hand!;
  const pot = hand.pots[hand.potIndex];
  const label = hand.potIndex === 0 ? "main pot" : `side pot ${hand.potIndex}`;
  const chosen = hand.order.filter((id) => picked.includes(id) && pot.eligible.includes(id));
  return h("div", {},
    heading(`Who wins the ${label}?`, `Reveal your hands. ${pot.amount} credits; pick two or more to split.`),
    pickList(game, pot.eligible),
    button(
      chosen.length === 0 ? "Pick the winner" : chosen.length === 1 ? `Award to ${names(game, chosen)}` : `Split: ${names(game, chosen)}`,
      () => act((g) => awardPot(g, chosen), "win"),
      "primary big",
      chosen.length === 0));
}

function sabaccPanel(game: Game): HTMLElement {
  const hand = game.hand!;
  const winners = hand.mainWinners;
  const pot = game.sabaccPot;
  if (winners.length === 1) {
    const name = names(game, winners);
    return h("div", {},
      heading(`Did ${name} have a Sabacc?`, `A hand totalling zero takes the Sabacc pot (${pot}).`),
      h("div", { class: "row" },
        button(`Yes, ${name} takes ${pot}`, () => act((g) => awardSabacc(g, winners), "sabacc"), "primary"),
        button("No, it carries over", () => act((g) => awardSabacc(g, []), "tap"), "secondary")));
  }
  const chosen = winners.filter((id) => picked.includes(id));
  return h("div", {},
    heading("Who had a Sabacc?", `Pick the winners whose hands totalled zero; they share the Sabacc pot (${pot}).`),
    pickList(game, winners),
    h("div", { class: "row" },
      button(chosen.length ? `Award to ${names(game, chosen)}` : "Pick a player", () => act((g) => awardSabacc(g, chosen), "sabacc"), "primary", chosen.length === 0),
      button("No Sabacc", () => act((g) => awardSabacc(g, []), "tap"), "secondary")));
}

function overPanel(game: Game): HTMLElement {
  const hand = game.hand!;
  const results = hand.order.filter((id) => hand.won[id]).map((id) => `${player(game, id).name} +${hand.won[id]}`);
  return h("div", {},
    heading(`Hand ${hand.number} is over`, results.join(" · ") + (hand.sabaccWon ? " · Sabacc!" : "")),
    button("Next hand", () => act(nextHand, "card"), "primary big"));
}

// ---------- Menu sheets ----------

function openSheet(which: typeof sheet): void {
  sheet = which;
  render();
}

function sheetEl(game: Game): HTMLElement {
  const close = () => openSheet(null);
  let body: HTMLElement;
  let title: string;
  switch (sheet) {
    case "log":
      title = "Hand log";
      body = h("pre", { class: "log" }, game.log.length ? game.log.slice(-300).join("\n") : "Nothing yet.");
      break;
    case "settings": {
      title = "Settings";
      const draft = { ...game.settings };
      body = h("div", {},
        h("p", { class: "muted small" }, "Ante changes apply from the next deal."),
        ...settingsFields(draft, false),
        button("Save", () => {
          if (!validSettings(draft)) return;
          sheet = null;
          act((g) => ({ ...g, settings: { ...draft, startingChips: g.settings.startingChips } }));
          state.settings = { ...state.game!.settings };
          save();
        }, "primary big"));
      break;
    }
    case "players":
      title = "Players & credits";
      body = playersSheet(game);
      break;
    default:
      title = "Menu";
      body = h("div", { class: "menu" },
        button("Hand log", () => openSheet("log")),
        button("Players & credits", () => openSheet("players")),
        button("Settings", () => openSheet("settings")),
        button("End game", () => {
          if (confirm("End this game? Chip counts will be cleared.")) endGame();
        }, "danger"));
  }
  return h("div", { class: "backdrop", onclick: (e: Event) => { if (e.target === e.currentTarget) close(); } },
    h("div", { class: "sheet", role: "dialog", "aria-label": title },
      h("header", {}, h("h2", {}, title), h("button", { type: "button", class: "icon", onclick: close, "aria-label": "Close" }, "✕")),
      body));
}

function playersSheet(game: Game): HTMLElement {
  if (game.hand && game.hand.phase !== "over") {
    return h("p", { class: "muted" }, "You can change players and chip counts between hands.");
  }
  const rows = game.players.map((p, i) =>
    h("div", { class: "name-row" },
      h("input", {
        type: "text", value: p.name, maxLength: 20, "aria-label": "Name",
        onchange: (e: Event) => {
          const name = (e.target as HTMLInputElement).value.trim();
          if (name) act((g) => ({ ...g, players: g.players.map((x, j) => j === i ? { ...x, name } : x) }));
        },
      }),
      h("input", {
        type: "number", class: "chips-input", inputMode: "numeric", min: "0", value: String(p.chips), "aria-label": "Credits",
        onchange: (e: Event) => {
          const chips = Math.max(0, Math.floor(Number((e.target as HTMLInputElement).value)) || 0);
          act((g) => ({ ...g, players: g.players.map((x, j) => j === i ? { ...x, chips } : x) }));
        },
      })));
  return h("div", {},
    h("p", { class: "muted small" }, "Rename, or set credits for a rebuy. Players with 0 credits sit out."),
    ...rows,
    game.players.length < 8 && !game.hand
      ? button(`+ Add player (${game.settings.startingChips} credits)`, () => act((g) => ({
        ...g,
        players: [...g.players, {
          id: `p${Math.max(...g.players.map((x) => Number(x.id.slice(1)))) + 1}`,
          name: `Player ${g.players.length + 1}`,
          chips: g.settings.startingChips,
        }],
      })))
      : null);
}

function endGame(): void {
  if (state.game) state.names = state.game.players.map((p) => p.name);
  state.game = null;
  state.undo = [];
  sheet = null;
  save();
  render();
}

// ---------- Keep the screen on while playing ----------

let wakeLock: { release(): Promise<void> } | null = null;

async function keepAwake(on: boolean): Promise<void> {
  try {
    if (on && !wakeLock && document.visibilityState === "visible") {
      wakeLock = await (navigator as unknown as { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } })
        .wakeLock?.request("screen") ?? null;
      (wakeLock as unknown as EventTarget | null)?.addEventListener?.("release", () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch {
    wakeLock = null;
  }
}

document.addEventListener("visibilitychange", () => keepAwake(!!state.game));

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

render();
