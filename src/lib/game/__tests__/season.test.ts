import { describe, expect, test } from "vitest";
import { FINAL_WEEK, USER_TEAM } from "../data";
import { POS_ORDER, STARTERS, starters } from "../roster";
import { ALL_TEAMS, generateSchedule, potentialOf, SEASON_WEEKS } from "../season";
import { initialState, lineup, loadState, PLAYOFF_START, reducer, seasonDoneWeek, seasonOver, standingOf, STORAGE_KEY, type GameState } from "../state";

const finishSeason = (s: GameState) => {
  while (!seasonOver(s)) s = reducer(s, { type: "sim/week" });
  return s;
};

describe("schedule", () => {
  test("12 weeks, every team plays exactly once a week, never itself", () => {
    const sched = generateSchedule(42);
    expect(Object.keys(sched)).toHaveLength(SEASON_WEEKS);
    for (let w = 1; w <= SEASON_WEEKS; w++) {
      const teams = sched[w].flatMap((g) => [g.home, g.away]);
      expect(new Set(teams).size).toBe(ALL_TEAMS.length);
      expect(sched[w].every((g) => g.home !== g.away)).toBe(true);
    }
    // Over a season the user faces 12 different opponents.
    const opps = Object.values(sched).map((games) => {
      const g = games.find((x) => x.home === USER_TEAM || x.away === USER_TEAM)!;
      return g.home === USER_TEAM ? g.away : g.home;
    });
    expect(new Set(opps).size).toBe(SEASON_WEEKS);
  });
});

describe("offseason", () => {
  test("only works once the season is over", () => {
    const s = initialState(7);
    expect(reducer(s, { type: "season/next" })).toBe(s);
  });

  test("seniors graduate, classes move up, players develop and the roster stays full", () => {
    const end = finishSeason(initialState(7));
    const next = reducer(end, { type: "season/next" });
    const seniors = end.players.filter((p) => p.yr === "Sr").map((p) => p.id);

    expect(next.season).toBe(2);
    expect(next.week).toBe(1);
    expect(next.players.some((p) => seniors.includes(p.id))).toBe(false);
    expect(next.lastOffseason!.graduated.map((p) => p.id).sort()).toEqual(seniors.sort());

    const was = new Map(end.players.map((p) => [p.id, p]));
    for (const p of next.players) {
      const old = was.get(p.id);
      if (!old) continue;
      expect(p.ovr).toBeGreaterThanOrEqual(old.ovr);
      expect(p.ovr).toBeLessThanOrEqual(potentialOf(old));
      expect({ Fr: "So", So: "Jr", Jr: "Sr", HS: "Fr" }[old.yr as "Fr"]).toBe(p.yr);
    }
    const st = starters(lineup(next));
    for (const pos of POS_ORDER) expect(st[pos]).toHaveLength(STARTERS[pos]);
    expect(next.history).toHaveLength(1);
    expect(next.history[0]).toMatchObject({ season: 1 });
  });

  test("December signees enroll and join the depth chart", () => {
    const end = finishSeason(initialState(3));
    const signees = end.players.filter((p) => p.yr === "HS").map((p) => p.id);
    const s = reducer(end, { type: "season/next" });
    expect(s.lastOffseason!.enrolled.map((p) => p.id).sort()).toEqual(signees.sort());
    for (const id of signees) {
      const p = s.players.find((x) => x.id === id)!;
      expect(p.yr).toBe("Fr");
      expect(s.depth[p.pos]).toContain(id);
    }
  });

  test("a new season starts 0–0 for all 40 teams with a fresh budget and no carry-over", () => {
    const next = reducer(finishSeason(initialState(11)), { type: "season/next" });
    expect(next.standings).toHaveLength(ALL_TEAMS.length);
    expect(next.standings.every((t) => t.wins === 0 && t.losses === 0)).toBe(true);
    expect(next.playoff).toBeNull();
    expect(next.recaps).toHaveLength(0);
    expect(Object.keys(next.injuries)).toHaveLength(0);
    expect(next.nilBudget).toBeGreaterThanOrEqual(2_000_000);
    expect(next.scholarships).toBe(40 - next.players.length);
    expect(next.offseason).toBeNull();
  });

  test("Season 2 is a full 12-game season followed by the playoff", () => {
    let s = reducer(finishSeason(initialState(5)), { type: "season/next" });
    s = reducer(s, { type: "sim/toPlayoffs" });
    expect(s.week).toBe(PLAYOFF_START);
    const me = standingOf(s, USER_TEAM)!;
    expect(me.wins + me.losses).toBe(FINAL_WEEK);
    expect(s.recaps).toHaveLength(FINAL_WEEK);
    expect(s.playoff?.seeds).toHaveLength(24); // the 24-team era starts in 2027-28 (Season 2)
    s = finishSeason(s);
    expect(s.week).toBe(seasonDoneWeek(2));
    s = reducer(s, { type: "season/next" });
    expect(s.season).toBe(3);
    expect(s.history.map((h) => h.season)).toEqual([1, 2]);
  });

  test("press answers only move hype and media trust", () => {
    const s = reducer(finishSeason(initialState(9)), { type: "season/next" });
    const pressed = reducer(s, { type: "press/answer", choice: "match" });
    expect(pressed.nilBudget).toBe(s.nilBudget);
    expect(pressed.hype).toBeGreaterThan(s.hype);
  });
});

describe("saves", () => {
  test("a version 3 save is migrated to Season 1 instead of reset", () => {
    const v3 = { ...initialState(1), week: 12, version: 3 } as Partial<GameState>;
    delete v3.season;
    delete v3.schedule;
    delete v3.teamRatings;
    delete v3.history;
    const loaded = loadState(JSON.stringify(v3));
    expect(loaded.week).toBe(12);
    expect(loaded.season).toBe(1);
    expect(loaded.schedule[12]).toBeDefined();
    expect(STORAGE_KEY).toBe("portal-wars-v3");
  });
});
