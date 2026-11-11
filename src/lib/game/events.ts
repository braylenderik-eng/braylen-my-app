// In-season scenarios: situations that can come up during the regular season, each with choices,
// a deadline and effects on the rest of the game. One may appear at the start of any regular-season
// week; anything unanswered at its deadline resolves with the default choice. Pure functions.

import { TEAMS, type TeamId } from "./data";
import { hashSeed, makeRng } from "./rng";
import { retentionCost } from "./economy";
import { POS_LABEL, STARTERS, type Injury, type Player, type Pos } from "./roster";
import type { RecruitingState } from "./recruiting";

export type ScenarioKind = "flip" | "booster" | "discipline" | "playingTime" | "visit";

export interface ScenarioOption {
  id: string;
  label: string;
  detail: string;
}

export interface Scenario {
  id: string;
  kind: ScenarioKind;
  week: number; // week it came up
  deadline: number; // answer before this week's game is played, or the default applies
  title: string;
  body: string;
  options: ScenarioOption[];
  defaultOption: string;
  target?: string; // player or prospect id
  rival?: TeamId;
  amount?: number;
}

export interface ResolvedScenario {
  id: string;
  kind: ScenarioKind;
  title: string;
  choice: string;
  outcome: string;
  week: number;
  auto: boolean; // resolved by default at the deadline
}

/** The slice of the game a scenario can read and change. */
export interface World {
  season: number;
  week: number;
  finalWeek: number;
  homeGame: boolean;
  players: Player[];
  depth: Record<Pos, string[]>;
  injuries: Record<string, Injury>;
  recruiting: RecruitingState | null;
  nilBudget: number;
  hype: number;
  mediaTrust: number;
}

export type WorldPatch = Partial<Pick<World, "players" | "injuries" | "recruiting" | "nilBudget" | "hype" | "mediaTrust">>;

const pick = <T,>(rng: () => number, xs: readonly T[]) => xs[Math.floor(rng() * xs.length)];
const clamp100 = (x: number) => Math.max(0, Math.min(100, Math.round(x)));
const money = (n: number) => (n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${Math.round(n / 1000)}K`);

function starterIds(w: World) {
  const byId = new Map(w.players.map((p) => [p.id, p]));
  const ids: string[] = [];
  for (const pos of Object.keys(STARTERS) as Pos[]) {
    ids.push(...w.depth[pos].filter((id) => byId.get(id) && byId.get(id)!.yr !== "HS" && !w.injuries[id]).slice(0, STARTERS[pos]));
  }
  return ids;
}

// ---- Builders: each returns a scenario if it can happen right now ------------------------

type Builder = (w: World, rng: () => number, taken: Set<string>) => Scenario | null;

const flip: Builder = (w, rng, taken) => {
  const rec = w.recruiting;
  if (!rec || rec.signed || w.week >= w.finalWeek + 1) return null;
  const candidates = rec.board.filter((p) => p.offered && p.status === "open" && !taken.has(p.id));
  if (!candidates.length) return null;
  const p = candidates.sort((a, b) => b.stars - a.stars)[0];
  const bump = Math.round((p.ask * (0.2 + rng() * 0.25)) / 5_000) * 5_000;
  const stars = "★".repeat(p.stars);
  return {
    id: "",
    kind: "flip",
    week: w.week,
    deadline: w.finalWeek,
    title: `Flip threat: ${stars} ${p.pos} ${p.name}`,
    body: `${TEAMS[p.rival].name} just offered ${p.name} ${money(p.ask + bump)} — ${money(bump)} more than you. His camp says he's still with you, but they want it matched before Early Signing Day.`,
    options: [
      { id: "match", label: `Match (+${money(bump)})`, detail: "Raises his deal and his interest in you. The extra money comes out of your budget now." },
      { id: "hold", label: "Hold your offer", detail: `Keep the money. ${TEAMS[p.rival].name} gains ground before Signing Day.` },
    ],
    defaultOption: "hold",
    target: p.id,
    rival: p.rival,
    amount: bump,
  };
};

const booster: Builder = (w, rng) => {
  const amount = (500 + Math.floor(rng() * 5) * 250) * 1000; // $500K - $1.5M
  return {
    id: "",
    kind: "booster",
    week: w.week,
    deadline: w.week,
    title: "Booster pledge",
    body: `A booster wants to give ${money(amount)} to the NIL collective — and would like a say in how it's spent and a sideline pass for the rest of the season.`,
    options: [
      { id: "accept", label: `Accept ${money(amount)}`, detail: "More money for deals. The media will ask who's really running the program." },
      { id: "decline", label: "Decline", detail: "No strings, no money. Earns some goodwill." },
    ],
    defaultOption: "decline",
    amount,
  };
};

const discipline: Builder = (w, rng, taken) => {
  const ids = starterIds(w).filter((id) => !taken.has(id));
  const byId = new Map(w.players.map((p) => [p.id, p]));
  const pool = ids.map((id) => byId.get(id)!).filter((p) => p.pos !== "K" && p.pos !== "P");
  if (!pool.length) return null;
  const p = pick(rng, pool);
  const what = pick(rng, ["missed curfew before the road trip", "skipped two team meetings", "got into a shouting match with a position coach", "violated a team rule"]);
  return {
    id: "",
    kind: "discipline",
    week: w.week,
    deadline: w.week,
    title: `Discipline: ${p.pos} ${p.name}`,
    body: `Your starting ${POS_LABEL[p.pos].toLowerCase()} ${p.name} ${what}. The locker room is watching what you do.`,
    options: [
      { id: "suspend", label: "Suspend him one game", detail: "He sits this week's game. The program looks disciplined." },
      { id: "internal", label: "Handle it internally", detail: "He plays. If the story gets out, it won't look good." },
    ],
    defaultOption: "internal",
    target: p.id,
  };
};

const playingTime: Builder = (w, rng, taken) => {
  const starters = new Set(starterIds(w));
  const pool = w.players.filter((p) => !starters.has(p.id) && (p.yr === "So" || p.yr === "Jr") && p.ovr >= 72 && !p.promised && !p.frustrated && !taken.has(p.id));
  if (!pool.length) return null;
  const p = pick(rng, pool);
  const cost = retentionCost(p.pos, p.ovr, p.id);
  return {
    id: "",
    kind: "playingTime",
    week: w.week,
    deadline: w.finalWeek,
    title: `Playing time: ${p.pos} ${p.name}`,
    body: `Backup ${POS_LABEL[p.pos].toLowerCase()} ${p.name} (${p.ovr} OVR) is frustrated with his snaps, and people around him are talking about the January transfer window.`,
    options: [
      { id: "promise", label: `Promise a bigger role (+${money(cost)})`, detail: "A raise on his deal now, and he won't enter the portal in January." },
      { id: "quiet", label: "Say nothing", detail: "Keep your money. Expect him to ask to transfer when the window opens." },
    ],
    defaultOption: "quiet",
    target: p.id,
    amount: cost,
  };
};

const visit: Builder = (w, _rng, taken) => {
  const rec = w.recruiting;
  if (!w.homeGame || !rec || rec.signed) return null;
  const p = rec.board.filter((x) => x.status === "open" && !x.visited && x.stars >= 4 && !taken.has(x.id)).sort((a, b) => b.stars - a.stars || b.pot - a.pot)[0];
  if (!p) return null;
  return {
    id: "",
    kind: "visit",
    week: w.week,
    deadline: w.week,
    title: `Official visit request: ${"★".repeat(p.stars)} ${p.pos} ${p.name}`,
    body: `${p.name} wants to take his official visit for your home game this Saturday. It's a big weekend — the stadium will be loud.`,
    options: [
      { id: "host", label: "Host him", detail: "A free official visit on game day: a big boost to his interest." },
      { id: "pass", label: "Not this week", detail: "Nothing changes." },
    ],
    defaultOption: "pass",
    target: p.id,
  };
};

const BUILDERS: [ScenarioKind, Builder, number][] = [
  ["flip", flip, 3],
  ["booster", booster, 2],
  ["discipline", discipline, 2],
  ["playingTime", playingTime, 2],
  ["visit", visit, 2],
];

/**
 * Maybe start a new scenario this week. At most two are open at once, and no two about the
 * same player. `force` guarantees one (used for the very first week of a save).
 */
export function maybeCreate(w: World, seed: number, open: Scenario[], force = false): Scenario | null {
  if (w.week > w.finalWeek || open.length >= 2) return null;
  const rng = makeRng(hashSeed("scenario", seed, w.season, w.week));
  if (!force && rng() > 0.55) return null;
  const taken = new Set(open.map((s) => s.target).filter((t): t is string => !!t));
  const kinds = new Set(open.map((s) => s.kind));
  const built = BUILDERS.filter(([k]) => !kinds.has(k))
    .map(([kind, build, weight]) => ({ kind, weight, s: build(w, rng, taken) }))
    .filter((x): x is { kind: ScenarioKind; weight: number; s: Scenario } => !!x.s);
  if (!built.length) return null;
  const total = built.reduce((n, x) => n + x.weight, 0);
  let roll = rng() * total;
  const chosen = built.find((x) => (roll -= x.weight) <= 0) ?? built[built.length - 1];
  return { ...chosen.s, id: `ev-${w.season}-${w.week}-${chosen.kind}` };
}

/** Apply a choice. Returns what changed and a one-line outcome for the log and news. */
export function resolve(w: World, s: Scenario, optionId: string, seed: number): { patch: WorldPatch; outcome: string } {
  const rng = makeRng(hashSeed("resolve", seed, s.id, optionId));
  const opt = s.options.find((o) => o.id === optionId) ?? s.options.find((o) => o.id === s.defaultOption)!;
  const player = s.target ? w.players.find((p) => p.id === s.target) : undefined;
  const prospect = s.target && w.recruiting ? w.recruiting.board.find((p) => p.id === s.target) : undefined;

  switch (s.kind) {
    case "flip": {
      if (!prospect || prospect.status !== "open" || !w.recruiting) return { patch: {}, outcome: "No longer relevant." };
      const bump = s.amount ?? 0;
      if (opt.id === "match" && w.nilBudget >= bump) {
        const board = w.recruiting.board.map((p) => (p.id === prospect.id ? { ...p, ask: p.ask + bump, you: clamp100(p.you + 14) } : p));
        return { patch: { nilBudget: w.nilBudget - bump, recruiting: { ...w.recruiting, board } }, outcome: `Matched. ${prospect.name} is firmly back in the fold.` };
      }
      const board = w.recruiting.board.map((p) => (p.id === prospect.id ? { ...p, them: clamp100(p.them + 14) } : p));
      return { patch: { recruiting: { ...w.recruiting, board } }, outcome: `Held. ${TEAMS[s.rival!].name} gained ground with ${prospect.name}.` };
    }
    case "booster": {
      if (opt.id === "accept") return { patch: { nilBudget: w.nilBudget + (s.amount ?? 0), mediaTrust: clamp100(w.mediaTrust - 4) }, outcome: `Accepted ${money(s.amount ?? 0)} for the collective.` };
      return { patch: { mediaTrust: clamp100(w.mediaTrust + 2), hype: clamp100(w.hype + 1) }, outcome: "Declined the pledge." };
    }
    case "discipline": {
      if (!player) return { patch: {}, outcome: "No longer relevant." };
      if (opt.id === "suspend") {
        return {
          patch: { injuries: { ...w.injuries, [player.id]: { desc: "suspension", status: "out", weeks: 1 } }, mediaTrust: clamp100(w.mediaTrust + 4), hype: clamp100(w.hype - 1) },
          outcome: `${player.name} suspended for this week's game.`,
        };
      }
      const leaked = rng() < 0.35;
      return leaked
        ? { patch: { mediaTrust: clamp100(w.mediaTrust - 8), hype: clamp100(w.hype - 3) }, outcome: `Handled internally — but the story leaked. Tough week with the press.` }
        : { patch: {}, outcome: `Handled internally. ${player.name} plays.` };
    }
    case "playingTime": {
      if (!player) return { patch: {}, outcome: "No longer relevant." };
      const cost = s.amount ?? 0;
      if (opt.id === "promise" && w.nilBudget >= cost) {
        const players = w.players.map((p) => (p.id === player.id ? { ...p, nil: p.nil + cost, promised: true } : p));
        return { patch: { players, nilBudget: w.nilBudget - cost }, outcome: `Promised ${player.name} a bigger role. He's staying.` };
      }
      const players = w.players.map((p) => (p.id === player.id ? { ...p, frustrated: true } : p));
      return { patch: { players }, outcome: `Said nothing. ${player.name} is likely to enter the January window.` };
    }
    case "visit": {
      if (!prospect || !w.recruiting || prospect.status !== "open") return { patch: {}, outcome: "No longer relevant." };
      if (opt.id === "host" && !prospect.visited) {
        const gain = 18 + Math.round(rng() * 8);
        const board = w.recruiting.board.map((p) => (p.id === prospect.id ? { ...p, you: clamp100(p.you + gain), visited: true } : p));
        return { patch: { recruiting: { ...w.recruiting, board } }, outcome: `Hosted ${prospect.name} on game day (+${gain} interest).` };
      }
      return { patch: {}, outcome: `Passed on ${prospect.name}'s visit.` };
    }
  }
}
