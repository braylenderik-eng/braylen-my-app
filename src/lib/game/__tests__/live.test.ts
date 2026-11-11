import { describe, expect, test } from "vitest";
import { USER_TEAM } from "../data";
import { playGame, simulateGame, type Answer, type Decision, type GameResult } from "../sim";
import { initialState, reducer, standingOf, userSimOptions } from "../state";

const opts = { ...userSimOptions(initialState(1)), interactive: true };

/** Play a live game, answering each call with `policy`. Returns the result and every decision seen. */
function play(seed: number, policy: (d: Decision) => Answer, o = opts) {
  const gen = playGame("stallions", "rangers", seed, o);
  const seen: Decision[] = [];
  let step = gen.next();
  while (!step.done) {
    if (step.value.type === "decision") {
      seen.push(step.value.decision);
      step = gen.next(policy(step.value.decision));
    } else step = gen.next();
  }
  return { result: step.value as GameResult, seen };
}

const defaults = (d: Decision): Answer =>
  d.kind === "fourth" ? { kind: "fourth", choice: d.usual } : d.kind === "two" ? { kind: "two", choice: "pat" } : d.kind === "clock" ? { kind: "clock", choice: "no" } : { kind: "halftime", plan: d.plan };

describe("live game day engine", () => {
  test("with every default call, a live game matches the quick sim exactly", () => {
    for (let seed = 0; seed < 60; seed++) {
      const live = play(seed, defaults).result;
      const quick = simulateGame("stallions", "rangers", seed, opts);
      expect([live.homeScore, live.awayScore]).toEqual([quick.homeScore, quick.awayScore]);
      expect(live.drives.map((d) => d.text)).toEqual(quick.drives.map((d) => d.text));
    }
  });

  test("a live game always offers halftime, and the calls only come on the user's side", () => {
    let fourths = 0;
    for (let seed = 0; seed < 40; seed++) {
      const { seen } = play(seed, defaults);
      expect(seen.filter((d) => d.kind === "halftime")).toHaveLength(1);
      fourths += seen.filter((d) => d.kind === "fourth").length;
      for (const d of seen) if (d.kind === "two") expect(d.quarter).toBeGreaterThanOrEqual(4);
      expect(seen.filter((d) => d.kind === "clock").length).toBeLessThanOrEqual(1);
    }
    expect(fourths / 40).toBeGreaterThan(1); // a few 4th-down calls per game on average
  });

  test("going for it sometimes converts and sometimes turns it over on downs", () => {
    const outcomes = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      const { result } = play(seed, (d) => (d.kind === "fourth" ? { kind: "fourth", choice: "go" } : defaults(d)));
      for (const c of result.calls ?? []) if (c.choice === "Went for it") outcomes.add(c.good ? "made" : "missed");
      for (const d of result.drives) if (d.result === "DOWNS" && d.team === USER_TEAM) outcomes.add("downs");
    }
    expect(outcomes).toEqual(new Set(["made", "missed", "downs"]));
  });

  test("going for two scores 2 or 0, never 1, on that try", () => {
    let tries = 0;
    for (let seed = 0; seed < 80; seed++) {
      const { result } = play(seed, (d) => (d.kind === "two" ? { kind: "two", choice: "two" } : defaults(d)));
      for (const c of result.calls ?? []) if (c.choice === "Went for two") tries++;
      const ourTds = result.drives.filter((d) => d.team === USER_TEAM && d.result === "TD" && d.quarter >= 4);
      for (const d of ourTds) expect(/two-point try (good|fails)/.test(d.text)).toBe(true);
    }
    expect(tries).toBeGreaterThan(0);
  });

  test("milking the clock removes an opponent possession unless you turn it over", () => {
    let checked = 0;
    for (let seed = 0; seed < 120 && checked < 3; seed++) {
      const yes = play(seed, (d) => (d.kind === "clock" ? { kind: "clock", choice: "yes" } : defaults(d)));
      const call = yes.result.calls?.find((c) => c.choice === "Milked the clock");
      if (!call || !call.good || yes.result.overtime) continue;
      const no = play(seed, defaults);
      const theirs = (r: GameResult) => r.drives.filter((d) => d.team !== USER_TEAM && d.quarter <= 4).length;
      expect(theirs(yes.result)).toBe(theirs(no.result) - 1);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  test("hurry-up gives the user one extra possession", () => {
    let checked = 0;
    for (let seed = 0; seed < 120 && checked < 3; seed++) {
      const yes = play(seed, (d) => (d.kind === "clock" ? { kind: "clock", choice: "yes" } : defaults(d)));
      if (!yes.result.calls?.some((c) => c.choice === "Went hurry-up") || yes.result.overtime) continue;
      const no = play(seed, defaults);
      const ours = (r: GameResult) => r.drives.filter((d) => d.team === USER_TEAM && d.quarter <= 4).length;
      expect(ours(yes.result)).toBe(ours(no.result) + 1);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  test("each call keeps its own outcome, even when several happen on one drive", () => {
    for (let seed = 0; seed < 150; seed++) {
      const { result } = play(seed, (d) =>
        d.kind === "clock" ? { kind: "clock", choice: "yes" } : d.kind === "two" ? { kind: "two", choice: "two" } : defaults(d),
      );
      for (const c of result.calls ?? []) {
        if (c.choice === "Went for two") expect(["Good", "No good"]).toContain(c.outcome);
        if (c.choice === "Went hurry-up") expect(c.outcome).toMatch(/possession/);
        if (c.choice === "Milked the clock") expect(c.outcome).toMatch(/clock|ball back/);
      }
    }
  });

  test("a live result is what counts for the week", () => {
    const s = initialState(4);
    const { result } = play(99, (d) => (d.kind === "fourth" ? { kind: "fourth", choice: "go" } : defaults(d)), {
      ...userSimOptions(s),
      interactive: true,
    });
    const next = reducer(s, { type: "sim/week", userGame: result });
    expect(next.recaps[0].game).toBe(result);
    const me0 = standingOf(s, USER_TEAM)!;
    const me1 = standingOf(next, USER_TEAM)!;
    const won = result.homeScore > result.awayScore;
    expect(me1.wins - me0.wins).toBe(won ? 1 : 0);
  });
});
