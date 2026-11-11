import { describe, expect, test } from "vitest";
import { isPowerConf, POWER_CONFS, TEAMS, USER_TEAM, type TeamId } from "../data";
import { ALL_TEAMS } from "../season";
import {
  champion, initialState, isPlayoffs, PLAYOFF_START, playoffFixtures, playoffFormat, reducer, roundOf, seasonDoneWeek, seasonOver, selectField,
  type GameState, type Standing,
} from "../state";

/** Play Season 1 and the offseason, then Season 2's regular season, landing on the 24-team bracket. */
function toSeason2Playoff(seed: number) {
  let s = initialState(seed);
  while (!seasonOver(s)) s = reducer(s, { type: "sim/week" });
  s = reducer(s, { type: "season/next" });
  s = reducer(s, { type: "sim/toPlayoffs" });
  return s;
}

describe("league", () => {
  test("40 teams: four Power conferences of eight and two smaller conferences of four", () => {
    expect(ALL_TEAMS).toHaveLength(40);
    const byConf = new Map<string, number>();
    for (const id of ALL_TEAMS) byConf.set(TEAMS[id].conf, (byConf.get(TEAMS[id].conf) ?? 0) + 1);
    for (const c of POWER_CONFS) expect(byConf.get(c)).toBe(8);
    expect([...byConf.entries()].filter(([c]) => !isPowerConf(c)).map(([, n]) => n)).toEqual([4, 4]);
  });
});

describe("playoff format by season", () => {
  test("Season 1 (2026) keeps the 12-team format; 2027-28 onward is 24 teams", () => {
    expect(playoffFormat(1)).toMatchObject({ size: 12, byes: 4 });
    expect(playoffFormat(1).rounds).toHaveLength(4);
    expect(playoffFormat(2)).toMatchObject({ size: 24, byes: 8, neutralFrom: 2 });
    expect(playoffFormat(2).rounds).toEqual(["First round", "Second round", "Quarterfinals", "Semifinals", "National championship"]);
  });

  test("24-team field: four Power champions + the best non-Power team automatically, 19 at-large, straight seeding", () => {
    // Everyone 8-4 except one champion per conference, so champions are clear; the best non-Power team is ranked 30th.
    const order = [...ALL_TEAMS];
    const table: Standing[] = order.map((id, i) => ({ id, wins: 8, losses: 4, sos: 0.5, score: 100 - i, rank: i + 1, prevRank: i + 1 }));
    const nonPower = table.filter((t) => !isPowerConf(TEAMS[t.id].conf));
    const { seeds, autoBids } = selectField(table, 2);
    expect(seeds).toHaveLength(24);
    expect(autoBids).toHaveLength(5);
    const powerChamps = autoBids.filter((id) => isPowerConf(TEAMS[id].conf));
    expect(new Set(powerChamps.map((id) => TEAMS[id].conf)).size).toBe(4);
    const best = nonPower.sort((a, b) => a.rank - b.rank)[0];
    expect(autoBids).toContain(best.id);
    expect(seeds).toContain(best.id); // even if ranked outside the top 24
    const rank = new Map(table.map((t) => [t.id, t.rank]));
    const ranks = seeds.map((id) => rank.get(id)!);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
});

describe("24-team bracket", () => {
  test("first round is 9 v 24 … 16 v 17 on campus; bye seeds host the second round; five rounds to a champion", () => {
    let s = toSeason2Playoff(11);
    expect(s.season).toBe(2);
    expect(isPlayoffs(s)).toBe(true);
    const seeds = s.playoff!.seeds;
    expect(seeds).toHaveLength(24);
    const seedOf = (id: TeamId) => seeds.indexOf(id) + 1;

    const r1 = playoffFixtures(s, 0);
    expect(r1).toHaveLength(8);
    const pairs = r1.map((f) => [seedOf(f!.home), seedOf(f!.away)].sort((a, b) => a - b));
    expect(pairs.map(([a, b]) => a + b).every((n) => n === 33)).toBe(true); // 9+24, 10+23, ... 16+17
    expect(r1.every((f) => !f!.neutral && f!.venue === "Campus site")).toBe(true);
    expect(playoffFixtures(s, 1).every((f) => f === null)).toBe(true);

    s = reducer(s, { type: "sim/week" });
    const r2 = playoffFixtures(s, 1);
    expect(r2).toHaveLength(8);
    expect(r2.every((f) => f && !f.neutral)).toBe(true);
    expect(r2.map((f) => seedOf(f!.home)).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    // Seed 1 faces the 16/17 winner, seed 8 the 9/24 winner.
    const vs1 = r2.find((f) => seedOf(f!.home) === 1)!;
    expect([16, 17]).toContain(seedOf(vs1.away));

    s = reducer(s, { type: "sim/week" });
    expect(playoffFixtures(s, 2).every((f) => f && f.neutral)).toBe(true); // quarterfinals at bowls
    while (!seasonOver(s)) s = reducer(s, { type: "sim/week" });
    expect(s.week).toBe(seasonDoneWeek(2));
    expect(s.playoff!.games).toHaveLength(8 + 8 + 4 + 2 + 1);
    expect(seeds).toContain(champion(s));
    expect(roundOf(seasonDoneWeek(2) - 1)).toBe(4);
  });

  test("Season 1 is still the 12-team bracket", () => {
    let s: GameState = initialState(4);
    while (s.week < PLAYOFF_START) s = reducer(s, { type: "sim/week" });
    expect(s.playoff!.seeds).toHaveLength(12);
    expect(playoffFixtures(s, 0)).toHaveLength(4);
    while (!seasonOver(s)) s = reducer(s, { type: "sim/week" });
    expect(s.playoff!.games).toHaveLength(4 + 4 + 2 + 1);
    expect(USER_TEAM).toBe("stallions");
  });
});
