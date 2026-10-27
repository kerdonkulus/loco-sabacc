import { describe, expect, it } from "vitest";
import {
  type Game,
  actor,
  awardPot,
  awardSabacc,
  bet,
  buildPots,
  diceRolled,
  mainPot,
  newGame,
  nextHand,
  player,
  startHand,
  turnAction,
} from "../src/engine";

const settings = { base: 10, mainAnte: 10, sabaccAnte: 5, startingChips: 100 };

function chipsOnTable(game: Game): number {
  const unpaid = game.hand && game.hand.phase !== "over" ? mainPot(game.hand) : 0;
  return game.players.reduce((a, p) => a + p.chips, 0) + game.sabaccPot + unpaid;
}

/** Everyone still in stands, then everyone checks, then the dice roll without doubles. */
function quietRound(game: Game): Game {
  while (game.hand!.phase === "turns") game = turnAction(game, "stand");
  while (game.hand!.phase === "betting") game = bet(game, { type: "check" });
  return diceRolled(game, false);
}

describe("dealing", () => {
  it("takes both antes and starts left of the dealer", () => {
    let game = newGame(["Han", "Lando"], settings);
    game = startHand(game);
    expect(player(game, "p1").chips).toBe(85);
    expect(player(game, "p2").chips).toBe(85);
    expect(mainPot(game.hand!)).toBe(20);
    expect(game.sabaccPot).toBe(10);
    // Han (p1) deals, so Lando is dealt to first and acts first.
    expect(actor(game)).toBe("p2");
  });

  it("runs turn actions in order, then betting, then dice", () => {
    let game = startHand(newGame(["A", "B", "C"], settings, 1));
    expect(game.hand!.order).toEqual(["p3", "p1", "p2"]);
    game = turnAction(game, "gain");
    game = turnAction(game, "swap");
    expect(game.hand!.phase).toBe("turns");
    game = turnAction(game, "stand");
    expect(game.hand!.phase).toBe("betting");
    expect(actor(game)).toBe("p3");
  });

  it("passes the deal to the left and skips busted players", () => {
    let game = newGame(["A", "B", "C"], settings);
    game.players[1].chips = 0;
    game = startHand(game);
    expect(game.hand!.order).toEqual(["p3", "p1"]);
    game = turnAction(game, "junk");
    expect(game.hand!.phase).toBe("over");
    game = nextHand(game);
    expect(game.dealer).toBe(2);
  });
});

describe("betting", () => {
  it("lets everyone respond to a raise, in order after the raiser", () => {
    let game = startHand(newGame(["A", "B", "C"], settings));
    while (game.hand!.phase === "turns") game = turnAction(game, "stand");
    game = bet(game, { type: "check" }); // B
    game = bet(game, { type: "raise", to: 20 }); // C bets
    expect(game.hand!.queue).toEqual(["p1", "p2"]);
    game = bet(game, { type: "call" }); // A
    game = bet(game, { type: "raise", to: 40 }); // B raises
    expect(game.hand!.queue).toEqual(["p3", "p1"]);
    game = bet(game, { type: "call" });
    game = bet(game, { type: "call" });
    expect(game.hand!.phase).toBe("dice");
    expect(mainPot(game.hand!)).toBe(30 + 120);
  });

  it("only allows bets in steps of the base amount", () => {
    let game = startHand(newGame(["A", "B"], settings));
    game = turnAction(turnAction(game, "stand"), "stand");
    expect(() => bet(game, { type: "raise", to: 15 })).toThrow();
    expect(() => bet(game, { type: "raise", to: 5 })).toThrow();
    game = bet(game, { type: "raise", to: 30 });
    expect(() => bet(game, { type: "check" })).toThrow();
    expect(() => bet(game, { type: "raise", to: 35 })).toThrow();
    game = bet(game, { type: "raise", to: 40 });
    expect(game.hand!.currentBet).toBe(40);
  });

  it("ends the hand when everyone else folds; the Sabacc pot carries over", () => {
    let game = startHand(newGame(["A", "B"], settings));
    game = turnAction(turnAction(game, "stand"), "stand");
    game = bet(game, { type: "raise", to: 20 });
    game = bet(game, { type: "fold" });
    expect(game.hand!.phase).toBe("over");
    expect(player(game, "p2").chips).toBe(85 - 20 + 40);
    expect(game.sabaccPot).toBe(10);
    expect(chipsOnTable(game)).toBe(200);
  });

  it("junking during turn actions folds the player", () => {
    let game = startHand(newGame(["A", "B", "C"], settings));
    game = turnAction(game, "junk");
    expect(game.hand!.folded).toEqual(["p2"]);
    game = turnAction(game, "stand");
    game = turnAction(game, "stand");
    expect(game.hand!.queue).toEqual(["p3", "p1"]);
  });

  it("skips betting once only one player has chips left", () => {
    let game = startHand(newGame(["A", "B"], settings));
    game = turnAction(turnAction(game, "stand"), "stand");
    game = bet(game, { type: "allin" }); // B all in for 85
    game = bet(game, { type: "call" });
    expect(game.hand!.phase).toBe("dice");
    game = diceRolled(game, true);
    game = turnAction(turnAction(game, "stand"), "stand");
    expect(game.hand!.phase).toBe("dice");
  });
});

describe("showdown", () => {
  it("plays three rounds, then awards the main and Sabacc pots", () => {
    let game = startHand(newGame(["A", "B"], settings));
    game = quietRound(game);
    game = quietRound(game);
    expect(game.hand!.round).toBe(3);
    game = quietRound(game);
    expect(game.hand!.phase).toBe("showdown");
    game = awardPot(game, ["p1"]);
    expect(game.hand!.phase).toBe("sabacc");
    expect(() => awardSabacc(game, ["p2"])).toThrow();
    game = awardSabacc(game, ["p1"]);
    expect(player(game, "p1").chips).toBe(85 + 20 + 10);
    expect(game.sabaccPot).toBe(0);
    expect(chipsOnTable(game)).toBe(200);
  });

  it("carries the Sabacc pot over without a Sabacc", () => {
    let game = startHand(newGame(["A", "B"], settings));
    for (let r = 0; r < 3; r++) game = quietRound(game);
    game = awardSabacc(awardPot(game, ["p2"]), []);
    expect(game.sabaccPot).toBe(10);
    game = startHand(nextHand(game));
    expect(game.sabaccPot).toBe(20);
  });

  it("splits a pot, giving the odd chip to the first player left of the dealer", () => {
    let game = newGame(["A", "B", "C"], { ...settings, mainAnte: 5, sabaccAnte: 0 });
    game = startHand(game);
    game = turnAction(game, "junk"); // B folds; pot is 15
    for (let r = 0; r < 3; r++) game = quietRound(game);
    game = awardPot(game, ["p1", "p3"]);
    expect(player(game, "p3").chips).toBe(95 + 8);
    expect(player(game, "p1").chips).toBe(95 + 7);
  });

  it("builds side pots for all-in players", () => {
    let game = newGame(["A", "B", "C"], settings);
    game.players[1].chips = 45; // B can only put in 30 after antes
    game = startHand(game);
    while (game.hand!.phase === "turns") game = turnAction(game, "stand");
    game = bet(game, { type: "allin" }); // B: 30
    game = bet(game, { type: "raise", to: 60 }); // C
    game = bet(game, { type: "call" }); // A
    expect(game.hand!.phase).toBe("dice");
    game = diceRolled(game, false);
    for (let r = 0; r < 2; r++) game = quietRound(game);
    expect(game.hand!.pots).toEqual([
      { amount: 120, eligible: ["p2", "p3", "p1"] },
      { amount: 60, eligible: ["p3", "p1"] },
    ]);
    game = awardPot(game, ["p2"]); // B wins the main pot only
    expect(game.hand!.phase).toBe("showdown");
    expect(() => awardPot(game, ["p2"])).toThrow();
    game = awardPot(game, ["p1"]);
    expect(game.hand!.phase).toBe("sabacc");
    expect(game.hand!.mainWinners).toEqual(["p2"]);
    game = awardSabacc(game, []);
    expect(player(game, "p2").chips).toBe(120);
    expect(chipsOnTable(game)).toBe(245);
  });

  it("returns an uncalled bet", () => {
    let game = newGame(["A", "B"], settings);
    game.players[0].chips = 35; // A has 20 after antes
    game = startHand(game);
    game = turnAction(turnAction(game, "stand"), "stand");
    game = bet(game, { type: "raise", to: 50 }); // B
    game = bet(game, { type: "call" }); // A calls 20, all in
    game = diceRolled(game, false);
    for (let r = 0; r < 2; r++) game = quietRound(game);
    expect(game.hand!.pots).toEqual([{ amount: 60, eligible: ["p2", "p1"] }, { amount: 30, eligible: ["p2"] }]);
    game = awardPot(game, ["p1"]);
    expect(game.hand!.phase).toBe("sabacc");
    expect(player(game, "p2").chips).toBe(85 - 50 + 30);
  });

  it("puts chips folded players put in above the live stakes in the last pot", () => {
    const pots = buildPots({
      order: ["a", "b", "c"],
      folded: ["b"],
      contributed: { a: 30, b: 50, c: 30 },
    } as never);
    expect(pots).toEqual([{ amount: 110, eligible: ["a", "c"] }]);
  });
});
