// Player development and the NFL Draft: draft grades, early entries, the draft itself, spring
// practice focus and redshirts. Pure functions.

import { marketValue } from "./economy";
import { hashSeed, makeRng } from "./rng";
import type { Player, Pos } from "./roster";
import { potentialOf } from "./season";

// ---- Draft grades ---------------------------------------------------------------------

const POS_PREMIUM: Partial<Record<Pos, number>> = { QB: 1.5, EDGE: 1, OT: 1, CB: 0.5, WR: 0.5, K: -4, P: -4 };

/** A player's stock: rating, position value, and the awards he's won. */
export function draftScore(p: Pick<Player, "ovr" | "pos" | "awards">) {
  const awards = p.awards ?? [];
  const bonus =
    (awards.some((a) => a.includes("Crown")) ? 4 : 0) +
    Math.min(3, awards.filter((a) => !a.includes("All-Conference") && !a.includes("Crown")).length * 2) +
    Math.min(2, awards.filter((a) => a.includes("All-Conference")).length);
  return p.ovr + (POS_PREMIUM[p.pos] ?? 0) + bonus;
}

/** Projected round (1-7), or null for undrafted. */
export function projectedRound(p: Pick<Player, "ovr" | "pos" | "awards">): number | null {
  const s = draftScore(p);
  if (s >= 91) return 1;
  if (s >= 88) return 2;
  if (s >= 86) return 3;
  if (s >= 84) return 4;
  if (s >= 82) return 5;
  if (s >= 80) return 6;
  if (s >= 78) return 7;
  return null;
}

export const roundLabel = (r: number | null) => (r === null ? "Undrafted" : `Round ${r}`);

// ---- Early entry ---------------------------------------------------------------------------

export interface Declaration {
  playerId: string;
  round: number; // projected
  cost: number; // what it takes to make your pitch (an NIL raise)
  call: "pitch" | "release" | null;
}

/** Chance he returns for his senior year, with and without your pitch. */
export function stayChance(round: number, pitched: boolean) {
  const base = { 1: 0.12, 2: 0.3, 3: 0.5 }[round] ?? 0.65;
  return pitched ? Math.min(0.9, base + 0.25) : base * 0.4;
}

/**
 * After the season, juniors with a top-three-round grade may declare early. The better his stock, the
 * likelier he goes. Call this on the roster before it ages (so juniors are still juniors).
 */
export function earlyEntries(players: Player[], seed: number, season: number): Declaration[] {
  const out: Declaration[] = [];
  for (const p of players) {
    if (p.yr !== "Jr") continue;
    const round = projectedRound(p);
    if (round === null || round > 3) continue;
    const r = makeRng(hashSeed("declare", seed, season, p.id))();
    if (r < { 1: 0.9, 2: 0.65, 3: 0.4 }[round]!) {
      out.push({ playerId: p.id, round, cost: Math.round((marketValue(p.pos, p.ovr, p.id) * 0.5) / 5_000) * 5_000, call: null });
    }
  }
  return out;
}

/** Decide early entries when the window closes: pitched players may stay (for a raise); everyone else leaves. */
export function resolveEntries(decls: Declaration[], seed: number, season: number) {
  const stays: Declaration[] = [];
  const leaves: Declaration[] = [];
  for (const d of decls) {
    const r = makeRng(hashSeed("stay", seed, season, d.playerId))();
    (r < stayChance(d.round, d.call === "pitch") ? stays : leaves).push(d);
  }
  return { stays, leaves };
}

// ---- The draft ------------------------------------------------------------------------------

export interface DraftPick {
  season: number; // the college season he last played
  playerId: string;
  name: string;
  pos: Pos;
  round: number | null; // null: undrafted free agent
  pick: number | null; // overall pick
  early: boolean; // left with eligibility remaining
}

/** Your draft class: graduating seniors and early entries, with rounds that can slide either way. */
export function runDraft(players: (Player & { early?: boolean })[], seed: number, season: number): DraftPick[] {
  return players
    .map((p) => {
      const rng = makeRng(hashSeed("draft", seed, season, p.id));
      const proj = projectedRound(p);
      let round = proj === null ? (rng() < 0.15 ? 7 : null) : proj + (rng() < 0.25 ? -1 : rng() < 0.35 ? 1 : 0);
      if (round !== null && (round < 1 || round > 7)) round = round < 1 ? 1 : null;
      return {
        season,
        playerId: p.id,
        name: p.name,
        pos: p.pos,
        round,
        pick: round === null ? null : (round - 1) * 32 + 1 + Math.floor(rng() * 32),
        early: !!p.early,
      };
    })
    .sort((a, b) => (a.pick ?? 999) - (b.pick ?? 999));
}

/** "We put guys in the league": recent draft classes help recruiting (interest points, capped). */
export function draftPedigree(history: DraftPick[], season: number) {
  const recent = history.filter((d) => d.season >= season - 2 && d.round !== null);
  const first = recent.filter((d) => d.round === 1).length;
  return Math.min(4, first + Math.floor((recent.length - first) / 3));
}

// ---- Spring practice ------------------------------------------------------------------------

export const FOCUS_GROUPS: Record<string, Pos[]> = {
  Quarterbacks: ["QB"],
  "Backs & tight ends": ["RB", "TE"],
  Receivers: ["WR"],
  "Offensive line": ["OT", "IOL"],
  "Defensive line": ["EDGE", "DT"],
  Linebackers: ["LB"],
  Secondary: ["CB", "S"],
};
export const MAX_FOCUS = 2;

/** Spring practice: players in the focus groups get extra development (up to their potential). */
export function springPractice(players: Player[], focus: string[], seed: number, season: number) {
  const pos = new Set(focus.flatMap((f) => FOCUS_GROUPS[f] ?? []));
  const gains: { player: Player; from: number; to: number }[] = [];
  const next = players.map((p) => {
    if (!pos.has(p.pos) || p.source === "walkon") return p;
    const pot = potentialOf(p);
    const r = makeRng(hashSeed("spring", seed, season, p.id))();
    const to = Math.min(Math.max(pot, p.ovr), p.ovr + 1 + Math.floor(r * 3));
    if (to === p.ovr) return p;
    gains.push({ player: p, from: p.ovr, to });
    return { ...p, ovr: to };
  });
  return { players: next, gains };
}

// ---- Redshirts ------------------------------------------------------------------------------

/** Last regular-season week you can still redshirt a freshman (he's played at most four games). */
export const REDSHIRT_DEADLINE = 4;

export const canRedshirt = (p: Player, week: number, inSeason: boolean) => inSeason && week <= REDSHIRT_DEADLINE && p.yr === "Fr" && !p.rsUsed;
