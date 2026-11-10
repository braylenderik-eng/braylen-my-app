// Season state and every action that changes it. Pure: (state, action) => state.

import {
  BYE_SEEDS, FINAL_WEEK, FIRST_WEEK, INITIAL_STANDINGS, PLAYOFF_FIELD, PORTAL, ROOK_ASK, ROOK_PORTAL,
  SCHEDULE, TEAMS, USER_TEAM, type Fixture, type PortalPlayer, type TeamId,
} from "./data";
import { DEFAULT_PLAN, hashSeed, makeRng, simulateGame, type GamePlan, type GameResult } from "./sim";

export const STORAGE_KEY = "portal-wars-v2";
export const STATE_VERSION = 2;

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
  tag: "RECRUITING" | "RANKINGS" | "PORTAL" | "INJURY" | "LEAGUE" | "GAME";
  headline: string;
  when: string;
}

export interface Bid {
  playerId: string;
  amount: number;
  status: "pending" | "signed" | "lost";
}

export type PressChoice = "match" | "board" | "nocomment";

export interface WeekRecap {
  week: number;
  game: GameResult;
  others: { home: TeamId; away: TeamId; homeScore: number; awayScore: number }[];
  rankBefore: number;
  rankAfter: number;
  bidUpdates: { playerId: string; status: "signed" | "lost" }[];
}

export interface GameState {
  version: number;
  week: number; // current week; FINAL_WEEK + 1 means the regular season is over
  nilBudget: number;
  scholarships: number;
  hype: number;
  mediaTrust: number;
  rook: { decision: null | "paid" | "walked"; offer: number; interest: number };
  press: PressChoice | null;
  bids: Bid[];
  scouts: string[];
  plan: GamePlan;
  standings: Standing[];
  recaps: WeekRecap[];
  unseenRecap: boolean; // show the result screen once after a sim
  news: NewsItem[];
}

export type Action =
  | { type: "rook/pay" }
  | { type: "rook/walk" }
  | { type: "press/answer"; choice: PressChoice }
  | { type: "portal/scout"; playerId: string }
  | { type: "portal/bid"; playerId: string }
  | { type: "plan/set"; plan: Partial<GamePlan> }
  | { type: "sim/week" }
  | { type: "recap/seen" }
  | { type: "reset" };

// ---- Initial state --------------------------------------------------------------

export function initialState(): GameState {
  const standings: Standing[] = INITIAL_STANDINGS.map((s, i) => ({
    ...s,
    rank: i + 1,
    score: 100 - i * SPACING, // spacing keeps the starting order until results move it
  }));
  return {
    version: STATE_VERSION,
    week: FIRST_WEEK,
    nilBudget: 2_100_000,
    scholarships: 3,
    hype: 50,
    mediaTrust: 70,
    rook: { decision: null, offer: 850_000, interest: 68 },
    press: null,
    bids: [],
    scouts: [],
    plan: DEFAULT_PLAN,
    standings,
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

export const seasonOver = (s: GameState) => s.week > FINAL_WEEK;

export function userFixture(week: number): Fixture | undefined {
  return SCHEDULE[week]?.find((f) => f.home === USER_TEAM || f.away === USER_TEAM);
}

export function standingOf(s: GameState, id: TeamId) {
  return s.standings.find((t) => t.id === id);
}

export function portalBoard(s: GameState): PortalPlayer[] {
  return s.rook.decision === "walked" ? [ROOK_PORTAL, ...PORTAL] : PORTAL;
}

export function findPortalPlayer(id: string) {
  return id === ROOK_PORTAL.id ? ROOK_PORTAL : PORTAL.find((p) => p.id === id);
}

/** Rating boosts from signed transfers. Transfers help right away in this prototype. */
export function boostsFor(s: GameState) {
  const signed = s.bids.filter((b) => b.status === "signed").map((b) => findPortalPlayer(b.playerId)!);
  let off = 0;
  let def = 0;
  for (const p of signed) {
    const gain = Math.max(0, (p.ovr - 80) / 10); // 0.0 - 1.6
    if (["QB", "RB", "WR", "TE", "OT", "K"].includes(p.pos)) off += gain;
    else def += gain;
  }
  return { [USER_TEAM]: { off, def } } as const;
}

export function canBid(s: GameState, p: PortalPlayer) {
  if (s.bids.some((b) => b.playerId === p.id)) return { ok: false, reason: "Bid filed" };
  if (!p.biddable && !s.scouts.includes(p.id)) return { ok: false, reason: "Scout first" };
  if (s.scholarships < 1) return { ok: false, reason: "No scholarships left" };
  if (s.nilBudget < p.ask) return { ok: false, reason: "Not enough NIL" };
  return { ok: true, reason: "" };
}

/**
 * Projected playoff odds for the user: Monte Carlo the rest of the season with a
 * logistic win model for speed, then check where the user's committee score lands.
 */
export function playoffOdds(s: GameState, assume?: "win" | "loss", runs = 600): number {
  if (seasonOver(s)) {
    const me = standingOf(s, USER_TEAM)!;
    return me.rank <= PLAYOFF_FIELD ? 1 : 0;
  }
  const rng = makeRng(hashSeed("odds", s.week, s.standings.map((t) => t.score).join(",")));
  const boosts = boostsFor(s);
  let made = 0;
  for (let i = 0; i < runs; i++) {
    let table = s.standings.map((t) => ({ ...t }));
    for (let w = s.week; w <= FINAL_WEEK; w++) {
      const results = (SCHEDULE[w] ?? []).map((f) => {
        const isUserNow = w === s.week && (f.home === USER_TEAM || f.away === USER_TEAM);
        let homeWins: boolean;
        if (isUserNow && assume) homeWins = (f.home === USER_TEAM) === (assume === "win");
        else homeWins = rng() < quickWinProb(f.home, f.away, boosts);
        return { home: f.home, away: f.away, homeScore: homeWins ? 1 : 0, awayScore: homeWins ? 0 : 1 };
      });
      table = applyResults(table, results);
    }
    const me = table.find((t) => t.id === USER_TEAM)!;
    if (me.rank <= PLAYOFF_FIELD) made++;
  }
  return made / runs;
}

function quickWinProb(home: TeamId, away: TeamId, boosts: ReturnType<typeof boostsFor>) {
  const b = boosts as Partial<Record<TeamId, { off: number; def: number }>>;
  const h = TEAMS[home].off + TEAMS[home].def + (b[home]?.off ?? 0) + (b[home]?.def ?? 0);
  const a = TEAMS[away].off + TEAMS[away].def + (b[away]?.off ?? 0) + (b[away]?.def ?? 0);
  return 1 / (1 + Math.exp(-(h - a + 3) / 7));
}

// ---- Rankings ------------------------------------------------------------------

// Committee tuning. Tuned so the Week 11 Stallions sit near 60% playoff odds.
export const SPACING = 0.8;
const WIN_BASE = 1;
const WIN_QUALITY = 9;
const LOSS_BASE = 4;
const LOSS_BAD = 12;

/** Apply a week of results to the committee table and re-rank. */
export function applyResults(
  table: Standing[],
  results: { home: TeamId; away: TeamId; homeScore: number; awayScore: number }[],
): Standing[] {
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
      if (s.rook.decision || s.nilBudget < ROOK_ASK || s.scholarships < 1) return s;
      return {
        ...s,
        nilBudget: s.nilBudget - ROOK_ASK,
        scholarships: s.scholarships - 1,
        hype: s.hype + 10,
        rook: { decision: "paid", offer: ROOK_ASK, interest: 93 },
        news: [news("RECRUITING", "Rook commits to Lone Star after $1.1M offer: \"I'm a Stallion\"", s.week), ...s.news],
      };
    }

    case "rook/walk": {
      if (s.rook.decision) return s;
      return {
        ...s,
        hype: s.hype - 6,
        rook: { ...s.rook, decision: "walked", interest: 6 },
        news: [news("PORTAL", "Five-star QB Jalen Rook enters the portal after Stallions hold the line", s.week), ...s.news],
      };
    }

    case "press/answer": {
      if (s.press) return s;
      const d = s.rook.decision;
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
      if (!p || !canBid(s, p).ok) return s;
      return {
        ...s,
        nilBudget: s.nilBudget - p.ask,
        scholarships: s.scholarships - 1,
        bids: [...s.bids, { playerId: p.id, amount: p.ask, status: "pending" }],
      };
    }

    case "plan/set":
      return { ...s, plan: { ...s.plan, ...a.plan } };

    case "recap/seen":
      return { ...s, unseenRecap: false };

    case "sim/week":
      return simWeek(s);
  }
}

function simWeek(s: GameState): GameState {
  if (seasonOver(s)) return s;
  const week = s.week;
  const fixtures = SCHEDULE[week] ?? [];
  const boosts = boostsFor(s);
  const rankBefore = standingOf(s, USER_TEAM)!.rank;

  let game: GameResult | undefined;
  const others: WeekRecap["others"] = [];
  for (const f of fixtures) {
    const isUser = f.home === USER_TEAM || f.away === USER_TEAM;
    const g = simulateGame(f.home, f.away, hashSeed("game", week, f.home, f.away), {
      userTeam: USER_TEAM,
      plan: s.plan,
      hype: s.hype,
      boosts,
      fast: !isUser,
    });
    if (isUser) game = g;
    else others.push({ home: g.home, away: g.away, homeScore: g.homeScore, awayScore: g.awayScore });
  }
  if (!game) return s;

  const standings = applyResults(s.standings, [game, ...others]);
  const rankAfter = standings.find((t) => t.id === USER_TEAM)!.rank;

  // Pending portal bids resolve at the end of the week.
  const rng = makeRng(hashSeed("bids", week, s.bids.length));
  const bidUpdates: WeekRecap["bidUpdates"] = [];
  let nilBudget = s.nilBudget;
  let scholarships = s.scholarships;
  const bids = s.bids.map((b) => {
    if (b.status !== "pending") return b;
    const p = findPortalPlayer(b.playerId)!;
    const chance = Math.min(0.92, Math.max(0.15, 0.85 - p.rivals * 0.06 + (s.hype - 50) / 200));
    const status = rng() < chance ? ("signed" as const) : ("lost" as const);
    if (status === "lost") {
      nilBudget += b.amount;
      scholarships += 1;
    }
    bidUpdates.push({ playerId: b.playerId, status });
    return { ...b, status };
  });

  const userWon =
    (game.home === USER_TEAM && game.homeScore > game.awayScore) ||
    (game.away === USER_TEAM && game.awayScore > game.homeScore);
  const opp = game.home === USER_TEAM ? game.away : game.home;
  const us = game.home === USER_TEAM ? game.homeScore : game.awayScore;
  const them = game.home === USER_TEAM ? game.awayScore : game.homeScore;

  const headlines: NewsItem[] = [
    news(
      "GAME",
      userWon
        ? `Stallions top ${TEAMS[opp].name} ${us}–${them}${game.overtime ? " in OT" : ""}`
        : `${TEAMS[opp].name} stun Stallions ${them}–${us}${game.overtime ? " in OT" : ""}`,
      week,
    ),
    news(
      "RANKINGS",
      rankAfter < rankBefore
        ? `Lone Star climbs to No. ${rankAfter} in committee rankings`
        : rankAfter > rankBefore
          ? `Lone Star slides to No. ${rankAfter} after week ${week}`
          : `Committee holds Lone Star at No. ${rankAfter}`,
      week,
    ),
    ...bidUpdates.map((u) =>
      news(
        "PORTAL",
        u.status === "signed"
          ? `${findPortalPlayer(u.playerId)!.name} signs with the Stallions`
          : `${findPortalPlayer(u.playerId)!.name} picks another school; NIL returned`,
        week,
      ),
    ),
  ];

  return {
    ...s,
    week: week + 1,
    standings,
    nilBudget,
    scholarships,
    bids,
    hype: clamp100(s.hype + (userWon ? 6 : -10)),
    press: null,
    recaps: [...s.recaps, { week, game, others, rankBefore, rankAfter, bidUpdates }],
    unseenRecap: true,
    news: [...headlines.reverse(), ...s.news],
  };
}

function news(tag: NewsItem["tag"], headline: string, week: number): NewsItem {
  return { id: `w${week}-${hashSeed(tag, headline).toString(36)}`, week, tag, headline, when: `Wk ${week}` };
}

const clamp100 = (x: number) => Math.max(0, Math.min(100, Math.round(x)));

// ---- Selection -----------------------------------------------------------------

export function playoffField(s: GameState) {
  return s.standings.slice(0, PLAYOFF_FIELD).map((t, i) => ({ ...t, seed: i + 1, bye: i < BYE_SEEDS }));
}

// ---- Persistence ---------------------------------------------------------------

export function loadState(raw: string | null): GameState {
  if (!raw) return initialState();
  try {
    const parsed = JSON.parse(raw) as GameState;
    if (parsed?.version !== STATE_VERSION || !Array.isArray(parsed.standings)) return initialState();
    return parsed;
  } catch {
    return initialState();
  }
}
