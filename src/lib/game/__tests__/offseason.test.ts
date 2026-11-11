import { describe, expect, test } from "vitest";
import { FINAL_WEEK, PORTAL } from "../data";
import { ROSTER_MAX } from "../offseason";
import { POS_ORDER, STARTERS, starters } from "../roster";
import { initialState, lineup, loadState, reducer, rosterSpots, seasonOver, STATE_VERSION, type GameState } from "../state";

const toOffseason = (seed: number) => {
  let s = initialState(seed);
  while (!seasonOver(s)) s = reducer(s, { type: "sim/week" });
  return reducer(s, { type: "offseason/start" });
};
const off = (s: GameState) => s.offseason!;

describe("offseason start", () => {
  test("opens the January window with next year's budget; December signees enroll", () => {
    let s = initialState(21);
    s = reducer(s, { type: "rook/pay" });
    while (!seasonOver(s)) s = reducer(s, { type: "sim/week" });
    s = reducer(s, { type: "offseason/start" });
    expect(off(s).phase).toBe("portal");
    expect(off(s).pool.length).toBe(14);
    expect(s.nilBudget).toBeGreaterThanOrEqual(2_000_000);
    expect(s.history).toHaveLength(1);
    expect(rosterSpots(s)).toBe(ROSTER_MAX - s.players.length);
    // Rook signed in December and enrolls now.
    expect(s.lastOffseason!.enrolled.map((p) => p.id)).toContain("rook");
    expect(s.players.find((p) => p.id === "rook")?.yr).toBe("Fr");
    expect(s.depth.QB).toContain("rook");
    // Can't start twice.
    expect(reducer(s, { type: "offseason/start" })).toBe(s);
  });

  test("the first January pool includes the players you watched in Season 1", () => {
    const s = toOffseason(23);
    const names = off(s).pool.map((t) => t.name);
    for (const p of PORTAL) expect(names).toContain(p.name);
  });
});

describe("January transfer window", () => {
  test("bids spend NIL and a roster spot; closing resolves them and refunds losses", () => {
    let s = toOffseason(22);
    const budget = s.nilBudget;
    const spots = rosterSpots(s);
    const targets = off(s).pool.slice(0, 3);
    for (const t of targets) s = reducer(s, { type: "offseason/bid", id: t.id });
    expect(s.nilBudget).toBe(budget - targets.reduce((n, t) => n + t.ask, 0));
    expect(rosterSpots(s)).toBe(spots - 3);
    expect(reducer(s, { type: "offseason/bid", id: targets[0].id })).toBe(s);

    s = reducer(s, { type: "offseason/closePortal" });
    expect(off(s).phase).toBe("ready");
    const signed = off(s).bids.filter((b) => b.status === "signed");
    expect(signed.length + off(s).bids.filter((b) => b.status === "lost").length).toBe(3);
    expect(s.nilBudget).toBe(budget - signed.reduce((n, b) => n + b.amount, 0));
    for (const b of signed) expect(s.players.some((p) => p.id === b.id && p.source === "portal")).toBe(true);
  });

  test("players you keep stay for an NIL raise; undecided departures leave", () => {
    let s = toOffseason(1);
    for (let seed = 2; off(s).departures.length < 2 && seed < 40; seed++) s = toOffseason(seed);
    const [keep, ...rest] = off(s).departures;
    const budget = s.nilBudget;
    s = reducer(s, { type: "offseason/departure", playerId: keep.playerId, call: "keep" });
    expect(s.nilBudget).toBe(budget - keep.keepCost);
    s = reducer(s, { type: "offseason/departure", playerId: keep.playerId, call: "release" });
    expect(s.nilBudget).toBe(budget);
    s = reducer(s, { type: "offseason/departure", playerId: keep.playerId, call: "keep" });
    s = reducer(s, { type: "offseason/closePortal" });
    expect(s.players.some((p) => p.id === keep.playerId)).toBe(true);
    for (const d of rest) expect(s.players.some((p) => p.id === d.playerId)).toBe(false);
  });

  test("beginning the season fills the roster and opens next year's recruiting board", () => {
    let s = toOffseason(31);
    s = reducer(s, { type: "offseason/closePortal" });
    s = reducer(s, { type: "offseason/begin" });
    expect(s.season).toBe(2);
    expect(s.week).toBe(1);
    expect(s.offseason).toBeNull();
    expect(s.recruiting).toMatchObject({ classSeason: 3, weeks: FINAL_WEEK, signed: false, week: 1 });
    const st = starters(lineup(s));
    for (const pos of POS_ORDER) expect(st[pos]).toHaveLength(STARTERS[pos]);
    expect(s.players.length).toBeLessThanOrEqual(ROSTER_MAX);
  });

  test("skipping the offseason resolves the window and starts the season", () => {
    let s = toOffseason(33);
    s = reducer(s, { type: "offseason/bid", id: off(s).pool[0].id });
    s = reducer(s, { type: "season/next" });
    expect(s.season).toBe(2);
    expect(s.offseason).toBeNull();
  });
});

describe("saves", () => {
  test("a version 4 save mid-season migrates: Rook decision kept, in-season bids refunded, recruiting board added", () => {
    const base = initialState(5);
    const v4 = {
      ...base,
      version: 4,
      rook: { decision: "walked", offer: 850_000, interest: 6 },
      bids: [{ playerId: "cole", amount: 310_000, status: "pending" }],
      nilBudget: 1_790_000,
      recruiting: undefined,
    };
    const loaded = loadState(JSON.stringify(v4));
    expect(loaded.version).toBe(STATE_VERSION);
    expect(loaded.rook).toMatchObject({ decision: "hold", outcome: "flipped" });
    expect(loaded.nilBudget).toBe(2_100_000);
    expect(loaded.recruiting?.signed).toBe(false);
  });
});
