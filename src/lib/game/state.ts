// Season state and every action that changes it. Pure: (state, action) => state.

import {
  FINAL_WEEK, FIRST_WEEK, INITIAL_STANDINGS, isPowerConf, PORTAL, POWER_CONFS, USER_TEAM,
  SCHEDULE, TEAMS, type Fixture, type TeamId,
} from "./data";
import { ageRoster, ALL_TEAMS, baseRatings, driftRatings, emptyReport, fillAndOrder, generateSchedule, type OffseasonReport, type Ratings } from "./season";
import * as Off from "./offseason";
import * as Rec from "./recruiting";
import * as Ev from "./events";
import { DEFENSE_STYLES, expectationsVerdict, OFFENSE_STYLES, programProfile, schemeEdge, schemeFit, type CoachProfile, type ProgramProfile } from "./program";
import { hashSeed, makeRng } from "./rng";
import {
  INITIAL_INJURIES, POS_LABEL, ROSTER, rosterFor, SIDE, STARTERS, initialDepth, isAvailable, ratingLossWithout,
  skillFor, starters, teamRatings, type Injury, type LineupInput, type Player, type Pos,
} from "./roster";
import { DEFAULT_PLAN, simulateGame, type GamePlan, type GameResult, type GameTimeRisk, type SimOptions, type StatLine } from "./sim";

export const STORAGE_KEY = "portal-wars-v3";
export const STATE_VERSION = 7;

// ---- Calendar and playoff format ------------------------------------------------
// Season N is the (2025 + N) college football season. Season 1 (2026) uses the 12-team playoff;
// from the 2027-28 season the playoff is 24 teams (announced Nov 9, 2026).
// Regular-season weeks end at FINAL_WEEK; playoff rounds follow, one "week" each.

export const PLAYOFF_START = FINAL_WEEK + 1;

export interface PlayoffFormat {
  size: number;
  byes: number;
  rounds: string[];
  short: string[]; // week-strip labels
  neutralFrom: number; // first round played at a neutral (bowl) site
  dates: string[];
}

export function playoffFormat(season: number): PlayoffFormat {
  if (season <= 1) {
    return {
      size: 12,
      byes: 4,
      rounds: ["First round", "Quarterfinals", "Semifinals", "National championship"],
      short: ["R1", "QF", "SF", "Final"],
      neutralFrom: 1,
      dates: ["Dec 18–19", "Dec 30–Jan 1", "Jan 14–15", "Jan 25"],
    };
  }
  return {
    size: 24,
    byes: 8,
    rounds: ["First round", "Second round", "Quarterfinals", "Semifinals", "National championship"],
    short: ["R1", "R2", "QF", "SF", "Final"],
    neutralFrom: 2,
    dates: ["Early Dec", "Mid-Dec", "New Year's", "2nd week of Jan", "Late Jan"],
  };
}

/** Kept for the 12-team (Season 1) bracket; use playoffFormat(season) for anything season-aware. */
export const PLAYOFF_ROUNDS = playoffFormat(1).rounds;

export const seasonDoneWeek = (season: number) => PLAYOFF_START + playoffFormat(season).rounds.length;
export const titleWeek = (season: number) => seasonDoneWeek(season) - 1;
export const isPlayoffs = (s: GameState) => s.week >= PLAYOFF_START && s.week < seasonDoneWeek(s.season);
export const seasonOver = (s: GameState) => s.week >= seasonDoneWeek(s.season);
export const regularSeasonOver = (s: GameState) => s.week > FINAL_WEEK;
export const roundOf = (week: number) => week - PLAYOFF_START;
/** @deprecated season-dependent: use seasonDoneWeek(season). Season 1 value, for old callers. */
export const SEASON_DONE = seasonDoneWeek(1);

/** Saturday after Thanksgiving (rivalry week) of the season's year. */
function rivalrySaturday(season: number) {
  const year = 2025 + season;
  const nov1 = new Date(Date.UTC(year, 10, 1)).getUTCDay(); // 0 = Sunday
  const firstThu = 1 + ((4 - nov1 + 7) % 7);
  return Date.UTC(year, 10, firstThu + 21 + 2);
}

/** Saturday of each regular-season week, ending with rivalry week. */
export function weekDate(week: number, season = 1) {
  const d = new Date(rivalrySaturday(season) - (FINAL_WEEK - week) * 7 * 86_400_000);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Real-calendar label for a week: game dates in the season, round dates in the playoff. */
export function dateLabel(week: number, season = 1) {
  if (week <= FINAL_WEEK) return `Sat, ${weekDate(week, season)}`;
  return playoffFormat(season).dates[week - PLAYOFF_START] ?? "January";
}

/** Signing Day, Selection Day and the transfer window. Exact dates are known for 2026-27. */
export function keyDates(season: number) {
  return season <= 1
    ? { signingDay: "Dec 2–4", selectionDay: "Dec 6", portalWindow: "Jan 4–13" }
    : { signingDay: "early December", selectionDay: "after rivalry week", portalWindow: "early January" };
}
export const KEY_DATES = keyDates(1);

export function weekLabel(week: number, season = 1) {
  if (week <= FINAL_WEEK) return `Week ${week}`;
  if (week >= seasonDoneWeek(season)) return "Season complete";
  return playoffFormat(season).rounds[roundOf(week)];
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
  target?: number; // regular-season win target
  expectation?: string; // "Met expectations", "Hot seat", ...
}

export interface PlayoffGame extends Score {
  round: number;
  slot: number;
}

export interface GameState {
  version: number;
  seed: number; // per-save randomness so each new season plays out differently
  team: TeamId; // the program you run
  coach: CoachProfile | null; // null for the classic Lone Star start
  program: ProgramProfile;
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
  /** In-season scenarios: open ones need a decision; the log keeps what happened. */
  scenarios: { open: Ev.Scenario[]; log: Ev.ResolvedScenario[] };
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
  | { type: "scenario/choose"; id: string; option: string }
  | { type: "dynasty/create"; coach: CoachProfile; team: TeamId; seed?: number }
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

/**
 * Season 1 joins late, so the previous staff left a couple of commitments on the board:
 * prospects with offers out who currently lean your way.
 */
function withCommitments(rec: Rec.RecruitingState): Rec.RecruitingState {
  const board = rec.board.map((p, i) => {
    if (i === 0) return { ...p, name: "Jalen Rook", pos: "QB" as const, hometown: "Austin, TX", offered: true, you: 72, them: 60, ask: 850_000 };
    if (i === 3) return { ...p, offered: true, you: Math.max(p.you, p.them + 8) };
    return p;
  });
  return { ...rec, board };
}

export function initialState(seed: number = Math.floor(Math.random() * 2 ** 31)): GameState {
  const standings: Standing[] = INITIAL_STANDINGS.map((s, i) => ({
    ...s,
    rank: i + 1,
    score: 100 - i * SPACING, // spacing keeps the starting order until results move it
  }));
  const s: GameState = {
    version: STATE_VERSION,
    seed,
    team: USER_TEAM,
    coach: null,
    program: programProfile(USER_TEAM),
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
    scenarios: { open: [], log: [] },
    // Joining late in Season 1: two recruiting weeks before Early Signing Day.
    recruiting: withCommitments(Rec.createBoard(ROSTER, seed, 2, 0.45, FINAL_WEEK - FIRST_WEEK + 1)),
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
      { id: "n1", week: 11, tag: "RECRUITING", when: "8:22a", headline: "New staff inherits two commitments in next year's class; Early Signing Day is Dec 2–4" },
      { id: "n2", week: 11, tag: "RANKINGS", when: "7:05a", headline: "Committee holds Lone Star at No. 11; Rangers game now a de facto play-in" },
      { id: "n3", week: 11, tag: "PORTAL", when: "Yest", headline: "Heartland EDGE Kade Holloway tells teammates he'll enter the January transfer window" },
      { id: "n4", week: 11, tag: "INJURY", when: "Yest", headline: "Stallions RT Andre Marquez (ankle) limited in Thursday walkthrough — game-time call" },
      { id: "n5", week: 11, tag: "LEAGUE", when: "Yest", headline: "Private league \"DFW Dynasty\" invites Stallions GM — 8 of 12 slots filled" },
    ],
  };
  return openScenario(s, true);
}

// ---- New dynasty -------------------------------------------------------------------

/** Preseason poll: team strength plus a little credit for last year's finish. */
function preseasonStandings(team: TeamId, mine: { off: number; def: number }, ratings: Ratings, prevRank: Map<TeamId, number>): Standing[] {
  const power = (id: TeamId) => {
    const r = id === team ? mine : ratings[id];
    return r.off + r.def + Math.max(0, 18 - (prevRank.get(id) ?? 25)) * 0.4;
  };
  const order = [...ALL_TEAMS].sort((a, b) => power(b) - power(a));
  return order.map((id, i) => ({ id, wins: 0, losses: 0, sos: 0.5, score: 100 - i * SPACING, rank: i + 1, prevRank: i + 1 }));
}

/**
 * Start a dynasty from the setup flow: any program, Season 1 (the 2026 season) from Week 1, with the
 * coach's schemes as the default game plan and next year's recruiting board already open.
 */
export function createDynasty(coach: CoachProfile, team: TeamId, seed: number = Math.floor(Math.random() * 2 ** 31)): GameState {
  const program = programProfile(team);
  const players = rosterFor(team, seed);
  const depth = initialDepth(players);
  const teamRatingsAll = baseRatings();
  const mine = teamRatings(team, { players, depth, injuries: {}, gameTime: {} });
  const standings = preseasonStandings(team, mine, teamRatingsAll, new Map(INITIAL_STANDINGS.map((t, i) => [t.id, i + 1])));
  const myRank = standings.find((t) => t.id === team)!.rank;
  const name = TEAMS[team].name;
  const s: GameState = {
    ...initialState(seed),
    team,
    coach,
    program,
    week: 1,
    schedule: generateSchedule(hashSeed("season", seed, 1)),
    teamRatings: teamRatingsAll,
    players,
    depth,
    injuries: {},
    standings,
    nilBudget: program.baseBudget,
    scholarships: Math.max(0, Rec.ROSTER_MAX - players.length),
    plan: { offense: OFFENSE_STYLES[coach.offense].plan, defense: DEFENSE_STYLES[coach.defense].plan },
    recruiting: Rec.createBoard(players, seed, 2, program.prestige, FINAL_WEEK, team, schemeFit(coach)),
    scenarios: { open: [], log: [] },
    news: [
      { id: "new-1", week: 1, tag: "LEAGUE", when: "Pre", headline: `${name} hire ${coach.name} as head coach` },
      { id: "new-2", week: 1, tag: "RANKINGS", when: "Pre", headline: `Preseason poll: ${name} open at No. ${myRank}; expectations: ${program.winTarget} wins` },
    ],
  };
  return openScenario(s, true);
}

// ---- Selectors ------------------------------------------------------------------

export const lineup = (s: GameState): LineupInput => ({ players: s.players, depth: s.depth, injuries: s.injuries, gameTime: s.gameTime });

export function standingOf(s: GameState, id: TeamId) {
  return s.standings.find((t) => t.id === id);
}

/** Season 1 "portal watch": players expected to enter the January window. They can't sign until then. */
export const watchList = () => PORTAL;

/** The slice of the save a scenario can read and change. */
export function world(s: GameState): Ev.World {
  const f = s.week <= FINAL_WEEK ? s.schedule[s.week]?.find((x) => x.home === s.team || x.away === s.team) : undefined;
  return {
    season: s.season,
    week: s.week,
    finalWeek: FINAL_WEEK,
    homeGame: f?.home === s.team,
    players: s.players,
    depth: s.depth,
    injuries: s.injuries,
    recruiting: s.recruiting,
    nilBudget: s.nilBudget,
    hype: s.hype,
    mediaTrust: s.mediaTrust,
  };
}

/** Maybe open a new scenario for the current week. */
function openScenario(s: GameState, force = false): GameState {
  const sc = Ev.maybeCreate(world(s), s.seed, s.scenarios.open, force);
  if (!sc) return s;
  return { ...s, scenarios: { ...s.scenarios, open: [...s.scenarios.open, sc] } };
}

/** Resolve one scenario with a choice (or its default), applying its effects. */
function resolveScenario(s: GameState, id: string, option: string | null, auto: boolean): { state: GameState; entry: Ev.ResolvedScenario | null } {
  const sc = s.scenarios.open.find((x) => x.id === id);
  if (!sc) return { state: s, entry: null };
  const choice = option && sc.options.some((o) => o.id === option) ? option : sc.defaultOption;
  const { patch, outcome } = Ev.resolve(world(s), sc, choice, s.seed);
  const entry: Ev.ResolvedScenario = { id: sc.id, kind: sc.kind, title: sc.title, choice: sc.options.find((o) => o.id === choice)!.label, outcome, week: s.week, auto };
  return {
    state: {
      ...s,
      ...patch,
      scenarios: { open: s.scenarios.open.filter((x) => x.id !== id), log: [entry, ...s.scenarios.log].slice(0, 40) },
      news: [news(sc.kind === "flip" || sc.kind === "visit" ? "RECRUITING" : sc.kind === "discipline" ? "INJURY" : "LEAGUE", `${sc.title} — ${outcome}`, s.week, s.season), ...s.news],
    },
    entry,
  };
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
    .map((p) => ({ name: p.name, pos: p.pos, chance: 0.3, loss: ratingLossWithout(s.team, inp, p.id) }));
  return {
    userTeam: s.team,
    plan: s.plan,
    hype: s.hype,
    ratings: { ...s.teamRatings, [s.team]: withEdge(teamRatings(s.team, inp), schemeEdge(s.coach, s.plan)) },
    skill: { [s.team]: skillFor(inp) },
    risks,
  };
}

function withEdge(r: { off: number; def: number }, e: { off: number; def: number }) {
  return { off: r.off + e.off, def: r.def + e.def };
}

/** The user's game this week, regular season or playoffs. */
export function currentUserFixture(s: GameState): (Fixture & { neutral?: boolean }) | undefined {
  if (s.week <= FINAL_WEEK) return s.schedule[s.week]?.find((f) => f.home === s.team || f.away === s.team);
  if (!isPlayoffs(s)) return undefined;
  return playoffFixtures(s, roundOf(s.week)).find((f) => f && (f.home === s.team || f.away === s.team)) ?? undefined;
}

export function scheduleFixture(s: GameState, week: number) {
  return s.schedule[week]?.find((f) => f.home === s.team || f.away === s.team);
}

/** First regular-season week on this season's schedule (11 in Season 1, 1 afterwards). */
export function firstWeek(s: GameState) {
  return Math.min(...Object.keys(s.schedule).map(Number));
}

// ---- Playoff bracket -------------------------------------------------------------

/** Standard bracket order of the bye seeds, so each column lines up with the next. */
function byeOrder(byes: number) {
  return byes === 8 ? [1, 8, 4, 5, 2, 7, 3, 6] : [1, 4, 2, 3];
}

/**
 * The playoff field. Season 1 (12 teams): the five highest-ranked conference champions get automatic
 * bids, seven at-large. From 2027-28 (24 teams): the four Power conference champions and the
 * highest-ranked team from the other conferences get automatic bids, 19 at-large. Either way, seeding
 * is straight by ranking. With no conference title games, a champion is the best record in its
 * conference, ties broken by ranking.
 */
export function selectField(standings: Standing[], season = 1) {
  const { size } = playoffFormat(season);
  const rankOf = new Map(standings.map((t) => [t.id, t.rank]));
  const champs = new Map<string, Standing>();
  for (const t of standings) {
    const conf = TEAMS[t.id].conf;
    const cur = champs.get(conf);
    const better = !cur || t.wins - t.losses > cur.wins - cur.losses || (t.wins - t.losses === cur.wins - cur.losses && t.rank < cur.rank);
    if (better) champs.set(conf, t);
  }
  let autoBids: TeamId[];
  if (size === 12) {
    autoBids = [...champs.values()].sort((a, b) => a.rank - b.rank).slice(0, 5).map((t) => t.id);
  } else {
    const power = POWER_CONFS.map((c) => champs.get(c)?.id).filter((x): x is TeamId => !!x);
    const group = standings.filter((t) => !isPowerConf(TEAMS[t.id].conf)).sort((a, b) => a.rank - b.rank)[0];
    autoBids = group ? [...power, group.id] : power;
  }
  const atLarge = standings.filter((t) => !autoBids.includes(t.id)).sort((a, b) => a.rank - b.rank).slice(0, size - autoBids.length).map((t) => t.id);
  const seeds = [...autoBids, ...atLarge].sort((a, b) => rankOf.get(a)! - rankOf.get(b)!);
  return { seeds, autoBids };
}

/**
 * Pairings for each round, as [team, team] slots. Round 0 is the first round (non-bye seeds), round 1
 * puts the bye seeds against round-0 winners, then winners pair off until the title game.
 */
function roundPairs(s: GameState, round: number): ([TeamId | null, TeamId | null] | null)[] {
  const seeds = s.playoff?.seeds;
  if (!seeds) return [];
  const { byes } = playoffFormat(s.season);
  const bySeed = (n: number) => seeds[n - 1] ?? null;
  const winner = (r: number, slot: number) => {
    const g = s.playoff!.games.find((x) => x.round === r && x.slot === slot);
    return g ? (g.homeScore > g.awayScore ? g.home : g.away) : null;
  };
  const order = byeOrder(byes);
  // The first-round game feeding bye seed t is (2*byes + 1 - t) vs (2*byes + t).
  if (round === 0) return order.map((t) => [bySeed(2 * byes + 1 - t), bySeed(2 * byes + t)]);
  if (round === 1) return order.map((t, i) => [bySeed(t), winner(0, i)]);
  const prev = byes >> (round - 2); // games in the previous round
  const out: [TeamId | null, TeamId | null][] = [];
  for (let i = 0; i < prev; i += 2) out.push([winner(round - 1, i), winner(round - 1, i + 1)]);
  return out;
}

export function seedOf(s: GameState, id: TeamId) {
  const i = s.playoff?.seeds.indexOf(id) ?? -1;
  return i >= 0 ? i + 1 : null;
}

/** Fixtures for a round; null where a team is still to be decided. The better seed is listed at home. */
export function playoffFixtures(s: GameState, round: number): ((Fixture & { neutral: boolean; slot: number }) | null)[] {
  const fmt = playoffFormat(s.season);
  return roundPairs(s, round).map((pair, slot) => {
    if (!pair || !pair[0] || !pair[1]) return null;
    const [a, b] = pair;
    const [home, away] = (seedOf(s, a) ?? 99) <= (seedOf(s, b) ?? 99) ? [a, b] : [b, a];
    const neutral = round >= fmt.neutralFrom;
    const venue = !neutral ? "Campus site" : round === fmt.rounds.length - 1 ? "Title game" : round === fmt.rounds.length - 2 ? "Semifinal bowl" : "Quarterfinal bowl";
    return { home, away, slot, neutral, kickoff: fmt.dates[round], venue, label: fmt.rounds[round] };
  });
}

export function champion(s: GameState): TeamId | null {
  const last = playoffFormat(s.season).rounds.length - 1;
  const g = s.playoff?.games.find((x) => x.round === last);
  return g ? (g.homeScore > g.awayScore ? g.home : g.away) : null;
}

export function userEliminated(s: GameState) {
  if (!s.playoff) return regularSeasonOver(s);
  if (!s.playoff.seeds.includes(s.team)) return true;
  return s.playoff.games.some((g) => (g.home === s.team || g.away === s.team) && (g.homeScore > g.awayScore ? g.away : g.home) === s.team);
}

// ---- Odds -----------------------------------------------------------------------

/**
 * Projected playoff odds for the user: Monte Carlo the rest of the season with a
 * logistic win model for speed, then check where the user's committee score lands.
 */
export function playoffOdds(s: GameState, assume?: "win" | "loss", runs = 600): number {
  if (regularSeasonOver(s)) return s.playoff?.seeds.includes(s.team) ? 1 : 0;
  const rng = makeRng(hashSeed("odds", s.week, s.standings.map((t) => t.score).join(",")));
  const mine = teamRatings(s.team, lineup(s));
  let made = 0;
  for (let i = 0; i < runs; i++) {
    let table = s.standings.map((t) => ({ ...t }));
    for (let w = s.week; w <= FINAL_WEEK; w++) {
      const results = (s.schedule[w] ?? []).map((f) => {
        const isUserNow = w === s.week && (f.home === s.team || f.away === s.team);
        let homeWins: boolean;
        if (isUserNow && assume) homeWins = (f.home === s.team) === (assume === "win");
        else homeWins = rng() < quickWinProb(s.teamRatings, f.home, f.away, mine, s.team);
        return { home: f.home, away: f.away, homeScore: homeWins ? 1 : 0, awayScore: homeWins ? 0 : 1 };
      });
      table = applyResults(table, results);
    }
    if (selectField(table, s.season).seeds.includes(s.team)) made++;
  }
  return made / runs;
}

function quickWinProb(ratings: Ratings, home: TeamId, away: TeamId, mine: { off: number; def: number }, team: TeamId) {
  const total = (id: TeamId) => (id === team ? mine.off + mine.def : ratings[id].off + ratings[id].def);
  return 1 / (1 + Math.exp(-(total(home) - total(away) + 3) / 7));
}

// ---- Rankings ------------------------------------------------------------------

/** Apply a week of results to the committee table and re-rank. */
export function applyResults(table: Standing[], results: Score[]): Standing[] {
  const next = table.map((t) => ({ ...t, prevRank: t.rank }));
  const byId = new Map(next.map((t) => [t.id, t]));
  // Quality of a win or loss: 1 for #1, sliding to 0 outside the top 25 (top 17 in the smaller Season 1 table).
  const top = Math.min(25, next.length);
  const quality = (id: TeamId) => {
    const t = byId.get(id);
    return t ? Math.max(0, top + 1 - t.rank) / top : 0;
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

    case "dynasty/create":
      return createDynasty(a.coach, a.team, a.seed);

    case "scenario/choose":
      return resolveScenario(s, a.id, a.option, false).state;

    case "press/answer": {
      if (s.press) return s;
      let { hype, mediaTrust } = s;
      if (a.choice === "match") {
        hype += 8;
        mediaTrust -= 1;
      } else if (a.choice === "board") {
        mediaTrust += 3;
      } else {
        mediaTrust -= 5;
      }
      return { ...s, press: a.choice, hype: clamp100(hype), mediaTrust: clamp100(mediaTrust) };
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

function simWeek(prev: GameState, liveGame?: GameResult): GameState {
  if (seasonOver(prev)) return prev;
  // Anything still unanswered at its deadline resolves with the default before this week's games.
  let s = prev;
  const autoNotes: string[] = [];
  for (const sc of prev.scenarios.open.filter((x) => x.deadline <= prev.week)) {
    const r = resolveScenario(s, sc.id, null, true);
    s = r.state;
    if (r.entry) autoNotes.push(`${r.entry.title}: no decision by the deadline — ${r.entry.choice.toLowerCase()}. ${r.entry.outcome}`);
  }
  const week = s.week;
  const playoffRound = isPlayoffs(s) ? roundOf(week) : null;
  const fixtures = playoffRound === null ? (s.schedule[week] ?? []) : playoffFixtures(s, playoffRound).filter((f) => f !== null);
  const rankBefore = standingOf(s, s.team)!.rank;
  const userOpts = userSimOptions(s);

  let game: GameResult | undefined;
  const others: Score[] = [];
  const results: (Score & { slot?: number })[] = [];
  for (const f of fixtures) {
    const isUser = f.home === s.team || f.away === s.team;
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
  const rankAfter = standings.find((t) => t.id === s.team)!.rank;

  let playoff = s.playoff;
  if (playoffRound !== null && playoff) {
    playoff = { ...playoff, games: [...playoff.games, ...results.map((r) => ({ ...r, round: playoffRound, slot: r.slot! }))] };
  }
  if (week === FINAL_WEEK) {
    playoff = { ...selectField(standings, s.season), games: [] };
  }

  const rng = makeRng(hashSeed("week", s.seed, s.season, week, 0, game?.homeScore ?? 0));

  const bidUpdates: WeekRecap["bidUpdates"] = [];
  let { nilBudget, players, recruiting } = s;
  const depth = s.depth;
  const notes: string[] = [...autoNotes];
  const recruitingNews: NewsItem[] = [];

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
      if (r.signees.length) recruitingNews.push(news("RECRUITING", `${TEAMS[s.team].name} signs ${r.signees.length} on Early Signing Day`, week, s.season));
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
      injuryUpdates.push({ playerId: id, text: inj.desc === "suspension" ? `${p.pos} ${p.name} returns from his suspension.` : `${p.pos} ${p.name} is healthy again.` });
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
      headlines.push(news("INJURY", `${TEAMS[s.team].short} ${POS_LABEL[p.pos].toLowerCase()} ${p.name} hurt (${desc})`, week, s.season));
    }
  }

  // Season stats for your players.
  const seasonStats = { ...s.seasonStats };
  for (const line of game?.stats.filter((x) => x.team === s.team) ?? []) {
    const id = nameToId.get(line.name);
    if (!id) continue;
    const prev = seasonStats[id] ?? { name: line.name, team: s.team, pos: line.pos, games: 0 };
    const merged: StatLine & { games: number } = { ...prev, games: prev.games + 1 };
    for (const [k, v] of Object.entries(line)) {
      if (typeof v === "number") (merged as unknown as Record<string, number>)[k] = ((prev as unknown as Record<string, number>)[k] ?? 0) + v;
    }
    seasonStats[id] = merged;
  }

  // Headlines.
  const fmt = playoffFormat(s.season);
  const lastRound = fmt.rounds.length - 1;
  const label = playoffRound === null ? `week ${week}` : fmt.rounds[playoffRound].toLowerCase();
  if (game) {
    const opp = game.home === s.team ? game.away : game.home;
    const us = game.home === s.team ? game.homeScore : game.awayScore;
    const them = game.home === s.team ? game.awayScore : game.homeScore;
    const ot = game.overtime ? " in OT" : "";
    headlines.push(
      news(
        playoffRound === null ? "GAME" : "PLAYOFF",
        us > them
          ? playoffRound === lastRound
            ? `NATIONAL CHAMPIONS: ${TEAMS[s.team].name} beat ${TEAMS[opp].name} ${us}–${them}${ot}`
            : `${TEAMS[s.team].name} top ${TEAMS[opp].name} ${us}–${them}${ot}${playoffRound !== null ? ` to win the ${label}` : ""}`
          : `${TEAMS[opp].name} ${playoffRound !== null ? `end the ${TEAMS[s.team].name}' season` : `stun the ${TEAMS[s.team].name}`} ${them}–${us}${ot}`,
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
          ? `${TEAMS[s.team].name} climbs to No. ${rankAfter} in committee rankings`
          : rankAfter > rankBefore
            ? `${TEAMS[s.team].name} slides to No. ${rankAfter} after ${label}`
            : `Committee holds ${TEAMS[s.team].name} at No. ${rankAfter}`,
        week,
        s.season,
      ),
    );
  }
  if (week === FINAL_WEEK && playoff) {
    const seed = playoff.seeds.indexOf(s.team) + 1;
    headlines.push(news("PLAYOFF", seed ? `Selection day: ${TEAMS[s.team].name} is the No. ${seed} seed` : `Selection day: ${TEAMS[s.team].name} left out of the ${fmt.size}-team field`, week, s.season));
  }
  if (playoffRound === lastRound && results[0]) {
    const r = results[0];
    const champ = r.homeScore > r.awayScore ? r.home : r.away;
    if (champ !== s.team) headlines.push(news("PLAYOFF", `${TEAMS[champ].name} win the national championship`, week, s.season));
  }
  headlines.push(...recruitingNews);

  const userWon = game ? (game.home === s.team ? game.homeScore > game.awayScore : game.awayScore > game.homeScore) : null;

  const next: GameState = {
    ...s,
    week: week + 1,
    standings,
    playoff,
    nilBudget,
    players,
    depth,
    injuries,
    recruiting,
    gameTime: {},
    seasonStats,
    hype: clamp100(s.hype + (userWon === null ? 0 : userWon ? 6 : -10)),
    press: null,
    recaps: [...s.recaps, { season: s.season, week, game, others, rankBefore, rankAfter, bidUpdates, injuryUpdates, notes }],
    unseenRecap: true,
    news: [...headlines.reverse(), ...s.news],
  };
  return playoffRound === null && week < FINAL_WEEK ? openScenario(next) : { ...next, scenarios: { ...next.scenarios, open: [] } };
}

function news(tag: NewsItem["tag"], headline: string, week: number, season = 1): NewsItem {
  const when = (season > 1 ? `S${season} ` : "") + (week > FINAL_WEEK ? "Post" : week === 0 ? "Pre" : `Wk ${week}`);
  return { id: `s${season}w${week}-${hashSeed(tag, headline).toString(36)}`, week, tag, headline, when };
}

const clamp100 = (x: number) => Math.max(0, Math.min(100, Math.round(x)));

// ---- Season to season -------------------------------------------------------------

/** How the user's season ended, for the history table. */
export function seasonSummary(s: GameState): SeasonSummary {
  const me = standingOf(s, s.team)!;
  const seed = seedOf(s, s.team);
  const champ = champion(s);
  let finish = "Missed the playoff";
  if (champ === s.team) finish = "National champions";
  else if (seed) {
    const loss = s.playoff?.games.find((g) => (g.home === s.team || g.away === s.team) && (g.homeScore > g.awayScore ? g.away : g.home) === s.team);
    const rounds = playoffFormat(s.season).rounds;
    finish = loss ? (loss.round === rounds.length - 1 ? "Lost in the title game" : `Lost in the ${rounds[loss.round].toLowerCase()}`) : "Made the playoff";
  }
  const target = s.program?.winTarget;
  const expectation = target === undefined || !s.coach ? undefined : expectationsVerdict(me.wins, target).label;
  return { season: s.season, wins: me.wins, losses: me.losses, rank: me.rank, seed, finish, champion: champ, target: s.coach ? target : undefined, expectation };
}

/** Program prestige (0-1) from the most recent finished season; drives recruiting interest and portal pull. */
export function prestige(s: GameState) {
  const last = s.history[s.history.length - 1];
  return last ? Off.prestigeFrom(last.finish, last.rank) : (s.program?.prestige ?? 0.4);
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
    teamRatings: driftRatings(s.teamRatings, s.seed, nextSeason, s.team),
    // Next year's budget: the program's base, plus wins and a playoff run, plus or minus how you did against expectations.
    nilBudget: (s.coach ? s.program.baseBudget : 2_000_000) + summary.wins * 25_000 + playoffBonus + (s.coach ? expectationsVerdict(summary.wins, s.program.winTarget).budget : 0),
    lastOffseason: report,
    offseason: Off.openOffseason(players, depth, s.seed, nextSeason, s.team, !s.coach && nextSeason === 2),
    unseenRecap: false,
    news: [news("PORTAL", `${report.graduated.length} seniors graduate; the January transfer window opens`, 0, nextSeason), ...s.news].slice(0, 40),
  };
}

/** Begin the next season: walk-ons fill gaps, then a new 12-week schedule and preseason poll. */
export function beginSeason(s: GameState): GameState {
  return openScenario(beginSeasonCore(s));
}

function beginSeasonCore(s: GameState): GameState {
  const season = s.season + 1;
  const filled = fillAndOrder(s.players, s.depth, s.seed, season);
  const players = filled.players.map((p) => (p.promised || p.frustrated ? { ...p, promised: false, frustrated: false } : p));
  const { depth, walkOns } = filled;
  const report = { ...(s.lastOffseason ?? emptyReport()), walkOns };
  const mine = teamRatings(s.team, { players, depth, injuries: {}, gameTime: {} });
  const prevRank = new Map(s.standings.map((t) => [t.id, t.rank]));

  // Preseason poll: team strength plus a little credit for last year's finish.
  const power = (id: TeamId) => {
    const r = id === s.team ? mine : s.teamRatings[id];
    return r.off + r.def + Math.max(0, 18 - (prevRank.get(id) ?? 25)) * 0.4;
  };
  const order = [...ALL_TEAMS].sort((a, b) => power(b) - power(a));
  const standings: Standing[] = order.map((id, i) => ({ id, wins: 0, losses: 0, sos: 0.5, score: 100 - i * SPACING, rank: i + 1, prevRank: i + 1 }));
  const myRank = standings.find((t) => t.id === s.team)!.rank;
  const newcomers = report.transfersIn.length + report.enrolled.length;

  return {
    ...s,
    season,
    week: 1,
    schedule: generateSchedule(hashSeed("season", s.seed, season)),
    lastOffseason: report,
    offseason: null,
    // Next year's class: the board opens with the season and signs in December.
    recruiting: Rec.createBoard(players, s.seed, season + 1, prestige(s), FINAL_WEEK, s.team, s.coach ? schemeFit(s.coach) : []),
    players,
    depth,
    injuries: {},
    gameTime: {},
    seasonStats: {},
    standings,
    playoff: null,
    recaps: [],
    unseenRecap: false,
    scenarios: { open: [], log: s.scenarios.log },
    scholarships: Math.max(0, Rec.ROSTER_MAX - players.length),
    bids: [],
    scouts: [],
    press: null,
    hype: Math.round(50 + (s.hype - 50) * 0.5),
    news: [
      news("RANKINGS", `Preseason poll: ${TEAMS[s.team].name} opens Season ${season} at No. ${myRank}`, 0, season),
      news("RECRUITING", `${newcomers} newcomers join the ${TEAMS[s.team].name} for Season ${season}`, 0, season),
      ...s.news,
    ].slice(0, 40),
  };
}

// ---- Selection -----------------------------------------------------------------

export function playoffField(s: GameState) {
  const fmt = playoffFormat(s.season);
  const ids = s.playoff?.seeds ?? selectField(s.standings, s.season).seeds;
  return ids.map((id, i) => ({ ...standingOf(s, id)!, seed: i + 1, bye: i < fmt.byes }));
}

/** Starters needed vs available, for warnings on the roster screen. */
export function shortPositions(s: GameState): Pos[] {
  const st = starters(lineup(s));
  return (Object.keys(STARTERS) as Pos[]).filter((pos) => st[pos].length < STARTERS[pos]);
}

// ---- Persistence ---------------------------------------------------------------

function migrateV4(old: GameState): GameState {
  const legacy = old as unknown as { offseason: (Off.OffseasonState & { phase: string }) | null; bids?: Bid[] };
  // In-season transfer bids no longer exist: refund anything still pending.
  const refund = (legacy.bids ?? []).filter((b) => b.status === "pending").reduce((n, b) => n + b.amount, 0);
  // Offseason recruiting moved into the season: an offseason stuck on recruiting skips to "ready".
  const offseason = legacy.offseason ? ({ ...legacy.offseason, phase: legacy.offseason.phase === "portal" ? "portal" : "ready" } as Off.OffseasonState) : null;
  const recruiting =
    old.week <= FINAL_WEEK && !old.offseason ? Rec.createBoard(old.players, old.seed, old.season + 1, 0.45, FINAL_WEEK - old.week + 1) : null;
  return { ...old, version: 5, offseason, recruiting, bids: [], nilBudget: old.nilBudget + refund };
}

export function loadState(raw: string | null): GameState {
  if (!raw) return initialState();
  try {
    let parsed = JSON.parse(raw) as GameState;
    // Version 3 saves predate multiple seasons: they are Season 1 on the fixed schedule.
    if (parsed?.version === 3) {
      parsed = { ...parsed, version: 6, scenarios: { open: [], log: [] }, season: 1, schedule: SCHEDULE, teamRatings: baseRatings(), history: [], lastOffseason: null, offseason: null };
    }
    // Version 4 saves: Rook could "enter the portal", recruiting ran in the offseason, and Season 1 had in-season bids.
    if (parsed?.version === 4) parsed = migrateV4(parsed);
    // Version 5 saves had a special-case Rook storyline; scenarios replace it.
    if (parsed?.version === 5) {
      const { rook: _rook, ...rest } = parsed as GameState & { rook?: unknown };
      void _rook;
      parsed = { ...rest, version: 6, scenarios: { open: [], log: [] } } as GameState;
    }
    // Version 6 saves are all the classic Lone Star dynasty.
    if (parsed?.version === 6) parsed = { ...parsed, version: STATE_VERSION, team: USER_TEAM, coach: null, program: programProfile(USER_TEAM) };
    // Saves from before the offseason update: no offseason field, and an older report shape.
    if (parsed && parsed.offseason === undefined) parsed = { ...parsed, offseason: null };
    if (parsed?.lastOffseason) parsed = { ...parsed, lastOffseason: { ...emptyReport(), ...parsed.lastOffseason } };
    if (parsed?.version !== STATE_VERSION || !Array.isArray(parsed.standings) || !parsed.depth || typeof parsed.seed !== "number") return initialState();
    return parsed;
  } catch {
    return initialState();
  }
}
