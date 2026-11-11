// In-season recruiting. The board for next year's class opens with the season; each regular-season
// week you spend recruiting points on pitches and official visits while rival schools push back.
// Only prospects with an NIL/revenue-share offer can sign. On Early Signing Day (the December
// signing period, right after the last regular-season week) each offered prospect signs with you or
// his top rival. Signees enroll in the offseason. Pure functions.

import { TEAMS, type TeamId } from "./data";
import { hashSeed, makeRng } from "./rng";
import { inRegion } from "./league";
import { playingTime, recruitAsk } from "./economy";
import { POS_ORDER, STARTERS, type Player, type Pos } from "./roster";
import { ALL_TEAMS, freeNumber, makePerson } from "./season";

export const ROSTER_MAX = 40; // the game tracks ~40 key players (real FBS rosters are capped at 105)
export const PITCH_COST = 1;
export const VISIT_COST = 4;
export const MAX_PITCHES_PER_WEEK = 3;
export const SIGNING_DAY = "Dec 2–4"; // early signing period

export interface Prospect {
  id: string;
  name: string;
  pos: Pos;
  stars: 2 | 3 | 4 | 5;
  ovr: number;
  pot: number;
  ask: number;
  hometown: string;
  rival: TeamId; // the school recruiting him hardest
  you: number; // interest in your program, 0-100
  them: number; // interest in the rival
  visited: boolean;
  offered: boolean;
  pitchesThisWeek: number;
  status: "open" | "signed" | "lost";
  fit?: boolean; // fits your offensive or defensive scheme
  room?: "path" | "crowded"; // a path to start, or a crowded depth chart, at his position
  local?: boolean; // from your conference's home region
}

export interface RecruitingState {
  classSeason: number; // the season these prospects enroll for
  board: Prospect[];
  week: number; // 1-based recruiting week
  weeks: number; // recruiting weeks before Signing Day
  points: number;
  pointsPerWeek: number;
  signed: boolean; // Signing Day has happened
  log: string[];
}

const pick = <T,>(rng: () => number, xs: readonly T[]) => xs[Math.floor(rng() * xs.length)];
const clamp = (x: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));

/** Positions where the roster is thin (counting seniors as already gone) weigh more on the board. */
export function needWeights(players: Player[]): [Pos, number][] {
  return POS_ORDER.map((pos) => {
    const have = players.filter((p) => p.pos === pos && p.yr !== "Sr").length;
    const want = STARTERS[pos] + 1;
    const base = pos === "K" || pos === "P" ? 0.3 : STARTERS[pos];
    return [pos, base * (have < want ? 2.2 : 1)];
  });
}

export function weightedPos(rng: () => number, weights: [Pos, number][]): Pos {
  const total = weights.reduce((n, [, w]) => n + w, 0);
  let roll = rng() * total;
  for (const [pos, w] of weights) {
    roll -= w;
    if (roll <= 0) return pos;
  }
  return weights[weights.length - 1][0];
}

/**
 * The big board for a recruiting class. `weeks` is how many regular-season weeks are left before
 * Signing Day; points per week scale so a short cycle (Season 1 starts at Week 11) still matters.
 */
export function createBoard(
  players: Player[],
  seed: number,
  classSeason: number,
  prestige: number,
  weeks: number,
  team: TeamId = "stallions",
  fit: Pos[] = [],
): RecruitingState {
  const weights = needWeights(players);
  const others = ALL_TEAMS.filter((t) => t !== team);
  // A short cycle means you're joining late: interest has already built up on both sides.
  const head = weeks < 6 ? 8 : 0;
  const STAR_SPREAD: (2 | 3 | 4 | 5)[] = [5, 5, 4, 4, 4, 4, 4, 4, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2];
  const board: Prospect[] = STAR_SPREAD.map((stars, i) => {
    const who = makePerson(["recruit", seed, classSeason, i]);
    const r = who.rng;
    const pos = weightedPos(r, weights);
    const local = inRegion(team, who.hometown);
    const ovr = { 5: 74, 4: 70, 3: 66, 2: 62 }[stars] + Math.floor(r() * 6);
    const room = playingTime(players, pos, ovr + 6, STARTERS[pos]);
    return {
      id: `hs-${classSeason}-${i}`,
      name: who.name,
      pos,
      stars,
      ovr,
      pot: { 5: 92, 4: 86, 3: 80, 2: 75 }[stars] + Math.floor(r() * 7),
      ask: recruitAsk(stars, pos, r),
      hometown: who.hometown,
      rival: pick(r, others),
      // Prospects who fit your schemes lean your way; others take a little more convincing.
      // Prestige helps, but playing time, scheme fit and home region matter as much as the brand.
      you: clamp(Math.round(52 - stars * 6 + prestige * 15 + head + (r() - 0.5) * 16 + (fit.length ? (fit.includes(pos) ? 8 : -3) : 0) + (local ? 6 : 0) + (room === "path" ? 8 : room === "crowded" ? -8 : 0))),
      them: clamp(Math.round(24 + stars * 5 + head + (r() - 0.5) * 16)),
      visited: false,
      offered: false,
      pitchesThisWeek: 0,
      status: "open" as const,
      fit: fit.includes(pos),
      room,
      local,
    };
  });
  const pointsPerWeek = Math.max(4, Math.round(36 / weeks));
  return { classSeason, board, week: 1, weeks, points: pointsPerWeek, pointsPerWeek, signed: false, log: [] };
}

/** Roster spots next season: seniors leave, signees and offers take spots. */
export function openSpotsNextYear(players: Player[], rec: RecruitingState | null) {
  const returning = players.filter((p) => p.yr !== "Sr").length; // includes earlier high-school signees
  const offers = rec ? rec.board.filter((p) => p.offered && p.status === "open").length : 0;
  return ROSTER_MAX - returning - offers;
}

/** Chance a prospect with an offer picks you on Signing Day. */
export function commitChance(p: Pick<Prospect, "you" | "them">) {
  return 1 / (1 + Math.exp(-(p.you - p.them) / 7));
}

export function pitch(rec: RecruitingState, id: string, seed: number): RecruitingState {
  const p = rec.board.find((x) => x.id === id);
  if (rec.signed || !p || p.status !== "open" || rec.points < PITCH_COST || p.pitchesThisWeek >= MAX_PITCHES_PER_WEEK) return rec;
  const rng = makeRng(hashSeed("pitch", seed, id, rec.week, p.pitchesThisWeek));
  const gain = Math.round(8 - p.pitchesThisWeek * 2 + rng() * 4); // diminishing within a week
  return {
    ...rec,
    points: rec.points - PITCH_COST,
    board: rec.board.map((x) => (x.id === id ? { ...x, you: clamp(x.you + gain), pitchesThisWeek: x.pitchesThisWeek + 1 } : x)),
  };
}

export function visit(rec: RecruitingState, id: string, seed: number): RecruitingState {
  const p = rec.board.find((x) => x.id === id);
  if (rec.signed || !p || p.status !== "open" || p.visited || rec.points < VISIT_COST) return rec;
  const rng = makeRng(hashSeed("visit", seed, id));
  const gain = 15 + Math.round(rng() * 10);
  return {
    ...rec,
    points: rec.points - VISIT_COST,
    board: rec.board.map((x) => (x.id === id ? { ...x, you: clamp(x.you + gain), visited: true } : x)),
    log: [`Official visit: ${p.name} (+${gain} interest).`, ...rec.log],
  };
}

/** Make an offer. Required to sign him; reserves the money and a roster spot. */
export function offer(rec: RecruitingState, id: string, nil: number, spots: number) {
  const p = rec.board.find((x) => x.id === id);
  if (rec.signed || !p || p.status !== "open" || p.offered || nil < p.ask || spots < 1) return { rec, nil };
  return { nil: nil - p.ask, rec: { ...rec, board: rec.board.map((x) => (x.id === id ? { ...x, offered: true, you: clamp(x.you + 5) } : x)) } };
}

export function withdraw(rec: RecruitingState, id: string, nil: number) {
  const p = rec.board.find((x) => x.id === id);
  if (rec.signed || !p || !p.offered || p.status !== "open") return { rec, nil };
  return { nil: nil + p.ask, rec: { ...rec, board: rec.board.map((x) => (x.id === id ? { ...x, offered: false, you: clamp(x.you - 5) } : x)) } };
}

/** A regular-season week passes: rivals push, unattended prospects cool off, points refresh. */
export function advanceWeek(rec: RecruitingState, seed: number, season: number, week: number): RecruitingState {
  if (rec.signed) return rec;
  const rng = makeRng(hashSeed("rec-week", seed, season, week));
  const scale = 3 / rec.weeks; // the same total rival push whether the cycle is 2 or 12 weeks
  const board = rec.board.map((p) => {
    if (p.status !== "open") return p;
    const push = Math.round((3 + rng() * (4 + p.stars * 2)) * scale);
    const fade = p.pitchesThisWeek === 0 && !p.visited ? Math.round(3 * scale) : 0;
    return { ...p, them: clamp(p.them + push), you: clamp(p.you - fade), pitchesThisWeek: 0 };
  });
  return { ...rec, board, week: rec.week + 1, points: rec.pointsPerWeek };
}

/** Early Signing Day: offered prospects sign with you or their top rival. Signees join as high-school signees. */
export function signingDay(players: Player[], rec: RecruitingState, nil: number, seed: number) {
  const rng = makeRng(hashSeed("signing-day", seed, rec.classSeason));
  const signees: Player[] = [];
  const log: string[] = [];
  let next = players;
  const board = rec.board.map((p) => {
    if (p.status !== "open") return p;
    if (!p.offered) return { ...p, status: "lost" as const };
    if (rng() < commitChance(p)) {
      const pl: Player = { id: p.id, name: p.name, num: freeNumber(next, rng), pos: p.pos, yr: "HS", ovr: p.ovr, pot: p.pot, hometown: p.hometown, nil: p.ask, source: "recruit" };
      next = [...next, pl];
      signees.push(pl);
      log.push(`${"★".repeat(p.stars)} ${p.pos} ${p.name} signed with you.`);
      return { ...p, status: "signed" as const };
    }
    nil += p.ask;
    log.push(`${"★".repeat(p.stars)} ${p.pos} ${p.name} signed with ${TEAMS[p.rival].name}.`);
    return { ...p, status: "lost" as const };
  });
  return { players: next, nil, signees, rec: { ...rec, board, signed: true, points: 0, log: [...log.reverse(), ...rec.log] } };
}
