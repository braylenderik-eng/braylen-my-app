import { describe, expect, test } from "vitest";
import { FINAL_WEEK } from "../data";
import * as A from "../awards";
import { awardsEnabled, createDynasty, initialState, loadState, reducer, seasonOver, STATE_VERSION, type GameState } from "../state";
import { ALL_TEAMS } from "../season";

const coach = { name: "Ray Dalton", almaMater: "", offense: "spread", defense: "multiple" } as const;
const clear = (s: GameState) => ({ ...s, scenarios: { ...s.scenarios, open: [] } });
const toWeek = (s: GameState, week: number) => {
  while (s.week <= week) s = reducer(clear(s), { type: "sim/week" });
  return s;
};

describe("league stars", () => {
  test("five stars per other program, none for yours", () => {
    const s = createDynasty(coach, "heartland", 4);
    expect(s.league!.stars).toHaveLength((ALL_TEAMS.length - 1) * 5);
    expect(s.league!.stars.some((x) => x.team === "heartland")).toBe(false);
  });

  test("stars build season lines from their team's games", () => {
    const s = toWeek(createDynasty(coach, "heartland", 4), 3);
    const qb = s.league!.stars.find((x) => x.pos === "QB")!;
    expect(qb.games).toBe(3);
    expect(qb.passYds).toBeGreaterThan(200);
  });
});

describe("season awards", () => {
  test("handed out after rivalry week, before the playoff, with All-Conference picks", () => {
    let s = createDynasty(coach, "gulf", 9);
    s = toWeek(s, FINAL_WEEK - 1);
    expect(s.awards).toHaveLength(0);
    s = reducer(clear(s), { type: "sim/week" });
    const names = s.awards.map((a) => a.award);
    for (const award of Object.values(A.AWARDS)) expect(names).toContain(award);
    expect(new Set(s.awards.filter((a) => a.award === A.AWARDS.crown || a.award === A.AWARDS.fresh).map((a) => a.id)).size).toBe(2);
    expect(s.allConference?.season).toBe(1);
    expect(s.allConference!.picks.length).toBeGreaterThan(20);
  });

  test("your winners get badges, and stats bank into career totals at season's end", () => {
    let s = createDynasty(coach, "gulf", 9);
    while (!seasonOver(s)) s = reducer(clear(s), { type: "sim/week" });
    const mine = s.awards.filter((a) => a.mine && a.id !== "coach");
    const picks = s.allConference!.picks.filter((p) => p.mine);
    expect(mine.length + picks.length).toBeGreaterThan(0);
    for (const w of mine) expect(s.players.find((p) => p.id === w.id)?.awards?.some((x) => x.includes(w.award))).toBe(true);
    const qb = Object.entries(s.seasonStats).find(([, l]) => l.pos === "QB")!;
    s = reducer(s, { type: "offseason/start" });
    const p = s.players.find((x) => x.id === qb[0]);
    if (p) expect(p.career?.passYds).toBe(qb[1].passYds);
  });

  test("the quick start's half season has no awards", () => {
    let s = initialState(5);
    expect(awardsEnabled(s)).toBe(false);
    s = toWeek(s, FINAL_WEEK);
    expect(s.awards).toHaveLength(0);
  });

  test("leaders and summaries", () => {
    const s = toWeek(createDynasty(coach, "summit", 2), 6);
    const c = A.candidates(s.league!, s.seasonStats, s.players, s.standings);
    const top = A.leaders(c, "rushYds", 5);
    expect(top).toHaveLength(5);
    expect(top.map((x) => x.rushYds)).toEqual([...top.map((x) => x.rushYds)].sort((a, b) => (b ?? 0) - (a ?? 0)));
    expect(A.statSummary({ passYds: 3000, passTd: 25 })).toBe("3,000 pass yds, 25 TD");
  });

  test("version 8 saves gain a league", () => {
    const old = { ...createDynasty(coach, "ozark", 6), version: 8 } as Partial<GameState>;
    delete old.league;
    delete old.awards;
    delete old.allConference;
    const s = loadState(JSON.stringify(old));
    expect(s.version).toBe(STATE_VERSION);
    expect(s.league?.stars.length).toBeGreaterThan(100);
    expect(s.awards).toEqual([]);
  });
});

import { weekDate } from "../state";
describe("calendar", () => {
  test("2026: Week 1 is Labor Day weekend, rivalry week the Saturday after Thanksgiving, one open week", () => {
    expect(weekDate(1, 1)).toBe("Sep 5");
    expect(weekDate(6, 1)).toBe("Oct 10");
    expect(weekDate(7, 1)).toBe("Oct 24");
    expect(weekDate(12, 1)).toBe("Nov 28");
    expect(weekDate(1, 2)).toBe("Sep 4");
    expect(weekDate(12, 2)).toBe("Nov 27");
  });
});
