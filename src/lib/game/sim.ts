// Drive-by-drive football sim. Pure functions only: same inputs + seed => same game.

import { DEPTH, TEAMS, type Skill, type TeamId } from "./data";

// ---- Seeded RNG (mulberry32) ----------------------------------------------------

export type Rng = () => number;

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(...parts: (string | number)[]): number {
  let h = 2166136261;
  for (const ch of parts.join("|")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const int = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = <T,>(rng: Rng, xs: readonly T[]) => xs[Math.floor(rng() * xs.length)];
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

// ---- Game plan ---------------------------------------------------------------------

export type OffensePlan = "ground" | "balanced" | "air";
export type DefensePlan = "pressure" | "base" | "bend";
export type InjuryCall = "start" | "rest";

export interface GamePlan {
  offense: OffensePlan;
  defense: DefensePlan;
  injury: InjuryCall;
}

export const DEFAULT_PLAN: GamePlan = { offense: "balanced", defense: "base", injury: "rest" };

interface SideMods {
  eff: number; // added to offensive efficiency
  bigPlay: number; // multiplier on TD chance variance
  turnover: number; // added to turnover chance
  passShare: number; // share of yards through the air
}

const OFFENSE_MODS: Record<OffensePlan, SideMods> = {
  ground: { eff: 0.5, bigPlay: 0.85, turnover: -0.025, passShare: 0.38 },
  balanced: { eff: 0, bigPlay: 1, turnover: 0, passShare: 0.55 },
  air: { eff: 0.5, bigPlay: 1.25, turnover: 0.035, passShare: 0.72 },
};

// Applied to the *opponent's* offense.
const DEFENSE_MODS: Record<DefensePlan, { eff: number; bigPlay: number; turnover: number; fgShift: number }> = {
  pressure: { eff: 0, bigPlay: 1.2, turnover: 0.04, fgShift: 0 },
  base: { eff: 0, bigPlay: 1, turnover: 0, fgShift: 0 },
  bend: { eff: -0.5, bigPlay: 0.75, turnover: -0.01, fgShift: 0.06 },
};

// ---- Result types -----------------------------------------------------------------

export type DriveResult = "TD" | "FG" | "MISS" | "PUNT" | "INT" | "FUM" | "DOWNS" | "END";

export interface Drive {
  quarter: number; // 1-4, 5 = OT
  team: TeamId;
  result: DriveResult;
  plays: number;
  yards: number;
  text: string;
  homeScore: number;
  awayScore: number;
}

export interface StatLine {
  name: string;
  team: TeamId;
  pos: string;
  // passing
  cmp?: number;
  att?: number;
  passYds?: number;
  passTd?: number;
  int?: number;
  // rushing
  car?: number;
  rushYds?: number;
  rushTd?: number;
  // receiving
  rec?: number;
  recYds?: number;
  recTd?: number;
  // defense
  sacks?: number;
  takeaways?: number;
}

export interface TeamTotals {
  points: number;
  passYds: number;
  rushYds: number;
  turnovers: number;
  quarters: number[];
}

export interface GameResult {
  home: TeamId;
  away: TeamId;
  homeScore: number;
  awayScore: number;
  overtime: boolean;
  drives: Drive[];
  stats: StatLine[];
  totals: Record<"home" | "away", TeamTotals>;
  notes: string[]; // injury and plan notes surfaced to the recap
}

export interface SimOptions {
  /** Plan for the user's side, if the user's team is playing. */
  plan?: GamePlan;
  userTeam?: TeamId;
  /** Hype 0-100; the user's crowd gets louder at home above 60. */
  hype?: number;
  /** Rating bonuses from signed transfers or other events, keyed by team. */
  boosts?: Partial<Record<TeamId, { off?: number; def?: number }>>;
  /** Skip building stat lines and drive text (much faster; used for odds). */
  fast?: boolean;
}

const GENERIC: Skill = {
  qb: "QB1",
  rb: ["RB1", "RB2"],
  receivers: [
    { name: "WR1", pos: "WR", share: 0.4 },
    { name: "WR2", pos: "WR", share: 0.35 },
    { name: "TE1", pos: "TE", share: 0.25 },
  ],
  k: "K",
  defense: [{ name: "Defense", pos: "DEF" }],
};

const HOME_EDGE = 1.5;

/**
 * Simulate one game. Each team gets ~11-12 possessions; each possession resolves
 * to a score, punt or turnover with odds driven by (offense - opposing defense).
 */
export function simulateGame(home: TeamId, away: TeamId, seed: number, opts: SimOptions = {}): GameResult {
  const rng = makeRng(seed);
  const user = opts.userTeam;
  const plan = opts.plan ?? DEFAULT_PLAN;
  const notes: string[] = [];

  const rating = (id: TeamId) => {
    const t = TEAMS[id];
    const b = opts.boosts?.[id] ?? {};
    return { off: t.off + (b.off ?? 0), def: t.def + (b.def ?? 0) };
  };
  const r = { home: rating(home), away: rating(away) };

  // Injury call: resting the RT costs a little offense; starting him risks losing more mid-game.
  let injuryAtDrive = -1;
  const userSide: "home" | "away" | null = user === home ? "home" : user === away ? "away" : null;
  if (userSide) {
    if (plan.injury === "rest") {
      r[userSide].off -= 1.5;
      notes.push("RT Andre Marquez rested. Backup Luke Ivers held up, but the edge leaked a few times.");
    } else if (rng() < 0.3) {
      injuryAtDrive = int(rng, 6, 16);
    } else {
      notes.push("RT Andre Marquez started and finished. The ankle held.");
    }
    if (userSide === "home" && (opts.hype ?? 50) > 60) r.home.off += 1;
  }

  const skill = { home: DEPTH[home] ?? GENERIC, away: DEPTH[away] ?? GENERIC };
  const stats = new Map<string, StatLine>();
  const line = (team: TeamId, name: string, pos: string) => {
    const key = `${team}:${name}`;
    let s = stats.get(key);
    if (!s) {
      s = { name, team, pos };
      stats.set(key, s);
    }
    return s;
  };
  const add = (s: StatLine, k: keyof StatLine, v: number) => {
    (s[k] as number | undefined) = ((s[k] as number | undefined) ?? 0) + v;
  };

  const score = { home: 0, away: 0 };
  const totals: Record<"home" | "away", TeamTotals> = {
    home: { points: 0, passYds: 0, rushYds: 0, turnovers: 0, quarters: [0, 0, 0, 0] },
    away: { points: 0, passYds: 0, rushYds: 0, turnovers: 0, quarters: [0, 0, 0, 0] },
  };
  const drives: Drive[] = [];

  const offMods = (side: "home" | "away"): SideMods => {
    const id = side === "home" ? home : away;
    return id === user ? OFFENSE_MODS[plan.offense] : OFFENSE_MODS.balanced;
  };
  const defMods = (side: "home" | "away") => {
    // defense faced by `side`'s offense
    const defId = side === "home" ? away : home;
    return defId === user ? DEFENSE_MODS[plan.defense] : DEFENSE_MODS.base;
  };

  const runDrive = (side: "home" | "away", quarter: number, idx: number) => {
    const other = side === "home" ? "away" : "home";
    const team = side === "home" ? home : away;
    const om = offMods(side);
    const dm = defMods(side);

    if (side === userSide && idx === injuryAtDrive) {
      r[side].off -= 3;
      notes.push(`RT Andre Marquez re-aggravated the ankle in the ${ordinal(quarter)} quarter and did not return.`);
    }

    const edge = r[side].off - r[other].def + (side === "home" ? HOME_EDGE : 0) + om.eff + dm.eff;
    const big = om.bigPlay * dm.bigPlay;
    const pTD = clamp((0.26 + 0.011 * edge) * (0.85 + 0.15 * big), 0.06, 0.6);
    const pFG = clamp(0.13 + 0.002 * edge + dm.fgShift, 0.04, 0.3);
    const pTO = clamp(0.1 - 0.003 * edge + om.turnover + dm.turnover, 0.02, 0.3);
    const roll = rng();

    let result: DriveResult;
    if (roll < pTD) result = "TD";
    else if (roll < pTD + pFG) result = rng() < 0.84 ? "FG" : "MISS";
    else if (roll < pTD + pFG + pTO) result = rng() < 0.6 ? "INT" : "FUM";
    else result = rng() < 0.08 ? "DOWNS" : "PUNT";

    const yards =
      result === "TD" ? int(rng, 45, 85)
      : result === "FG" || result === "MISS" ? int(rng, 30, 60)
      : result === "PUNT" ? int(rng, -4, 38)
      : result === "DOWNS" ? int(rng, 20, 50)
      : int(rng, 0, 40);
    const plays = Math.max(3, Math.round(Math.abs(yards) / int(rng, 6, 10)) + int(rng, 0, 2));

    if (result === "TD") score[side] += 7;
    if (result === "FG") score[side] += 3;
    if (result === "INT" || result === "FUM") totals[side].turnovers++;
    const pts = result === "TD" ? 7 : result === "FG" ? 3 : 0;
    if (quarter <= 4) totals[side].quarters[quarter - 1] += pts;

    // Split yards into passing and rushing.
    const passYds = Math.round(Math.max(0, yards) * clamp(om.passShare + (rng() - 0.5) * 0.3, 0.1, 0.95));
    const rushYds = yards - passYds;
    totals[side].passYds += passYds;
    totals[side].rushYds += rushYds;

    let text = "";
    if (!opts.fast) {
      const sk = skill[side];
      const dsk = skill[other];
      const passPlays = Math.max(1, Math.round(plays * om.passShare));
      const rushPlays = Math.max(0, plays - passPlays);
      const qb = line(team, sk.qb, "QB");
      const cmp = Math.max(0, Math.min(passPlays, Math.round(passPlays * (0.55 + rng() * 0.2))));
      add(qb, "att", passPlays);
      add(qb, "cmp", cmp);
      add(qb, "passYds", passYds);

      // Distribute catches.
      let left = passYds;
      for (let c = 0; c < cmp; c++) {
        const target = weighted(rng, sk.receivers);
        const s = line(team, target.name, target.pos);
        const y = c === cmp - 1 ? left : Math.round(left * (0.2 + rng() * 0.5));
        left -= y;
        add(s, "rec", 1);
        add(s, "recYds", y);
      }
      // Distribute carries (lead back gets most).
      let rleft = rushYds;
      for (let c = 0; c < rushPlays; c++) {
        const back = rng() < 0.72 ? sk.rb[0] : sk.rb[1] ?? sk.rb[0];
        const s = line(team, back, "RB");
        const y = c === rushPlays - 1 ? rleft : Math.round(rleft * (0.15 + rng() * 0.4));
        rleft -= y;
        add(s, "car", 1);
        add(s, "rushYds", y);
      }

      if (result === "TD") {
        const passing = rng() < om.passShare;
        const dist = int(rng, 1, Math.min(55, Math.max(2, yards - 10)));
        if (passing) {
          const target = weighted(rng, sk.receivers);
          add(qb, "passTd", 1);
          add(line(team, target.name, target.pos), "recTd", 1);
          text = `${last(sk.qb)} ${dist}-yd TD pass to ${target.name}`;
        } else {
          const back = rng() < 0.8 ? sk.rb[0] : sk.qb;
          add(line(team, back, back === sk.qb ? "QB" : "RB"), "rushTd", 1);
          text = `${back} ${dist}-yd TD run`;
        }
      } else if (result === "FG") text = `${sk.k} ${int(rng, 24, 52)}-yd field goal`;
      else if (result === "MISS") text = `${sk.k} misses from ${int(rng, 38, 54)}`;
      else if (result === "INT") {
        const d = pick(rng, dsk.defense);
        add(qb, "int", 1);
        add(line(other === "home" ? home : away, d.name, d.pos), "takeaways", 1);
        text = `${last(sk.qb)} intercepted by ${d.name}`;
      } else if (result === "FUM") {
        const d = pick(rng, dsk.defense);
        add(line(other === "home" ? home : away, d.name, d.pos), "takeaways", 1);
        text = `Fumble forced by ${d.name}`;
      } else if (result === "DOWNS") text = "Turnover on downs";
      else text = "Punt";

      // Occasional sack credited to the defense's first player.
      if (rng() < 0.18 * (defMods(side) === DEFENSE_MODS.pressure ? 1.8 : 1)) {
        const d = dsk.defense[0];
        add(line(other === "home" ? home : away, d.name, d.pos), "sacks", 1);
      }
    }

    drives.push({ quarter, team, result, plays, yards, text, homeScore: score.home, awayScore: score.away });
  };

  // Regulation: 24 possessions, 6 per quarter, alternating. Coin toss picks who starts.
  const first: "home" | "away" = rng() < 0.5 ? "home" : "away";
  const order = (i: number) => (i % 2 === 0 ? first : first === "home" ? "away" : "home");
  const possessions = 22 + int(rng, 0, 2) * 2;
  for (let i = 0; i < possessions; i++) {
    const quarter = Math.min(4, 1 + Math.floor((i * 4) / possessions));
    runDrive(order(i), quarter, i);
  }

  // Overtime: one possession each until someone leads after a pair.
  let overtime = false;
  let guard = 0;
  while (score.home === score.away && guard++ < 8) {
    overtime = true;
    runDrive("away", 5, possessions + guard * 2);
    runDrive("home", 5, possessions + guard * 2 + 1);
  }
  if (score.home === score.away) {
    // Extremely rare: settle it with a walk-off field goal for the home side.
    score.home += 3;
    drives.push({ quarter: 5, team: home, result: "FG", plays: 4, yards: 12, text: `${skill.home.k} walk-off field goal`, homeScore: score.home, awayScore: score.away });
  }

  totals.home.points = score.home;
  totals.away.points = score.away;

  return {
    home,
    away,
    homeScore: score.home,
    awayScore: score.away,
    overtime,
    drives,
    stats: [...stats.values()],
    totals,
    notes,
  };
}

/** Monte Carlo win probability for `team` in a fixture. */
export function winProbability(home: TeamId, away: TeamId, team: TeamId, opts: SimOptions = {}, runs = 400): number {
  let wins = 0;
  for (let i = 0; i < runs; i++) {
    const g = simulateGame(home, away, hashSeed("wp", home, away, i), { ...opts, fast: true });
    const won = team === home ? g.homeScore > g.awayScore : g.awayScore > g.homeScore;
    if (won) wins++;
  }
  return wins / runs;
}

function weighted<T extends { share: number }>(rng: Rng, xs: readonly T[]): T {
  const total = xs.reduce((s, x) => s + x.share, 0);
  let roll = rng() * total;
  for (const x of xs) {
    roll -= x.share;
    if (roll <= 0) return x;
  }
  return xs[xs.length - 1];
}

function last(name: string) {
  const parts = name.split(" ");
  return parts[parts.length - 1];
}

export function ordinal(n: number) {
  return n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : n === 5 ? "OT" : `${n}th`;
}
