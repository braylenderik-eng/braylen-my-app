// The money side of the game, at 2026-27 scale. Two sources pay players:
//   - revenue sharing from the school, capped at REV_SHARE_CAP per school (football usually gets ~75%), and
//   - NIL deals from the collective and boosters on top, where the big programs pull ahead.
// Player pay follows position and rating. Parity comes from the other side of the ledger: good rosters
// cost more to keep, so the big programs' room to add players isn't much bigger than anyone else's.
// Pure functions.

import { hashSeed, makeRng } from "./rng";
import type { Player, Pos } from "./roster";

export const REV_SHARE_CAP = 21_580_000; // per school, 2026-27 (College Sports Commission)
export const FOOTBALL_SHARE = 0.75;
export const FOOTBALL_REV_SHARE = Math.round((REV_SHARE_CAP * FOOTBALL_SHARE) / 10_000) * 10_000;

/** How the market prices each position (quarterbacks first, specialists last). */
export const POS_PAY: Record<Pos, number> = {
  QB: 3,
  EDGE: 1.5,
  OT: 1.4,
  WR: 1.3,
  CB: 1.2,
  RB: 1,
  DT: 1,
  S: 0.9,
  LB: 0.9,
  TE: 0.8,
  IOL: 0.8,
  K: 0.2,
  P: 0.15,
};

const round5k = (x: number) => Math.round(x / 5_000) * 5_000;
export const MAX_PAY = 6_500_000; // the top of the 2026 quarterback market

/**
 * What a player is worth for a season: about $100K at 70 OVR, rising ~15% per point, scaled by position.
 * A 90 OVR quarterback lands around $6M, a starting interior lineman in the mid six figures.
 */
export function marketValue(pos: Pos, ovr: number, id: string): number {
  const r = makeRng(hashSeed("pay", id))();
  return Math.min(MAX_PAY, Math.max(10_000, round5k(100_000 * Math.pow(1.15, ovr - 70) * POS_PAY[pos] * (0.85 + r * 0.3))));
}

/** A high-school prospect's asking price, by star rating (quarterbacks ask more, specialists less). */
export function recruitAsk(stars: 2 | 3 | 4 | 5, pos: Pos, rng: () => number): number {
  const [lo, hi] = { 5: [600_000, 1_500_000], 4: [150_000, 400_000], 3: [30_000, 80_000], 2: [10_000, 25_000] }[stars];
  const posAdj = pos === "QB" ? 1.5 : pos === "K" || pos === "P" ? 0.3 : 1;
  return Math.max(10_000, round5k((lo + rng() * (hi - lo)) * posAdj));
}

/** A transfer's ask: market value plus a portal premium. */
export const transferAsk = (pos: Pos, ovr: number, id: string) => round5k(marketValue(pos, ovr, id) * 1.1);

/** What it costs to keep an unhappy player: a raise worth about a quarter of his value. */
export const retentionCost = (pos: Pos, ovr: number, id: string) => round5k(25_000 + marketValue(pos, ovr, id) * 0.25);

export const payroll = (players: Pick<Player, "nil">[]) => players.reduce((n, p) => n + p.nil, 0);

/** Re-price a roster at market value (each offseason players who developed get raises). Walk-ons stay unpaid. */
export function reprice(players: Player[]): Player[] {
  return players.map((p) => (p.source === "walkon" || p.yr === "HS" || (p.contractYears ?? 0) > 0 ? p : { ...p, nil: Math.max(p.nil, marketValue(p.pos, p.ovr, p.id)) }));
}

/** The collective always finds something: the minimum room to add players, at a new job and each offseason. */
export const MIN_ROOM = { start: 3_000_000, season: 1_500_000 };

/** Season-end changes to next year's budget. */
export const BUDGET_PER_WIN = 150_000;
export const PLAYOFF_BUDGET = { title: 2_000_000, playoff: 750_000 };

/** Room to add players: the football budget minus current payroll and money already promised. */
export function capRoom(budget: number, players: Pick<Player, "nil">[], floor = 0) {
  return Math.max(floor, budget - payroll(players));
}

/**
 * Playing time: how many returning players would still be ahead of a newcomer next season. A clear path to
 * start pulls players in; a crowded room pushes them away, no matter how much money is on the table.
 */
export function playingTime(players: Pick<Player, "pos" | "ovr" | "yr">[], pos: Pos, ovr: number, starters: number): "path" | "crowded" | undefined {
  const ahead = players.filter((p) => p.pos === pos && p.yr !== "Sr" && p.ovr >= ovr).length;
  if (ahead < starters) return "path";
  if (ahead > starters) return "crowded";
  return undefined;
}
