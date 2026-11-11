// Season state and every action that changes it. Pure: (state, action) => state.

import {
  BYE_SEEDS, FINAL_WEEK, FIRST_WEEK, INITIAL_STANDINGS, PLAYOFF_FIELD, PORTAL, ROOK_ASK, ROOK_CURRENT,
  SCHEDULE, TEAMS, USER_TEAM, type Fixture, type TeamId,
} from "./data";
import { ageRoster, ALL_TEAMS, baseRatings, driftRatings, emptyReport, fillAndOrder, generateSchedule, type OffseasonReport, type Ratings } from "./season";
import * as Off from "./offseason";
import * as Rec from "./recruiting";
import { hashSeed, makeRng } from "./rng";
import {
  INITIAL_INJURIES, POS_LABEL, ROSTER, SIDE, STARTERS, initialDepth, isAvailable, ratingLossWithout, rookSignee,
  skillFor, starters, teamRatings, type Injury, type LineupInput, type Player, type Pos,
} from "./roster";
import { DEFAULT_PLAN, simulateGame, type GamePlan, type GameResult, type GameTimeRisk, type SimOptions, type StatLine } from "./sim";

export const STORAGE_KEY = "portal-wars-v3";
export const STATE_VERSION = 5;

// ---- Calendar ------------------------------------------------------------------
// Weeks 11-12 are the regular season, 13-16 the playoff rounds, 17 means the season is done.

export const PLAYOFF_START = FINAL_WEEK + 1;
export const PLAYOFF_ROUNDS = ["First round", "Quarterfinals", "Semifinals", "National championship"] as const;
export const SEASON_DONE = PLAYOFF_START + PLAYOFF_ROUNDS.length;

export const isPlayoffs = (s: GameState) => s.week >= PLAYOFF_START && s.week < SEASON_DONE;
export const seasonOver = (s: GameState) => s.week >= SEASON_DONE;
export const regularSeasonOver = (s: GameState) => s.week > FINAL_WEEK;
export const roundOf = (week: number) => week - PLAYOFF_START;

/** Saturday of each regular-season week, ending with rivalry week on Nov 28. */
export function weekDate(week: number) {
  const d = new Date(Date.UTC(2026, 10, 28) - (FINAL_WEEK - week) * 7 * 86_400_000);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Real-calendar label for a week: game dates in the season, round dates in the playoff. */
export function dateLabel(week: number) {
  if (week <= FINAL_WEEK) return `Sat, ${weekDate(week)}`;
  return ["Dec 18–19", "Dec 30–Jan 1", "Jan 14–15", "Jan 25"][week - FINAL_WEEK - 1] ?? "January";
}

export const KEY_DATES = {
  signingDay: "Dec 2–4",
  selectionDay: "Dec 6",
  portalWindow: "Jan 4–13",
};

export function weekLabel(week: number) {
  if (week <= FINAL_WEEK) return `Week ${week}`;
  if (week >= SEASON_DONE) return "Season complete";
  return PLAYOFF_ROUNDS[roundOf(week)];
}

// ---- Types ---------------------------------------------------------------------

export interface Standing {
  id: TeamId;
  wins: number;
  losses: number;
  sos: number;
  score: number; // committee score; higher ranks higher
  rank: number;
  prevRank: number;
}

export interface NewsItem {
  id: string;
  week: number;
  tag: "RECRUITING" | "RANKINGS" | "PORTAL" | "INJURY" | "LEAGUE" | "GAME" | "PLAYOFF";
  headline: string;
  when: string;
}

export interface Bid {
  playerId: string;
  amount: number;
  status: "pending" | "signed" | "lost";
}

export type PressChoice = "match" | "board" | "nocomment";

export interface Score {
  home: TeamId;
  away: TeamId;
  homeScore: number;
  awayScore: number;
}

export interface WeekRecap {
  season?: number;
  week: number;
  game?: GameResult; // missing when the user had no game (bye or eliminated)
  others: Score[];
  rankBefore: number;
  rankAfter: number;
  bidUpdates: { playerId: string; status: "signed" | "lost" }[]; // legacy (in-season bids no longer exist)
  injuryUpdates: { playerId: string; text: string }[];
  notes?: string[]; // recruiting and signing-day news for the recap
}

export interface SeasonSummary {
  season: number;
  wins: number;
  losses: number;
  rank: number;
  seed: number | null;
  finish: string; // "National champions", "Lost in the quarterfinals", "Missed the playoff"
  champion: TeamId | null;
}

export interface PlayoffGame extends Score {
  round: number;
  slot: number;
}

export interface GameState {
  version: number;
  seed: number; // per-save randomness so each new season plays out differently
  season: number;
  week: number;
  schedule: Record<number, Fixture[]>;
  teamRatings: Ratings; // every team's base ratings this season (the user's come from the depth chart)
  history: SeasonSummary[];
  lastOffseason: OffseasonReport | null; // built up during the offseason, shown at the start of the new season
  offseason: Off.OffseasonState | null; // non-null between the title game and the next season
  nilBudget: number;
  scholarships: number;
  hype: number;
  mediaTrust: number;
  /** Season 1 scenario: match Bayou's offer for Rook before Early Signing Day, or hold. */
  rook: { decision: null | "match" | "hold"; offer: number; interest: number; outcome: null | "signed" | "flipped" };
  recruiting: Rec.RecruitingState | null; // next year's class; signs on Early Signing Day
  press: PressChoice | null;
  bids: Bid[];
  scouts: string[];
  plan: GamePlan;
  players: Player[];
  depth: Record<Pos, string[]>;
  injuries: Record<string, Injury>;
  gameTime: Record<string, "start" | "rest">;
  seasonStats: Record<string, StatLine & { games: number }>;
  standings: Standing[];
  playoff: { seeds: TeamId[]; autoBids?: TeamId[]; games: PlayoffGame[] } | null;
  recaps: WeekRecap[];
  unseenRecap: boolean;
  news: NewsItem[];
}

export type Action =
  | { type: "rook/pay" }
  | { type: "rook/walk" }
  | { type: "press/answer"; choice: PressChoice }
  | { type: "portal/scout"; playerId: string }
  | { type: "plan/set"; plan: Partial<GamePlan> }
  | { type: "depth/move"; pos: Pos; playerId: string; dir: -1 | 1 }
  | { type: "gametime/set"; playerId: string; call: "start" | "rest" }
  | { type: "sim/week"; userGame?: GameResult } // userGame: a game the user just played live
  | { type: "sim/toPlayoffs" }
  | { type: "season/next" } // skip the rest of the offseason: the portal window closes with no more moves
  | { type: "offseason/start" }
  | { type: "offseason/departure"; playerId: string; call: "keep" | "release" }
  | { type: "offseason/bid"; id: string }
  | { type: "offseason/closePortal" }
  | { type: "recruit/pitch"; id: string }
  | { type: "recruit/visit"; id: string }
  | { type: "recruit/offer"; id: string }
  | { type: "recruit/withdraw"; id: string }
  | { type: "offseason/begin" }
  | { type: "recap/seen" }
  | { type: "reset" };

// ---- Initial state --------------------------------------------------------------

// Committee tuning. Tuned so the Week 11 Stallions sit near 60% playoff odds.
const SPACING = 0.8;
const WIN_BASE = 1;
const WIN_QUALITY = 9;
const LOSS_BASE = 4;
const LOSS_BAD = 12;

export function initialState(seed: number = Math.floor(Math.random() * 2 ** 31)): GameState {
  const standings: Standing[] = INITIAL_STANDINGS.map((s, i) => ({
    ...s,
    rank: i + 1,
    score: 100 - i * SPACING, // spacing keeps the starting order until results move it
  }));
  return {
    version: STATE_VERSION,
    seed,
    season: 1,
    week: FIRST_WEEK,
    schedule: SCHEDULE,
    teamRatings: baseRatings(),
    history: [],
    lastOffseason: null,
    offseason: null,
    nilBudget: 2_100_000,
    scholarships: 3,
    hype: 50,
    mediaTrust: 70,
    rook: { decision: null, offer: ROOK_CURRENT, interest: 68, outcome: null },
    // Joining late in Season 1: two recruiting weeks before Early Signing Day.
    recruiting: Rec.createBoard(ROSTER, seed, 2, 0.45, FINAL_WEEK - FIRST_WEEK + 1),
    press: null,
    bids: [],
    scouts: [],
    plan: DEFAULT_PLAN,
    players: ROSTER,
    depth: initialDepth(),
    injuries: INITIAL_INJURIES,
    gameTime: {},
    seasonStats: {},
    standings,
    playoff: null,
    recaps: [],
    unseenRecap: false,
    news: [
      { id: "n1", week: 11, tag: "RECRUITING", when: "8:22a", headline: "Bayou offers committed QB Jalen Rook $1.1M; his camp wants Lone Star to match before Early Signing Day" },
      { id: "n2", week: 11, tag: "RANKINGS", when: "7:05a", headline: "Committee holds Lone Star at No. 11; Rangers game now a de facto play-in" },
      { id: "n3", week: 11, tag: "PORTAL", when: "Yest", headline: "Heartland EDGE Kade Holloway tells teammates he'll enter the January transfer window" },
      { id: "n4", week: 11, tag: "INJURY", when: "Yest", headline: "Stallions RT Andre Marquez (ankle) limited in Thursday walkthrough — game-time call" },
      { id: "n5", week: 11, tag: "LEAGUE", when: "Yest", headline: "Private league \"DFW Dynasty\" invites Stallions GM — 8 of 12 slots filled" },
    ],
  };
}

// ---- Selectors ------------------------------------------------------------------

export const lineup = (s: GameState): LineupInput => ({ players: s.players, depth: s.depth, injuries: s.injuries, gameTime: s.gameTime });

export function standingOf(s: GameState, id: TeamId) {
  return s.standings.find((t) => t.id === id);
}

/** Season 1 "portal watch": players expected to enter the January window. They can't sign until then. */
export const watchList = () => PORTAL;

/** The Rook decision is open until Early Signing Day (right after the last regular-season week). */
export const rookOpen = (s: GameState) => s.season === 1 && s.week <= FINAL_WEEK && s.rook.decision === null;

/** Questionable players the user can make a game-time call on. */
export function questionable(s: GameState) {
  return s.players.filter((p) => s.injuries[p.id]?.status === "questionable");
}

/** Sim options for the user's side this week: lineup ratings, names and injury risks. */
export function userSimOptions(s: GameState): Pick<SimOptions, "ratings" | "skill" | "risks" | "plan" | "hype" | "userTeam"> {
  const inp = lineup(s);
  const st = starters(inp);
  const starterIds = new Set(Object.values(st).flat().map((p) => p.id));
  const risks: GameTimeRisk[] = questionable(s)
    .filter((p) => isAvailable(p.id, inp) && starterIds.has(p.id))
    .map((p) => ({ name: p.name, pos: p.pos, chance: 0.3, loss: ratingLossWithout(USER_TEAM, inp, p.id) }));
  return {
    userTeam: USER_TEAM,
    plan: s.plan,
    hype: s.hype,
    ratings: { ...s.teamRatings, [USER_TEAM]: teamRatings(USER_TEAM, inp) },
    skill: { [USER_TEAM]: skillFor(inp) },
    risks,
  };
}

/** The user's game this week, regular season or playoffs. */
export function currentUserFixture(s: GameState): (Fixture & { neutral?: boolean }) | undefined {
  if (s.week <= FINAL_WEEK) return s.schedule[s.week]?.find((f) => f.home === USER_TEAM || f.away === USER_TEAM);
  if (!isPlayoffs(s)) return undefined;
  return playoffFixtures(s, roundOf(s.week)).find((f) => f && (f.home === USER_TEAM || f.away === USER_TEAM)) ?? undefined;
}

export function scheduleFixture(s: GameState, week: number) {
  return s.schedule[week]?.find((f) => f.home === USER_TEAM || f.away === USER_TEAM);
}

/** First regular-season week on this season's schedule (11 in Season 1, 1 afterwards). */
export function firstWeek(s: GameState) {
  return Math.min(...Object.keys(s.schedule).map(Number));
}

// ---- Playoff bracket -------------------------------------------------------------

const ROUND_META = [
  { kickoff: "Dec 18–19", venue: "Campus site" },
  { kickoff: "Dec 30–Jan 1", venue: "Quarterfinal bowl" },
  { kickoff: "Jan 14–15", venue: "Semifinal bowl" },
  { kickoff: "Mon, Jan 25", venue: "Title game" },
];

/**
 * The 12-team field: the five highest-ranked conference champions get automatic bids, the next seven
 * highest-ranked teams are at-large, and everyone is seeded straight by ranking.
 * A conference champion here is the best record in its conference, ties broken by ranking.
 */
export function selectField(standings: Standing[]) {
  const confOf = (id: TeamId) => TEAMS[id].conf;
  const champs = new Map<string, Standing>();
  for (const t of standings) {
    const cur = champs.get(confOf(t.id));
    const better = !cur || t.wins - t.losses > cur.wins - cur.losses || (t.wins - t.losses === cur.wins - cur.losses && t.rank < cur.rank);
    if (better) champs.set(confOf(t.id), t);
  }
  const autoBids = [...champs.values()].sort((a, b) => a.rank - b.rank).slice(0, 5).map((t) => t.id);
  const atLarge = standings.filter((t) => !autoBids.includes(t.id)).slice(0, PLAYOFF_FIELD - autoBids.length).map((t) => t.id);
  const rankOf = new Map(standings.map((t) => [t.id, t.rank]));
  const seeds = [...autoBids, ...atLarge].sort((a, b) => rankOf.get(a)! - rankOf.get(b)!);
  return { seeds, autoBids };
}

/** Seed pairings for each round, as [higher seed, lower seed] slots. */
function roundPairs(s: GameState, round: number): ([TeamId | null, TeamId | null] | null)[] {
  const seeds = s.playoff?.seeds;
  if (!seeds) return [];
  const bySeed = (n: number) => seeds[n - 1];
  const winner = (r: number, slot: number) => {
    const g = s.playoff!.games.find((x) => x.round === r && x.slot === slot);
    return g ? (g.homeScore > g.awayScore ? g.home : g.away) : null;
  };
  // Slots are ordered so each game sits next to the one it feeds: R1 slot i -> QF slot i -> SF slot i/2.
  if (round === 0) return [[bySeed(8), bySeed(9)], [bySeed(5), bySeed(12)], [bySeed(7), bySeed(10)], [bySeed(6), bySeed(11)]];
  if (round === 1) return [[bySeed(1), winner(0, 0)], [bySeed(4), winner(0, 1)], [bySeed(2), winner(0, 2)], [bySeed(3), winner(0, 3)]];
  if (round === 2) return [[winner(1, 0), winner(1, 1)], [winner(1, 2), winner(1, 3)]];
  if (round === 3) return [[winner(2, 0), winner(2, 1)]];
  return [];
}

export function seedOf(s: GameState, id: TeamId) {
  const i = s.playoff?.seeds.indexOf(id) ?? -1;
  return i >= 0 ? i + 1 : null;
}

/** Fixtures for a round; null where a team is still to be decided. The better seed is listed at home. */
export function playoffFixtures(s: GameState, round: number): ((Fixture & { neutral: boolean; slot: number }) | null)[] {
  return roundPairs(s, round).map((pair, slot) => {
    if (!pair || !pair[0] || !pair[1]) return null;
    const [a, b] = pair;
    const [home, away] = (seedOf(s, a) ?? 99) <= (seedOf(s, b) ?? 99) ? [a, b] : [b, a];
    return { home, away, slot, neutral: round > 0, ...ROUND_META[round], label: PLAYOFF_ROUNDS[round] };
  });
}

export function champion(s: GameState): TeamId | null {
  const g = s.playoff?.games.find((x) => x.round === 3);
  return g ? (g.homeScore > g.awayScore ? g.home : g.away) : null;
}

export function userEliminated(s: GameState) {
  if (!s.playoff) return regularSeasonOver(s);
  if (!s.playoff.seeds.includes(USER_TEAM)) return true;
  return s.playoff.games.some((g) => (g.home === USER_TEAM || g.away === USER_TEAM) && (g.homeScore > g.awayScore ? g.away : g.home) === USER_TEAM);
}

// ---- Odds -----------------------------------------------------------------------

/**
 * Projected playoff odds for the user: Monte Carlo the rest of the season with a
 * logistic win model for speed, then check where the user's committee score lands.
 */
export function playoffOdds(s: GameState, assume?: "win" | "loss", runs = 600): number {
  if (regularSeasonOver(s)) return s.playoff?.seeds.includes(USER_TEAM) ? 1 : 0;
  const rng = makeRng(hashSeed("odds", s.week, s.standings.map((t) => t.score).join(",")));
  const mine = teamRatings(USER_TEAM, lineup(s));
  let made = 0;
  for (let i = 0; i < runs; i++) {
    let table = s.standings.map((t) => ({ ...t }));
    for (let w = s.week; w <= FINAL_WEEK; w++) {
      const results = (s.schedule[w] ?? []).map((f) => {
        const isUserNow = w === s.week && (f.home === USER_TEAM || f.away === USER_TEAM);
        let homeWins: boolean;
        if (isUserNow && assume) homeWins = (f.home === USER_TEAM) === (assume === "win");
        else homeWins = rng() < quickWinProb(s.teamRatings, f.home, f.away, mine);
        return { home: f.home, away: f.away, homeScore: homeWins ? 1 : 0, awayScore: homeWins ? 0 : 1 };
      });
      table = applyResults(table, results);
    }
    if (table.find((t) => t.id === USER_TEAM)!.rank <= PLAYOFF_FIELD) made++;
  }
  return made / runs;
}

function quickWinProb(ratings: Ratings, home: TeamId, away: TeamId, mine: { off: number; def: number }) {
  const total = (id: TeamId) => (id === USER_TEAM ? mine.off + mine.def : ratings[id].off + ratings[id].def);
  return 1 / (1 + Math.exp(-(total(home) - total(away) + 3) / 7));
}

// ---- Rankings ------------------------------------------------------------------

/** Apply a week of results to the committee table and re-rank. */
export function applyResults(table: Standing[], results: Score[]): Standing[] {
  const next = table.map((t) => ({ ...t, prevRank: t.rank }));
  const byId = new Map(next.map((t) => [t.id, t]));
  const quality = (id: TeamId) => {
    const t = byId.get(id);
    return t ? Math.max(0, 18 - t.rank) / 17 : 0; // 1 for #1, 0 for unranked
  };
  for (const g of results) {
    const winner = g.homeScore > g.awayScore ? g.home : g.away;
    const loser = winner === g.home ? g.away : g.home;
    const w = byId.get(winner);
    const l = byId.get(loser);
    const qW = quality(loser);
    const qL = quality(winner);
    const margin = Math.min(21, Math.abs(g.homeScore - g.awayScore));
    if (w) {
      w.wins++;
      w.score += WIN_BASE + qW * WIN_QUALITY + margin * 0.05;
      w.sos = round3(w.sos + (qW - 0.4) * 0.01);
    }
    if (l) {
      l.losses++;
      l.score -= LOSS_BASE + (1 - qL) * LOSS_BAD;
      l.sos = round3(l.sos + (qL - 0.4) * 0.01);
    }
  }
  next.sort((a, b) => b.score - a.score || a.prevRank - b.prevRank);
  next.forEach((t, i) => (t.rank = i + 1));
  return next;
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

// ---- Reducer -------------------------------------------------------------------

export function reducer(s: GameState, a: Action): GameState {
  switch (a.type) {
    case "reset":
      return initialState();

    case "rook/pay": {
      // Match Bayou's offer. The deal is a commitment for next season; the money is set aside now.
      if (!rookOpen(s) || s.nilBudget < ROOK_ASK) return s;
      return {
        ...s,
        nilBudget: s.nilBudget - ROOK_ASK,
        hype: clamp100(s.hype + 8),
        rook: { decision: "match", offer: ROOK_ASK, interest: 95, outcome: null },
        players: [...s.players, rookSignee(ROOK_ASK)],
        news: [news("RECRUITING", "Lone Star matches Bayou for Jalen Rook: \"I'm a Stallion. I'll sign on day one.\"", s.week), ...s.news],
      };
    }

    case "rook/walk": {
      // Hold at his current number and let his interest decide it on Signing Day.
      if (!rookOpen(s)) return s;
      return {
        ...s,
        hype: clamp100(s.hype - 3),
        rook: { ...s.rook, decision: "hold" },
        news: [news("RECRUITING", "Lone Star holds firm at $850K for Rook; Bayou keeps calling", s.week), ...s.news],
      };
    }

    case "press/answer": {
      if (s.press) return s;
      // The Rook storyline is only live in Season 1 before Signing Day; otherwise answers just move hype and trust.
      const open = rookOpen(s);
      let { hype, mediaTrust, nilBudget, rook } = s;
      if (a.choice === "match") {
        hype += 8;
        mediaTrust += 2;
        if (open) {
          nilBudget -= 50_000;
          rook = { ...rook, interest: Math.min(99, rook.interest + 9) };
        }
      } else if (a.choice === "board") {
        mediaTrust += 2;
        if (open) rook = { ...rook, interest: Math.max(1, rook.interest - 12) };
      } else {
        mediaTrust -= 5;
      }
      return { ...s, press: a.choice, hype: clamp100(hype), mediaTrust: clamp100(mediaTrust), nilBudget, rook };
    }

    case "portal/scout":
      return s.scouts.includes(a.playerId) ? s : { ...s, scouts: [...s.scouts, a.playerId] };

    case "plan/set":
      return { ...s, plan: { ...s.plan, ...a.plan } };

    case "depth/move": {
      const list = [...s.depth[a.pos]];
      const i = list.indexOf(a.playerId);
      const j = i + a.dir;
      if (i < 0 || j < 0 || j >= list.length) return s;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...s, depth: { ...s.depth, [a.pos]: list } };
    }

    case "gametime/set":
      if (s.injuries[a.playerId]?.status !== "questionable") return s;
      return { ...s, gameTime: { ...s.gameTime, [a.playerId]: a.call } };

    case "recap/seen":
      return { ...s, unseenRecap: false };

    case "sim/week":
      return simWeek(s, a.userGame);

    case "sim/toPlayoffs": {
      let next = s;
      while (next.week <= FINAL_WEEK) next = simWeek(next);
      return next;
    }

    case "season/next": {
      if (!seasonOver(s)) return s;
      let next = s.offseason ? s : startOffseason(s);
      if (next.offseason!.phase === "portal") next = reducer(next, { type: "offseason/closePortal" });
      return beginSeason(next);
    }

    case "offseason/start":
      return seasonOver(s) && !s.offseason ? startOffseason(s) : s;

    case "offseason/departure": {
      const off = s.offseason;
      const d = off?.departures.find((x) => x.playerId === a.playerId);
      if (!off || off.phase !== "portal" || !d || d.call === a.call) return s;
      // Keeping him costs an NIL raise now; changing your mind refunds it.
      const nilBudget = s.nilBudget + (d.call === "keep" ? d.keepCost : 0) - (a.call === "keep" ? d.keepCost : 0);
      if (nilBudget < 0) return s;
      const raise = a.call === "keep" ? d.keepCost : d.call === "keep" ? -d.keepCost : 0;
      const players = s.players.map((p) => (p.id === a.playerId ? { ...p, nil: p.nil + raise } : p));
      return { ...s, nilBudget, players, offseason: { ...off, departures: off.departures.map((x) => (x.playerId === a.playerId ? { ...x, call: a.call } : x)) } };
    }

    case "offseason/bid": {
      const off = s.offseason;
      const t = off?.pool.find((x) => x.id === a.id);
      if (!off || off.phase !== "portal" || !t || off.bids.some((b) => b.id === a.id)) return s;
      if (s.nilBudget < t.ask || Off.openSpots(s.players, off) < 1) return s;
      return { ...s, nilBudget: s.nilBudget - t.ask, offseason: { ...off, bids: [...off.bids, { id: t.id, amount: t.ask, status: "pending" }] } };
    }

    case "offseason/closePortal": {
      const off = s.offseason;
      if (!off || off.phase !== "portal") return s;
      const r = Off.closePortal(s.players, off, s.nilBudget, s.seed, s.season, s.hype, prestige(s));
      const keep = new Set(r.players.map((p) => p.id));
      const depth = Object.fromEntries(Object.entries(s.depth).map(([pos, ids]) => [pos, ids.filter((id) => keep.has(id))])) as GameState["depth"];
      return {
        ...s,
        players: r.players,
        depth,
        nilBudget: r.nil,
        offseason: r.off,
        lastOffseason: { ...s.lastOffseason!, transfersOut: r.transfersOut, transfersIn: r.transfersIn },
      };
    }

    case "recruit/pitch":
    case "recruit/visit": {
      const rec = s.recruiting;
      if (!rec || rec.signed || s.week > FINAL_WEEK) return s;
      const next = a.type === "recruit/pitch" ? Rec.pitch(rec, a.id, s.seed) : Rec.visit(rec, a.id, s.seed);
      return next === rec ? s : { ...s, recruiting: next };
    }

    case "recruit/offer":
    case "recruit/withdraw": {
      const rec = s.recruiting;
      if (!rec || rec.signed || s.week > FINAL_WEEK) return s;
      const r = a.type === "recruit/offer" ? Rec.offer(rec, a.id, s.nilBudget, Rec.openSpotsNextYear(s.players, rec)) : Rec.withdraw(rec, a.id, s.nilBudget);
      return r.rec === rec ? s : { ...s, nilBudget: r.nil, recruiting: r.rec };
    }

    case "offseason/begin":
      return s.offseason?.phase === "ready" ? beginSeason(s) : s;
  }
}

// ---- The weekly sim ---------------------------------------------------------------

function simWeek(s: GameState, liveGame?: GameResult): GameState {
  if (seasonOver(s)) return s;
  const week = s.week;
  const playoffRound = isPlayoffs(s) ? roundOf(week) : null;
  const fixtures = playoffRound === null ? (s.schedule[week] ?? []) : playoffFixtures(s, playoffRound).filter((f) => f !== null);
  const rankBefore = standingOf(s, USER_TEAM)!.rank;
  const userOpts = userSimOptions(s);

  let game: GameResult | undefined;
  const others: Score[] = [];
  const results: (Score & { slot?: number })[] = [];
  for (const f of fixtures) {
    const isUser = f.home === USER_TEAM || f.away === USER_TEAM;
    const played = isUser && liveGame && liveGame.home === f.home && liveGame.away === f.away;
    const g = played ? liveGame : simulateGame(f.home, f.away, hashSeed("game", s.seed, s.season, week, f.home, f.away), {
      ratings: s.teamRatings,
      ...(isUser ? userOpts : {}),
      neutral: (f as { neutral?: boolean }).neutral ?? false,
      fast: !isUser,
    });
    const score = { home: g.home, away: g.away, homeScore: g.homeScore, awayScore: g.awayScore };
    results.push({ ...score, slot: (f as { slot?: number }).slot });
    if (isUser) game = g;
    else others.push(score);
  }

  // Rankings only move in the regular season.
  const standings = playoffRound === null ? applyResults(s.standings, results) : s.standings;
  const rankAfter = standings.find((t) => t.id === USER_TEAM)!.rank;

  let playoff = s.playoff;
  if (playoffRound !== null && playoff) {
    playoff = { ...playoff, games: [...playoff.games, ...results.map((r) => ({ ...r, round: playoffRound, slot: r.slot! }))] };
  }
  if (week === FINAL_WEEK) {
    playoff = { ...selectField(standings), games: [] };
  }

  const rng = makeRng(hashSeed("week", s.seed, s.season, week, 0, game?.homeScore ?? 0));

  const bidUpdates: WeekRecap["bidUpdates"] = [];
  let { nilBudget, players, recruiting, rook } = s;
  const depth = s.depth;
  const notes: string[] = [];
  const recruitingNews: NewsItem[] = [];

  // Season 1: Rook decides on Early Signing Day, right after the last regular-season week.
  if (playoffRound === null && week === FINAL_WEEK && s.season === 1 && rook.outcome === null) {
    const holdChance = Math.min(0.6, Math.max(0.05, 0.3 + (rook.interest - 68) / 60 + (s.hype - 50) / 300));
    const signs = rook.decision === "match" || (nilBudget >= ROOK_CURRENT && rng() < holdChance);
    if (signs && rook.decision !== "match") {
      nilBudget -= ROOK_CURRENT;
      players = [...players, rookSignee(ROOK_CURRENT)];
    }
    rook = { ...rook, decision: rook.decision ?? "hold", outcome: signs ? "signed" : "flipped" };
    const text = signs ? "Jalen Rook signs with Lone Star on Early Signing Day." : "Jalen Rook flips to Bayou and signs with the Kings on Early Signing Day.";
    notes.push(text);
    recruitingNews.push(news("RECRUITING", text, week, s.season));
  }

  // Recruiting: each regular-season week passes on the board; the class signs after the last one.
  if (playoffRound === null && recruiting && !recruiting.signed) {
    recruiting = Rec.advanceWeek(recruiting, s.seed, s.season, week);
    if (week === FINAL_WEEK) {
      const r = Rec.signingDay(players, recruiting, nilBudget, s.seed);
      players = r.players;
      nilBudget = r.nil;
      recruiting = r.rec;
      const lost = r.rec.board.filter((p) => p.offered && p.status === "lost").length;
      notes.push(`Early Signing Day: ${r.signees.length} signed${lost ? `, ${lost} offered prospect${lost === 1 ? "" : "s"} went elsewhere` : ""}. Signees enroll after the season.`);
      if (r.signees.length) recruitingNews.push(news("RECRUITING", `Lone Star signs ${r.signees.length} on Early Signing Day`, week, s.season));
    }
  }

  // Injuries: heal, apply re-injuries, maybe add a new one.
  const injuryUpdates: WeekRecap["injuryUpdates"] = [];
  const injuries: Record<string, Injury> = {};
  const nameToId = new Map(s.players.map((p) => [p.name, p.id]));
  const reinjured = new Set((game?.reinjured ?? []).map((n) => nameToId.get(n)!));
  for (const [id, inj] of Object.entries(s.injuries)) {
    if (reinjured.has(id)) injuries[id] = { desc: inj.desc, status: "out", weeks: 2 };
    else if (inj.status === "out" && inj.weeks > 1) injuries[id] = { ...inj, weeks: inj.weeks - 1 };
    else {
      const p = s.players.find((x) => x.id === id)!;
      injuryUpdates.push({ playerId: id, text: `${p.pos} ${p.name} is healthy again.` });
    }
  }
  for (const id of reinjured) {
    const p = s.players.find((x) => x.id === id)!;
    injuryUpdates.push({ playerId: id, text: `${p.pos} ${p.name} re-aggravated the ${injuries[id].desc} — out 2 games.` });
  }
  const headlines: NewsItem[] = [];
  if (game && rng() < 0.38) {
    const pool = Object.values(starters(lineup(s)))
      .flat()
      .filter((p) => SIDE[p.pos] !== "st" && !injuries[p.id]);
    const p = pool[Math.floor(rng() * pool.length)];
    if (p) {
      const desc = ["ankle", "knee", "hamstring", "shoulder", "hand", "concussion protocol"][Math.floor(rng() * 6)];
      const roll = rng();
      const inj: Injury = roll < 0.5 ? { desc, status: "questionable", weeks: 0 } : { desc, status: "out", weeks: roll < 0.85 ? 1 : 2 };
      injuries[p.id] = inj;
      const text =
        inj.status === "questionable"
          ? `${p.pos} ${p.name} (${desc}) is questionable — game-time call next week.`
          : `${p.pos} ${p.name} (${desc}) is out ${inj.weeks} game${inj.weeks > 1 ? "s" : ""}.`;
      injuryUpdates.push({ playerId: p.id, text });
      headlines.push(news("INJURY", `Stallions ${POS_LABEL[p.pos].toLowerCase()} ${p.name} hurt (${desc})`, week, s.season));
    }
  }

  // Season stats for Stallions players.
  const seasonStats = { ...s.seasonStats };
  for (const line of game?.stats.filter((x) => x.team === USER_TEAM) ?? []) {
    const id = nameToId.get(line.name);
    if (!id) continue;
    const prev = seasonStats[id] ?? { name: line.name, team: USER_TEAM, pos: line.pos, games: 0 };
    const merged: StatLine & { games: number } = { ...prev, games: prev.games + 1 };
    for (const [k, v] of Object.entries(line)) {
      if (typeof v === "number") (merged as unknown as Record<string, number>)[k] = ((prev as unknown as Record<string, number>)[k] ?? 0) + v;
    }
    seasonStats[id] = merged;
  }

  // Headlines.
  const label = playoffRound === null ? `week ${week}` : PLAYOFF_ROUNDS[playoffRound].toLowerCase();
  if (game) {
    const opp = game.home === USER_TEAM ? game.away : game.home;
    const us = game.home === USER_TEAM ? game.homeScore : game.awayScore;
    const them = game.home === USER_TEAM ? game.awayScore : game.homeScore;
    const ot = game.overtime ? " in OT" : "";
    headlines.push(
      news(
        playoffRound === null ? "GAME" : "PLAYOFF",
        us > them
          ? playoffRound === 3
            ? `NATIONAL CHAMPIONS: Stallions beat ${TEAMS[opp].name} ${us}–${them}${ot}`
            : `Stallions top ${TEAMS[opp].name} ${us}–${them}${ot}${playoffRound !== null ? ` to win the ${label}` : ""}`
          : `${TEAMS[opp].name} ${playoffRound !== null ? "end Stallions' season" : "stun Stallions"} ${them}–${us}${ot}`,
        week,
        s.season,
      ),
    );
  }
  if (playoffRound === null) {
    headlines.push(
      news(
        "RANKINGS",
        rankAfter < rankBefore
          ? `Lone Star climbs to No. ${rankAfter} in committee rankings`
          : rankAfter > rankBefore
            ? `Lone Star slides to No. ${rankAfter} after ${label}`
            : `Committee holds Lone Star at No. ${rankAfter}`,
        week,
        s.season,
      ),
    );
  }
  if (week === FINAL_WEEK && playoff) {
    const seed = playoff.seeds.indexOf(USER_TEAM) + 1;
    headlines.push(news("PLAYOFF", seed ? `Selection day: Lone Star is the No. ${seed} seed` : "Selection day: Lone Star left out of the 12-team field", week, s.season));
  }
  if (playoffRound === 3 && results[0]) {
    const r = results[0];
    const champ = r.homeScore > r.awayScore ? r.home : r.away;
    if (champ !== USER_TEAM) headlines.push(news("PLAYOFF", `${TEAMS[champ].name} win the national championship`, week, s.season));
  }
  headlines.push(...recruitingNews);

  const userWon = game ? (game.home === USER_TEAM ? game.homeScore > game.awayScore : game.awayScore > game.homeScore) : null;

  return {
    ...s,
    week: week + 1,
    standings,
    playoff,
    nilBudget,
    players,
    depth,
    injuries,
    recruiting,
    rook,
    gameTime: {},
    seasonStats,
    hype: clamp100(s.hype + (userWon === null ? 0 : userWon ? 6 : -10)),
    press: null,
    recaps: [...s.recaps, { season: s.season, week, game, others, rankBefore, rankAfter, bidUpdates, injuryUpdates, notes }],
    unseenRecap: true,
    news: [...headlines.reverse(), ...s.news],
  };
}

function news(tag: NewsItem["tag"], headline: string, week: number, season = 1): NewsItem {
  const when = (season > 1 ? `S${season} ` : "") + (week > FINAL_WEEK ? "Post" : week === 0 ? "Pre" : `Wk ${week}`);
  return { id: `s${season}w${week}-${hashSeed(tag, headline).toString(36)}`, week, tag, headline, when };
}

const clamp100 = (x: number) => Math.max(0, Math.min(100, Math.round(x)));

// ---- Season to season -------------------------------------------------------------

/** How the user's season ended, for the history table. */
export function seasonSummary(s: GameState): SeasonSummary {
  const me = standingOf(s, USER_TEAM)!;
  const seed = seedOf(s, USER_TEAM);
  const champ = champion(s);
  let finish = "Missed the playoff";
  if (champ === USER_TEAM) finish = "National champions";
  else if (seed) {
    const loss = s.playoff?.games.find((g) => (g.home === USER_TEAM || g.away === USER_TEAM) && (g.homeScore > g.awayScore ? g.away : g.home) === USER_TEAM);
    finish = loss ? (loss.round === 3 ? "Lost in the title game" : `Lost in the ${PLAYOFF_ROUNDS[loss.round].toLowerCase()}`) : "Made the playoff";
  }
  return { season: s.season, wins: me.wins, losses: me.losses, rank: me.rank, seed, finish, champion: champ };
}

/** Program prestige (0-1) from the most recent finished season; drives recruiting interest and portal pull. */
export function prestige(s: GameState) {
  const last = s.history[s.history.length - 1];
  return last ? Off.prestigeFrom(last.finish, last.rank) : 0.4;
}

/** Roster spots: in the offseason, spots left this window; in season, spots that open up next year. */
export function rosterSpots(s: GameState) {
  return s.offseason ? Off.openSpots(s.players, s.offseason) : Rec.openSpotsNextYear(s.players, s.recruiting);
}

/**
 * Start the offseason: archive the season, graduate seniors and develop everyone else,
 * reshuffle the league, set next year's NIL budget, and open the January transfer window.
 */
export function startOffseason(s: GameState): GameState {
  const summary = seasonSummary(s);
  const nextSeason = s.season + 1;
  const { players, report } = ageRoster(s.players, s.seed, nextSeason);
  const ids = new Set(players.map((p) => p.id));
  const depth = Object.fromEntries(Object.entries(s.depth).map(([pos, list]) => [pos, list.filter((id) => ids.has(id))])) as GameState["depth"];
  // Signees who just enrolled join the depth chart now, ordered by rating.
  for (const p of report.enrolled) {
    if (depth[p.pos].includes(p.id)) continue;
    const list = [...depth[p.pos], p.id];
    const byId = new Map(players.map((x) => [x.id, x]));
    depth[p.pos] = list.sort((x, y) => byId.get(y)!.ovr - byId.get(x)!.ovr);
  }
  const playoffBonus = summary.finish === "National champions" ? 300_000 : summary.seed ? 100_000 : 0;
  return {
    ...s,
    history: [...s.history, summary],
    players,
    depth,
    injuries: {},
    gameTime: {},
    bids: [],
    scouts: [],
    teamRatings: driftRatings(s.teamRatings, s.seed, nextSeason),
    nilBudget: 2_000_000 + summary.wins * 25_000 + playoffBonus,
    lastOffseason: report,
    offseason: Off.openOffseason(players, depth, s.seed, nextSeason),
    unseenRecap: false,
    news: [news("PORTAL", `${report.graduated.length} seniors graduate; the January transfer window opens`, 0, nextSeason), ...s.news].slice(0, 40),
  };
}

/** Begin the next season: walk-ons fill gaps, then a new 12-week schedule and preseason poll. */
export function beginSeason(s: GameState): GameState {
  const season = s.season + 1;
  const { players, depth, walkOns } = fillAndOrder(s.players, s.depth, s.seed, season);
  const report = { ...(s.lastOffseason ?? emptyReport()), walkOns };
  const mine = teamRatings(USER_TEAM, { players, depth, injuries: {}, gameTime: {} });
  const prevRank = new Map(s.standings.map((t) => [t.id, t.rank]));

  // Preseason poll: team strength plus a little credit for last year's finish.
  const power = (id: TeamId) => {
    const r = id === USER_TEAM ? mine : s.teamRatings[id];
    return r.off + r.def + Math.max(0, 18 - (prevRank.get(id) ?? 25)) * 0.4;
  };
  const order = [...ALL_TEAMS].sort((a, b) => power(b) - power(a));
  const standings: Standing[] = order.map((id, i) => ({ id, wins: 0, losses: 0, sos: 0.5, score: 100 - i * SPACING, rank: i + 1, prevRank: i + 1 }));
  const myRank = standings.find((t) => t.id === USER_TEAM)!.rank;
  const newcomers = report.transfersIn.length + report.enrolled.length;

  return {
    ...s,
    season,
    week: 1,
    schedule: generateSchedule(hashSeed("season", s.seed, season)),
    lastOffseason: report,
    offseason: null,
    // Next year's class: the board opens with the season and signs in December.
    recruiting: Rec.createBoard(players, s.seed, season + 1, prestige(s), FINAL_WEEK),
    players,
    depth,
    injuries: {},
    gameTime: {},
    seasonStats: {},
    standings,
    playoff: null,
    recaps: [],
    unseenRecap: false,
    scholarships: Math.max(0, Rec.ROSTER_MAX - players.length),
    bids: [],
    scouts: [],
    press: null,
    hype: Math.round(50 + (s.hype - 50) * 0.5),
    news: [
      news("RANKINGS", `Preseason poll: Lone Star opens Season ${season} at No. ${myRank}`, 0, season),
      news("RECRUITING", `${newcomers} newcomers join the Stallions for Season ${season}`, 0, season),
      ...s.news,
    ].slice(0, 40),
  };
}

// ---- Selection -----------------------------------------------------------------

export function playoffField(s: GameState) {
  const ids = s.playoff?.seeds ?? s.standings.slice(0, PLAYOFF_FIELD).map((t) => t.id);
  return ids.map((id, i) => ({ ...standingOf(s, id)!, seed: i + 1, bye: i < BYE_SEEDS }));
}

/** Starters needed vs available, for warnings on the roster screen. */
export function shortPositions(s: GameState): Pos[] {
  const st = starters(lineup(s));
  return (Object.keys(STARTERS) as Pos[]).filter((pos) => st[pos].length < STARTERS[pos]);
}

// ---- Persistence ---------------------------------------------------------------

function migrateV4(old: GameState): GameState {
  const legacy = old as unknown as { rook: { decision: string | null; offer: number; interest: number }; offseason: (Off.OffseasonState & { phase: string }) | null; bids?: Bid[] };
  const past = old.season > 1 || old.week > FINAL_WEEK;
  const d = legacy.rook?.decision;
  const rook: GameState["rook"] = {
    decision: d === "paid" ? "match" : d === "walked" ? "hold" : null,
    offer: legacy.rook?.offer ?? ROOK_CURRENT,
    interest: legacy.rook?.interest ?? 68,
    outcome: d === "paid" ? (past ? "signed" : null) : d === "walked" || past ? "flipped" : null,
  };
  // In-season transfer bids no longer exist: refund anything still pending.
  const refund = (legacy.bids ?? []).filter((b) => b.status === "pending").reduce((n, b) => n + b.amount, 0);
  // Offseason recruiting moved into the season: an offseason stuck on recruiting skips to "ready".
  const offseason = legacy.offseason ? ({ ...legacy.offseason, phase: legacy.offseason.phase === "portal" ? "portal" : "ready" } as Off.OffseasonState) : null;
  const recruiting =
    old.week <= FINAL_WEEK && !old.offseason ? Rec.createBoard(old.players, old.seed, old.season + 1, 0.45, FINAL_WEEK - old.week + 1) : null;
  return { ...old, version: STATE_VERSION, rook, offseason, recruiting, bids: [], nilBudget: old.nilBudget + refund };
}

export function loadState(raw: string | null): GameState {
  if (!raw) return initialState();
  try {
    let parsed = JSON.parse(raw) as GameState;
    // Version 3 saves predate multiple seasons: they are Season 1 on the fixed schedule.
    if (parsed?.version === 3) {
      parsed = { ...parsed, version: STATE_VERSION, season: 1, schedule: SCHEDULE, teamRatings: baseRatings(), history: [], lastOffseason: null, offseason: null };
    }
    // Version 4 saves: Rook could "enter the portal", recruiting ran in the offseason, and Season 1 had in-season bids.
    if (parsed?.version === 4) parsed = migrateV4(parsed);
    // Saves from before the offseason update: no offseason field, and an older report shape.
    if (parsed && parsed.offseason === undefined) parsed = { ...parsed, offseason: null };
    if (parsed?.lastOffseason) parsed = { ...parsed, lastOffseason: { ...emptyReport(), ...parsed.lastOffseason } };
    if (parsed?.version !== STATE_VERSION || !Array.isArray(parsed.standings) || !parsed.depth || typeof parsed.seed !== "number") return initialState();
    return parsed;
  } catch {
    return initialState();
  }
}
