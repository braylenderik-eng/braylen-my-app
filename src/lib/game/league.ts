// Conference identities and rivalries. Each dynasty draws its own rivalries (mostly within a conference),
// with a trophy, a series record and a holder. Rivalry games are played in rivalry week (Week 12).
// Pure data and helpers.

import { TEAMS, type TeamId } from "./data";
import { hashSeed, makeRng } from "./rng";

export interface ConferenceIdentity {
  tagline: string;
  style: string; // how the league plays, shown on the conference card
  lean: { off: number; def: number }; // where its teams' ratings drift over time (relative to the league middle)
  states: string[]; // home recruiting region
}

export const CONFERENCES: Record<string, ConferenceIdentity> = {
  "Delta League": {
    tagline: "Trench wars and defenses full of future pros",
    style: "Defense first",
    lean: { off: -1, def: 3 },
    states: ["LA", "MS", "AL"],
  },
  "Redrock Circuit": {
    tagline: "Thin air, late kickoffs and 50-point shootouts",
    style: "Air it out",
    lean: { off: 3, def: -2 },
    states: ["AZ", "NM", "NV", "UT", "CO", "CA"],
  },
  "Atlantic Circuit": {
    tagline: "The oldest rivalries in the game, played under center",
    style: "Pro style",
    lean: { off: 1, def: 1 },
    states: ["VA", "NC", "MD", "KY", "PA", "OH"],
  },
  "Mesa League": {
    tagline: "Friday-night-lights country: run it and dare them to stop it",
    style: "Ground game",
    lean: { off: 2, def: 0 },
    states: ["TX", "OK", "AR"],
  },
  "Sun Coast Conference": {
    tagline: "Track-meet speed on the coast",
    style: "Speed in space",
    lean: { off: 1, def: -1 },
    states: ["FL", "GA", "SC"],
  },
  "Plains Athletic": {
    tagline: "Cold Novembers and ball-control football",
    style: "Ball control",
    lean: { off: -1, def: 1 },
    states: ["KS", "NE", "SD", "ND", "IA"],
  },
};

export const conferenceOf = (team: TeamId) => CONFERENCES[TEAMS[team].conf];

/** Whether a prospect's hometown ("City, ST") is in a team's conference footprint. */
export function inRegion(team: TeamId, hometown: string) {
  const st = hometown.split(", ").pop() ?? "";
  return conferenceOf(team)?.states.includes(st) ?? false;
}

export interface Rivalry {
  a: TeamId;
  b: TeamId;
  trophy: string;
  since: number;
  series: Record<string, number>; // wins by team id
  holder: TeamId; // who has the trophy
  last?: { season: number; winner: TeamId; score: string };
}

const TROPHY_A = ["Old", "Iron", "Golden", "Rusty", "Silver", "Copper", "Brass", "Cedar", "Black", "Lantern", "Prairie", "River", "Railroad", "Governor's", "Founders'"];
const TROPHY_B = ["Bell", "Skillet", "Spur", "Bucket", "Anvil", "Lantern", "Plow", "Paddle", "Saddle", "Compass", "Kettle", "Horseshoe", "Cannon", "Shovel", "Boot", "Oar"];
const NAME_A = ["Battle for the", "Fight for the", "", "", ""];

/**
 * Pair every team with a rival, within its conference. `fixed` pairs are kept (the classic start
 * makes the Stallions and Rangers rivals).
 */
export function makeRivalries(seed: number, fixed: [TeamId, TeamId][] = []): Rivalry[] {
  const rng = makeRng(hashSeed("rivalries", seed));
  const byConf = new Map<string, TeamId[]>();
  const taken = new Set(fixed.flat());
  for (const id of Object.keys(TEAMS) as TeamId[]) {
    if (taken.has(id)) continue;
    const c = TEAMS[id].conf;
    byConf.set(c, [...(byConf.get(c) ?? []), id]);
  }
  const pairs: [TeamId, TeamId][] = [...fixed];
  const leftovers: TeamId[] = [];
  for (const ids of byConf.values()) {
    const xs = [...ids];
    for (let i = xs.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [xs[i], xs[j]] = [xs[j], xs[i]];
    }
    for (let i = 0; i + 1 < xs.length; i += 2) pairs.push([xs[i], xs[i + 1]]);
    if (xs.length % 2) leftovers.push(xs[xs.length - 1]);
  }
  for (let i = 0; i + 1 < leftovers.length; i += 2) pairs.push([leftovers[i], leftovers[i + 1]]);

  const used = new Set<string>();
  return pairs.map(([a, b]) => {
    let trophy = "";
    do {
      const t = `${TROPHY_A[Math.floor(rng() * TROPHY_A.length)]} ${TROPHY_B[Math.floor(rng() * TROPHY_B.length)]}`;
      trophy = `${NAME_A[Math.floor(rng() * NAME_A.length)]} ${t}`.trim();
      if (!trophy.startsWith("Battle") && !trophy.startsWith("Fight")) trophy = `The ${trophy}`;
    } while (used.has(trophy.replace(/^(Battle for the|Fight for the|The) /, "")) && used.size < 200);
    used.add(trophy.replace(/^(Battle for the|Fight for the|The) /, ""));
    const games = 40 + Math.floor(rng() * 80);
    const aWins = Math.round(games * (0.35 + rng() * 0.3));
    return {
      a,
      b,
      trophy,
      since: 1890 + Math.floor(rng() * 85),
      series: { [a]: aWins, [b]: games - aWins },
      holder: rng() < 0.5 ? a : b,
    };
  });
}

export const rivalryOf = (rivalries: Rivalry[] | undefined, team: TeamId) => rivalries?.find((r) => r.a === team || r.b === team);
export const rivalOf = (r: Rivalry, team: TeamId) => (r.a === team ? r.b : r.a);
export const isRivalry = (rivalries: Rivalry[] | undefined, x: TeamId, y: TeamId) =>
  !!rivalries?.some((r) => (r.a === x && r.b === y) || (r.a === y && r.b === x));

/** Record rivalry results for the week's games. Returns the updated list. */
export function recordRivalries(rivalries: Rivalry[], season: number, games: { home: TeamId; away: TeamId; homeScore: number; awayScore: number }[]) {
  return rivalries.map((r) => {
    const g = games.find((x) => (x.home === r.a && x.away === r.b) || (x.home === r.b && x.away === r.a));
    if (!g) return r;
    const winner = g.homeScore > g.awayScore ? g.home : g.away;
    const hi = Math.max(g.homeScore, g.awayScore);
    const lo = Math.min(g.homeScore, g.awayScore);
    return { ...r, series: { ...r.series, [winner]: (r.series[winner] ?? 0) + 1 }, holder: winner, last: { season, winner, score: `${hi}–${lo}` } };
  });
}

/** Display name for a trophy game, e.g. "the Iron Skillet" or "the Battle for the Old Bell". */
export function trophyRef(r: Rivalry) {
  return r.trophy.startsWith("The ") ? `the ${r.trophy.slice(4)}` : `the ${r.trophy}`;
}
