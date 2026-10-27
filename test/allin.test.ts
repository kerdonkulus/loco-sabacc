import { describe, expect, it } from "vitest";
import { bet, newGame, player, startHand, turnAction } from "../src/engine";

const settings = { base: 10, mainAnte: 10, sabaccAnte: 5, startingChips: 100 };

function toBetting(chipsA: number, chipsB: number) {
  let game = newGame(["A", "B"], settings);
  game.players[0].chips = chipsA;
  game.players[1].chips = chipsB;
  game = startHand(game);
  return turnAction(turnAction(game, "stand"), "stand");
}

describe("betting everything without the All in button", () => {
  it("accepts a raise to a player's whole stack even if it isn't a whole step", () => {
    let game = toBetting(100, 100); // B acts first with 85 after antes
    game = bet(game, { type: "raise", to: 85 });
    expect(player(game, "p2").chips).toBe(0);
  });

  it("doesn't let the other player raise once their opponent is all in", () => {
    let game = toBetting(100, 100);
    game = bet(game, { type: "raise", to: 80 }); // B, leaving 5
    game = bet(game, { type: "raise", to: 85 }); // A bets everything
    expect(game.hand!.queue).toEqual(["p2"]);
    expect(() => bet(game, { type: "raise", to: 100 })).toThrow();
    game = bet(game, { type: "call" });
    expect(game.hand!.phase).toBe("dice");
  });
});
