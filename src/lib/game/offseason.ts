// The offseason: portal window (your departures + other schools' transfers) and recruiting
// (a big board of high-school prospects over three rounds, then Signing Day). Pure functions.

import { TEAMS, USER_TEAM, type TeamId } from "./data";
import { hashSeed, makeRng } from "./rng";
import { POS_ORDER, STARTERS, type Player, type Pos } from "./roster";
import { ALL_TEAMS, freeNumber, makePerson } from "./season";

export const ROSTER_MAX = 40;
export const RECRUIT_ROUNDS = 3;
export const POINTS_PER_ROUND = 12;
export const PITCH_COST = 1;
export const VISIT_COST = 4;
export const MAX_PITCHES_PER_ROUND = 3;

export type Phase = "portal" | "recruiting" | "ready";

export interface Departure {
  playerId: string;
  keepCost: number; // NIL raise to stay
  call: "keep" | "release" | null;
}

export interface Transfer {
  id: string;
  name: string;
  from: TeamId;
  pos: Pos;
  yr: "So" | "Jr" | "Sr";
  ovr: number;
  pot: number;
  ask: number;
  rivals: number;
  note: string;
  hometown: string;
}

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
  you: number; // interest in the Stallions, 0-100
  them: number; // interest in the rival
  visited: boolean;
  offered: boolean;
  pitchesThisRound: number;
  status: "open" | "signed" | "lost";
}

export interface OffseasonState {
  phase: Phase;
  departures: Departure[];
  pool: Transfer[];
  bids: { id: string; amount: number; status: "pending" | "signed" | "lost" }[];
  board: Prospect[];
  round: number; // 1..RECRUIT_ROUNDS; RECRUIT_ROUNDS + 1 after Signing Day
  points: number;
  log: string[]; // what happened, newest first
}

const pick = <T,>(rng: () => number, xs: readonly T[]) => xs[Math.floor(rng() * xs.length)];
const clamp = (x: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));

/** Positions where the roster is thin weigh more when generating transfers and prospects. */
function needWeights(players: Player[]): [Pos, number][] {
  return POS_ORDER.map((pos) => {
    const have = players.filter((p) => p.pos === pos && p.yr !== "HS" && p.yr !== "Sr").length;
    const want = STARTERS[pos] + 1;
    const base = pos === "K" || pos === "P" ? 0.3 : STARTERS[pos];
    return [pos, base * (have < want ? 2.2 : 1)];
  });
}

function weightedPos(rng: () => number, weights: [Pos, number][]): Pos {
  const total = weights.reduce((n, [, w]) => n + w, 0);
  let roll = rng() * total;
  for (const [pos, w] of weights) {
    roll -= w;
    if (roll <= 0) return pos;
  }
  return weights[weights.length - 1][0];
}

/**
 * Build the offseason after graduation and development: which backups want out, who is in the
 * portal, and who is on the recruiting board. `prestige` (0-1) reflects last season's finish.
 */
export function openOffseason(players: Player[], depth: Record<Pos, string[]>, seed: number, season: number, prestige: number): OffseasonState {
  const rng = makeRng(hashSeed("offseason-open", seed, season));
  const byId = new Map(players.map((p) => [p.id, p]));

  // Backups with real talent and eligibility left may ask to leave for playing time.
  const departures: Departure[] = [];
  for (const pos of POS_ORDER) {
    const list = depth[pos].map((id) => byId.get(id)).filter((p): p is Player => !!p && p.yr !== "HS");
    for (const p of list.slice(STARTERS[pos])) {
      if ((p.yr === "So" || p.yr === "Jr") && p.ovr >= 74 && rng() < 0.45) {
        departures.push({ playerId: p.id, keepCost: 40_000 + Math.max(0, p.ovr - 72) * 12_000, call: null });
      }
    }
  }

  const weights = needWeights(players);
  const others = ALL_TEAMS.filter((t) => t !== USER_TEAM);

  const pool: Transfer[] = Array.from({ length: 14 }, (_, i) => {
    const who = makePerson(["transfer", seed, season, i]);
    const r = who.rng;
    const pos = weightedPos(r, weights);
    const ovr = 74 + Math.floor(r() * 16);
    const yr = pick(r, ["So", "Jr", "Jr", "Sr", "Sr"] as const);
    const from = pick(r, others);
    return {
      id: `tr-${season}-${i}`,
      name: who.name,
      from,
      pos,
      yr,
      ovr,
      pot: Math.min(97, ovr + (yr === "Sr" ? 0 : yr === "Jr" ? 2 + Math.floor(r() * 3) : 4 + Math.floor(r() * 5))),
      ask: Math.round((60_000 + (ovr - 72) * 22_000) / 5_000) * 5_000,
      rivals: Math.floor(r() * (ovr >= 85 ? 9 : 6)),
      note: pick(r, [
        "Wants a bigger role and a contender.",
        "Looking to play closer to home.",
        "Lost his starting job after a coaching change.",
        "Following his position coach out the door.",
        "Wants to test himself at a higher level.",
      ]),
      hometown: who.hometown,
    };
  }).sort((a, b) => b.ovr - a.ovr);

  const STAR_SPREAD: (2 | 3 | 4 | 5)[] = [5, 5, 4, 4, 4, 4, 4, 4, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2];
  const board: Prospect[] = STAR_SPREAD.map((stars, i) => {
    const who = makePerson(["recruit", seed, season, i]);
    const r = who.rng;
    const pos = weightedPos(r, weights);
    const ovr = { 5: 74, 4: 70, 3: 66, 2: 62 }[stars] + Math.floor(r() * 6);
    const pot = { 5: 92, 4: 86, 3: 80, 2: 75 }[stars] + Math.floor(r() * 7);
    const ask = { 5: 250_000, 4: 100_000, 3: 30_000, 2: 10_000 }[stars] + Math.floor(r() * 4) * { 5: 50_000, 4: 25_000, 3: 10_000, 2: 3_000 }[stars];
    const you = clamp(Math.round(55 - stars * 6 + prestige * 25 + (r() - 0.5) * 16));
    const them = clamp(Math.round(30 + stars * 5 + (r() - 0.5) * 16));
    return {
      id: `hs-${season}-${i}`,
      name: who.name,
      pos,
      stars,
      ovr,
      pot,
      ask,
      hometown: who.hometown,
      rival: pick(r, others),
      you,
      them,
      visited: false,
      offered: false,
      pitchesThisRound: 0,
      status: "open" as const,
    };
  });

  return { phase: "portal", departures, pool, bids: [], board, round: 1, points: POINTS_PER_ROUND, log: [] };
}

// ---- Roster spots -------------------------------------------------------------------

/** Spots left under the roster cap, counting pending bids and open offers. */
export function openSpots(players: Player[], off: OffseasonState) {
  const released = off.departures.filter((d) => d.call === "release").length;
  const pendingBids = off.bids.filter((b) => b.status === "pending").length;
  const offers = off.board.filter((p) => p.offered && p.status === "open").length;
  return ROSTER_MAX - players.length + released - pendingBids - offers;
}

// ---- Portal window ------------------------------------------------------------------

export function signChance(t: Transfer, hype: number, prestige: number) {
  return clamp(0.82 - t.rivals * 0.06 + (hype - 50) / 250 + prestige * 0.12, 0.12, 0.93);
}

/** Close the window: departures who weren't kept leave, bids resolve, signings join the roster. */
export function closePortal(players: Player[], off: OffseasonState, nil: number, seed: number, season: number, hype: number, prestige: number) {
  const rng = makeRng(hashSeed("portal-close", seed, season));
  const leaving = new Set(off.departures.filter((d) => d.call !== "keep").map((d) => d.playerId));
  const transfersOut = players.filter((p) => leaving.has(p.id));
  let next = players.filter((p) => !leaving.has(p.id));
  const transfersIn: Player[] = [];
  const log: string[] = [];
  for (const p of transfersOut) log.push(`${p.pos} ${p.name} transferred out.`);

  const bids = off.bids.map((b) => {
    if (b.status !== "pending") return b;
    const t = off.pool.find((x) => x.id === b.id)!;
    if (rng() < signChance(t, hype, prestige)) {
      const pl: Player = { id: t.id, name: t.name, num: freeNumber(next, rng), pos: t.pos, yr: t.yr, ovr: t.ovr, pot: t.pot, hometown: `via ${TEAMS[t.from].name}`, nil: b.amount, source: "portal" };
      next = [...next, pl];
      transfersIn.push(pl);
      log.push(`${t.pos} ${t.name} (${t.ovr}) signed from ${TEAMS[t.from].name}.`);
      return { ...b, status: "signed" as const };
    }
    nil += b.amount;
    log.push(`${t.pos} ${t.name} chose another school. ${Math.round(b.amount / 1000)}K returned.`);
    return { ...b, status: "lost" as const };
  });

  return {
    players: next,
    nil,
    transfersOut,
    transfersIn,
    off: { ...off, phase: "recruiting" as const, bids, log: [...log.reverse(), ...off.log] },
  };
}

// ---- Recruiting --------------------------------------------------------------------

/** Chance a prospect with an offer picks you on Signing Day. */
export function commitChance(p: Prospect) {
  return 1 / (1 + Math.exp(-(p.you - p.them) / 7));
}

export function pitch(off: OffseasonState, id: string, seed: number): OffseasonState {
  const p = off.board.find((x) => x.id === id);
  if (!p || p.status !== "open" || off.points < PITCH_COST || p.pitchesThisRound >= MAX_PITCHES_PER_ROUND) return off;
  const rng = makeRng(hashSeed("pitch", seed, id, off.round, p.pitchesThisRound));
  const gain = Math.round((8 - p.pitchesThisRound * 2) + rng() * 4); // diminishing within a round
  return {
    ...off,
    points: off.points - PITCH_COST,
    board: off.board.map((x) => (x.id === id ? { ...x, you: clamp(x.you + gain), pitchesThisRound: x.pitchesThisRound + 1 } : x)),
  };
}

export function visit(off: OffseasonState, id: string, seed: number): OffseasonState {
  const p = off.board.find((x) => x.id === id);
  if (!p || p.status !== "open" || p.visited || off.points < VISIT_COST) return off;
  const rng = makeRng(hashSeed("visit", seed, id));
  const gain = 15 + Math.round(rng() * 10);
  return {
    ...off,
    points: off.points - VISIT_COST,
    board: off.board.map((x) => (x.id === id ? { ...x, you: clamp(x.you + gain), visited: true } : x)),
    log: [`Official visit: ${p.name} (+${gain} interest).`, ...off.log],
  };
}

/** Offer an NIL deal. Required to sign him; reserves the money and a roster spot. */
export function offer(off: OffseasonState, id: string, nil: number, spots: number) {
  const p = off.board.find((x) => x.id === id);
  if (!p || p.status !== "open" || p.offered || nil < p.ask || spots < 1) return { off, nil };
  return {
    nil: nil - p.ask,
    off: { ...off, board: off.board.map((x) => (x.id === id ? { ...x, offered: true, you: clamp(x.you + 5) } : x)) },
  };
}

export function withdraw(off: OffseasonState, id: string, nil: number) {
  const p = off.board.find((x) => x.id === id);
  if (!p || !p.offered || p.status !== "open") return { off, nil };
  return { nil: nil + p.ask, off: { ...off, board: off.board.map((x) => (x.id === id ? { ...x, offered: false, you: clamp(x.you - 5) } : x)) } };
}

/** End a recruiting round: rivals make their pushes. After the last round, Signing Day. */
export function endRound(players: Player[], off: OffseasonState, nil: number, seed: number, season: number) {
  const rng = makeRng(hashSeed("round", seed, season, off.round));
  const board = off.board.map((p) => {
    if (p.status !== "open") return p;
    const push = 3 + Math.round(rng() * (4 + p.stars * 2));
    const fade = p.pitchesThisRound === 0 && !p.visited ? 3 : 0;
    return { ...p, them: clamp(p.them + push), you: clamp(p.you - fade), pitchesThisRound: 0 };
  });
  if (off.round < RECRUIT_ROUNDS) {
    return { players, nil, recruits: [] as Player[], off: { ...off, board, round: off.round + 1, points: POINTS_PER_ROUND } };
  }

  // Signing Day.
  const recruits: Player[] = [];
  const log: string[] = [];
  let next = players;
  const final = board.map((p) => {
    if (p.status !== "open") return p;
    if (!p.offered) return { ...p, status: "lost" as const };
    if (rng() < commitChance(p)) {
      const pl: Player = { id: p.id, name: p.name, num: freeNumber(next, rng), pos: p.pos, yr: "Fr", ovr: p.ovr, pot: p.pot, hometown: p.hometown, nil: p.ask, source: "recruit" };
      next = [...next, pl];
      recruits.push(pl);
      log.push(`${"★".repeat(p.stars)} ${p.pos} ${p.name} signed with the Stallions.`);
      return { ...p, status: "signed" as const };
    }
    nil += p.ask;
    log.push(`${"★".repeat(p.stars)} ${p.pos} ${p.name} picked ${TEAMS[p.rival].name}.`);
    return { ...p, status: "lost" as const };
  });
  return {
    players: next,
    nil,
    recruits,
    off: { ...off, board: final, round: RECRUIT_ROUNDS + 1, points: 0, phase: "ready" as const, log: [...log.reverse(), ...off.log] },
  };
}

/** 0-1 program prestige from last season, used for recruiting interest and portal pull. */
export function prestigeFrom(finish: string, rank: number) {
  if (finish === "National champions") return 1;
  const base = Math.max(0, (21 - rank) / 20) * 0.6;
  return Math.min(1, base + (finish.startsWith("Lost in") || finish === "Made the playoff" ? 0.25 : 0));
}
