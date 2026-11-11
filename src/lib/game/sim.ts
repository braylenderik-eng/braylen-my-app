// Drive-by-drive football sim. Same inputs + seed + decisions => same game.
//
// The engine is a generator (`playGame`) so a live game can pause for the user's calls:
// 4th downs, extra point vs two, halftime adjustments and late-game clock management.
// `simulateGame` runs the same engine straight through, answering every call with the default.

import { DEPTH, TEAMS, type Skill, type TeamId } from "./data";
import { generatedSkill } from "./roster";
import { hashSeed, makeRng, type Rng } from "./rng";

export { hashSeed, makeRng };

const int = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = <T,>(rng: Rng, xs: readonly T[]) => xs[Math.floor(rng() * xs.length)];
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

// ---- Game plan ---------------------------------------------------------------------

export type OffensePlan = "ground" | "balanced" | "air";
export type DefensePlan = "pressure" | "base" | "bend";
export interface GamePlan {
  offense: OffensePlan;
  defense: DefensePlan;
}

export const DEFAULT_PLAN: GamePlan = { offense: "balanced", defense: "base" };

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
  cmp?: number;
  att?: number;
  passYds?: number;
  passTd?: number;
  int?: number;
  car?: number;
  rushYds?: number;
  rushTd?: number;
  rec?: number;
  recYds?: number;
  recTd?: number;
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

/** A call the user made during a live game, and how it turned out. */
export interface CallLog {
  quarter: number;
  label: string; // "4th & 2 at the RRR 38"
  choice: string; // "Went for it"
  outcome: string; // "Converted"
  good: boolean;
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
  reinjured: string[]; // names of players who got hurt again mid-game
  calls?: CallLog[]; // only for live games
}

/** A questionable starter the user chose to play: may re-injure mid-game and cost rating. */
export interface GameTimeRisk {
  name: string;
  pos: string;
  chance: number;
  loss: { off: number; def: number };
}

export interface SimOptions {
  /** Plan for the user's side, if the user's team is playing. */
  plan?: GamePlan;
  userTeam?: TeamId;
  /** Hype 0-100; the user's crowd gets louder at home above 60. */
  hype?: number;
  /** Absolute ratings that replace a team's base ratings (the user's lineup). */
  ratings?: Partial<Record<TeamId, { off: number; def: number }>>;
  /** Play-by-play names that replace a team's depth chart. */
  skill?: Partial<Record<TeamId, Skill>>;
  /** Questionable players the user is starting. */
  risks?: GameTimeRisk[];
  /** Neutral site: no home-field edge. */
  neutral?: boolean;
  /** Skip building stat lines and drive text (much faster; used for odds). */
  fast?: boolean;
  /** Pause for the user's calls (live game day). */
  interactive?: boolean;
}

// ---- Live decisions ---------------------------------------------------------------

export type Decision =
  | {
      kind: "fourth";
      quarter: number;
      distance: number;
      spot: string;
      /** What the offense would do by default: kick a field goal or punt. */
      usual: "kick" | "punt";
      canKick: boolean;
      kickPct: number;
      goPct: number;
      scoreUs: number;
      scoreThem: number;
    }
  | { kind: "two"; quarter: number; kickPct: number; twoPct: number; scoreUs: number; scoreThem: number }
  | { kind: "clock"; quarter: number; mode: "milk" | "hurry"; scoreUs: number; scoreThem: number }
  | { kind: "halftime"; plan: GamePlan; totals: Record<"us" | "them", TeamTotals>; scoreUs: number; scoreThem: number };

export type Answer =
  | { kind: "fourth"; choice: "go" | "kick" | "punt" }
  | { kind: "two"; choice: "pat" | "two" }
  | { kind: "clock"; choice: "yes" | "no" }
  | { kind: "halftime"; plan: GamePlan };

export type GameEvent = { type: "drive"; drive: Drive; remaining: number; total: number } | { type: "decision"; decision: Decision };

const HOME_EDGE = 1.5;
const PAT_PCT = 0.97;

/** Field goal success by kick distance (yards). */
export function kickPct(distance: number) {
  return clamp(1.02 - (distance - 20) * 0.008, 0.3, 0.98);
}

/** 4th-down conversion odds by yards to go and offensive edge. */
export function goPct(distance: number, edge: number) {
  return clamp(0.7 - 0.07 * (distance - 1) + 0.008 * edge, 0.15, 0.82);
}

export function twoPct(edge: number) {
  return clamp(0.45 + 0.006 * edge, 0.3, 0.6);
}

function spotLabel(yardline: number, us: TeamId, them: TeamId) {
  if (yardline === 50) return "midfield";
  return yardline < 50 ? `your ${yardline}` : `the ${TEAMS[them].short} ${100 - yardline}`;
}

/**
 * The game as a generator. Yields a `drive` event after each possession, and, in interactive
 * mode, a `decision` event whenever the user has a call to make; resume it with an `Answer`.
 */
export function* playGame(home: TeamId, away: TeamId, seed: number, opts: SimOptions = {}): Generator<GameEvent, GameResult, Answer | undefined> {
  const rng = makeRng(seed);
  const user = opts.userTeam;
  let plan = opts.plan ?? DEFAULT_PLAN;
  const notes: string[] = [];
  const calls: CallLog[] = [];
  const live = !!opts.interactive && !opts.fast && (user === home || user === away);

  const rating = (id: TeamId) => opts.ratings?.[id] ?? { off: TEAMS[id].off, def: TEAMS[id].def };
  const r = { home: { ...rating(home) }, away: { ...rating(away) } };
  const userSide: "home" | "away" | null = user === home ? "home" : user === away ? "away" : null;
  if (userSide === "home" && !opts.neutral && (opts.hype ?? 50) > 60) r.home.off += 1;
  const sideTeam = (side: "home" | "away") => (side === "home" ? home : away);
  const otherOf = (side: "home" | "away") => (side === "home" ? "away" : "home");

  // Questionable starters: each may re-injure at some point in the game.
  const risks = (opts.risks ?? []).map((k) => ({ ...k, atDrive: rng() < k.chance ? int(rng, 4, 18) : -1 }));
  const reinjured: string[] = [];
  for (const k of risks) if (k.atDrive < 0) notes.push(`${k.pos} ${k.name} started and finished. He held up.`);

  const skill = {
    home: opts.skill?.[home] ?? DEPTH[home] ?? generatedSkill(home),
    away: opts.skill?.[away] ?? DEPTH[away] ?? generatedSkill(away),
  };
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
  const us = () => (userSide ? score[userSide] : 0);
  const them = () => (userSide ? score[otherOf(userSide)] : 0);

  const offMods = (side: "home" | "away", override?: SideMods): SideMods => {
    if (override) return override;
    return sideTeam(side) === user ? OFFENSE_MODS[plan.offense] : OFFENSE_MODS.balanced;
  };
  const defMods = (side: "home" | "away") => (sideTeam(otherOf(side)) === user ? DEFENSE_MODS[plan.defense] : DEFENSE_MODS.base);

  let shortField: "home" | "away" | null = null; // set after a failed 4th down: that side gets a short field next

  // One possession. A generator because the user may get a 4th-down or two-point call mid-drive.
  function* runDrive(side: "home" | "away", quarter: number, idx: number, mode?: "milk" | "hurry"): Generator<GameEvent, Drive, Answer | undefined> {
    const other = otherOf(side);
    const team = sideTeam(side);
    const isUser = team === user;
    const override = mode === "milk" ? { ...OFFENSE_MODS.ground, turnover: -0.04 } : mode === "hurry" ? { ...OFFENSE_MODS.air, turnover: 0.06 } : undefined;
    const om = offMods(side, override);
    const dm = defMods(side);

    if (userSide) {
      for (const k of risks) {
        if (k.atDrive === idx) {
          r[userSide].off -= k.loss.off;
          r[userSide].def -= k.loss.def;
          reinjured.push(k.name);
          notes.push(`${k.pos} ${k.name} got hurt again in the ${quarter === 5 ? "overtime" : `${ordinal(quarter)} quarter`} and did not return.`);
        }
      }
    }

    const edge = r[side].off - r[other].def + (side === "home" && !opts.neutral ? HOME_EDGE : 0) + om.eff + dm.eff;
    const big = om.bigPlay * dm.bigPlay;
    const fieldBonus = shortField === side ? 0.1 : 0;
    shortField = null;
    const pTD = clamp((0.26 + 0.011 * edge) * (0.85 + 0.15 * big) + fieldBonus, 0.06, 0.7);
    const pFG = clamp(0.13 + 0.002 * edge + dm.fgShift + fieldBonus / 2, 0.04, 0.3);
    const pTO = clamp(0.1 - 0.003 * edge + om.turnover + dm.turnover, 0.02, 0.3);
    const roll = rng();

    let result: DriveResult;
    if (roll < pTD) result = "TD";
    else if (roll < pTD + pFG) result = "FG";
    else if (roll < pTD + pFG + pTO) result = rng() < 0.6 ? "INT" : "FUM";
    else result = rng() < 0.08 ? "DOWNS" : "PUNT";

    let yards =
      result === "TD" ? int(rng, 45, 85)
      : result === "FG" ? int(rng, 32, 58)
      : result === "PUNT" ? int(rng, -4, 38)
      : result === "DOWNS" ? int(rng, 20, 50)
      : int(rng, 0, 40);
    let plays = Math.max(3, Math.round(Math.abs(yards) / int(rng, 6, 10)) + int(rng, 0, 2));
    let suffix = "";

    // Field goals: kick by distance. The drive starts at your own 25.
    let yardline = clamp(25 + yards, 1, 99);
    let fgDistance = 100 - yardline + 17;

    // 4th down: the user decides on stalled drives in range or past their own 45. The distance is
    // drawn for the user's team even in a quick sim, so a live game with default calls plays out identically.
    const fourthSpot = isUser && (result === "FG" || (result === "PUNT" && yardline >= 45));
    const distance = fourthSpot ? pick(rng, [1, 1, 2, 2, 3, 3, 4, 5, 6, 8, 10]) : 0;
    const askable = live && fourthSpot;
    if (askable) {
      const usual = result === "FG" ? "kick" : "punt";
      const canKick = result === "FG" || yardline >= 60;
      const kp = kickPct(fgDistance);
      const gp = goPct(distance, edge);
      const ans = yield {
        type: "decision",
        decision: { kind: "fourth", quarter, distance, spot: spotLabel(yardline, team, sideTeam(other)), usual, canKick, kickPct: canKick ? kp : 0, goPct: gp, scoreUs: us(), scoreThem: them() },
      };
      const label = `4th & ${distance} at ${spotLabel(yardline, team, sideTeam(other))}`;
      if (ans?.kind === "fourth" && ans.choice === "go") {
        const made = rng() < gp;
        plays += 1;
        if (made) {
          // Keep driving from the new spot.
          yardline = Math.min(99, yardline + distance + int(rng, 0, 6));
          const pTDr = clamp(0.28 + 0.007 * (yardline - 50) + 0.01 * edge, 0.15, 0.8);
          const pFGr = yardline >= 55 ? 0.38 : 0.12;
          const rr = rng();
          const extra = int(rng, 0, 3);
          plays += extra;
          if (rr < pTDr) {
            result = "TD";
            yards = 100 - 25;
          } else if (rr < pTDr + pFGr) {
            result = "FG";
            yardline = Math.min(95, yardline + int(rng, 0, 15));
            yards = yardline - 25;
          } else if (rr < pTDr + pFGr + 0.08) {
            result = rng() < 0.6 ? "INT" : "FUM";
            yards = yardline - 25;
          } else {
            result = "PUNT";
            yards = yardline - 25;
          }
          fgDistance = 100 - yardline + 17;
          suffix = ` (converted ${label.replace(" at ", " from ")})`;
          calls.push({ quarter, label, choice: "Went for it", outcome: result === "TD" ? "Converted — touchdown drive" : "Converted", good: true });
        } else {
          result = "DOWNS";
          yards = yardline - 25;
          shortField = other;
          calls.push({ quarter, label, choice: "Went for it", outcome: "Stopped — turnover on downs", good: false });
        }
      } else if (ans?.kind === "fourth" && ans.choice === "kick" && canKick) {
        result = "FG";
        calls.push({ quarter, label, choice: `Kicked a ${fgDistance}-yarder`, outcome: "", good: true });
      } else {
        result = "PUNT";
        calls.push({ quarter, label, choice: "Punted", outcome: "Pinned them back", good: true });
      }
    }

    if (result === "FG") {
      const good = rng() < kickPct(fgDistance);
      if (!good) result = "MISS";
      const kickCall = calls[calls.length - 1];
      if (askable && kickCall && kickCall.choice.startsWith("Kicked")) {
        kickCall.outcome = good ? "Good" : "No good";
        kickCall.good = good;
      }
    }

    // Scoring and the try after a touchdown.
    let pts = result === "FG" ? 3 : 0;
    if (result === "TD") {
      pts = 6;
      let goForTwo = false;
      if (live && isUser && quarter >= 4) {
        const tp = twoPct(edge);
        const ans = yield {
          type: "decision",
          decision: { kind: "two", quarter, kickPct: PAT_PCT, twoPct: tp, scoreUs: us() + 6, scoreThem: them() },
        };
        goForTwo = ans?.kind === "two" && ans.choice === "two";
        const made = rng() < (goForTwo ? tp : PAT_PCT);
        pts += made ? (goForTwo ? 2 : 1) : 0;
        suffix += goForTwo ? (made ? " · two-point try good" : " · two-point try fails") : made ? "" : " · extra point missed";
        calls.push({ quarter, label: `After a touchdown (${us() + 6}–${them()})`, choice: goForTwo ? "Went for two" : "Kicked the extra point", outcome: made ? "Good" : "No good", good: made });
      } else {
        const made = rng() < PAT_PCT;
        pts += made ? 1 : 0;
        if (!made) suffix += " · extra point missed";
      }
    }
    score[side] += pts;
    if (result === "INT" || result === "FUM") totals[side].turnovers++;
    if (quarter <= 4) totals[side].quarters[quarter - 1] += pts;

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

      let left = passYds;
      for (let c = 0; c < cmp; c++) {
        const target = weighted(rng, sk.receivers);
        const s = line(team, target.name, target.pos);
        const y = c === cmp - 1 ? left : Math.round(left * (0.2 + rng() * 0.5));
        left -= y;
        add(s, "rec", 1);
        add(s, "recYds", y);
      }
      let rleft = rushYds;
      for (let c = 0; c < rushPlays; c++) {
        const back = rng() < 0.72 ? sk.rb[0] : sk.rb[1] ?? sk.rb[0];
        const s = line(team, back, "RB");
        const y = c === rushPlays - 1 ? rleft : Math.round(rleft * (0.15 + rng() * 0.4));
        rleft -= y;
        add(s, "car", 1);
        add(s, "rushYds", y);
      }

      const otherTeam = sideTeam(other);
      if (result === "TD") {
        const passing = rng() < om.passShare;
        const dist = int(rng, 1, Math.min(55, Math.max(2, yards - 10)));
        if (passing) {
          const target = weighted(rng, sk.receivers);
          add(qb, "passTd", 1);
          add(line(team, target.name, target.pos), "recTd", 1);
          text = `${lastName(sk.qb)} ${dist}-yd TD pass to ${target.name}`;
        } else {
          const back = rng() < 0.8 ? sk.rb[0] : sk.qb;
          add(line(team, back, back === sk.qb ? "QB" : "RB"), "rushTd", 1);
          text = `${back} ${dist}-yd TD run`;
        }
      } else if (result === "FG") text = `${sk.k} ${fgDistance}-yd field goal`;
      else if (result === "MISS") text = `${sk.k} misses from ${fgDistance}`;
      else if (result === "INT") {
        const d = pick(rng, dsk.defense);
        add(qb, "int", 1);
        add(line(otherTeam, d.name, d.pos), "takeaways", 1);
        text = `${lastName(sk.qb)} intercepted by ${d.name}`;
      } else if (result === "FUM") {
        const d = pick(rng, dsk.defense);
        add(line(otherTeam, d.name, d.pos), "takeaways", 1);
        text = `Fumble forced by ${d.name}`;
      } else if (result === "DOWNS") text = "Turnover on downs";
      else text = "Punt";
      text += suffix;

      if (rng() < 0.18 * (defMods(side) === DEFENSE_MODS.pressure ? 1.8 : 1)) {
        const d = dsk.defense[0];
        add(line(otherTeam, d.name, d.pos), "sacks", 1);
      }
    }

    const drive: Drive = { quarter, team, result, plays, yards, text, homeScore: score.home, awayScore: score.away };
    drives.push(drive);
    return drive;
  }

  // Regulation: ~24 possessions, alternating. Coin toss picks who starts.
  const first: "home" | "away" = rng() < 0.5 ? "home" : "away";
  const possessions = 22 + int(rng, 0, 2) * 2;
  const order: ("home" | "away")[] = Array.from({ length: possessions }, (_, i) => (i % 2 === 0 ? first : otherOf(first)));
  const quarterOf = (i: number) => Math.min(4, 1 + Math.floor((i * 4) / possessions));
  let clockAsked = false;
  let halftimeDone = false;

  for (let i = 0; i < order.length; i++) {
    const side = order[i];
    const quarter = quarterOf(i);

    if (live && !halftimeDone && quarter >= 3) {
      halftimeDone = true;
      const ans = yield {
        type: "decision",
        decision: {
          kind: "halftime",
          plan,
          totals: { us: { ...totals[userSide!] }, them: { ...totals[otherOf(userSide!)] } },
          scoreUs: us(),
          scoreThem: them(),
        },
      };
      if (ans?.kind === "halftime") {
        const changed = ans.plan.offense !== plan.offense || ans.plan.defense !== plan.defense;
        plan = ans.plan;
        if (changed) notes.push(`Halftime adjustment: ${plan.offense === "ground" ? "ground and pound" : plan.offense === "air" ? "air it out" : "balanced"} on offense, ${plan.defense === "pressure" ? "bring pressure" : plan.defense === "bend" ? "bend, don't break" : "base"} on defense.`);
      }
    }

    // Late-game clock management on the user's possessions.
    let mode: "milk" | "hurry" | undefined;
    let clockCall: CallLog | undefined;
    if (live && !clockAsked && quarter === 4 && sideTeam(side) === user) {
      const userLeft = order.slice(i).filter((s) => s === side).length;
      const diff = us() - them();
      if (userLeft <= 2 && diff !== 0 && Math.abs(diff) <= 16) {
        clockAsked = true;
        const m = diff > 0 ? "milk" : "hurry";
        const ans = yield { type: "decision", decision: { kind: "clock", quarter, mode: m, scoreUs: us(), scoreThem: them() } };
        if (ans?.kind === "clock" && ans.choice === "yes") mode = m;
        clockCall = {
          quarter,
          label: `${diff > 0 ? "Up" : "Down"} ${Math.abs(diff)} late`,
          choice: mode === "milk" ? "Milked the clock" : mode === "hurry" ? "Went hurry-up" : "Played it straight",
          outcome: "",
          good: true,
        };
        calls.push(clockCall);
      }
    }

    const drive: Drive = yield* runDrive(side, quarter, i, mode);
    if (mode && clockCall) {
      // Update the clock call itself; other calls (like a two-point try) may have been made during this drive.
      const turnover = drive.result === "INT" || drive.result === "FUM" || drive.result === "DOWNS";
      if (mode === "milk") {
        if (!turnover) {
          const next = order.findIndex((s, j) => j > i && s !== side);
          if (next > 0) order.splice(next, 1);
        }
        clockCall.outcome = turnover ? "Turned it over — they get the ball back" : "Ate the clock — one fewer possession for them";
        clockCall.good = !turnover;
      } else {
        order.push(side); // one extra possession at the end
        clockCall.outcome = turnover ? "Turned it over, but bought one more possession" : "Bought one more possession";
        clockCall.good = !turnover;
      }
    }
    yield { type: "drive", drive, remaining: order.length - i - 1, total: order.length };
  }

  // Overtime: one possession each until someone leads after a pair.
  let overtime = false;
  let guard = 0;
  while (score.home === score.away && guard++ < 8) {
    overtime = true;
    for (const side of ["away", "home"] as const) {
      const drive: Drive = yield* runDrive(side, 5, order.length + guard * 2 + (side === "home" ? 1 : 0));
      yield { type: "drive", drive, remaining: 0, total: order.length };
    }
  }
  if (score.home === score.away) {
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
    reinjured,
    ...(live ? { calls } : {}),
  };
}

/** Run a whole game with default answers (no pauses). */
export function simulateGame(home: TeamId, away: TeamId, seed: number, opts: SimOptions = {}): GameResult {
  const gen = playGame(home, away, seed, { ...opts, interactive: false });
  let step = gen.next();
  while (!step.done) step = gen.next();
  return step.value;
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

/**
 * In-game win probability from the score, how much of the game is left, and the
 * pregame expectation (expected margin for the user over a full game).
 */
export function liveWinProbability(margin: number, fractionLeft: number, expectedMargin: number) {
  if (fractionLeft <= 0) return margin > 0 ? 1 : margin < 0 ? 0 : 0.5;
  const mean = margin + expectedMargin * fractionLeft;
  const sd = 2 + 14 * Math.sqrt(fractionLeft);
  return 1 / (1 + Math.exp((-1.7 * mean) / sd));
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

function lastName(name: string) {
  const parts = name.split(" ");
  return parts[parts.length - 1];
}

export function ordinal(n: number) {
  return n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : n === 5 ? "OT" : `${n}th`;
}
