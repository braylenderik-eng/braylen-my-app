import { describe, expect, test } from "vitest";
import { capRoom, marketValue, MAX_PAY, MIN_ROOM, payroll, playingTime, recruitAsk, REV_SHARE_CAP } from "../economy";
import { programProfile } from "../program";
import { rosterFor, ROSTER } from "../roster";
import { createDynasty, initialState, reducer, seasonOver } from "../state";
import { ALL_TEAMS } from "../season";
import { makeRng } from "../rng";

describe("2026-27 money", () => {
  test("pay follows position and rating", () => {
    expect(marketValue("QB", 90, "a")).toBeGreaterThan(3_500_000);
    expect(marketValue("QB", 99, "a")).toBe(MAX_PAY);
    expect(marketValue("IOL", 84, "b")).toBeLessThan(marketValue("QB", 84, "b"));
    expect(marketValue("LB", 70, "c")).toBeLessThan(150_000);
    expect(REV_SHARE_CAP).toBe(21_580_000);
  });

  test("recruit asks by stars", () => {
    const r = makeRng(1);
    const five = recruitAsk(5, "WR", r);
    expect(five).toBeGreaterThanOrEqual(600_000);
    expect(recruitAsk(5, "QB", r)).toBeGreaterThan(800_000);
    expect(recruitAsk(3, "WR", r)).toBeLessThan(100_000);
  });

  test("budgets: everyone gets (about) the same revenue share; the collective sets the big programs apart", () => {
    const bb = programProfile(ALL_TEAMS.find((t) => programProfile(t).tier === "Blue blood")!);
    const rb = programProfile(ALL_TEAMS.find((t) => programProfile(t).tier === "Rebuild")!);
    expect(bb.baseBudget).toBeGreaterThan(30_000_000);
    expect(bb.collective).toBeGreaterThan(rb.collective * 5);
    expect(bb.revShare).toBeLessThan(REV_SHARE_CAP);
  });

  test("parity: big rosters cost more, so room to add players stays close across tiers", () => {
    const rooms: Record<string, number[]> = {};
    for (const t of ALL_TEAMS) (rooms[programProfile(t).tier] ??= []).push(capRoom(programProfile(t).baseBudget, rosterFor(t, 3), MIN_ROOM.start));
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const bb = avg(rooms["Blue blood"]);
    const rb = avg(rooms["Rebuild"]);
    expect(bb / rb).toBeLessThan(2);
    expect(rb).toBeGreaterThanOrEqual(MIN_ROOM.start);
  });

  test("playing time: a thin room is a path to start, a stacked one is crowded", () => {
    const qbs = ROSTER.filter((p) => p.pos === "QB");
    expect(playingTime(qbs, "QB", 60, 1)).toBe("crowded");
    expect(playingTime([], "QB", 80, 1)).toBe("path");
  });

  test("a season's payroll and budget stay realistic", () => {
    let s = createDynasty({ name: "x", almaMater: "", offense: "spread", defense: "multiple" }, "gulf", 3);
    expect(payroll(s.players)).toBeGreaterThan(15_000_000);
    while (!seasonOver(s)) s = reducer({ ...s, scenarios: { ...s.scenarios, open: [] } }, { type: "sim/week" });
    s = reducer(s, { type: "offseason/start" });
    expect(s.nilBudget).toBeGreaterThanOrEqual(MIN_ROOM.season);
    expect(initialState(2).players.find((p) => p.pos === "QB")!.nil).toBeGreaterThan(1_500_000);
  });
});
