// Stats, the award race and season awards. Every other program has a handful of stars whose season
// lines build week by week from their real game results; your players use their actual game stats.
// Awards are handed out after rivalry week, before Early Signing Day. Pure functions.

import { TEAMS, type TeamId } from "./data";
import { hashSeed, makeRng } from "./rng";
import type { Player, Pos } from "./roster";
import { ALL_TEAMS, makePerson, type Ratings } from "./season";
import type { StatLine } from "./sim";

export type SeasonLine = StatLine & { games: number };

export interface Star extends SeasonLine {
  id: string;
  yr: "Fr" | "So" | "Jr" | "Sr";
  talent: number; // 0.85 - 1.2: how much he gets out of his team's offense or defense
}

export interface LeagueStats {
  season: number;
  stars: Star[];
  preseason: Partial<Record<TeamId, number>>; // preseason rank, for Coach of the Year
}

export interface AwardResult {
  season: number;
  award: string;
  id: string;
  name: string;
  team: TeamId;
  pos: string;
  yr?: string;
  line: string; // stat summary
  mine: boolean;
}

export interface AllConfPick {
  pos: Pos;
  id: string;
  name: string;
  team: TeamId;
  mine: boolean;
}

/** Original award names (fictional league). */
export const AWARDS = {
  crown: "The Crown Trophy",
  qb: "Field General Award",
  rb: "Workhorse Award",
  wr: "Deep Threat Award",
  def: "Iron Wall Award",
  fresh: "Rising Star Award",
  coach: "Coach of the Year",
} as const;

export const AWARD_BLURB: Record<string, string> = {
  [AWARDS.crown]: "Most outstanding player in the country",
  [AWARDS.qb]: "Top quarterback",
  [AWARDS.rb]: "Top running back",
  [AWARDS.wr]: "Top receiver",
  [AWARDS.def]: "Top defensive player",
  [AWARDS.fresh]: "Top freshman",
  [AWARDS.coach]: "Best coaching job",
};

const STAR_POS: Pos[] = ["QB", "RB", "WR", "EDGE", "S"];
const YRS = ["Fr", "So", "Jr", "Sr"] as const;

const blank = (): Omit<SeasonLine, "name" | "team" | "pos"> => ({ games: 0 });

/** Each program's stars for a season (your team uses its real roster instead). */
export function makeLeague(seed: number, season: number, standings: { id: TeamId; rank: number }[], userTeam: TeamId): LeagueStats {
  const stars: Star[] = [];
  for (const team of ALL_TEAMS) {
    if (team === userTeam) continue;
    for (const pos of STAR_POS) {
      const who = makePerson(["star", seed, season, team, pos]);
      const r = who.rng;
      stars.push({
        id: `star-${season}-${team}-${pos}`,
        name: who.name,
        team,
        pos,
        yr: YRS[Math.floor(r() * 4)],
        talent: Math.round((0.85 + r() * 0.35) * 100) / 100,
        ...blank(),
      });
    }
  }
  return { season, stars, preseason: Object.fromEntries(standings.map((t) => [t.id, t.rank])) };
}

const add = (a: SeasonLine, b: Partial<StatLine>): SeasonLine => {
  const out = { ...a, games: a.games + 1 } as SeasonLine & Record<string, number>;
  for (const [k, v] of Object.entries(b)) if (typeof v === "number") out[k] = ((out[k] as number) ?? 0) + v;
  return out;
};

/** One game's line for a star, from how many points his team scored (or allowed, for defenders). */
function starGame(star: Star, ptsFor: number, ptsAgainst: number, ratings: Ratings, rng: () => number): Partial<StatLine> {
  const t = star.talent * (0.8 + rng() * 0.4);
  const r = ratings[star.team];
  const off = r ? r.off / 82 : 1;
  const def = r ? r.def / 82 : 1;
  const tds = ptsFor / 7;
  switch (star.pos) {
    case "QB": {
      const att = Math.round((28 + rng() * 14) * off);
      const passYds = Math.round((115 + ptsFor * 4.2) * t * off);
      return { att, cmp: Math.round(att * (0.58 + rng() * 0.12)), passYds, passTd: Math.round(tds * 0.45 * t), int: rng() < 0.35 / t ? 1 : 0, rushTd: rng() < 0.12 ? 1 : 0 };
    }
    case "RB":
      return { car: Math.round(16 + rng() * 10), rushYds: Math.round((55 + ptsFor * 2.1) * t * off), rushTd: Math.round(tds * 0.28 * t) };
    case "WR": {
      const rec = Math.max(1, Math.round((4 + ptsFor * 0.09) * t));
      return { rec, recYds: Math.round(rec * (11 + rng() * 4)), recTd: Math.round(tds * 0.2 * t) };
    }
    case "EDGE":
      return { sacks: Math.max(0, Math.round(1.8 * def * t * (0.3 + rng() * 1.4) - (ptsAgainst > 30 ? 0.5 : 0))), takeaways: rng() < 0.15 ? 1 : 0 };
    default:
      return { takeaways: rng() < 0.32 * t * def ? 1 : 0 };
  }
}

/** A regular-season week of games: every star whose team played gets a line. */
export function recordWeek(league: LeagueStats, games: { home: TeamId; away: TeamId; homeScore: number; awayScore: number }[], ratings: Ratings, seed: number, week: number): LeagueStats {
  const byTeam = new Map<TeamId, [number, number]>();
  for (const g of games) {
    byTeam.set(g.home, [g.homeScore, g.awayScore]);
    byTeam.set(g.away, [g.awayScore, g.homeScore]);
  }
  const stars = league.stars.map((st) => {
    const sc = byTeam.get(st.team);
    if (!sc) return st;
    const rng = makeRng(hashSeed("star-game", seed, league.season, week, st.id));
    return add(st, starGame(st, sc[0], sc[1], ratings, rng)) as Star;
  });
  return { ...league, stars };
}

// ---- Scoring -------------------------------------------------------------------------

const n = (x?: number) => x ?? 0;

/** Production score for the national player of the year race. */
export function productionScore(l: Partial<StatLine>) {
  return (
    n(l.passYds) / 20 + n(l.passTd) * 5 - n(l.int) * 4 +
    n(l.rushYds) / 12 + n(l.rushTd) * 6 +
    n(l.recYds) / 12 + n(l.recTd) * 6 +
    n(l.sacks) * 3 + n(l.takeaways) * 6
  );
}

const DEF_POS = new Set(["EDGE", "DT", "LB", "CB", "S"]);

export interface Candidate extends SeasonLine {
  id: string;
  yr?: string;
  mine: boolean;
  score: number;
}

/** Everyone eligible: league stars plus your players with stats. Team success counts. */
export function candidates(
  league: LeagueStats,
  mine: Record<string, SeasonLine>,
  players: Player[],
  standings: { id: TeamId; wins: number; rank: number }[],
): Candidate[] {
  const st = new Map(standings.map((t) => [t.id, t]));
  const yr = new Map(players.map((p) => [p.id, p.yr]));
  const teamBonus = (team: TeamId) => {
    const t = st.get(team);
    return t ? t.wins * 6 + Math.max(0, 26 - t.rank) * 1.5 : 0;
  };
  const list: Candidate[] = [
    ...league.stars.map((s) => ({ ...s, mine: false, score: productionScore(s) + teamBonus(s.team) })),
    ...Object.entries(mine).map(([id, l]) => ({ ...l, id, yr: yr.get(id), mine: true, score: productionScore(l) + teamBonus(l.team) })),
  ];
  return list.filter((c) => c.games > 0).sort((a, b) => b.score - a.score);
}

export function statSummary(l: Partial<StatLine>) {
  const parts: string[] = [];
  if (n(l.passYds)) parts.push(`${n(l.passYds).toLocaleString()} pass yds, ${n(l.passTd)} TD`);
  if (n(l.rushYds) > 150) parts.push(`${n(l.rushYds).toLocaleString()} rush yds, ${n(l.rushTd)} TD`);
  if (n(l.recYds)) parts.push(`${n(l.rec)} rec, ${n(l.recYds).toLocaleString()} yds, ${n(l.recTd)} TD`);
  if (n(l.sacks)) parts.push(`${n(l.sacks)} sacks`);
  if (n(l.takeaways)) parts.push(`${n(l.takeaways)} takeaways`);
  return parts.slice(0, 2).join(" · ") || "—";
}

/** Stat leaders for a category, across the league. */
export function leaders(cands: Candidate[], key: keyof StatLine, limit = 10) {
  return [...cands].filter((c) => n(c[key] as number) > 0).sort((a, b) => n(b[key] as number) - n(a[key] as number)).slice(0, limit);
}

/**
 * Season awards. Coach of the Year goes to you for a big year against expectations; otherwise to the
 * program that climbed the most from its preseason rank.
 */
export function seasonAwards(
  season: number,
  cands: Candidate[],
  standings: { id: TeamId; wins: number; losses: number; rank: number }[],
  league: LeagueStats,
  userTeam: TeamId,
  coach: { name: string; winTarget: number } | null,
): AwardResult[] {
  const pick = (award: string, pool: Candidate[], scoreOf: (c: Candidate) => number): AwardResult | null => {
    const best = [...pool].sort((a, b) => scoreOf(b) - scoreOf(a))[0];
    if (!best) return null;
    return { season, award, id: best.id, name: best.name, team: best.team, pos: best.pos, yr: best.yr, line: statSummary(best), mine: best.mine };
  };
  const out: (AwardResult | null)[] = [
    pick(AWARDS.crown, cands, (c) => c.score),
    pick(AWARDS.qb, cands.filter((c) => c.pos === "QB"), (c) => c.score),
    pick(AWARDS.rb, cands.filter((c) => c.pos === "RB"), (c) => n(c.rushYds) / 10 + n(c.rushTd) * 6 + n(c.recYds) / 15),
    pick(AWARDS.wr, cands.filter((c) => c.pos === "WR" || c.pos === "TE"), (c) => n(c.recYds) / 10 + n(c.recTd) * 6 + n(c.rec) * 0.5),
    pick(AWARDS.def, cands.filter((c) => DEF_POS.has(c.pos)), (c) => Math.min(n(c.sacks), 16) * 6 + n(c.takeaways) * 12 + c.score * 0.15),
  ];
  // Spread the honors: the national player of the year doesn't also take the freshman award.
  out.push(pick(AWARDS.fresh, cands.filter((c) => c.yr === "Fr" && c.id !== out[0]?.id), (c) => c.score));
  // Coach of the Year.
  const me = standings.find((t) => t.id === userTeam)!;
  if (coach && me.wins >= 9 && me.wins - coach.winTarget >= 2) {
    out.push({ season, award: AWARDS.coach, id: "coach", name: coach.name, team: userTeam, pos: "HC", line: `${me.wins}–${me.losses}, target ${coach.winTarget}`, mine: true });
  } else {
    const climb = [...standings]
      .filter((t) => t.wins >= 9)
      .sort((a, b) => n(league.preseason[b.id]) - b.rank - (n(league.preseason[a.id]) - a.rank))[0];
    if (climb) {
      out.push({
        season,
        award: AWARDS.coach,
        id: `coach-${climb.id}`,
        name: `${TEAMS[climb.id].name} head coach`,
        team: climb.id,
        pos: "HC",
        line: `${climb.wins}–${climb.losses}, from No. ${league.preseason[climb.id] ?? "—"} to No. ${climb.rank}`,
        mine: climb.id === userTeam && !!coach,
      });
    }
  }
  return out.filter((x): x is AwardResult => !!x);
}

/** First-team All-Conference for your conference: your starters against each rival's best at the spot. */
export function allConference(
  season: number,
  seed: number,
  userTeam: TeamId,
  starters: Partial<Record<Pos, Player[]>>,
  slots: Record<Pos, number>,
  mine: Record<string, SeasonLine>,
  league: LeagueStats,
  ratings: Ratings,
): AllConfPick[] {
  const conf = TEAMS[userTeam].conf;
  const rivals = ALL_TEAMS.filter((t) => t !== userTeam && TEAMS[t].conf === conf);
  const picks: AllConfPick[] = [];
  const side = (pos: Pos) => (["QB", "RB", "WR", "TE", "OT", "IOL"].includes(pos) ? "off" : "def");
  for (const pos of Object.keys(slots) as Pos[]) {
    const pool: { id: string; name: string; team: TeamId; mine: boolean; score: number }[] = [];
    for (const p of starters[pos] ?? []) pool.push({ id: p.id, name: p.name, team: userTeam, mine: true, score: p.ovr + Math.min(4, productionScore(mine[p.id] ?? {}) / 80) });
    for (const t of rivals) {
      const star = league.stars.find((s) => s.team === t && s.pos === pos);
      for (let i = 0; i < slots[pos]; i++) {
        const rng = makeRng(hashSeed("allconf", seed, season, t, pos, i));
        const base = (ratings[t]?.[side(pos)] ?? 80) + 3 + (rng() - 0.5) * 10 - i * 2;
        if (i === 0 && star) pool.push({ id: star.id, name: star.name, team: t, mine: false, score: base + 2 + Math.min(4, productionScore(star) / 80) });
        else pool.push({ id: `ac-${t}-${pos}-${i}`, name: makePerson(["allconf", seed, season, t, pos, i]).name, team: t, mine: false, score: base });
      }
    }
    pool.sort((a, b) => b.score - a.score);
    for (const c of pool.slice(0, slots[pos])) picks.push({ pos, id: c.id, name: c.name, team: c.team, mine: c.mine });
  }
  return picks;
}

/** Add a season's stat line to a player's career totals. */
export function addCareer(career: SeasonLine | undefined, season: SeasonLine): SeasonLine {
  const base = career ?? ({ name: season.name, team: season.team, pos: season.pos, games: 0 } as SeasonLine);
  const out = { ...base, games: base.games + season.games } as SeasonLine & Record<string, number>;
  for (const [k, v] of Object.entries(season)) if (typeof v === "number" && k !== "games") out[k] = ((out[k] as number) ?? 0) + v;
  return out;
}
