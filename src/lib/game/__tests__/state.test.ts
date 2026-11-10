import { describe, expect, test } from "vitest";
import { FINAL_WEEK } from "../data";
import { canBid, initialState, loadState, playoffOdds, reducer, standingOf } from "../state";

describe("season state", () => {
  test("paying Rook spends $1.1M and a scholarship, only once", () => {
    let s = reducer(initialState(), { type: "rook/pay" });
    expect(s.nilBudget).toBe(1_000_000);
    expect(s.scholarships).toBe(2);
    expect(s.rook).toMatchObject({ decision: "paid", interest: 93 });
    s = reducer(s, { type: "rook/pay" });
    expect(s.nilBudget).toBe(1_000_000);
  });

  test("letting Rook walk puts him on the portal board", () => {
    const s = reducer(initialState(), { type: "rook/walk" });
    expect(s.rook.decision).toBe("walked");
    expect(s.nilBudget).toBe(2_100_000);
  });

  test("portal players must be scouted before bidding unless shortlisted", () => {
    let s = initialState();
    const cole = { id: "cole" } as const;
    expect(canBid(s, { ...cole, biddable: false, ask: 1 } as never).ok).toBe(false);
    s = reducer(s, { type: "portal/scout", playerId: "cole" });
    s = reducer(s, { type: "portal/bid", playerId: "cole" });
    expect(s.bids).toHaveLength(1);
    expect(s.nilBudget).toBe(2_100_000 - 310_000);
  });

  test("simming a week plays the game, advances the week and re-ranks", () => {
    const s0 = initialState();
    const s1 = reducer(s0, { type: "sim/week" });
    expect(s1.week).toBe(s0.week + 1);
    expect(s1.recaps).toHaveLength(1);
    expect(s1.unseenRecap).toBe(true);
    const me0 = standingOf(s0, "stallions")!;
    const me1 = standingOf(s1, "stallions")!;
    expect(me1.wins + me1.losses).toBe(me0.wins + me0.losses + 1);
    // every ranked team played exactly once
    const games = s1.standings.reduce((n, t) => n + t.wins + t.losses, 0) - s0.standings.reduce((n, t) => n + t.wins + t.losses, 0);
    expect(games).toBe(s0.standings.length);
  });

  test("the season ends after the final week and further sims do nothing", () => {
    let s = initialState();
    while (s.week <= FINAL_WEEK) s = reducer(s, { type: "sim/week" });
    const after = reducer(s, { type: "sim/week" });
    expect(after).toBe(s);
    expect([0, 1]).toContain(playoffOdds(s));
  });

  test("playoff odds rise with a win and fall with a loss", () => {
    const s = initialState();
    const win = playoffOdds(s, "win");
    const loss = playoffOdds(s, "loss");
    expect(win).toBeGreaterThan(playoffOdds(s));
    expect(loss).toBeLessThan(0.35);
  });

  test("bad saved data falls back to a fresh season", () => {
    expect(loadState("{oops").week).toBe(initialState().week);
    expect(loadState(JSON.stringify({ version: 1 })).week).toBe(initialState().week);
  });
});
