// Multi-season helpers: schedules, preseason rankings, opponent rating drift and the
// offseason (graduation, progression, incoming freshmen). Pure functions.

import { TEAMS, USER_TEAM, type Fixture, type TeamId } from "./data";
import { hashSeed, makeRng } from "./rng";
import { POS_ORDER, STARTERS, type Player, type Pos, type Year } from "./roster";

export const SEASON_WEEKS = 12;
export const ALL_TEAMS = Object.keys(TEAMS) as TeamId[];

export type Ratings = Record<TeamId, { off: number; def: number }>;

export function baseRatings(): Ratings {
  return Object.fromEntries(ALL_TEAMS.map((id) => [id, { off: TEAMS[id].off, def: TEAMS[id].def }])) as Ratings;
}

// ---- Schedule -------------------------------------------------------------------

const KICKOFFS = ["Sat 11:00 AM ET", "Sat 12:00 PM CT", "Sat 2:30 PM CT", "Sat 3:30 PM ET", "Sat 6:00 PM CT", "Sat 7:30 PM ET", "Sat 9:15 PM MT"];

/**
 * A 12-week schedule where every team plays every week (circle-method round robin over
 * 20 teams, first 12 rounds, with a seeded shuffle so each season differs).
 */
export function generateSchedule(seed: number): Record<number, Fixture[]> {
  const rng = makeRng(hashSeed("schedule", seed));
  const teams = [...ALL_TEAMS];
  for (let i = teams.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [teams[i], teams[j]] = [teams[j], teams[i]];
  }
  const n = teams.length; // 20
  const fixed = teams[0];
  let rot = teams.slice(1);
  const schedule: Record<number, Fixture[]> = {};
  for (let w = 1; w <= SEASON_WEEKS; w++) {
    const round = [fixed, ...rot];
    const games: Fixture[] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = round[i];
      const b = round[n - 1 - i];
      // Alternate home sides by week so nobody is always home.
      const [home, away] = (w + i) % 2 === 0 ? [a, b] : [b, a];
      const conf = TEAMS[home].conf === TEAMS[away].conf;
      games.push({
        home,
        away,
        kickoff: KICKOFFS[Math.floor(rng() * KICKOFFS.length)],
        venue: home === USER_TEAM ? "Stallion Field" : undefined,
        label: conf ? "Conference game" : undefined,
      });
    }
    schedule[w] = games;
    rot = [rot[rot.length - 1], ...rot.slice(0, -1)];
  }
  return schedule;
}

// ---- Opponents ------------------------------------------------------------------

/** Each offseason every other team drifts a little, pulled gently toward the league middle. */
export function driftRatings(prev: Ratings, seed: number, season: number): Ratings {
  const rng = makeRng(hashSeed("drift", seed, season));
  const next = { ...prev };
  for (const id of ALL_TEAMS) {
    if (id === USER_TEAM) continue;
    const step = (x: number) => {
      const pull = (82 - x) * 0.15;
      return Math.round(Math.max(66, Math.min(93, x + pull + (rng() - 0.5) * 6)));
    };
    next[id] = { off: step(prev[id].off), def: step(prev[id].def) };
  }
  return next;
}

// ---- Players --------------------------------------------------------------------

/** Hidden potential: how far a player can still grow. Younger players have more room. */
export function potentialOf(p: Player): number {
  if (p.pot) return p.pot;
  const rng = makeRng(hashSeed("pot", p.id));
  const room = { HS: [8, 14], Fr: [6, 14], So: [4, 10], Jr: [2, 6], Sr: [0, 2] }[p.yr];
  return Math.min(99, p.ovr + room[0] + Math.floor(rng() * (room[1] - room[0] + 1)));
}

const NEXT_YEAR: Record<Player["yr"], Year | null> = { HS: "Fr", Fr: "So", So: "Jr", Jr: "Sr", Sr: null };

const FIRST = ["Aiden", "Bryson", "Cade", "Darian", "Ezra", "Gavin", "Hayden", "Jace", "Kendrick", "Landon", "Micah", "Nate", "Omari", "Reid", "Silas", "Tristan", "Xander", "Zion", "Brody", "Camden"];
const LAST = ["Abbott", "Barrera", "Cobb", "Delacruz", "Easley", "Flores", "Gamble", "Hargrove", "Isom", "Jefferson", "Kimble", "Landry", "Moreno", "Norwood", "Oakes", "Pickett", "Rios", "Sandoval", "Thibodeaux", "Vaughn"];
const TOWNS = ["Austin, TX", "Houston, TX", "Dallas, TX", "San Antonio, TX", "Lubbock, TX", "Shreveport, LA", "Tulsa, OK", "Little Rock, AR", "Albuquerque, NM", "Baton Rouge, LA"];

export interface OffseasonReport {
  graduated: Player[];
  enrolled: Player[]; // signees (like Rook) joining
  freshmen: Player[]; // auto-signed to replace graduates
  progressed: { player: Player; from: number; to: number }[];
}

/**
 * Advance the roster one year: seniors leave, everyone else moves up a class and develops
 * toward their potential, signees enroll, and freshmen fill the open spots.
 */
export function advanceRoster(players: Player[], depth: Record<Pos, string[]>, seed: number, season: number) {
  const rng = makeRng(hashSeed("offseason", seed, season));
  const report: OffseasonReport = { graduated: [], enrolled: [], freshmen: [], progressed: [] };
  const next: Player[] = [];

  for (const p of players) {
    const yr = NEXT_YEAR[p.yr];
    if (!yr) {
      report.graduated.push(p);
      continue;
    }
    const pot = potentialOf(p);
    let ovr = p.ovr;
    if (p.yr === "HS") report.enrolled.push(p);
    else {
      const gain = Math.max(0, Math.round((pot - p.ovr) * 0.4 + (rng() - 0.35) * 3));
      ovr = Math.min(pot, p.ovr + gain);
      if (ovr !== p.ovr) report.progressed.push({ player: p, from: p.ovr, to: ovr });
    }
    next.push({ ...p, yr, ovr, pot });
  }

  // Replace graduates position by position, and make sure every group has a backup.
  const used = new Set(next.map((p) => p.num));
  const freshman = (pos: Pos, i: number): Player => {
    const r = makeRng(hashSeed("fr", seed, season, pos, i));
    let num = 10 + Math.floor(r() * 89);
    while (used.has(num)) num = 10 + ((num + 7) % 89);
    used.add(num);
    const ovr = 66 + Math.floor(r() * 9);
    return {
      id: `fr-${season}-${pos}-${i}`,
      name: `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`,
      num,
      pos,
      yr: "Fr",
      ovr,
      pot: Math.min(95, ovr + 10 + Math.floor(r() * 10)),
      hometown: TOWNS[Math.floor(r() * TOWNS.length)],
      nil: 15_000 + Math.floor(r() * 4) * 5_000,
      source: "recruit",
    };
  };
  for (const pos of POS_ORDER) {
    const leaving = report.graduated.filter((p) => p.pos === pos).length;
    const have = next.filter((p) => p.pos === pos).length;
    const need = Math.max(leaving, STARTERS[pos] + (pos === "K" || pos === "P" ? 0 : 1) - have);
    for (let i = 0; i < need; i++) {
      const f = freshman(pos, i);
      next.push(f);
      report.freshmen.push(f);
    }
  }

  // Keep the user's depth order for returners; slot newcomers in by rating.
  const byId = new Map(next.map((p) => [p.id, p]));
  const newDepth = {} as Record<Pos, string[]>;
  for (const pos of POS_ORDER) {
    const returning = depth[pos].filter((id) => byId.has(id));
    const newcomers = next.filter((p) => p.pos === pos && !returning.includes(p.id));
    const merged = [...returning];
    for (const n of newcomers.sort((a, b) => b.ovr - a.ovr)) {
      const at = merged.findIndex((id) => byId.get(id)!.ovr < n.ovr);
      merged.splice(at < 0 ? merged.length : at, 0, n.id);
    }
    newDepth[pos] = merged;
  }

  return { players: next, depth: newDepth, report };
}
