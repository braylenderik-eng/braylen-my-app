import { describe, expect, test } from "vitest";
import * as D from "../draft";
import { createDynasty, loadState, reducer, seasonOver, STATE_VERSION, type GameState } from "../state";
import { FINAL_WEEK } from "../data";
import type { Player } from "../roster";

const coach = { name: "Ray Dalton", almaMater: "", offense: "spread", defense: "multiple" } as const;
const clear = (s: GameState) => ({ ...s, scenarios: { ...s.scenarios, open: [] } });
const toOffseason = (team: Parameters<typeof createDynasty>[1], seed: number) => {
  let s = createDynasty(coach, team, seed);
  while (!seasonOver(s)) s = reducer(clear(s), { type: "sim/week" });
  return reducer(s, { type: "offseason/start" });
};
const pl = (over: Partial<Player>): Player => ({ id: "x", name: "X", num: 1, pos: "WR", yr: "Jr", ovr: 80, hometown: "", nil: 0, ...over });

describe("draft grades", () => {
  test("rating, position and awards set the round", () => {
    expect(D.projectedRound(pl({ ovr: 92 }))).toBe(1);
    expect(D.projectedRound(pl({ ovr: 85, pos: "QB" }))).toBe(3);
    expect(D.projectedRound(pl({ ovr: 87, awards: ["2026 The Crown Trophy"] }))).toBe(1);
    expect(D.projectedRound(pl({ ovr: 74 }))).toBeNull();
  });

  test("pitching raises the chance a junior comes back", () => {
    for (const r of [1, 2, 3]) expect(D.stayChance(r, true)).toBeGreaterThan(D.stayChance(r, false));
    expect(D.stayChance(1, true)).toBeLessThan(D.stayChance(3, true));
  });

  test("the draft orders picks and pedigree rewards recent classes", () => {
    const picks = D.runDraft([pl({ id: "a", ovr: 93 }), pl({ id: "b", ovr: 84 }), pl({ id: "c", ovr: 70 })], 1, 1);
    expect(picks[0].playerId).toBe("a");
    expect(picks[0].round).toBeLessThanOrEqual(2);
    const ped = D.draftPedigree(picks, 1);
    expect(ped).toBeGreaterThan(0);
    expect(D.draftPedigree(picks, 5)).toBe(0);
  });
});

describe("offseason flow", () => {
  test("seniors and early entries are drafted when the new season starts", () => {
    let s = toOffseason("gulf", 9);
    const off = s.offseason!;
    expect(off.draftPool!.length).toBeGreaterThan(0);
    for (const d of off.declarations ?? []) expect(off.departures.some((x) => x.playerId === d.playerId)).toBe(false);
    const first = off.declarations?.[0];
    if (first) {
      const budget = s.nilBudget;
      s = reducer(s, { type: "offseason/declaration", playerId: first.playerId, call: "pitch" });
      expect(s.nilBudget).toBe(budget - first.cost);
      s = reducer(s, { type: "offseason/declaration", playerId: first.playerId, call: "release" });
      expect(s.nilBudget).toBe(budget);
    }
    s = reducer(s, { type: "offseason/focus", group: "Quarterbacks" });
    s = reducer(s, { type: "offseason/focus", group: "Receivers" });
    s = reducer(s, { type: "offseason/focus", group: "Secondary" });
    expect(s.offseason!.focus).toEqual(["Quarterbacks", "Receivers"]);
    const leaving = new Set(s.offseason!.declarations!.map((d) => d.playerId));
    s = reducer(s, { type: "season/next" });
    expect(s.season).toBe(2);
    for (const id of leaving) expect(s.players.some((p) => p.id === id)).toBe(false);
    expect(s.draftHistory.length).toBeGreaterThan(0);
    expect(s.draftHistory.every((d) => d.season === 1)).toBe(true);
    expect(s.lastOffseason?.drafted?.length).toBe(s.draftHistory.length);
    expect(s.lastOffseason?.spring?.every((g) => ["QB", "WR"].includes(g.player.pos))).toBe(true);
  });
});

describe("redshirts", () => {
  test("a freshman can be redshirted through Week 4: he sits, keeps his class and develops", () => {
    let s = createDynasty(coach, "heartland", 5);
    const fr = s.players.find((p) => p.yr === "Fr")!;
    s = reducer(s, { type: "player/redshirt", playerId: fr.id, on: true });
    expect(s.players.find((p) => p.id === fr.id)!.redshirt).toBe(true);
    while (s.week <= D.REDSHIRT_DEADLINE) s = reducer(clear(s), { type: "sim/week" });
    expect(reducer(s, { type: "player/redshirt", playerId: fr.id, on: false })).toBe(s); // locked in
    while (s.week <= FINAL_WEEK) s = reducer(clear(s), { type: "sim/week" });
    expect(Object.keys(s.seasonStats)).not.toContain(fr.id);
    while (!seasonOver(s)) s = reducer(clear(s), { type: "sim/week" });
    s = reducer(s, { type: "offseason/start" });
    const after = s.players.find((p) => p.id === fr.id)!;
    expect(after.yr).toBe("Fr");
    expect(after.rsUsed).toBe(true);
    expect(after.redshirt).toBe(false);
  });

  test("version 10 saves gain a draft history", () => {
    const old = { ...createDynasty(coach, "ozark", 6), version: 10 } as Partial<GameState>;
    delete old.draftHistory;
    const s = loadState(JSON.stringify(old));
    expect(s.version).toBe(STATE_VERSION);
    expect(s.draftHistory).toEqual([]);
  });
});
