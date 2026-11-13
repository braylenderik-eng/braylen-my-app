// Stallions roster, depth chart and the lineup math that feeds the sim. Pure TypeScript.

import { TEAMS, type Skill, type TeamId } from "./data";
import { hashSeed, makeRng } from "./rng";
import { marketValue } from "./economy";

export type Pos = "QB" | "RB" | "WR" | "TE" | "OT" | "IOL" | "EDGE" | "DT" | "LB" | "CB" | "S" | "K" | "P";
export type Year = "Fr" | "So" | "Jr" | "Sr";

export interface Player {
  id: string;
  name: string;
  num: number;
  pos: Pos;
  yr: Year | "HS";
  ovr: number;
  hometown: string;
  nil: number; // annual NIL deal
  pot?: number; // hidden potential; derived from id and class year when missing
  source?: "portal" | "recruit" | "walkon";
  promised?: boolean; // promised a bigger role this season: won't enter the January portal
  frustrated?: boolean; // unhappy with playing time: will ask to transfer in January
  awards?: string[]; // "2027 All-Conference", "2027 The Crown Trophy"
  redshirt?: boolean; // sitting out this season to keep a year of eligibility
  rsUsed?: boolean; // has used his redshirt year
  contractYears?: number; // seasons left on a locked NIL deal (no raise until it runs out)
  career?: import("./sim").StatLine & { games: number }; // totals from finished seasons
}

export interface Injury {
  desc: string; // "ankle"
  status: "questionable" | "out";
  weeks: number; // games missed remaining when "out"
}

/** How many starters each position group fields. */
export const STARTERS: Record<Pos, number> = { QB: 1, RB: 1, WR: 3, TE: 1, OT: 2, IOL: 3, EDGE: 2, DT: 2, LB: 2, CB: 2, S: 2, K: 1, P: 1 };

export const POS_ORDER: Pos[] = ["QB", "RB", "WR", "TE", "OT", "IOL", "EDGE", "DT", "LB", "CB", "S", "K", "P"];

export const POS_LABEL: Record<Pos, string> = {
  QB: "Quarterback", RB: "Running back", WR: "Wide receiver", TE: "Tight end", OT: "Offensive tackle", IOL: "Interior line",
  EDGE: "Edge rusher", DT: "Defensive tackle", LB: "Linebacker", CB: "Cornerback", S: "Safety", K: "Kicker", P: "Punter",
};

export const SIDE: Record<Pos, "off" | "def" | "st"> = {
  QB: "off", RB: "off", WR: "off", TE: "off", OT: "off", IOL: "off", EDGE: "def", DT: "def", LB: "def", CB: "def", S: "def", K: "st", P: "st",
};

// Pay comes from market value (position and rating).
const p = (id: string, name: string, num: number, pos: Pos, yr: Year, ovr: number, hometown: string): Player => ({ id, name, num, pos, yr, ovr, hometown, nil: marketValue(pos, ovr, id) });

/** The Stallions, listed in default depth order within each position. */
export const ROSTER: Player[] = [
  p("whitfield", "Tate Whitfield", 7, "QB", "Jr", 86, "Abilene, TX"),
  p("rusk", "Caleb Rusk", 12, "QB", "So", 74, "Lubbock, TX"),
  p("lyle", "Marcus Lyle", 22, "RB", "Jr", 84, "Tyler, TX"),
  p("ortiz", "Jaylen Ortiz", 28, "RB", "Fr", 77, "El Paso, TX"),
  p("shaw", "Devin Shaw", 1, "WR", "Sr", 87, "Houston, TX"),
  p("grant", "Isaiah Grant", 5, "WR", "Jr", 83, "Shreveport, LA"),
  p("valdez", "Rico Valdez", 11, "WR", "So", 80, "San Antonio, TX"),
  p("thornton", "Malik Thornton", 84, "WR", "Fr", 75, "Waco, TX"),
  p("pruitt", "Owen Pruitt", 88, "TE", "Sr", 81, "Midland, TX"),
  p("kessler", "Brady Kessler", 85, "TE", "So", 72, "Tulsa, OK"),
  p("hart", "Nolan Hart", 74, "OT", "Sr", 85, "Amarillo, TX"),
  p("marquez", "Andre Marquez", 76, "OT", "Jr", 82, "Laredo, TX"),
  p("ivers", "Luke Ivers", 71, "OT", "So", 74, "Odessa, TX"),
  p("pulaski", "Grant Pulaski", 65, "IOL", "Jr", 81, "Fort Worth, TX"),
  p("salas", "Diego Salas", 55, "IOL", "Sr", 80, "Corpus Christi, TX"),
  p("brandt", "Kyle Brandt", 62, "IOL", "Jr", 79, "Plano, TX"),
  p("vu", "Tommy Vu", 68, "IOL", "Fr", 71, "Garland, TX"),
  p("okoye", "Trey Okoye", 9, "EDGE", "Sr", 85, "Dallas, TX"),
  p("pierce", "Jamal Pierce", 44, "EDGE", "Jr", 80, "Beaumont, TX"),
  p("dunn", "Xavier Dunn", 49, "EDGE", "Fr", 73, "Killeen, TX"),
  p("mosley", "Raymond Mosley", 95, "DT", "Sr", 82, "Texarkana, TX"),
  p("leota", "Tavita Leota", 92, "DT", "Jr", 80, "Euless, TX"),
  p("brooks", "Elijah Brooks", 97, "DT", "So", 72, "Bryan, TX"),
  p("buckner", "Cam Buckner", 34, "LB", "Jr", 80, "Arlington, TX"),
  p("gaines", "Hunter Gaines", 42, "LB", "Sr", 79, "Round Rock, TX"),
  p("reyes", "Mason Reyes", 36, "LB", "So", 71, "McAllen, TX"),
  p("vance", "Reggie Vance", 3, "CB", "Jr", 83, "Baton Rouge, LA"),
  p("webb", "Darnell Webb", 21, "CB", "Sr", 81, "Longview, TX"),
  p("sims", "Kobe Sims", 24, "CB", "So", 74, "Temple, TX"),
  p("ellis", "Jordan Ellis", 2, "S", "Sr", 82, "Austin, TX"),
  p("clarke", "Tyson Clarke", 8, "S", "Jr", 79, "Denton, TX"),
  p("ferrante", "Nico Ferrante", 27, "S", "Fr", 70, "Kerrville, TX"),
  p("delgado", "Sam Delgado", 39, "K", "Jr", 80, "Brownsville, TX"),
  p("eriksen", "Lars Eriksen", 38, "P", "Sr", 77, "Sugar Land, TX"),
];

export const INITIAL_INJURIES: Record<string, Injury> = {
  marquez: { desc: "ankle", status: "questionable", weeks: 0 },
};

export function initialDepth(players: Player[] = ROSTER): Record<Pos, string[]> {
  const depth = Object.fromEntries(POS_ORDER.map((pos) => [pos, [] as string[]])) as Record<Pos, string[]>;
  for (const pl of players) depth[pl.pos].push(pl.id);
  return depth;
}

// ---- Lineup ---------------------------------------------------------------------

export interface LineupInput {
  players: Player[];
  depth: Record<Pos, string[]>;
  injuries: Record<string, Injury>;
  /** Game-time calls for questionable players; default is to rest them. */
  gameTime: Record<string, "start" | "rest">;
}

export function isAvailable(id: string, inp: Pick<LineupInput, "injuries" | "gameTime">) {
  const inj = inp.injuries[id];
  if (!inj) return true;
  if (inj.status === "out") return false;
  return inp.gameTime[id] === "start";
}

/** Starters per position: the first N available players in depth order. */
export function starters(inp: LineupInput): Record<Pos, Player[]> {
  const byId = new Map(inp.players.map((pl) => [pl.id, pl]));
  const out = {} as Record<Pos, Player[]>;
  for (const pos of POS_ORDER) {
    out[pos] = inp.depth[pos]
      .map((id) => byId.get(id))
      .filter((pl): pl is Player => !!pl && pl.yr !== "HS" && !pl.redshirt && isAvailable(pl.id, inp))
      .slice(0, STARTERS[pos]);
  }
  return out;
}

const avg = (xs: Player[]) => (xs.length ? xs.reduce((s, x) => s + x.ovr, 0) / xs.length : 60);

const OFF_WEIGHTS: Partial<Record<Pos, number>> = { QB: 0.3, OT: 0.12, IOL: 0.13, WR: 0.2, RB: 0.13, TE: 0.12 };
const DEF_WEIGHTS: Partial<Record<Pos, number>> = { EDGE: 0.25, DT: 0.2, LB: 0.2, CB: 0.2, S: 0.15 };
/** How strongly lineup changes move the team rating. */
const SCALE = 1.5;

function weighted(st: Record<Pos, Player[]>, w: Partial<Record<Pos, number>>) {
  return (Object.keys(w) as Pos[]).reduce((s, pos) => s + avg(st[pos]) * (w[pos] ?? 0), 0);
}

const BASELINE = (() => {
  const st = starters({ players: ROSTER, depth: initialDepth(), injuries: {}, gameTime: {} });
  return { off: weighted(st, OFF_WEIGHTS), def: weighted(st, DEF_WEIGHTS) };
})();

/**
 * The user's team ratings for the sim, from its starters. Calibrated on the Lone Star template roster
 * (84 offense / 81 defense); generated rosters are built to land on their program's rating.
 */
export function teamRatings(_team: TeamId, inp: LineupInput) {
  const st = starters(inp);
  return {
    off: 84 + (weighted(st, OFF_WEIGHTS) - BASELINE.off) * SCALE,
    def: 81 + (weighted(st, DEF_WEIGHTS) - BASELINE.def) * SCALE,
  };
}

/**
 * A full roster for any program: the Lone Star template, re-rated so the team lands on its own
 * offense/defense rating, with new names, numbers and hometowns. Lone Star keeps its real roster.
 */
export function rosterFor(team: TeamId, seed: number): Player[] {
  if (team === "stallions") return ROSTER;
  const shift = { off: (TEAMS[team].off - 84) / SCALE, def: (TEAMS[team].def - 81) / SCALE };
  const rng = makeRng(hashSeed("roster", team, seed));
  const used = new Set<number>();
  return ROSTER.map((tpl, i) => {
    const side = SIDE[tpl.pos] === "def" ? shift.def : SIDE[tpl.pos] === "off" ? shift.off : (shift.off + shift.def) / 2;
    const ovr = Math.max(55, Math.min(97, Math.round(tpl.ovr + side + (rng() - 0.5) * 4)));
    let num = tpl.num;
    while (used.has(num)) num = 1 + (num % 99);
    used.add(num);
    const first = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)];
    const last = LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)];
    return { ...tpl, id: `${team}-${i}`, name: `${first} ${last}`, num, ovr, nil: marketValue(tpl.pos, ovr, `${team}-${i}`), hometown: HOMETOWNS[Math.floor(rng() * HOMETOWNS.length)] };
  });
}

const FIRST_NAMES = ["Aaron", "Bryce", "Carter", "Dominic", "Elijah", "Gabe", "Hudson", "Isaiah", "Jordan", "Kaden", "Levi", "Malik", "Nolan", "Parker", "Quinn", "Roman", "Sawyer", "Trey", "Vance", "Wesley", "Xavier", "Zach", "Ty", "Deshawn", "Marcus", "Andre", "Cole", "Jace", "Reggie", "Tanner"];
const LAST_NAMES = ["Adams", "Baker", "Coleman", "Dixon", "Evans", "Foster", "Graham", "Harris", "Irving", "Jackson", "King", "Lewis", "Mitchell", "Nelson", "Owens", "Patterson", "Reed", "Simmons", "Turner", "Underwood", "Vaughn", "Walker", "Young", "Brooks", "Carter", "Hayes", "Price", "Ross", "Ward", "Wells"];
const HOMETOWNS = ["Atlanta, GA", "Miami, FL", "Houston, TX", "Charlotte, NC", "Memphis, TN", "Phoenix, AZ", "Denver, CO", "Columbus, OH", "Birmingham, AL", "Jackson, MS", "Tulsa, OK", "Omaha, NE", "Richmond, VA", "Mobile, AL", "Fresno, CA"];

/** Change in team rating if a starter is swapped for the next man up. Used for mid-game injuries. */
export function ratingLossWithout(team: TeamId, inp: LineupInput, id: string) {
  const before = teamRatings(team, inp);
  const after = teamRatings(team, { ...inp, injuries: { ...inp.injuries, [id]: { desc: "", status: "out", weeks: 1 } } });
  return { off: before.off - after.off, def: before.def - after.def };
}

/** Names the play-by-play uses for the user's team. */
export function skillFor(inp: LineupInput): Skill {
  const st = starters(inp);
  const byId = new Map(inp.players.map((pl) => [pl.id, pl]));
  const backups = (pos: Pos) =>
    inp.depth[pos].map((id) => byId.get(id)!).filter((pl) => pl && pl.yr !== "HS" && !pl.redshirt && isAvailable(pl.id, inp) && !st[pos].includes(pl));
  const wr = st.WR;
  return {
    qb: st.QB[0]?.name ?? "Backup QB",
    rb: [st.RB[0]?.name ?? "Walk-on RB", backups("RB")[0]?.name ?? st.RB[0]?.name ?? "Walk-on RB"],
    receivers: [
      ...wr.map((pl, i) => ({ name: pl.name, pos: "WR" as const, share: [0.34, 0.27, 0.17][i] ?? 0.1 })),
      ...(st.TE[0] ? [{ name: st.TE[0].name, pos: "TE" as const, share: 0.2 }] : []),
    ],
    k: st.K[0]?.name ?? "Walk-on K",
    defense: [...st.EDGE, ...st.LB, ...st.CB, ...st.S.slice(0, 1), ...st.DT.slice(0, 1)].map((pl) => ({ name: pl.name, pos: pl.pos })),
  };
}

/** Position-group cards for the matchup panels. */
export function unitsFor(inp: LineupInput): Record<string, { name: string; rating: number }> {
  const st = starters(inp);
  const unit = (xs: Player[], label: string) => ({ name: label, rating: Math.round(avg(xs)) });
  const top = (xs: Player[]) => ({ name: xs[0]?.name ?? "—", rating: xs[0]?.ovr ?? 60 });
  return {
    QB: top(st.QB),
    RB: top(st.RB),
    WR: top([...st.WR].sort((a, b) => b.ovr - a.ovr)),
    OL: unit([...st.OT, ...st.IOL], "OL unit"),
    DL: unit(st.DT, "DL unit"),
    EDGE: top([...st.EDGE].sort((a, b) => b.ovr - a.ovr)),
    CB: top([...st.CB].sort((a, b) => b.ovr - a.ovr)),
    LB: unit(st.LB, "LB unit"),
  };
}

// ---- Player card attributes ------------------------------------------------------

const ATTRS: Record<Pos, string[]> = {
  QB: ["Arm strength", "Accuracy", "Vision", "Mobility"],
  RB: ["Speed", "Power", "Elusiveness", "Hands"],
  WR: ["Speed", "Hands", "Route running", "Release"],
  TE: ["Hands", "Route running", "Blocking", "Speed"],
  OT: ["Pass block", "Run block", "Strength", "Footwork"],
  IOL: ["Pass block", "Run block", "Strength", "Footwork"],
  EDGE: ["Pass rush", "Run stop", "Strength", "Motor"],
  DT: ["Pass rush", "Run stop", "Strength", "Motor"],
  LB: ["Tackling", "Coverage", "Instincts", "Speed"],
  CB: ["Coverage", "Speed", "Ball skills", "Tackling"],
  S: ["Coverage", "Speed", "Ball skills", "Tackling"],
  K: ["Power", "Accuracy", "Consistency", "Clutch"],
  P: ["Power", "Accuracy", "Hang time", "Clutch"],
};

/** Four position attributes, deterministic per player, averaging out near their OVR. */
export function attributes(pl: Player): { label: string; value: number }[] {
  const rng = makeRng(hashSeed("attrs", pl.id));
  const offs = ATTRS[pl.pos].map(() => Math.round((rng() - 0.5) * 14));
  const mean = offs.reduce((a, b) => a + b, 0) / offs.length;
  return ATTRS[pl.pos].map((label, i) => ({ label, value: Math.max(40, Math.min(99, Math.round(pl.ovr + offs[i] - mean))) }));
}

// ---- Generated opponents ---------------------------------------------------------

const FIRST = ["Jalen", "Marcus", "Tyler", "Brandon", "Dre", "Cody", "Isaiah", "Mason", "Trent", "Darius", "Colton", "Rashad", "Wes", "Kendall", "Jace", "Austin", "Malik", "Bryce", "Damon", "Quentin"];
const LAST = ["Holt", "Banks", "Carter", "Dawson", "Ellison", "Fowler", "Gentry", "Hayes", "Ingram", "Jennings", "Keller", "Lowry", "Maddox", "Nash", "Odom", "Pryor", "Quarles", "Rowland", "Sutton", "Tatum", "Upton", "Vickers", "Whitley", "Yates"];

function nameFor(team: TeamId, slot: string) {
  const rng = makeRng(hashSeed("name", team, slot));
  return `${FIRST[Math.floor(rng() * FIRST.length)]} ${LAST[Math.floor(rng() * LAST.length)]}`;
}

/** Play-by-play names for teams without a hand-written depth chart. */
export function generatedSkill(team: TeamId): Skill {
  return {
    qb: nameFor(team, "qb"),
    rb: [nameFor(team, "rb1"), nameFor(team, "rb2")],
    receivers: [
      { name: nameFor(team, "wr1"), pos: "WR", share: 0.4 },
      { name: nameFor(team, "wr2"), pos: "WR", share: 0.33 },
      { name: nameFor(team, "te1"), pos: "TE", share: 0.27 },
    ],
    k: nameFor(team, "k"),
    defense: [
      { name: nameFor(team, "edge"), pos: "EDGE" },
      { name: nameFor(team, "lb"), pos: "LB" },
      { name: nameFor(team, "cb"), pos: "CB" },
    ],
  };
}

export function generatedUnits(team: TeamId, rating: { off: number; def: number } = TEAMS[team]): Record<string, { name: string; rating: number }> {
  const { off, def } = rating;
  const s = generatedSkill(team);
  return {
    QB: { name: s.qb, rating: off + 1 },
    RB: { name: s.rb[0], rating: off - 1 },
    WR: { name: s.receivers[0].name, rating: off + 2 },
    OL: { name: "OL unit", rating: off - 2 },
    DL: { name: "DL unit", rating: def },
    EDGE: { name: s.defense[0].name, rating: def + 2 },
    CB: { name: s.defense[2].name, rating: def - 1 },
    LB: { name: "LB unit", rating: def - 2 },
  };
}
