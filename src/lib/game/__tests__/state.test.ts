import { describe, expect, test } from "vitest";
import { FINAL_WEEK, USER_TEAM } from "../data";
import { starters, teamRatings } from "../roster";
import {
  champion, currentUserFixture, initialState, isPlayoffs, lineup, loadState, PLAYOFF_START, playoffFixtures, playoffOdds,
  reducer, rookOpen, SEASON_DONE, seasonOver, selectField, standingOf, userSimOptions, type GameState, type Standing,
} from "../state";

const simAll = (s: GameState) => {
  while (!seasonOver(s)) s = reducer(s, { type: "sim/week" });
  return s;
};

describe("season state", () => {
  test("matching Bayou for Rook spends $1.1M once; he's a signee who doesn't play this season", () => {
    let s = reducer(initialState(), { type: "rook/pay" });
    expect(s.nilBudget).toBe(1_000_000);
    expect(s.rook).toMatchObject({ decision: "match", outcome: null });
    expect(s.players.find((p) => p.id === "rook")?.yr).toBe("HS");
    expect(starters(lineup(s)).QB.map((p) => p.id)).toEqual(["whitfield"]);
    expect(rookOpen(s)).toBe(false); // the alert goes away once you decide
    s = reducer(s, { type: "rook/pay" });
    expect(s.nilBudget).toBe(1_000_000);
    // He signs on Early Signing Day, right after the last regular-season week.
    while (s.week <= FINAL_WEEK) s = reducer(s, { type: "sim/week" });
    expect(s.rook.outcome).toBe("signed");
    expect(s.players.filter((p) => p.id === "rook")).toHaveLength(1);
  });

  test("holding (or not deciding) keeps the money and resolves on Early Signing Day", () => {
    let held = 0;
    let flipped = 0;
    for (let seed = 1; seed <= 30; seed++) {
      let s = initialState(seed);
      if (seed % 2) s = reducer(s, { type: "rook/walk" });
      expect(s.nilBudget).toBe(2_100_000);
      s = reducer(s, { type: "sim/week" });
      expect(rookOpen(s)).toBe(s.rook.decision === null); // still open in Week 12 if undecided
      s = reducer(s, { type: "sim/week" });
      expect(rookOpen(s)).toBe(false); // the deadline has passed
      expect(s.rook.outcome).not.toBeNull();
      if (s.rook.outcome === "signed") {
        held++;
        expect(s.players.find((p) => p.id === "rook")?.nil).toBe(850_000);
      } else {
        flipped++;
        expect(s.players.some((p) => p.id === "rook")).toBe(false);
      }
      // Too late to match now.
      expect(reducer(s, { type: "rook/pay" })).toBe(s);
    }
    expect(held).toBeGreaterThan(0);
    expect(flipped).toBeGreaterThan(held); // holding is a gamble
  });

  test("no in-season transfers: the portal watch list can be scouted but not bid on", () => {
    let s = initialState();
    s = reducer(s, { type: "portal/scout", playerId: "cole" });
    expect(s.scouts).toContain("cole");
    expect((s as unknown as { bids: unknown[] }).bids).toHaveLength(0);
    s = reducer(s, { type: "sim/week" });
    expect(s.players.some((p) => p.source === "portal")).toBe(false);
  });

  test("simming a week plays the game, advances the week and re-ranks", () => {
    const s0 = initialState();
    const s1 = reducer(s0, { type: "sim/week" });
    expect(s1.week).toBe(s0.week + 1);
    expect(s1.recaps).toHaveLength(1);
    expect(s1.unseenRecap).toBe(true);
    const me0 = standingOf(s0, USER_TEAM)!;
    const me1 = standingOf(s1, USER_TEAM)!;
    expect(me1.wins + me1.losses).toBe(me0.wins + me0.losses + 1);
    const games = s1.standings.reduce((n, t) => n + t.wins + t.losses, 0) - s0.standings.reduce((n, t) => n + t.wins + t.losses, 0);
    expect(games).toBe(s0.standings.length);
  });

  test("playoff odds rise with a win and fall with a loss", () => {
    const s = initialState();
    expect(playoffOdds(s, "win")).toBeGreaterThan(playoffOdds(s));
    expect(playoffOdds(s, "loss")).toBeLessThan(0.35);
  });

  test("bad saved data falls back to a fresh season", () => {
    expect(loadState("{oops").week).toBe(initialState().week);
    expect(loadState(JSON.stringify({ version: 2 })).week).toBe(initialState().week);
  });
});

describe("roster and depth chart", () => {
  test("promoting a backup over a starter changes who starts and lowers the rating", () => {
    const s0 = initialState();
    const s1 = reducer(s0, { type: "depth/move", pos: "QB", playerId: "rusk", dir: -1 });
    expect(starters(lineup(s1)).QB[0].id).toBe("rusk");
    expect(teamRatings(USER_TEAM, lineup(s1)).off).toBeLessThan(teamRatings(USER_TEAM, lineup(s0)).off - 3);
  });

  test("the default healthy lineup matches the team's base ratings", () => {
    const s = { ...initialState(), injuries: {} };
    const r = teamRatings(USER_TEAM, lineup(s));
    expect(r.off).toBeCloseTo(84, 5);
    expect(r.def).toBeCloseTo(81, 5);
  });

  test("questionable players sit unless you start them, and starting them adds a risk", () => {
    let s = initialState();
    expect(starters(lineup(s)).OT.map((p) => p.id)).toEqual(["hart", "ivers"]);
    expect(userSimOptions(s).risks).toHaveLength(0);
    s = reducer(s, { type: "gametime/set", playerId: "marquez", call: "start" });
    expect(starters(lineup(s)).OT.map((p) => p.id)).toEqual(["hart", "marquez"]);
    expect(userSimOptions(s).risks).toMatchObject([{ name: "Andre Marquez", chance: 0.3 }]);
  });

  test("Stallions season stats accumulate from simmed games", () => {
    const s = reducer(initialState(), { type: "sim/week" });
    expect(s.seasonStats.whitfield?.games).toBe(1);
    expect(s.seasonStats.whitfield?.att).toBeGreaterThan(0);
  });
});

describe("playoffs", () => {
  test("the five highest-ranked conference champions get automatic bids; seeding is straight by rank", () => {
    // Rank order with a low-ranked conference champion (Mesa League: rangers are #17 but 11-1 in this table).
    const order = ["gulf", "summit", "bluegrass", "prairie", "canyon", "lakeshore", "piedmont", "metro", "desert", "bayou", "pacific", "heartland", "capitol", "iron", "coastline", "stallions", "rangers"] as const;
    const table: Standing[] = order.map((id, i) => ({ id, wins: id === "rangers" ? 11 : 9, losses: id === "rangers" ? 1 : 3, sos: 0.5, score: 100 - i, rank: i + 1, prevRank: i + 1 }));
    const { seeds, autoBids } = selectField(table);
    expect(seeds).toHaveLength(12);
    expect(autoBids).toHaveLength(5);
    // Every auto-bid team is in, even if ranked outside the top 12.
    for (const id of autoBids) expect(seeds).toContain(id);
    // Seeds are in ranking order.
    const rank = new Map(table.map((t) => [t.id, t.rank]));
    expect(seeds.map((id) => rank.get(id)!)).toEqual([...seeds.map((id) => rank.get(id)!)].sort((a, b) => a - b));
  });

  test("the final regular-season week sets a 12-team field and the playoffs run to a champion", () => {
    let s = initialState();
    while (s.week <= FINAL_WEEK) s = reducer(s, { type: "sim/week" });
    expect(s.week).toBe(PLAYOFF_START);
    expect(isPlayoffs(s)).toBe(true);
    expect(s.playoff?.seeds).toHaveLength(12);
    expect(new Set(s.playoff!.seeds).size).toBe(12);
    expect(playoffFixtures(s, 0).every((f) => f !== null)).toBe(true);
    expect(playoffFixtures(s, 1).every((f) => f === null)).toBe(true);

    s = simAll(s);
    expect(s.week).toBe(SEASON_DONE);
    expect(s.playoff!.games).toHaveLength(4 + 4 + 2 + 1);
    expect(champion(s)).not.toBeNull();
    expect(s.playoff!.seeds).toContain(champion(s));
    // Further sims do nothing.
    expect(reducer(s, { type: "sim/week" })).toBe(s);
  });

  test("first-round home team is the better seed and later rounds are neutral", () => {
    let s = initialState();
    while (s.week <= FINAL_WEEK) s = reducer(s, { type: "sim/week" });
    const seeds = s.playoff!.seeds;
    const r1 = playoffFixtures(s, 0);
    expect(r1.map((f) => [seeds.indexOf(f!.home) + 1, seeds.indexOf(f!.away) + 1])).toEqual([
      [8, 9],
      [5, 12],
      [7, 10],
      [6, 11],
    ]);
    expect(r1.every((f) => !f!.neutral)).toBe(true);
    s = reducer(s, { type: "sim/week" });
    const qf = playoffFixtures(s, 1);
    expect(qf.every((f) => f && f.neutral)).toBe(true);
    // Top seeds host the quarterfinal next to the first-round game that feeds it.
    expect(qf.map((f) => seeds.indexOf(f!.home) + 1)).toEqual([1, 4, 2, 3]);
  });

  test("the user only has a playoff fixture when they are in that round", () => {
    let s = initialState();
    while (s.week <= FINAL_WEEK) s = reducer(s, { type: "sim/week" });
    const seed = s.playoff!.seeds.indexOf(USER_TEAM) + 1;
    const f = currentUserFixture(s);
    if (seed >= 5) expect(f).toBeDefined();
    else expect(f).toBeUndefined();
  });
});
