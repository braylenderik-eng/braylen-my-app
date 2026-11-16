import { describe, expect, test } from "vitest";
import { tally, statText, type Tally } from "../pbp";
import { playGame, simulateGame, type Answer, type Decision, type GameResult } from "../sim";
import { initialState, userSimOptions } from "../state";

const opts = { ...userSimOptions(initialState(1)), interactive: true };
const defaults = (d: Decision): Answer =>
  d.kind === "fourth" ? { kind: "fourth", choice: d.usual } : d.kind === "two" ? { kind: "two", choice: "pat" } : d.kind === "clock" ? { kind: "clock", choice: "no" } : { kind: "halftime", plan: d.plan };

function live(seed: number, policy: (d: Decision) => Answer = defaults) {
  const gen = playGame("stallions", "rangers", seed, opts);
  const seen: Decision[] = [];
  let step = gen.next();
  while (!step.done) {
    if (step.value.type === "decision") {
      seen.push(step.value.decision);
      step = gen.next(policy(step.value.decision));
    } else step = gen.next();
  }
  return { g: step.value as GameResult, seen };
}

describe("play by play", () => {
  test("every live drive has snaps that add up: downs, field position, and the final score", () => {
    for (let seed = 0; seed < 40; seed++) {
      const { g } = live(seed);
      for (const d of g.drives) {
        if (d.quarter === 5 && !d.pbp) continue; // the overtime walk-off
        const plays = d.pbp!;
        expect(plays.length).toBeGreaterThan(0);
        for (const p of plays) {
          if (p.kind !== "try") {
            expect(p.down).toBeGreaterThanOrEqual(1);
            expect(p.down).toBeLessThanOrEqual(4);
            expect(p.toGo).toBeGreaterThan(0);
            expect(p.spot).toBeGreaterThanOrEqual(1);
            expect(p.spot).toBeLessThanOrEqual(99);
          }
        }
        const last = plays.at(-1)!;
        expect([last.homeScore, last.awayScore]).toEqual([d.homeScore, d.awayScore]);
        if (d.result === "TD") expect(plays.some((p) => p.kind === "td" && p.spot + p.yards === 100)).toBe(true);
        if (d.result === "PUNT") expect(last).toMatchObject({ kind: "punt", down: 4 });
      }
    }
  });

  test("the box score is built from the snaps", () => {
    for (let seed = 0; seed < 20; seed++) {
      const { g } = live(seed);
      const map = new Map<string, Tally>();
      for (const d of g.drives) for (const p of d.pbp ?? []) tally(map, p);
      for (const s of g.stats) {
        const t = map.get(`${s.team}:${s.name}`);
        if (!t) continue;
        expect(t.passYds).toBe(s.passYds ?? 0);
        expect(t.recYds).toBe(s.recYds ?? 0);
        expect(t.rushYds).toBe(s.rushYds ?? 0);
        expect(t.sacks).toBe(s.sacks ?? 0);
      }
      const home = g.drives.filter((d) => d.team === g.home).flatMap((d) => d.pbp ?? []);
      const pass = home.filter((p) => p.rec && (p.kind === "pass" || p.kind === "td")).reduce((n, p) => n + p.yards, 0);
      expect(pass).toBe(g.totals.home.passYds);
    }
  });

  test("a 4th-down call shows up in the feed at the same distance", () => {
    let checked = 0;
    for (let seed = 0; seed < 40; seed++) {
      const { g, seen } = live(seed);
      const calls = seen.filter((d) => d.kind === "fourth");
      for (const c of calls) {
        if (c.kind !== "fourth") continue;
        const match = g.drives.flatMap((d) => d.pbp ?? []).find((p) => (p.kind === "punt" || p.kind === "fg" || p.kind === "miss") && p.down === 4 && p.toGo === c.distance);
        expect(match).toBeTruthy();
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  test("quick sims keep stats but don't carry the snaps", () => {
    const g = simulateGame("stallions", "rangers", 3, opts);
    expect(g.drives.every((d) => !d.pbp)).toBe(true);
    expect(g.stats.length).toBeGreaterThan(5);
  });

  test("stat lines read like a broadcast", () => {
    const map = new Map<string, Tally>();
    const qb = { name: "Ty Cole", pos: "QB", team: "stallions" as const };
    const rec = { name: "Al Shaw", pos: "WR", team: "stallions" as const };
    const base = { quarter: 1, clock: "12:00", team: "stallions" as const, down: 1, toGo: 10, spot: 25, homeScore: 0, awayScore: 0 };
    const p = { ...base, kind: "pass" as const, yards: 14, label: "Pass", text: "", player: rec, qb, rec, pass: true };
    tally(map, p);
    tally(map, { ...p, kind: "td", yards: 20, label: "Touchdown" });
    expect(statText({ ...p, kind: "td" }, map)).toBe("2 REC, 34 YDS, 1 TD");
    expect(statText({ ...p, kind: "incomplete", player: qb }, map)).toBe("2/2, 34 YDS, 1 TD, 0 INT");
  });
});
