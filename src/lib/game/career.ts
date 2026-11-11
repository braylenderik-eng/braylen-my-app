// The coach's career: job security, firing, and job offers in the offseason. Pure functions.

import { TEAMS, type TeamId } from "./data";
import { programProfile, type Tier } from "./program";
import { hashSeed, makeRng } from "./rng";

export const TIER_ORDER: Tier[] = ["Rebuild", "Rising", "Contender", "Blue blood"];
export const tierRank = (t: Tier) => TIER_ORDER.indexOf(t);

export interface Stint {
  team: TeamId;
  from: number; // first season
  to: number | null; // last season, null while still there
  wins: number;
  losses: number;
  playoffs: number;
  titles: number;
}

export interface JobOffer {
  team: TeamId;
  reason: string;
}

export interface CareerState {
  security: number; // 0-100; at 0 you're fired
  stints: Stint[];
  offers: JobOffer[]; // open offers this offseason
  status: "active" | "fired" | "over";
}

export const START_SECURITY = 60;

export function newCareer(team: TeamId, season: number): CareerState {
  return { security: START_SECURITY, stints: [{ team, from: season, to: null, wins: 0, losses: 0, playoffs: 0, titles: 0 }], offers: [], status: "active" };
}

const SECURITY_CHANGE: Record<string, number> = {
  "Exceeded expectations": 20,
  "Met expectations": 10,
  "Fell short": -15,
  "Hot seat": -35,
};

export function securityLabel(x: number) {
  if (x >= 75) return "Untouchable";
  if (x >= 50) return "Secure";
  if (x >= 25) return "Under pressure";
  return "Hot seat";
}

/**
 * The season is over: update the record and job security, decide whether you're fired, and
 * make job offers (from bigger programs after a strong year; from smaller ones if you're fired).
 */
export function endSeason(
  c: CareerState,
  team: TeamId,
  season: number,
  r: { wins: number; losses: number; expectation: string; playoff: boolean; champion: boolean },
  seed: number,
): CareerState {
  const stints = c.stints.map((s, i) =>
    i === c.stints.length - 1
      ? { ...s, wins: s.wins + r.wins, losses: s.losses + r.losses, playoffs: s.playoffs + (r.playoff ? 1 : 0), titles: s.titles + (r.champion ? 1 : 0) }
      : s,
  );
  const security = Math.max(0, Math.min(100, c.security + (SECURITY_CHANGE[r.expectation] ?? 0) + (r.champion ? 30 : r.playoff ? 5 : 0)));
  const fired = security <= 0;
  const rng = makeRng(hashSeed("offers", seed, season));
  const myTier = tierRank(programProfile(team).tier);
  const others = (Object.keys(TEAMS) as TeamId[]).filter((id) => id !== team);
  const shuffle = <T,>(xs: T[]) => {
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  let offers: JobOffer[] = [];
  if (fired) {
    // A soft landing at a smaller program, if anyone calls. At the bottom tier, maybe nobody does.
    const pool = others.filter((id) => tierRank(programProfile(id).tier) < Math.max(1, myTier));
    const n = myTier === 0 ? (rng() < 0.5 ? 1 : 0) : 1 + (rng() < 0.4 ? 1 : 0);
    offers = shuffle(pool).slice(0, n).map((id) => ({ team: id, reason: "A fresh start after your firing" }));
  } else {
    const strong = r.champion || r.expectation === "Exceeded expectations";
    const n = strong ? 2 : r.expectation === "Met expectations" && r.playoff ? (rng() < 0.6 ? 1 : 0) : 0;
    const pool = others.filter((id) => tierRank(programProfile(id).tier) > myTier || (myTier === 3 && tierRank(programProfile(id).tier) === 3));
    offers = shuffle(pool)
      .slice(0, n)
      .map((id) => ({ team: id, reason: r.champion ? "They want a national champion" : `They noticed your ${r.wins}–${r.losses} season` }));
  }
  return { security: fired ? 0 : security, stints, offers, status: fired ? (offers.length ? "fired" : "over") : "active" };
}

/** Take a new job: close the current stint and open one at the new program. */
export function takeJob(c: CareerState, team: TeamId, nextSeason: number): CareerState {
  const stints = c.stints.map((s, i) => (i === c.stints.length - 1 ? { ...s, to: nextSeason - 1 } : s));
  return { security: START_SECURITY, stints: [...stints, { team, from: nextSeason, to: null, wins: 0, losses: 0, playoffs: 0, titles: 0 }], offers: [], status: "active" };
}

/** Turn the offers down. If you were fired, that ends your career. */
export function declineOffers(c: CareerState): CareerState {
  return { ...c, offers: [], status: c.status === "fired" ? "over" : c.status };
}

export function careerTotals(c: CareerState) {
  return c.stints.reduce((t, s) => ({ wins: t.wins + s.wins, losses: t.losses + s.losses, playoffs: t.playoffs + s.playoffs, titles: t.titles + s.titles }), {
    wins: 0,
    losses: 0,
    playoffs: 0,
    titles: 0,
  });
}
