// Season state and every action that changes it. Pure: (state, action) => state.

import {
  BYE_SEEDS, FINAL_WEEK, FIRST_WEEK, INITIAL_STANDINGS, PLAYOFF_FIELD, PORTAL, ROOK_ASK, ROOK_PORTAL,
  SCHEDULE, TEAMS, USER_TEAM, type Fixture, type PortalPlayer, type TeamId,
} from "./data";
import { ageRoster, ALL_TEAMS, baseRatings, driftRatings, emptyReport, fillAndOrder, generateSchedule, type OffseasonReport, type Ratings } from "./season";
import * as Off from "./offseason";
import { hashSeed, makeRng } from "./rng";
import {
  INITIAL_INJURIES, POS_LABEL, ROSTER, SIDE, STARTERS, initialDepth, isAvailable, playerFromPortal, ratingLossWithout,
  skillFor, starters, teamRatings, type Injury, type LineupInput, type Player, type Pos,
} from "./roster";
import { DEFAULT_PLAN, simulateGame, type GamePlan, type GameResult, type GameTimeRisk, type SimOptions, type StatLine } from "./sim";

export const STORAGE_KEY = "portal-wars-v3";
export const STATE_VERSION = 4;

// ---- Calendar ------------------------------------------------------------------
// Weeks 11-12 are the regular season, 13-16 the playoff rounds, 17 means the season is done.

export const PLAYOFF_START = FINAL_WEEK + 1;
export const PLAYOFF_ROUNDS = ["First round", "Quarterfinals", "Semifinals", "National championship"] as const;
export const SEASON_DONE = PLAYOFF_START + PLAYOFF_ROUNDS.length;

export const isPlayoffs = (s: GameState) => s.week >= PLAYOFF_START && s.week < SEASON_DONE;
export const seasonOver = (s: GameState) => s.week >= SEASON_DONE;
export const regularSeasonOver = (s: GameState) => s.week > FINAL_WEEK;
export const roundOf = (week: number) => week - PLAYOFF_START;

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
  bidUpdates: { playerId: string; status: "signed" | "lost" }[];
  injuryUpdates: { playerId: string; text: string }[];
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
  rook: { decision: null | "paid" | "walked"; offer: number; interest: number };
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
  playoff: { seeds: TeamId[]; games: PlayoffGame[] } | null;
  recaps: WeekRecap[];
  unseenRecap: boolean;
  news: NewsItem[];
}

export type Action =
  | { type: "rook/pay" }
  | { type: "rook/walk" }
  | { type: "press/answer"; choice: PressChoice }
  | { type: "portal/scout"; playerId: string }
  | { type: "portal/bid"; playerId: string }
  | { type: "plan/set"; plan: Partial<GamePlan> }
  | { type: "depth/move"; pos: Pos; playerId: string; dir: -1 | 1 }
  | { type: "gametime/set"; playerId: string; call: "start" | "rest" }
  | { type: "sim/week" }
  | { type: "sim/toPlayoffs" }
  | { type: "season/next" } // skip the offseason: let the portal and recruiting resolve with no moves
  | { type: "offseason/start" }
  | { type: "offseason/departure"; playerId: string; call: "keep" | "release" }
  | { type: "offseason/bid"; id: string }
  | { type: "offseason/closePortal" }
  | { type: "recruit/pitch"; id: string }
  | { type: "recruit/visit"; id: string }
  | { type: "recruit/offer"; id: string }
  | { type: "recruit/withdraw"; id: string }
  | { type: "recruit/endRound" }
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
    rook: { decision: null, offer: 850_000, interest: 68 },
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
      { id: "n1", week: 11, tag: "RECRUITING", when: "8:22a", headline: "Rook texts Stallions — wants $1.1M or he enters the portal Friday" },
      { id: "n2", week: 11, tag: "RANKINGS", when: "7:05a", headline: "Committee holds Lone Star at No. 11; Rangers game now a de facto play-in" },
      { id: "n3", week: 11, tag: "PORTAL", when: "Yest", headline: "EDGE Kade Holloway hits portal; Stallions scouts already en route" },
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

/** Season 1's transfer window. Later seasons' windows arrive with the offseason portal update. */
export function portalBoard(s: GameState): PortalPlayer[] {
  if (s.season > 1) return [];
  return s.rook.decision === "walked" ? [ROOK_PORTAL, ...PORTAL] : PORTAL;
}

export function findPortalPlayer(id: string) {
  return id === ROOK_PORTAL.id ? ROOK_PORTAL : PORTAL.find((p) => p.id === id);
}

export function canBid(s: GameState, p: PortalPlayer) {
  if (s.bids.some((b) => b.playerId === p.id)) return { ok: false, reason: "Bid filed" };
  if (!p.biddable && !s.scouts.includes(p.id)) return { ok: false, reason: "Scout first" };
  if (s.scholarships < 1) return { ok: false, reason: "No scholarships left" };
  if (s.nilBudget < p.ask) return { ok: false, reason: "Not enough NIL" };
  return { ok: true, reason: "" };
}

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
  { kickoff: "Sat 12:00 PM ET", venue: "Campus site" },
  { kickoff: "Jan 1 · 4:00 PM ET", venue: "Quarterfinal bowl" },
  { kickoff: "Jan 9 · 7:30 PM ET", venue: "Semifinal bowl" },
  { kickoff: "Jan 19 · 7:30 PM ET", venue: "Title game" },
];

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
      if (s.season > 1 || s.rook.decision || s.nilBudget < ROOK_ASK || s.scholarships < 1) return s;
      return {
        ...s,
        nilBudget: s.nilBudget - ROOK_ASK,
        scholarships: s.scholarships - 1,
        hype: s.hype + 10,
        rook: { decision: "paid", offer: ROOK_ASK, interest: 93 },
        players: [...s.players, playerFromPortal(ROOK_PORTAL, ROOK_ASK)],
        news: [news("RECRUITING", "Rook commits to Lone Star after $1.1M offer: \"I'm a Stallion\"", s.week), ...s.news],
      };
    }

    case "rook/walk": {
      if (s.season > 1 || s.rook.decision) return s;
      return {
        ...s,
        hype: s.hype - 6,
        rook: { ...s.rook, decision: "walked", interest: 6 },
        news: [news("PORTAL", "Five-star QB Jalen Rook enters the portal after Stallions hold the line", s.week), ...s.news],
      };
    }

    case "press/answer": {
      if (s.press) return s;
      // The Rook storyline only exists in Season 1; afterwards answers just move hype and trust.
      const d = s.season > 1 ? "closed" : s.rook.decision;
      let { hype, mediaTrust, nilBudget, rook } = s;
      if (a.choice === "match") {
        hype += 8;
        mediaTrust += d === "walked" ? 4 : 2;
        if (!d) {
          nilBudget -= 50_000;
          rook = { ...rook, interest: Math.min(99, rook.interest + 9) };
        }
      } else if (a.choice === "board") {
        mediaTrust += 2;
        if (!d) rook = { ...rook, interest: Math.max(1, rook.interest - 12) };
      } else {
        mediaTrust -= 5;
      }
      return { ...s, press: a.choice, hype: clamp100(hype), mediaTrust: clamp100(mediaTrust), nilBudget, rook };
    }

    case "portal/scout":
      return s.scouts.includes(a.playerId) ? s : { ...s, scouts: [...s.scouts, a.playerId] };

    case "portal/bid": {
      const p = findPortalPlayer(a.playerId);
      if (!p || !canBid(s, p).ok || seasonOver(s)) return s;
      return {
        ...s,
        nilBudget: s.nilBudget - p.ask,
        scholarships: s.scholarships - 1,
        bids: [...s.bids, { playerId: p.id, amount: p.ask, status: "pending" }],
      };
    }

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
      return simWeek(s);

    case "sim/toPlayoffs": {
      let next = s;
      while (next.week <= FINAL_WEEK) next = simWeek(next);
      return next;
    }

    case "season/next": {
      if (!seasonOver(s)) return s;
      let next = s.offseason ? s : startOffseason(s);
      if (next.offseason!.phase === "portal") next = reducer(next, { type: "offseason/closePortal" });
      while (next.offseason!.phase === "recruiting") next = reducer(next, { type: "recruit/endRound" });
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
      const off = s.offseason;
      if (!off || off.phase !== "recruiting") return s;
      const next = a.type === "recruit/pitch" ? Off.pitch(off, a.id, s.seed) : Off.visit(off, a.id, s.seed);
      return next === off ? s : { ...s, offseason: next };
    }

    case "recruit/offer":
    case "recruit/withdraw": {
      const off = s.offseason;
      if (!off || off.phase !== "recruiting") return s;
      const r = a.type === "recruit/offer" ? Off.offer(off, a.id, s.nilBudget, Off.openSpots(s.players, off)) : Off.withdraw(off, a.id, s.nilBudget);
      return r.off === off ? s : { ...s, nilBudget: r.nil, offseason: r.off };
    }

    case "recruit/endRound": {
      const off = s.offseason;
      if (!off || off.phase !== "recruiting") return s;
      const r = Off.endRound(s.players, off, s.nilBudget, s.seed, s.season);
      return {
        ...s,
        players: r.players,
        nilBudget: r.nil,
        offseason: r.off,
        lastOffseason: r.off.phase === "ready" ? { ...s.lastOffseason!, recruits: r.recruits } : s.lastOffseason,
      };
    }

    case "offseason/begin":
      return s.offseason?.phase === "ready" ? beginSeason(s) : s;
  }
}

// ---- The weekly sim ---------------------------------------------------------------

function simWeek(s: GameState): GameState {
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
    const g = simulateGame(f.home, f.away, hashSeed("game", s.seed, s.season, week, f.home, f.away), {
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
    playoff = { seeds: standings.slice(0, PLAYOFF_FIELD).map((t) => t.id), games: [] };
  }

  const rng = makeRng(hashSeed("week", s.seed, s.season, week, s.bids.length, game?.homeScore ?? 0));

  // Portal bids resolve at the end of the week; signings join the depth chart by rating.
  const bidUpdates: WeekRecap["bidUpdates"] = [];
  let { nilBudget, scholarships, players, depth } = s;
  const bids = s.bids.map((b) => {
    if (b.status !== "pending") return b;
    const p = findPortalPlayer(b.playerId)!;
    const chance = Math.min(0.92, Math.max(0.15, 0.85 - p.rivals * 0.06 + (s.hype - 50) / 200));
    const status = rng() < chance ? ("signed" as const) : ("lost" as const);
    if (status === "lost") {
      nilBudget += b.amount;
      scholarships += 1;
    } else {
      const pl = playerFromPortal(p, b.amount);
      players = [...players, pl];
      const byId = new Map(players.map((x) => [x.id, x]));
      const list = [...depth[pl.pos], pl.id].sort((x, y) => byId.get(y)!.ovr - byId.get(x)!.ovr);
      depth = { ...depth, [pl.pos]: list };
    }
    bidUpdates.push({ playerId: b.playerId, status });
    return { ...b, status };
  });

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
  for (const u of bidUpdates) {
    const name = findPortalPlayer(u.playerId)!.name;
    headlines.push(news("PORTAL", u.status === "signed" ? `${name} signs with the Stallions` : `${name} picks another school; NIL returned`, week, s.season));
  }

  const userWon = game ? (game.home === USER_TEAM ? game.homeScore > game.awayScore : game.awayScore > game.homeScore) : null;

  return {
    ...s,
    week: week + 1,
    standings,
    playoff,
    nilBudget,
    scholarships,
    bids,
    players,
    depth,
    injuries,
    gameTime: {},
    seasonStats,
    hype: clamp100(s.hype + (userWon === null ? 0 : userWon ? 6 : -10)),
    press: null,
    recaps: [...s.recaps, { season: s.season, week, game, others, rankBefore, rankAfter, bidUpdates, injuryUpdates }],
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

/** Roster spots left under the cap: during the offseason this also counts pending bids and offers. */
export function rosterSpots(s: GameState) {
  return s.offseason ? Off.openSpots(s.players, s.offseason) : Off.ROSTER_MAX - s.players.length;
}

/**
 * Start the offseason: archive the season, graduate seniors and develop everyone else,
 * reshuffle the league, set next year's NIL budget, and open the portal window and recruiting board.
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
    offseason: Off.openOffseason(players, depth, s.seed, nextSeason, Off.prestigeFrom(summary.finish, summary.rank)),
    unseenRecap: false,
    news: [news("RECRUITING", `Offseason opens: ${report.graduated.length} seniors graduate and the portal window opens`, 0, nextSeason), ...s.news].slice(0, 40),
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
  const newcomers = report.transfersIn.length + report.recruits.length + report.enrolled.length;

  return {
    ...s,
    season,
    week: 1,
    schedule: generateSchedule(hashSeed("season", s.seed, season)),
    lastOffseason: report,
    offseason: null,
    players,
    depth,
    injuries: {},
    gameTime: {},
    seasonStats: {},
    standings,
    playoff: null,
    recaps: [],
    unseenRecap: false,
    scholarships: Math.max(0, Off.ROSTER_MAX - players.length),
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

export function loadState(raw: string | null): GameState {
  if (!raw) return initialState();
  try {
    let parsed = JSON.parse(raw) as GameState;
    // Version 3 saves predate multiple seasons: they are Season 1 on the fixed schedule.
    if (parsed?.version === 3) {
      parsed = { ...parsed, version: STATE_VERSION, season: 1, schedule: SCHEDULE, teamRatings: baseRatings(), history: [], lastOffseason: null, offseason: null };
    }
    // Saves from before the offseason update: no offseason field, and an older report shape.
    if (parsed && parsed.offseason === undefined) parsed = { ...parsed, offseason: null };
    if (parsed?.lastOffseason) parsed = { ...parsed, lastOffseason: { ...emptyReport(), ...parsed.lastOffseason } };
    if (parsed?.version !== STATE_VERSION || !Array.isArray(parsed.standings) || !parsed.depth || typeof parsed.seed !== "number") return initialState();
    return parsed;
  } catch {
    return initialState();
  }
}
