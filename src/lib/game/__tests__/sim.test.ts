import { describe, expect, test } from "vitest";
import { simulateGame, winProbability } from "../sim";

describe("simulateGame", () => {
  test("is deterministic for a given seed", () => {
    const a = simulateGame("stallions", "rangers", 7, { userTeam: "stallions" });
    const b = simulateGame("stallions", "rangers", 7, { userTeam: "stallions" });
    expect(a).toEqual(b);
  });

  test("never ends in a tie and the final drive matches the score", () => {
    for (let seed = 0; seed < 300; seed++) {
      const g = simulateGame("capitol", "stallions", seed, { userTeam: "stallions" });
      expect(g.homeScore).not.toBe(g.awayScore);
      const last = g.drives[g.drives.length - 1];
      expect([last.homeScore, last.awayScore]).toEqual([g.homeScore, g.awayScore]);
    }
  });

  test("passing TDs add up to receiving TDs for each team", () => {
    const g = simulateGame("stallions", "rangers", 99, { userTeam: "stallions" });
    for (const team of ["stallions", "rangers"] as const) {
      const lines = g.stats.filter((s) => s.team === team);
      const pass = lines.reduce((n, s) => n + (s.passTd ?? 0), 0);
      const rec = lines.reduce((n, s) => n + (s.recTd ?? 0), 0);
      expect(pass).toBe(rec);
    }
  });

  test("Stallions are about 70-80% favorites at home against the Rangers", () => {
    const wp = winProbability("stallions", "rangers", "stallions", { userTeam: "stallions" }, 1000);
    expect(wp).toBeGreaterThan(0.65);
    expect(wp).toBeLessThan(0.82);
  });
});
