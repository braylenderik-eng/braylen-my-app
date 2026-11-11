import { describe, expect, test } from "vitest";
import { FINAL_WEEK, TEAMS, type TeamId } from "../data";
import { declineOffers, endSeason, newCareer, START_SECURITY, takeJob, tierRank } from "../career";
import { CONFERENCES, inRegion, isRivalry, makeRivalries, recordRivalries, rivalryOf } from "../league";
import { programProfile, type CoachProfile } from "../program";
import { ALL_TEAMS, generateSchedule } from "../season";
import { careerBlocked, createDynasty, initialState, loadState, reducer, seasonOver, STATE_VERSION, type GameState } from "../state";

const coach: CoachProfile = { name: "Ray Dalton", almaMater: "", offense: "spread", defense: "multiple" };
const byTier = (tier: string) => ALL_TEAMS.filter((id) => programProfile(id).tier === tier);

describe("rivalries", () => {
  test("every team has exactly one rival, in its conference, with a trophy", () => {
    const rs = makeRivalries(9);
    expect(rs).toHaveLength(ALL_TEAMS.length / 2);
    const seen = rs.flatMap((r) => [r.a, r.b]);
    expect(new Set(seen).size).toBe(ALL_TEAMS.length);
    for (const r of rs) {
      expect(TEAMS[r.a].conf).toBe(TEAMS[r.b].conf);
      expect(r.trophy.length).toBeGreaterThan(4);
      expect([r.a, r.b]).toContain(r.holder);
    }
    expect(new Set(rs.map((r) => r.trophy)).size).toBe(rs.length);
    expect(makeRivalries(9)).toEqual(rs); // reproducible per save
  });

  test("the classic start keeps the Stallions–Rangers rivalry", () => {
    const r = rivalryOf(initialState(3).rivalries, "stallions")!;
    expect([r.a, r.b]).toEqual(["stallions", "rangers"]);
  });

  test("rivalry week: everyone plays their rival in Week 12, and nobody plays twice", () => {
    const rs = makeRivalries(4);
    const sched = generateSchedule(77, rs);
    expect(sched[FINAL_WEEK]).toHaveLength(ALL_TEAMS.length / 2);
    for (const f of sched[FINAL_WEEK]) {
      expect(isRivalry(rs, f.home, f.away)).toBe(true);
      expect(f.label).toMatch(/^Rivalry · /);
    }
    const pairs = Object.values(sched).flat().map((f) => [f.home, f.away].sort().join("-"));
    expect(new Set(pairs).size).toBe(pairs.length);
    for (let w = 1; w <= FINAL_WEEK; w++) expect(new Set(sched[w].flatMap((f) => [f.home, f.away])).size).toBe(ALL_TEAMS.length);
  });

  test("results move the series and the trophy", () => {
    const [r] = makeRivalries(1);
    const loser = r.holder;
    const winner = loser === r.a ? r.b : r.a;
    const [next] = recordRivalries([r], 2, [{ home: winner, away: loser, homeScore: 24, awayScore: 21 }]);
    expect(next.holder).toBe(winner);
    expect(next.series[winner]).toBe(r.series[winner] + 1);
    expect(next.last).toEqual({ season: 2, winner, score: "24–21" });
  });
});

describe("conference identity", () => {
  test("every conference has an identity and a home region", () => {
    for (const id of ALL_TEAMS) expect(CONFERENCES[TEAMS[id].conf]).toBeDefined();
    expect(inRegion("stallions", "Austin, TX")).toBe(true);
    expect(inRegion("stallions", "Denver, CO")).toBe(false);
  });

  test("home-region prospects lean your way", () => {
    const board = createDynasty(coach, "stallions", 12).recruiting!.board;
    expect(board.some((p) => p.local)).toBe(true);
    expect(board.every((p) => p.local === inRegion("stallions", p.hometown))).toBe(true);
  });
});

describe("career", () => {
  const rebuild = byTier("Rebuild")[0];
  const contender = byTier("Contender")[0];

  test("job security moves with results; two hot seats get you fired", () => {
    let c = newCareer(contender, 1);
    expect(c.security).toBe(START_SECURITY);
    c = endSeason(c, contender, 1, { wins: 5, losses: 7, expectation: "Hot seat", playoff: false, champion: false }, 1);
    expect(c.status).toBe("active");
    expect(c.security).toBe(START_SECURITY - 35);
    c = endSeason(c, contender, 2, { wins: 4, losses: 8, expectation: "Hot seat", playoff: false, champion: false }, 1);
    expect(c.status).toBe("fired");
    expect(c.offers.length).toBeGreaterThan(0);
    for (const o of c.offers) expect(tierRank(programProfile(o.team).tier)).toBeLessThan(tierRank(programProfile(contender).tier));
    expect(c.stints[0]).toMatchObject({ wins: 9, losses: 15 });
    expect(declineOffers(c).status).toBe("over");
  });

  test("a big season brings offers from bigger programs", () => {
    const c = endSeason(newCareer(rebuild, 1), rebuild, 1, { wins: 10, losses: 2, expectation: "Exceeded expectations", playoff: true, champion: false }, 5);
    expect(c.offers).toHaveLength(2);
    for (const o of c.offers) expect(tierRank(programProfile(o.team).tier)).toBeGreaterThan(0);
    const moved = takeJob(c, c.offers[0].team, 2);
    expect(moved.stints).toHaveLength(2);
    expect(moved.stints[0].to).toBe(1);
    expect(moved.stints[1]).toMatchObject({ team: c.offers[0].team, from: 2, to: null });
  });

  test("in a dynasty: accept an offer, inherit the new program, keep the history", () => {
    let s: GameState = createDynasty(coach, rebuild, 31);
    while (!seasonOver(s)) s = reducer(s, { type: "sim/week" });
    s = reducer(s, { type: "offseason/start" });
    // Force an offer to test the hand-off regardless of how the season went.
    const target = contender as TeamId;
    s = { ...s, career: { ...s.career!, status: "active", offers: [{ team: target, reason: "test" }] } };
    s = reducer(s, { type: "career/accept", team: target });
    expect(s.team).toBe(target);
    expect(s.program).toEqual(programProfile(target));
    expect(s.players.every((p) => p.id.startsWith(`${target}-`))).toBe(true);
    expect(s.offseason).not.toBeNull();
    expect(s.career!.stints.map((x) => x.team)).toEqual([rebuild, target]);
    s = reducer(s, { type: "season/next" });
    expect(s.season).toBe(2);
    expect(s.week).toBe(1);
    expect(s.history[0].team).toBe(rebuild);
  });

  test("fired: the season can't start until you take a job or walk away", () => {
    let s: GameState = createDynasty(coach, contender, 8);
    while (!seasonOver(s)) s = reducer(s, { type: "sim/week" });
    s = reducer(s, { type: "offseason/start" });
    s = { ...s, career: { ...s.career!, status: "fired", security: 0, offers: [{ team: rebuild, reason: "test" }] } };
    expect(careerBlocked(s)).toBe(true);
    expect(reducer(s, { type: "season/next" }).season).toBe(1);
    const out = reducer(s, { type: "career/decline" });
    expect(out.career!.status).toBe("over");
    expect(reducer(out, { type: "season/next" }).season).toBe(1);
  });

  test("rivalry week shows up in a dynasty's schedule", () => {
    const s = createDynasty(coach, rebuild, 2);
    const f = s.schedule[FINAL_WEEK].find((x) => x.home === rebuild || x.away === rebuild)!;
    expect(isRivalry(s.rivalries, f.home, f.away)).toBe(true);
  });

  test("version 7 saves gain rivalries and a career", () => {
    const old = { ...createDynasty(coach, rebuild, 6), version: 7 } as Partial<GameState>;
    delete old.rivalries;
    delete old.career;
    const s = loadState(JSON.stringify(old));
    expect(s.version).toBe(STATE_VERSION);
    expect(s.rivalries).toHaveLength(ALL_TEAMS.length / 2);
    expect(s.career?.status).toBe("active");
  });
});
