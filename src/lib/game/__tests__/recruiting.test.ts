import { describe, expect, test } from "vitest";
import { FINAL_WEEK } from "../data";
import { commitChance, MAX_PITCHES_PER_WEEK, ROSTER_MAX, VISIT_COST } from "../recruiting";
import { initialState, reducer, rosterSpots, seasonOver, type GameState } from "../state";

const rec = (s: GameState) => s.recruiting!;

describe("in-season recruiting", () => {
  test("Season 1 joins late: two recruiting weeks before Early Signing Day", () => {
    const s = initialState(1);
    expect(rec(s)).toMatchObject({ classSeason: 2, weeks: 2, week: 1, signed: false });
    expect(rec(s).points).toBeGreaterThan(10);
  });

  test("pitches and visits spend this week's points; points refresh when the week is played", () => {
    let s = initialState(2);
    const p = rec(s).board[0];
    const start = rec(s).points;
    s = reducer(s, { type: "recruit/pitch", id: p.id });
    s = reducer(s, { type: "recruit/visit", id: p.id });
    expect(rec(s).points).toBe(start - 1 - VISIT_COST);
    expect(rec(s).board[0].you).toBeGreaterThan(p.you);
    expect(reducer(s, { type: "recruit/visit", id: p.id })).toBe(s); // one visit only
    for (let i = 0; i < MAX_PITCHES_PER_WEEK; i++) s = reducer(s, { type: "recruit/pitch", id: p.id });
    expect(rec(s).board[0].pitchesThisWeek).toBe(MAX_PITCHES_PER_WEEK);
    s = reducer(s, { type: "sim/week" });
    expect(rec(s).week).toBe(2);
    expect(rec(s).points).toBe(rec(s).pointsPerWeek);
    expect(rec(s).board[0].pitchesThisWeek).toBe(0);
  });

  test("offers reserve NIL and a spot for next season; withdrawing refunds", () => {
    let s = initialState(3);
    const p = rec(s).board[5];
    const budget = s.nilBudget;
    const spots = rosterSpots(s);
    s = reducer(s, { type: "recruit/offer", id: p.id });
    expect(s.nilBudget).toBe(budget - p.ask);
    expect(rosterSpots(s)).toBe(spots - 1);
    s = reducer(s, { type: "recruit/withdraw", id: p.id });
    expect(s.nilBudget).toBe(budget);
  });

  test("Early Signing Day happens right after the last regular-season week, before the playoff", () => {
    let s = initialState(4);
    const targets = rec(s).board.filter((p) => p.stars <= 3).slice(0, 3);
    for (const t of targets) {
      s = reducer(s, { type: "recruit/offer", id: t.id });
      for (let i = 0; i < 3; i++) s = reducer(s, { type: "recruit/pitch", id: t.id });
    }
    s = reducer(s, { type: "sim/week" });
    expect(rec(s).signed).toBe(false);
    s = reducer(s, { type: "sim/week" });
    expect(s.week).toBe(FINAL_WEEK + 1); // playoff not played yet
    expect(rec(s).signed).toBe(true);
    const signed = rec(s).board.filter((p) => p.status === "signed");
    expect(signed.every((p) => p.offered)).toBe(true);
    expect(rec(s).board.every((p) => p.status !== "open")).toBe(true);
    for (const p of signed) expect(s.players.find((x) => x.id === p.id)?.yr).toBe("HS");
    expect(s.recaps[s.recaps.length - 1].notes?.some((n) => n.startsWith("Early Signing Day"))).toBe(true);
    // The board is closed now.
    expect(reducer(s, { type: "recruit/pitch", id: rec(s).board[0].id })).toBe(s);
    // Signees enroll in the offseason.
    while (!seasonOver(s)) s = reducer(s, { type: "sim/week" });
    s = reducer(s, { type: "offseason/start" });
    for (const p of signed) expect(s.players.find((x) => x.id === p.id)?.yr).toBe("Fr");
  });

  test("a full 12-week cycle in Season 2 runs to Signing Day after Week 12", () => {
    let s = initialState(6);
    s = reducer(s, { type: "season/next" }); // not over yet: no-op
    while (!seasonOver(s)) s = reducer(s, { type: "sim/week" });
    s = reducer(s, { type: "season/next" });
    expect(rec(s)).toMatchObject({ classSeason: 3, weeks: 12, week: 1 });
    for (let w = 1; w < FINAL_WEEK; w++) s = reducer(s, { type: "sim/week" });
    expect(rec(s).week).toBe(FINAL_WEEK);
    expect(rec(s).signed).toBe(false);
    s = reducer(s, { type: "sim/week" });
    expect(rec(s).signed).toBe(true);
    expect(s.players.length).toBeLessThanOrEqual(ROSTER_MAX + 12); // HS signees count toward next year, not this one
  });

  test("commit chance favors whoever leads in interest", () => {
    expect(commitChance({ you: 60, them: 40 })).toBeGreaterThan(0.9);
    expect(commitChance({ you: 40, them: 60 })).toBeLessThan(0.1);
    expect(commitChance({ you: 50, them: 50 })).toBeCloseTo(0.5, 5);
  });
});
