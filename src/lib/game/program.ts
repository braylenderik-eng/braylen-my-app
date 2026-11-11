// Coaching identity and program expectations, chosen when a dynasty starts. Pure data and helpers.

import { TEAMS, type TeamId } from "./data";
import { FOOTBALL_REV_SHARE } from "./economy";
import type { Pos } from "./roster";
import type { DefensePlan, OffensePlan } from "./sim";

export type OffenseStyle = "airraid" | "spread" | "pro" | "ground";
export type DefenseStyle = "attacking" | "multiple" | "bend";

export interface CoachProfile {
  name: string;
  almaMater: string;
  offense: OffenseStyle;
  defense: DefenseStyle;
}

export const OFFENSE_STYLES: Record<OffenseStyle, { name: string; blurb: string; plan: OffensePlan; fit: Pos[] }> = {
  airraid: { name: "Air Raid", blurb: "Four wide, throw it all over the field.", plan: "air", fit: ["QB", "WR"] },
  spread: { name: "Spread Option", blurb: "Stretch the defense and make it defend the quarterback's legs.", plan: "balanced", fit: ["QB", "RB"] },
  pro: { name: "Pro Style", blurb: "Under center, play-action, tight ends and a physical line.", plan: "balanced", fit: ["TE", "OT", "IOL"] },
  ground: { name: "Ground & Pound", blurb: "Run it, run it again, and win the fourth quarter.", plan: "ground", fit: ["RB", "OT", "IOL"] },
};

export const DEFENSE_STYLES: Record<DefenseStyle, { name: string; blurb: string; plan: DefensePlan; fit: Pos[] }> = {
  attacking: { name: "Attacking", blurb: "Pressure from everywhere. Live with the big play.", plan: "pressure", fit: ["EDGE", "LB"] },
  multiple: { name: "Multiple", blurb: "Disguise and adjust to whatever the offense does.", plan: "base", fit: ["LB", "S"] },
  bend: { name: "Bend, Don't Break", blurb: "Two deep, keep it in front, win in the red zone.", plan: "bend", fit: ["CB", "S"] },
};

/** Positions that fit a coach's schemes: those prospects are easier to land, others a bit harder. */
export function schemeFit(coach: Pick<CoachProfile, "offense" | "defense">): Pos[] {
  return [...new Set([...OFFENSE_STYLES[coach.offense].fit, ...DEFENSE_STYLES[coach.defense].fit])];
}

/** Rating edge for calling the game plan your scheme is built around. */
export function schemeEdge(coach: Pick<CoachProfile, "offense" | "defense"> | null, plan: { offense: OffensePlan; defense: DefensePlan }) {
  if (!coach) return { off: 0, def: 0 };
  return {
    off: OFFENSE_STYLES[coach.offense].plan === plan.offense ? 1 : 0,
    def: DEFENSE_STYLES[coach.defense].plan === plan.defense ? 1 : 0,
  };
}

export type Tier = "Blue blood" | "Contender" | "Rising" | "Rebuild";

export interface ProgramProfile {
  tier: Tier;
  winTarget: number; // regular-season wins expected
  baseBudget: number; // football player budget each season before results: revenue share + collective
  revShare: number; // the school's revenue-sharing money for football (capped)
  collective: number; // NIL from the collective and boosters on top
  prestige: number; // 0-1, used for recruiting until you have a track record
}

/** Program tier from team strength: bigger programs bring bigger budgets and bigger expectations. */
export function programProfile(team: TeamId): ProgramProfile {
  const t = TEAMS[team];
  const power = t.off + t.def;
  // Everyone gets (close to) the same revenue share; the collective is where the big programs pull ahead.
  const p = (tier: Tier, winTarget: number, revShare: number, collective: number, prestige: number): ProgramProfile => ({
    tier,
    winTarget,
    revShare,
    collective,
    baseBudget: revShare + collective,
    prestige,
  });
  if (power >= 172) return p("Blue blood", 10, FOOTBALL_REV_SHARE, 17_800_000, 0.85);
  if (power >= 163) return p("Contender", 9, FOOTBALL_REV_SHARE, 7_800_000, 0.6);
  if (power >= 152) return p("Rising", 7, 13_000_000, 2_500_000, 0.4);
  return p("Rebuild", 5, 9_500_000, 1_500_000, 0.2);
}

/** How a season measured up against expectations, and what it does to next year's budget. */
export function expectationsVerdict(wins: number, target: number) {
  if (wins >= target + 2) return { label: "Exceeded expectations", budget: 2_000_000 };
  if (wins >= target) return { label: "Met expectations", budget: 750_000 };
  if (wins >= target - 2) return { label: "Fell short", budget: 0 };
  return { label: "Hot seat", budget: -1_500_000 };
}
