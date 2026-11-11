// Coaching identity and program expectations, chosen when a dynasty starts. Pure data and helpers.

import { TEAMS, type TeamId } from "./data";
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
  baseBudget: number; // NIL budget each season before results
  prestige: number; // 0-1, used for recruiting until you have a track record
}

/** Program tier from team strength: bigger programs bring bigger budgets and bigger expectations. */
export function programProfile(team: TeamId): ProgramProfile {
  const t = TEAMS[team];
  const power = t.off + t.def;
  if (power >= 172) return { tier: "Blue blood", winTarget: 10, baseBudget: 3_000_000, prestige: 0.85 };
  if (power >= 163) return { tier: "Contender", winTarget: 9, baseBudget: 2_400_000, prestige: 0.6 };
  if (power >= 152) return { tier: "Rising", winTarget: 7, baseBudget: 1_800_000, prestige: 0.4 };
  return { tier: "Rebuild", winTarget: 5, baseBudget: 1_200_000, prestige: 0.2 };
}

/** How a season measured up against expectations, and what it does to next year's budget. */
export function expectationsVerdict(wins: number, target: number) {
  if (wins >= target + 2) return { label: "Exceeded expectations", budget: 300_000 };
  if (wins >= target) return { label: "Met expectations", budget: 100_000 };
  if (wins >= target - 2) return { label: "Fell short", budget: 0 };
  return { label: "Hot seat", budget: -250_000 };
}
