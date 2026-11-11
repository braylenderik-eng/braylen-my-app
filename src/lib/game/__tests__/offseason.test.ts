import { describe, expect, test } from "vitest";
import { commitChance, POINTS_PER_ROUND, RECRUIT_ROUNDS, ROSTER_MAX, VISIT_COST } from "../offseason";
import { POS_ORDER, STARTERS, starters } from "../roster";
import { initialState, lineup, reducer, rosterSpots, seasonOver, type GameState } from "../state";

const toOffseason = (seed: number) => {
  let s = initialState(seed);
  while (!seasonOver(s)) s = reducer(s, { type: "sim/week" });
  return reducer(s, { type: "offseason/start" });
};
const off = (s: GameState) => s.offseason!;

describe("offseason start", () => {
  test("opens the portal window with a pool, a recruiting board and next year's budget", () => {
    const s = toOffseason(21);
    expect(off(s).phase).toBe("portal");
    expect(off(s).pool.length).toBe(14);
    expect(off(s).board.length).toBe(24);
    expect(s.players.some((p) => p.yr === "Sr" && s.lastOffseason!.graduated.some((g) => g.id === p.id))).toBe(false);
    expect(s.nilBudget).toBeGreaterThanOrEqual(2_000_000);
    expect(s.history).toHaveLength(1);
    expect(rosterSpots(s)).toBe(ROSTER_MAX - s.players.length);
    // Can't start twice.
    expect(reducer(s, { type: "offseason/start" })).toBe(s);
  });
});

describe("portal window", () => {
  test("bids spend NIL and a roster spot; closing resolves them and refunds losses", () => {
    let s = toOffseason(22);
    const budget = s.nilBudget;
    const spots = rosterSpots(s);
    const targets = off(s).pool.slice(0, 3);
    for (const t of targets) s = reducer(s, { type: "offseason/bid", id: t.id });
    const spent = targets.reduce((n, t) => n + t.ask, 0);
    expect(s.nilBudget).toBe(budget - spent);
    expect(rosterSpots(s)).toBe(spots - 3);
    // Duplicate bid is ignored.
    expect(reducer(s, { type: "offseason/bid", id: targets[0].id })).toBe(s);

    s = reducer(s, { type: "offseason/closePortal" });
    expect(off(s).phase).toBe("recruiting");
    const signed = off(s).bids.filter((b) => b.status === "signed");
    const lost = off(s).bids.filter((b) => b.status === "lost");
    expect(signed.length + lost.length).toBe(3);
    expect(s.nilBudget).toBe(budget - signed.reduce((n, b) => n + b.amount, 0));
    for (const b of signed) expect(s.players.some((p) => p.id === b.id && p.source === "portal")).toBe(true);
    expect(s.lastOffseason!.transfersIn.map((p) => p.id).sort()).toEqual(signed.map((b) => b.id).sort());
  });

  test("players you keep stay for an NIL raise; undecided departures leave", () => {
    // Find a seed with at least two departures.
    let s = toOffseason(1);
    for (let seed = 2; off(s).departures.length < 2 && seed < 40; seed++) s = toOffseason(seed);
    const [keep, ...rest] = off(s).departures;
    expect(keep).toBeDefined();
    const budget = s.nilBudget;
    s = reducer(s, { type: "offseason/departure", playerId: keep.playerId, call: "keep" });
    expect(s.nilBudget).toBe(budget - keep.keepCost);
    // Changing your mind refunds it, then keep again.
    s = reducer(s, { type: "offseason/departure", playerId: keep.playerId, call: "release" });
    expect(s.nilBudget).toBe(budget);
    s = reducer(s, { type: "offseason/departure", playerId: keep.playerId, call: "keep" });

    s = reducer(s, { type: "offseason/closePortal" });
    expect(s.players.some((p) => p.id === keep.playerId)).toBe(true);
    for (const d of rest) {
      expect(s.players.some((p) => p.id === d.playerId)).toBe(false);
      expect(Object.values(s.depth).flat()).not.toContain(d.playerId);
    }
    expect(s.lastOffseason!.transfersOut.map((p) => p.id).sort()).toEqual(rest.map((d) => d.playerId).sort());
  });
});

describe("recruiting", () => {
  const toRecruiting = (seed: number) => reducer(toOffseason(seed), { type: "offseason/closePortal" });

  test("pitches and visits spend points and raise interest; offers reserve NIL", () => {
    let s = toRecruiting(31);
    const p = off(s).board[0];
    s = reducer(s, { type: "recruit/pitch", id: p.id });
    s = reducer(s, { type: "recruit/visit", id: p.id });
    const after = off(s).board[0];
    expect(off(s).points).toBe(POINTS_PER_ROUND - 1 - VISIT_COST);
    expect(after.you).toBeGreaterThan(p.you);
    expect(after.visited).toBe(true);
    // Only one visit.
    expect(reducer(s, { type: "recruit/visit", id: p.id })).toBe(s);

    const budget = s.nilBudget;
    s = reducer(s, { type: "recruit/offer", id: p.id });
    expect(s.nilBudget).toBe(budget - p.ask);
    s = reducer(s, { type: "recruit/withdraw", id: p.id });
    expect(s.nilBudget).toBe(budget);
  });

  test("Signing Day: only offered prospects can sign, losses refund, and the class joins the next season", () => {
    let s = toRecruiting(32);
    // Pour everything into three cheap prospects and offer them.
    const targets = off(s).board.filter((p) => p.stars <= 3).slice(0, 3);
    for (let round = 1; round <= RECRUIT_ROUNDS; round++) {
      for (const t of targets) for (let i = 0; i < 3; i++) s = reducer(s, { type: "recruit/pitch", id: t.id });
      if (round === 1) for (const t of targets) s = reducer(s, { type: "recruit/offer", id: t.id });
      s = reducer(s, { type: "recruit/endRound" });
    }
    expect(off(s).phase).toBe("ready");
    const signed = off(s).board.filter((p) => p.status === "signed");
    expect(signed.every((p) => p.offered)).toBe(true);
    expect(signed.length).toBeGreaterThan(0); // heavy pitching on low-star kids should land at least one
    expect(off(s).board.every((p) => p.status !== "open")).toBe(true);

    s = reducer(s, { type: "offseason/begin" });
    expect(s.offseason).toBeNull();
    expect(s.season).toBe(2);
    for (const p of signed) {
      const pl = s.players.find((x) => x.id === p.id)!;
      expect(pl.yr).toBe("Fr");
      expect(s.depth[pl.pos]).toContain(pl.id);
    }
    expect(s.players.length).toBeLessThanOrEqual(ROSTER_MAX);
    const st = starters(lineup(s));
    for (const pos of POS_ORDER) expect(st[pos]).toHaveLength(STARTERS[pos]);
  });

  test("commit chance favors whoever leads in interest", () => {
    const base = { you: 60, them: 40 } as Parameters<typeof commitChance>[0];
    expect(commitChance(base)).toBeGreaterThan(0.9);
    expect(commitChance({ ...base, you: 40, them: 60 })).toBeLessThan(0.1);
    expect(commitChance({ ...base, you: 50, them: 50 })).toBeCloseTo(0.5, 5);
  });

  test("skipping the offseason resolves everything and starts the season", () => {
    let s = toOffseason(33);
    const t = off(s).pool[0];
    s = reducer(s, { type: "offseason/bid", id: t.id });
    s = reducer(s, { type: "season/next" });
    expect(s.season).toBe(2);
    expect(s.week).toBe(1);
    expect(s.offseason).toBeNull();
    expect(s.players.length).toBeLessThanOrEqual(ROSTER_MAX);
  });
});
