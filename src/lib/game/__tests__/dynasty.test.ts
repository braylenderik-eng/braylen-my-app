import { describe, expect, test } from "vitest";
import { FINAL_WEEK, TEAMS } from "../data";
import { expectationsVerdict, programProfile, schemeEdge, schemeFit, type CoachProfile } from "../program";
import { ALL_TEAMS } from "../season";
import { capRoom, MIN_ROOM } from "../economy";
import { createDynasty, currentUserFixture, loadState, reducer, seasonOver, STATE_VERSION, type GameState } from "../state";

const coach: CoachProfile = { name: "Ray Dalton", almaMater: "Somewhere State", offense: "airraid", defense: "attacking" };

describe("program profiles", () => {
  test("every team gets a tier; stronger programs expect more and pay more", () => {
    const ps = ALL_TEAMS.map((id) => ({ id, p: programProfile(id), power: TEAMS[id].off + TEAMS[id].def }));
    expect(new Set(ps.map((x) => x.p.tier)).size).toBeGreaterThanOrEqual(3);
    const best = ps.reduce((a, b) => (b.power > a.power ? b : a));
    const worst = ps.reduce((a, b) => (b.power < a.power ? b : a));
    expect(best.p.winTarget).toBeGreaterThan(worst.p.winTarget);
    expect(best.p.baseBudget).toBeGreaterThan(worst.p.baseBudget);
  });

  test("expectations verdicts", () => {
    expect(expectationsVerdict(11, 9).label).toBe("Exceeded expectations");
    expect(expectationsVerdict(9, 9).label).toBe("Met expectations");
    expect(expectationsVerdict(7, 9).label).toBe("Fell short");
    expect(expectationsVerdict(4, 9)).toEqual({ label: "Hot seat", budget: -1_500_000 });
  });

  test("scheme fit and edge", () => {
    expect(schemeFit(coach)).toEqual(["QB", "WR", "EDGE", "LB"]);
    expect(schemeEdge(coach, { offense: "air", defense: "pressure" })).toEqual({ off: 1, def: 1 });
    expect(schemeEdge(coach, { offense: "ground", defense: "bend" })).toEqual({ off: 0, def: 0 });
    expect(schemeEdge(null, { offense: "air", defense: "pressure" })).toEqual({ off: 0, def: 0 });
  });
});

describe("createDynasty", () => {
  const team = ALL_TEAMS.find((id) => id !== "stallions" && programProfile(id).tier === "Rebuild")!;

  test("starts Season 1 at Week 1 with the chosen program, coach and schemes", () => {
    const s = createDynasty(coach, team, 7);
    expect(s.version).toBe(STATE_VERSION);
    expect(s.team).toBe(team);
    expect(s.coach).toEqual(coach);
    expect(s.season).toBe(1);
    expect(s.week).toBe(1);
    expect(s.plan).toEqual({ offense: "air", defense: "pressure" });
    expect(s.nilBudget).toBe(capRoom(programProfile(team).baseBudget, s.players, MIN_ROOM.start));
    expect(s.players.every((p) => p.id.startsWith(`${team}-`))).toBe(true);
    expect(s.standings).toHaveLength(ALL_TEAMS.length);
    expect(s.recruiting!.weeks).toBe(FINAL_WEEK);
    expect(s.recruiting!.board.some((p) => p.fit)).toBe(true);
    expect(s.scenarios.open.length).toBeGreaterThan(0); // a first decision is waiting
    const f = currentUserFixture(s)!;
    expect([f.home, f.away]).toContain(team);
  });

  test("schemes make fitting prospects keener", () => {
    const fit = createDynasty(coach, team, 3).recruiting!.board;
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(avg(fit.filter((p) => p.fit).map((p) => p.you))).toBeGreaterThan(avg(fit.filter((p) => !p.fit).map((p) => p.you)));
  });

  test("a full season plays out, records expectations, and the next season starts for the same program", () => {
    let s: GameState = createDynasty(coach, team, 21);
    const answer = (x: GameState) => x.scenarios.open.reduce((y, sc) => reducer(y, { type: "scenario/choose", id: sc.id, option: sc.options[0].id }), x);
    while (!seasonOver(s)) s = reducer(answer(s), { type: "sim/week" });
    const me = s.standings.find((t) => t.id === team)!;
    expect(me.wins + me.losses).toBe(12);
    s = reducer(s, { type: "season/next" });
    const h = s.history.at(-1)!;
    expect(h.target).toBe(programProfile(team).winTarget);
    expect(h.expectation).toBe(expectationsVerdict(h.wins, h.target!).label);
    expect(s.team).toBe(team);
    expect(s.season).toBe(2);
  });

  test("the reducer action and a saved dynasty round-trip", () => {
    const s = reducer(createDynasty(coach, "stallions", 1), { type: "dynasty/create", coach, team, seed: 5 });
    expect(s.team).toBe(team);
    expect(loadState(JSON.stringify(s))).toEqual(s);
  });

  test("older saves migrate to the classic program", () => {
    const old = { ...createDynasty(coach, team, 2), version: 6 } as Partial<GameState>;
    delete old.team;
    delete old.coach;
    delete old.program;
    const s = loadState(JSON.stringify(old));
    expect(s.version).toBe(STATE_VERSION);
    expect(s.team).toBe("stallions");
    expect(s.coach).toBeNull();
  });
});
