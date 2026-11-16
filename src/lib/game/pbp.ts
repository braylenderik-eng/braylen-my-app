// Play-by-play: turns one drive the engine has already decided (result, yards, plays) into the snaps that
// got there, with down and distance, field position and the players involved. The engine's box score is
// built from these plays, so the feed and the stats always agree. Pure, seeded.

import type { Skill, TeamId } from "./data";

export type PlayKind =
  | "pass" | "incomplete" | "run" | "sack" | "td" | "fg" | "miss" | "punt" | "int" | "fumble" | "downs" | "try" | "kneel";

export interface Actor {
  name: string;
  pos: string;
  team: TeamId;
}

export interface Play {
  quarter: number;
  clock: string; // "12:41", or "OT"
  team: TeamId; // offense
  down: number;
  toGo: number;
  spot: number; // offense's yardline before the snap: own 25 = 25, opponent's 30 = 70
  kind: PlayKind;
  yards: number;
  label: string; // "Short pass", "Big run", "Touchdown"…
  text: string;
  /** The player the play is about (receiver, runner, pass rusher, kicker). */
  player?: Actor;
  /** Everyone who gets a stat from the play. */
  qb?: Actor;
  rec?: Actor;
  rusher?: Actor;
  def?: Actor;
  pass?: boolean; // a pass attempt (complete, incomplete, intercepted, or a passing TD)
  homeScore: number;
  awayScore: number;
  scoring?: boolean;
}

export interface DriveInput {
  rng: () => number;
  team: TeamId;
  opp: TeamId;
  home: TeamId;
  quarter: number;
  result: "TD" | "FG" | "MISS" | "PUNT" | "INT" | "FUM" | "DOWNS" | "END";
  yards: number;
  passShare: number;
  pressure: boolean; // the defense is bringing pressure
  sk: Skill;
  dsk: Skill;
  /** 4th-down distance the engine already used for a decision, so the feed matches the call. */
  fourth?: number;
  fgDistance: number;
  /** The try after a touchdown. */
  tryAfter?: { two: boolean; made: boolean };
  before: { home: number; away: number };
  after: { home: number; away: number };
  /** Game-clock window for the drive, in seconds left in the quarter; null in overtime. */
  clock: { start: number; span: number } | null;
}

const int = (rng: () => number, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = <T,>(rng: () => number, xs: readonly T[]) => xs[Math.floor(rng() * xs.length)];
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
export const lastName = (name: string) => name.split(" ").slice(1).join(" ") || name;

/** One set of downs that moves the chains: 1-3 plays summing to `g` (>= 10), only the last one converting. */
function series(rng: () => number, g: number): number[] {
  const n = g >= 25 ? (rng() < 0.55 ? 1 : 2) : pick(rng, [1, 2, 2, 3, 3]);
  const small = (max: number) => (rng() < 0.35 ? 0 : int(rng, -2, Math.max(-2, max)));
  if (n === 1) return [g];
  if (n === 2) {
    const a = small(Math.min(9, g - 1));
    return [a, g - a];
  }
  const a = small(6);
  const b = small(9 - a);
  return [a, b, g - a - b];
}

/** Sets of downs covering `total` yards. With `fresh`, every set moves the chains; otherwise a short remainder is left. */
function chains(rng: () => number, total: number, fresh: boolean): { sets: number[][]; rest: number } {
  const sets: number[][] = [];
  let rem = total;
  while (rem >= 10) {
    let g: number;
    if (fresh && rem < 20) g = rem;
    else {
      const cap = fresh ? rem - 10 : rem;
      g = int(rng, 10, Math.max(10, rng() < 0.15 ? Math.min(cap, 65) : Math.min(cap, 22)));
    }
    sets.push(series(rng, g));
    rem -= g;
  }
  return { sets, rest: rem };
}

/** Plays that don't move the chains: `n` plays summing to `total`, every running total under 10. */
function stall(rng: () => number, total: number, n: number): number[] {
  if (total <= 0) return [total, ...Array(n - 1).fill(0)];
  const out: number[] = [];
  let left = total;
  for (let i = 0; i < n - 1; i++) {
    const y = rng() < 0.35 ? 0 : int(rng, -2, left);
    out.push(y);
    left -= y;
  }
  out.push(left);
  return out;
}

const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

const TEXT = {
  short: ["{qb} hits {rec} on a quick slant", "{qb} dumps it off to {rec}", "{qb} finds {rec} underneath", "{qb} to {rec} on a hitch", "{rec} snags a short one from {qb}"],
  mid: ["{qb} drills {rec} over the middle", "{qb} finds {rec} on a deep out", "{rec} hangs on in traffic; {qb} with the throw", "{qb} lofts it to {rec} down the sideline"],
  deep: ["{qb} launches it deep and {rec} runs under it", "{qb} drops it in over the top to {rec}", "{rec} gets behind the secondary and {qb} finds him", "{qb} hits {rec} in stride up the seam"],
  inc: ["{qb}'s pass sails high", "{def} breaks it up", "{qb} throws it away under pressure", "{qb} misfires for {rec}", "Dropped! {rec} can't hang on"],
  stuff: ["{rb} is stuffed at the line by {def}", "{rb} gets nowhere up the middle", "{def} drops {rb} in the backfield"],
  run: ["{rb} grinds out a few", "{rb} up the middle", "{rb} cuts back for a short gain", "{rb} falls forward"],
  good: ["{rb} bounces outside", "{rb} finds a crease", "{rb} breaks a tackle and keeps going", "{rb} slices through the left side"],
  big: ["{rb} breaks free!", "{rb} bursts through the line and is gone", "{rb} hits the edge and turns upfield", "{rb} spins out of a tackle and takes off"],
  scramble: ["{qb} tucks it and scrambles", "{qb} keeps it on the read option"],
  sack: ["{def} gets home for the sack", "{qb} is dropped by {def}", "{def} beats his man and buries {qb}"],
  tdPass: ["Touchdown! {qb} finds {rec} in the end zone", "Touchdown! {rec} hauls it in from {qb}"],
  tdLong: ["Touchdown! {rec} takes it {n} yards to the house", "Touchdown! {qb} goes deep to {rec}, nobody catches him"],
  tdRun: ["Touchdown! {rb} punches it in", "Touchdown! {rb} dives over the pile"],
  tdRunLong: ["Touchdown! {rb} goes {n} yards untouched", "Touchdown! {rb} breaks loose and outruns everyone"],
  int: ["Picked off! {def} jumps the route", "Intercepted by {def}", "{qb} forces it and {def} takes it away"],
  fum: ["Fumble! {def} punches it loose from {rb}", "{rb} coughs it up and {def} recovers"],
};

const clockText = (secs: number) => {
  const s = Math.max(0, Math.round(secs));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/** Build the plays for one drive. */
export function buildDrive(d: DriveInput): Play[] {
  const { rng, team, opp, sk, dsk, result } = d;
  const actor = (name: string, pos: string, t: TeamId = team): Actor => ({ name, pos, team: t });
  const qb = actor(sk.qb, "QB");
  const kicker = actor(sk.k, "K");
  const defender = () => {
    const x = pick(rng, dsk.defense);
    return actor(x.name, x.pos, opp);
  };
  const rusher = () => (rng() < 0.08 ? qb : actor(rng() < 0.72 ? sk.rb[0] : (sk.rb[1] ?? sk.rb[0]), "RB"));
  const receiver = () => {
    const total = sk.receivers.reduce((n, r) => n + r.share, 0);
    let x = rng() * total;
    for (const r of sk.receivers) if ((x -= r.share) <= 0) return actor(r.name, r.pos);
    return actor(sk.receivers[0].name, sk.receivers[0].pos);
  };
  const pressureSack = d.pressure ? 0.55 : 0.35;

  // Lay out the yardage: where the drive starts, the sets of downs, and how it ends.
  const yards = d.yards;
  let start = 25;
  let body: number[][] = [];
  let tail: number[] = [];
  let finalYards = 0;
  if (result === "TD") {
    finalYards = rng() < 0.3 ? int(rng, 12, Math.min(75, yards)) : int(rng, 1, Math.min(11, yards));
    start = clamp(100 - yards, 1, 99);
    const c = chains(rng, yards - finalYards, false);
    body = c.sets;
    tail = c.rest > 0 ? (rng() < 0.5 ? [c.rest] : stall(rng, c.rest, 2)) : [];
  } else if (result === "INT" || result === "FUM") {
    const c = chains(rng, Math.max(0, yards), false);
    body = c.sets;
    tail = c.rest > 0 ? stall(rng, c.rest, rng() < 0.5 ? 1 : 2) : [];
  } else {
    // A stalled drive: sets of downs, then three plays that don't make it, then 4th down.
    const want = d.fourth ?? pick(rng, [1, 2, 3, 4, 5, 6, 7, 8, 10]);
    let t = 10 - want;
    let b = yards - t;
    if (yards < 10) {
      b = 0;
      t = yards;
    } else if (b < 10) {
      b = 10;
      t = yards - 10;
    }
    body = b > 0 ? chains(rng, b, true).sets : [];
    tail = stall(rng, t, 3);
  }

  // Walk the field.
  const snaps = body.flat().length + tail.length + (result === "END" ? 1 : 1);
  const per = d.clock ? d.clock.span / Math.max(1, snaps) : 0;
  let snap = 0;
  const clock = () => (d.clock ? clockText(d.clock.start - per * snap) : "OT");
  let spot = start;
  let down = 1;
  let toGo = Math.min(10, 100 - spot);
  const plays: Play[] = [];
  const score = (s: { home: number; away: number }) => ({ homeScore: s.home, awayScore: s.away });

  const push = (p: Omit<Play, "quarter" | "clock" | "team" | "down" | "toGo" | "spot" | "homeScore" | "awayScore">, s = d.before) => {
    plays.push({ quarter: d.quarter, clock: clock(), team, down, toGo, spot, ...p, ...score(s) });
    snap++;
  };
  const advance = (y: number) => {
    spot = clamp(spot + y, 1, 99);
    if (y >= toGo) {
      down = 1;
      toGo = Math.min(10, 100 - spot);
    } else {
      down++;
      toGo -= y;
    }
  };

  const gain = (y: number) => {
    if (y === 0 && rng() < 0.75) {
      const rec = receiver();
      const def = defender();
      const t = pick(rng, TEXT.inc);
      push({ kind: "incomplete", yards: 0, label: "Incomplete", text: fill(t, { qb: lastName(qb.name), rec: lastName(rec.name), def: def.name }), player: t.includes("{def}") ? def : qb, qb, pass: true });
    } else if (y < 0 && rng() < pressureSack) {
      const def = actor(dsk.defense[0].name, dsk.defense[0].pos, opp);
      const who = rng() < 0.6 ? def : defender();
      push({ kind: "sack", yards: y, label: "Sack", text: fill(pick(rng, TEXT.sack), { qb: lastName(qb.name), def: who.name }), player: who, qb, rusher: qb, def: who });
    } else {
      const p = clamp(d.passShare + (y >= 18 ? 0.2 : y <= 3 ? -0.2 : 0), 0.05, 0.95);
      if (y > 0 && rng() < p) {
        const rec = receiver();
        const t = pick(rng, y >= 20 ? TEXT.deep : y >= 10 ? TEXT.mid : TEXT.short);
        push({ kind: "pass", yards: y, label: y >= 20 ? "Deep pass" : y >= 10 ? "Pass" : "Short pass", text: fill(t, { qb: lastName(qb.name), rec: rec.name }), player: rec, qb, rec, pass: true });
      } else {
        const rb = rusher();
        const def = defender();
        const pool = rb === qb && y > 0 ? TEXT.scramble : y <= 0 ? TEXT.stuff : y < 5 ? TEXT.run : y < 15 ? TEXT.good : TEXT.big;
        push({ kind: "run", yards: y, label: y <= 0 ? (y < 0 ? "Loss" : "No gain") : y >= 15 ? "Big run" : "Run", text: fill(pick(rng, pool), { rb: rb.name, qb: qb.name, def: def.name }), player: rb, rusher: rb, def: y <= 0 ? def : undefined });
      }
    }
    advance(y);
  };

  for (const set of body) for (const y of set) gain(y);
  for (const y of tail) gain(y);

  const side = team === d.home ? "home" : "away";
  if (result === "TD") {
    const n = 100 - spot;
    const passing = rng() < clamp(d.passShare + (n >= 20 ? 0.15 : 0), 0.1, 0.9);
    const six = { ...d.before, [side]: d.before[side] + 6 };
    if (passing) {
      const rec = receiver();
      const t = pick(rng, n >= 20 ? TEXT.tdLong : TEXT.tdPass);
      push({ kind: "td", yards: n, label: "Touchdown", text: fill(t, { qb: lastName(qb.name), rec: rec.name, n }), player: rec, qb, rec, pass: true, scoring: true }, six);
    } else {
      const rb = rng() < 0.8 ? actor(sk.rb[0], "RB") : qb;
      const t = pick(rng, n >= 15 ? TEXT.tdRunLong : TEXT.tdRun);
      push({ kind: "td", yards: n, label: "Touchdown", text: fill(t, { rb: rb.name, n }), player: rb, rusher: rb, scoring: true }, six);
    }
    snap--; // the try doesn't take time off the clock
    const tr = d.tryAfter ?? { two: false, made: true };
    const label = tr.two ? "Two-point try" : "Extra point";
    const text = tr.two ? (tr.made ? "Two-point try is good" : "Two-point try fails") : tr.made ? `${kicker.name}'s extra point is good` : `${kicker.name}'s extra point is no good`;
    plays.push({ quarter: d.quarter, clock: clock(), team, down: 0, toGo: 0, spot: 97, kind: "try", yards: 0, label, text, player: tr.two ? plays[plays.length - 1].player : kicker, ...score(d.after), scoring: tr.made });
  } else if (result === "FG" || result === "MISS") {
    const good = result === "FG";
    push({ kind: good ? "fg" : "miss", yards: 0, label: good ? "Field goal" : "No good", text: `${kicker.name}'s ${d.fgDistance}-yard field goal ${good ? "is good" : "is no good"}`, player: kicker, scoring: good }, d.after);
  } else if (result === "PUNT") {
    const room = 100 - spot;
    const kick = int(rng, 34, 50);
    push({ kind: "punt", yards: 0, label: "Punt", text: kick >= room ? `${kicker.name} punts into the end zone. Touchback.` : `${kicker.name} punts ${kick} yards`, player: kicker });
  } else if (result === "DOWNS") {
    const y = int(rng, -1, Math.max(-1, toGo - 1));
    if (y <= 0 && rng() < 0.6) {
      const def = defender();
      push({ kind: "downs", yards: 0, label: "Turnover on downs", text: `${lastName(qb.name)}'s 4th-down pass is broken up by ${def.name}`, player: def, qb, pass: true });
    } else {
      const rb = rusher();
      push({ kind: "downs", yards: y, label: "Turnover on downs", text: `${rb.name} is stopped short on 4th down`, player: rb, rusher: rb });
    }
  } else if (result === "INT") {
    const def = defender();
    push({ kind: "int", yards: 0, label: "Interception", text: fill(pick(rng, TEXT.int), { qb: lastName(qb.name), def: def.name }), player: def, qb, def, pass: true });
  } else if (result === "FUM") {
    const rb = rusher();
    const def = defender();
    push({ kind: "fumble", yards: 0, label: "Fumble", text: fill(pick(rng, TEXT.fum), { rb: rb.name, def: def.name }), player: def, rusher: rb, def });
  } else {
    push({ kind: "kneel", yards: -1, label: "Kneel", text: `${lastName(qb.name)} takes a knee`, player: qb, rusher: qb });
  }
  return plays;
}

// ---- Running stat lines for the feed ------------------------------------------------

export interface Tally {
  cmp: number;
  att: number;
  passYds: number;
  passTd: number;
  int: number;
  car: number;
  rushYds: number;
  rushTd: number;
  rec: number;
  recYds: number;
  recTd: number;
  sacks: number;
  takeaways: number;
  fgm: number;
  fga: number;
  xpm: number;
  xpa: number;
}

export const actorKey = (a: Actor) => `${a.team}:${a.name}`;
const blank = (): Tally => ({ cmp: 0, att: 0, passYds: 0, passTd: 0, int: 0, car: 0, rushYds: 0, rushTd: 0, rec: 0, recYds: 0, recTd: 0, sacks: 0, takeaways: 0, fgm: 0, fga: 0, xpm: 0, xpa: 0 });

/** Add one play to running stat lines (the same rules as the box score). */
export function tally(map: Map<string, Tally>, p: Play) {
  const get = (a: Actor) => {
    const k = actorKey(a);
    let t = map.get(k);
    if (!t) map.set(k, (t = blank()));
    return t;
  };
  if (p.qb && p.pass) get(p.qb).att++;
  if (p.rec && (p.kind === "pass" || p.kind === "td")) {
    const q = get(p.qb!);
    const r = get(p.rec);
    q.cmp++;
    q.passYds += p.yards;
    r.rec++;
    r.recYds += p.yards;
    if (p.kind === "td") {
      q.passTd++;
      r.recTd++;
    }
  }
  if (p.rusher && p.kind !== "int") {
    const r = get(p.rusher);
    r.car++;
    r.rushYds += p.yards;
    if (p.kind === "td") r.rushTd++;
  }
  if (p.kind === "sack" && p.def) get(p.def).sacks++;
  if (p.kind === "int" && p.qb) get(p.qb).int++;
  if ((p.kind === "int" || p.kind === "fumble") && p.def) get(p.def).takeaways++;
  if ((p.kind === "fg" || p.kind === "miss") && p.player) {
    const k = get(p.player);
    k.fga++;
    if (p.kind === "fg") k.fgm++;
  }
  if (p.kind === "try" && p.label === "Extra point" && p.player) {
    const k = get(p.player);
    k.xpa++;
    if (p.scoring) k.xpm++;
  }
}

/** The stat line that goes under the featured player: "9 REC, 61 YDS, 1 TD". */
export function statText(p: Play, map: Map<string, Tally>): string {
  const a = p.player;
  if (!a) return "";
  const t = map.get(actorKey(a));
  if (!t) return "";
  const td = (n: number) => (n ? `, ${n} TD` : "");
  const same = (b?: Actor) => !!b && b.name === a.name && b.team === a.team;
  if (p.kind === "fg" || p.kind === "miss" || (p.kind === "try" && a.pos === "K")) return `${t.fgm}/${t.fga} FG, ${t.xpm}/${t.xpa} XP`;
  if (same(p.def) || (a.team !== p.team)) {
    const bits = [t.sacks && `${t.sacks} SACK`, t.takeaways && `${t.takeaways} TAKEAWAY${t.takeaways > 1 ? "S" : ""}`].filter(Boolean);
    return bits.join(", ") || a.pos;
  }
  if (same(p.rec) || (p.kind === "try" && t.rec)) return `${t.rec} REC, ${t.recYds} YDS${td(t.recTd)}`;
  if (same(p.rusher) && a.pos !== "QB") return `${t.car} CAR, ${t.rushYds} YDS${td(t.rushTd)}`;
  if (a.pos === "QB") {
    const pass = `${t.cmp}/${t.att}, ${t.passYds} YDS, ${t.passTd} TD, ${t.int} INT`;
    return t.car && same(p.rusher) ? `${t.car} CAR, ${t.rushYds} YDS · ${pass}` : pass;
  }
  return `${t.car} CAR, ${t.rushYds} YDS${td(t.rushTd)}`;
}
