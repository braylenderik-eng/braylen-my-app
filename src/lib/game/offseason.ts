// The offseason: the January transfer window. Your backups who want playing time may enter, and
// players from other schools are available to bid on. (College football has one transfer window, in
// January; there is no spring or in-season window.) Recruiting happens during the season — see
// recruiting.ts. Pure functions.

import { PORTAL, TEAMS, type TeamId } from "./data";
import { hashSeed, makeRng } from "./rng";
import { playingTime, retentionCost, transferAsk } from "./economy";
import type { Declaration } from "./draft";
import { bidEdge, rivalOpening } from "./negotiation";
import { POS_ORDER, STARTERS, type Player, type Pos } from "./roster";
import { ROSTER_MAX, needWeights, weightedPos } from "./recruiting";
import { ALL_TEAMS, freeNumber, makePerson } from "./season";

export { ROSTER_MAX };
export const PORTAL_WINDOW = "Jan 4–13"; // the 10-day January window

export type Phase = "portal" | "ready";

export interface Departure {
  playerId: string;
  keepCost: number; // NIL/revenue-share raise to stay
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
  room?: "path" | "crowded"; // playing time at your school
  rivalBid?: number; // the best rival school's offer (0 when nobody else is in)
}

export interface OffseasonState {
  phase: Phase;
  declarations?: Declaration[]; // juniors who declared for the NFL Draft
  draftPool?: (Player & { early?: boolean })[]; // your draft class: graduating seniors and early entries
  focus?: string[]; // spring practice position groups
  departures: Departure[];
  pool: Transfer[];
  bids: { id: string; amount: number; years?: number; status: "pending" | "signed" | "lost" }[];
  log: string[];
}

const pick = <T,>(rng: () => number, xs: readonly T[]) => xs[Math.floor(rng() * xs.length)];
const clamp = (x: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));

const teamByName = (name: string): TeamId => (Object.keys(TEAMS) as TeamId[]).find((id) => TEAMS[id].name === name) ?? "iron";

/** The Season 1 "portal watch" players, entering in the first January window. */
function watchListTransfers(): Transfer[] {
  return PORTAL.map((p) => ({
    id: `watch-${p.id}`,
    name: p.name,
    from: teamByName(p.from),
    pos: p.pos as Pos,
    yr: (p.yr === "Sr" ? "Sr" : p.yr === "Jr" ? "Jr" : "So") as Transfer["yr"],
    ovr: p.ovr,
    pot: p.pot,
    ask: transferAsk(p.pos as Pos, p.ovr, `watch-${p.id}`),
    rivals: p.rivals,
    note: p.note,
    hometown: `via ${p.from}`,
  }));
}

/**
 * Open the January window after graduation and development: which backups want out, and who is
 * in the portal. In the first offseason the pool starts with the players you watched in Season 1.
 */
export function openOffseason(players: Player[], depth: Record<Pos, string[]>, seed: number, season: number, team: TeamId = "stallions", watchList = season === 2): OffseasonState {
  const rng = makeRng(hashSeed("offseason-open", seed, season));
  const byId = new Map(players.map((p) => [p.id, p]));

  // Backups with real talent and eligibility left may enter the portal for playing time.
  const departures: Departure[] = [];
  for (const pos of POS_ORDER) {
    const list = depth[pos].map((id) => byId.get(id)).filter((p): p is Player => !!p && p.yr !== "HS");
    for (const p of list.slice(STARTERS[pos])) {
      if (p.promised) continue;
      if (p.frustrated || ((p.yr === "So" || p.yr === "Jr") && p.ovr >= 74 && rng() < 0.45)) {
        departures.push({ playerId: p.id, keepCost: retentionCost(p.pos, p.ovr, p.id), call: null });
      }
    }
  }

  const weights = needWeights(players);
  const others = ALL_TEAMS.filter((t) => t !== team);
  const carried = watchList ? watchListTransfers().filter((t) => t.from !== team) : [];
  const generated: Transfer[] = Array.from({ length: 14 - carried.length }, (_, i) => {
    const who = makePerson(["transfer", seed, season, i]);
    const r = who.rng;
    const pos = weightedPos(r, weights);
    const ovr = 74 + Math.floor(r() * 16);
    const yr = pick(r, ["So", "Jr", "Jr", "Sr", "Sr"] as const);
    return {
      id: `tr-${season}-${i}`,
      name: who.name,
      from: pick(r, others),
      pos,
      yr,
      ovr,
      pot: Math.min(97, ovr + (yr === "Sr" ? 0 : yr === "Jr" ? 2 + Math.floor(r() * 3) : 4 + Math.floor(r() * 5))),
      ask: transferAsk(pos, ovr, `tr-${season}-${i}`),
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
  });

  // Playing time decides a lot of portal moves: a path to start pulls, a crowded room pushes.
  const pool = [...carried, ...generated]
    .map((t) => ({
      ...t,
      room: playingTime(players, t.pos, t.ovr, STARTERS[t.pos]),
      // More schools in on him means a richer best offer.
      rivalBid: t.rivals > 0 ? rivalOpening(t.ask, makeRng(hashSeed("rival-bid", seed, t.id))(), Math.min(0.2, t.rivals * 0.03)) : 0,
    }))
    .sort((a, b) => b.ovr - a.ovr);
  return { phase: "portal", departures, pool, bids: [], log: [] };
}

/** Spots left under the roster cap during the window, counting releases and pending bids. */
export function openSpots(players: Player[], off: OffseasonState) {
  const released = off.departures.filter((d) => d.call === "release").length;
  const pendingBids = off.bids.filter((b) => b.status === "pending").length;
  return ROSTER_MAX - players.length + released - pendingBids;
}

export function signChance(t: Transfer, hype: number, prestige: number, bid?: number) {
  const money = bid ? bidEdge(bid, t.rivalBid ?? 0, t.ask) : 0;
  return clamp(0.8 - t.rivals * 0.06 + (hype - 50) / 250 + prestige * 0.08 + (t.room === "path" ? 0.12 : t.room === "crowded" ? -0.15 : 0) + money, 0.08, 0.95);
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
    if (rng() < signChance(t, hype, prestige, b.amount)) {
      const pl: Player = { id: t.id, name: t.name, num: freeNumber(next, rng), pos: t.pos, yr: t.yr, ovr: t.ovr, pot: t.pot, hometown: `via ${TEAMS[t.from].name}`, nil: b.amount, source: "portal", contractYears: b.years ?? 1 };
      next = [...next, pl];
      transfersIn.push(pl);
      log.push(`${t.pos} ${t.name} (${t.ovr}) signed from ${TEAMS[t.from].name}.`);
      return { ...b, status: "signed" as const };
    }
    nil += b.amount;
    log.push(`${t.pos} ${t.name} chose another school. ${Math.round(b.amount / 1000)}K returned.`);
    return { ...b, status: "lost" as const };
  });

  return { players: next, nil, transfersOut, transfersIn, off: { ...off, phase: "ready" as const, bids, log: [...log.reverse(), ...off.log] } };
}

/** 0-1 program prestige from last season, used for recruiting interest and portal pull. */
export function prestigeFrom(finish: string, rank: number) {
  if (finish === "National champions") return 1;
  const base = Math.max(0, (21 - rank) / 20) * 0.6;
  return Math.min(1, base + (finish.startsWith("Lost in") || finish === "Made the playoff" ? 0.25 : 0));
}
