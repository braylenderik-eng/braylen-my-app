import { describe, expect, test } from "vitest";
import { FINAL_WEEK } from "../data";
import { resolve, type Scenario } from "../events";
import { starters } from "../roster";
import { initialState, isPlayoffs, lineup, reducer, seasonOver, world, type GameState } from "../state";

const base = (kind: Scenario["kind"], extra: Partial<Scenario>): Scenario => ({
  id: `t-${kind}`,
  kind,
  week: 11,
  deadline: 11,
  title: kind,
  body: "",
  options: [
    { id: "a", label: "A", detail: "" },
    { id: "b", label: "B", detail: "" },
  ],
  defaultOption: "b",
  ...extra,
});

/** Put a hand-made scenario on the save so it can be answered through the reducer. */
const withScenario = (s: GameState, sc: Scenario): GameState => ({ ...s, scenarios: { open: [sc], log: [] } });

describe("in-season scenarios", () => {
  test("a new save opens with one scenario, and at most two are ever open", () => {
    for (let seed = 1; seed <= 30; seed++) {
      let s = initialState(seed);
      expect(s.scenarios.open).toHaveLength(1);
      while (!seasonOver(s)) {
        expect(s.scenarios.open.length).toBeLessThanOrEqual(2);
        if (isPlayoffs(s)) expect(s.scenarios.open).toHaveLength(0);
        s = reducer(s, { type: "sim/week" });
      }
    }
  });

  test("over many seasons every kind of scenario shows up", () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 25; seed++) {
      let s = initialState(seed);
      s = reducer(s, { type: "season/next" });
      for (const sc of s.scenarios.open) kinds.add(sc.kind);
      while (!seasonOver(s)) s = reducer(s, { type: "season/next" }) === s ? reducer(s, { type: "sim/week" }) : s;
      for (const e of s.scenarios.log) kinds.add(e.kind);
    }
    expect(kinds).toEqual(new Set(["flip", "booster", "discipline", "playingTime", "visit"]));
  });

  test("unanswered scenarios resolve with the default at their deadline and show in the recap", () => {
    const s0 = initialState(2);
    const sc = s0.scenarios.open[0];
    let s = s0;
    while (s.week <= sc.deadline) s = reducer(s, { type: "sim/week" });
    expect(s.scenarios.open.find((x) => x.id === sc.id)).toBeUndefined();
    const entry = s.scenarios.log.find((x) => x.id === sc.id)!;
    expect(entry.auto).toBe(true);
    expect(entry.choice).toBe(sc.options.find((o) => o.id === sc.defaultOption)!.label);
    expect(s.recaps.some((r) => r.notes?.some((n) => n.includes("no decision by the deadline")))).toBe(true);
  });

  test("flip threat: matching costs the bump and raises interest; holding lets the rival gain", () => {
    const s = initialState(3);
    const p = s.recruiting!.board.find((x) => x.offered)!;
    const sc = base("flip", { target: p.id, rival: p.rival, amount: 100_000, options: [{ id: "match", label: "Match", detail: "" }, { id: "hold", label: "Hold", detail: "" }], defaultOption: "hold" });
    const matched = reducer(withScenario(s, sc), { type: "scenario/choose", id: sc.id, option: "match" });
    const mp = matched.recruiting!.board.find((x) => x.id === p.id)!;
    expect(matched.nilBudget).toBe(s.nilBudget - 100_000);
    expect(mp.ask).toBe(p.ask + 100_000);
    expect(mp.you).toBeGreaterThan(p.you);
    const held = reducer(withScenario(s, sc), { type: "scenario/choose", id: sc.id, option: "hold" });
    expect(held.nilBudget).toBe(s.nilBudget);
    expect(held.recruiting!.board.find((x) => x.id === p.id)!.them).toBeGreaterThan(p.them);
    expect(held.scenarios.open).toHaveLength(0);
    expect(held.scenarios.log[0]).toMatchObject({ id: sc.id, auto: false });
  });

  test("booster pledge: accepting adds money and costs media trust", () => {
    const s = initialState(4);
    const sc = base("booster", { amount: 250_000, options: [{ id: "accept", label: "Accept", detail: "" }, { id: "decline", label: "Decline", detail: "" }], defaultOption: "decline" });
    const yes = reducer(withScenario(s, sc), { type: "scenario/choose", id: sc.id, option: "accept" });
    expect(yes.nilBudget).toBe(s.nilBudget + 250_000);
    expect(yes.mediaTrust).toBeLessThan(s.mediaTrust);
    const no = reducer(withScenario(s, sc), { type: "scenario/choose", id: sc.id, option: "decline" });
    expect(no.nilBudget).toBe(s.nilBudget);
  });

  test("discipline: a suspended starter misses exactly one game", () => {
    const s = initialState(5);
    const sc = base("discipline", { target: "shaw", options: [{ id: "suspend", label: "Suspend", detail: "" }, { id: "internal", label: "Internal", detail: "" }], defaultOption: "internal" });
    let t = reducer(withScenario(s, sc), { type: "scenario/choose", id: sc.id, option: "suspend" });
    expect(t.injuries.shaw).toMatchObject({ desc: "suspension", status: "out" });
    expect(starters(lineup(t)).WR.map((p) => p.id)).not.toContain("shaw");
    t = reducer(t, { type: "sim/week" });
    expect(t.injuries.shaw?.desc).not.toBe("suspension");
    expect(t.recaps[0].injuryUpdates.some((u) => u.text.includes("returns from his suspension"))).toBe(true);
  });

  test("playing time: a promised backup stays in January; an ignored one asks to leave", () => {
    const s = initialState(6);
    const sc = (id: string): Scenario =>
      base("playingTime", { id, target: "rusk", amount: 60_000, deadline: FINAL_WEEK, options: [{ id: "promise", label: "Promise", detail: "" }, { id: "quiet", label: "Quiet", detail: "" }], defaultOption: "quiet" });
    const toJanuary = (t: GameState) => {
      while (!seasonOver(t)) t = reducer(t, { type: "sim/week" });
      return reducer(t, { type: "offseason/start" });
    };
    const promised = toJanuary(reducer(withScenario(s, sc("p1")), { type: "scenario/choose", id: "p1", option: "promise" }));
    expect(promised.offseason!.departures.map((d) => d.playerId)).not.toContain("rusk");
    const quiet = toJanuary(reducer(withScenario(s, sc("p2")), { type: "scenario/choose", id: "p2", option: "quiet" }));
    expect(quiet.offseason!.departures.map((d) => d.playerId)).toContain("rusk");
  });

  test("official visit: hosting is a free visit with a big interest boost", () => {
    const s = initialState(7);
    const p = s.recruiting!.board.find((x) => !x.visited && x.status === "open")!;
    const sc = base("visit", { target: p.id, options: [{ id: "host", label: "Host", detail: "" }, { id: "pass", label: "Pass", detail: "" }], defaultOption: "pass" });
    const t = reducer(withScenario(s, sc), { type: "scenario/choose", id: sc.id, option: "host" });
    const q = t.recruiting!.board.find((x) => x.id === p.id)!;
    expect(q.visited).toBe(true);
    expect(q.you).toBeGreaterThanOrEqual(p.you + 18);
    expect(t.recruiting!.points).toBe(s.recruiting!.points); // no recruiting points spent
  });

  test("resolve() is pure and works from the world snapshot", () => {
    const s = initialState(8);
    const sc = base("booster", { amount: 150_000, options: [{ id: "accept", label: "Accept", detail: "" }, { id: "decline", label: "Decline", detail: "" }], defaultOption: "decline" });
    const a = resolve(world(s), sc, "accept", s.seed);
    const b = resolve(world(s), sc, "accept", s.seed);
    expect(a).toEqual(b);
    expect(a.patch.nilBudget).toBe(s.nilBudget + 150_000);
  });
});
