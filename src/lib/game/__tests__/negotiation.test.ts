import { describe, expect, test } from "vitest";
import { FINAL_WEEK } from "../data";
import * as Eco from "../economy";
import { bidEdge, moneyEdge, nextTier, offerAmount, OFFER_TIERS } from "../negotiation";
import * as Rec from "../recruiting";
import { initialState, loadState, reducer, seasonOver, STATE_VERSION, type GameState } from "../state";

const rec = (s: GameState) => s.recruiting!;
const withProspect = (s: GameState, id: string, patch: Partial<Rec.Prospect>): GameState => ({
  ...s,
  recruiting: { ...rec(s), board: rec(s).board.map((p) => (p.id === id ? { ...p, ...patch } : p)) },
});

describe("negotiation math", () => {
  test("money matters, but within limits", () => {
    expect(moneyEdge(0, 100_000, 100_000)).toBe(0); // no offer yet
    expect(moneyEdge(130_000, 100_000, 100_000)).toBe(6);
    expect(moneyEdge(10_000_000, 100_000, 100_000)).toBe(10); // can't buy him outright
    expect(moneyEdge(50_000, 1_000_000, 100_000)).toBe(-15);
    expect(bidEdge(2_000_000, 1_000_000, 1_000_000)).toBe(0.15);
    expect(bidEdge(500_000, 1_000_000, 1_000_000)).toBeCloseTo(-0.2);
  });

  test("raise steps up through the offer tiers and stops at the max", () => {
    const ask = 200_000;
    expect(nextTier(ask, ask)).toBe(offerAmount(ask, 1.15));
    expect(nextTier(ask, offerAmount(ask, 1.15))).toBe(offerAmount(ask, OFFER_TIERS.at(-1)!.mult));
    expect(nextTier(ask, offerAmount(ask, 1.3))).toBeNull();
  });
});

describe("recruit offers", () => {
  test("every prospect has a rival offer near his ask", () => {
    for (const p of rec(initialState(5)).board.filter((x) => !x.offered)) {
      expect(p.rivalOffer).toBeGreaterThanOrEqual(p.ask * 0.7);
      expect(p.rivalOffer).toBeLessThan(p.ask * 1.35);
    }
  });

  test("above-ask, multi-year offers reserve that amount and win him over faster", () => {
    let s = initialState(6);
    const p = rec(s).board.find((x) => !x.offered)!;
    const amount = offerAmount(p.ask, 1.15);
    const nil = s.nilBudget;
    s = reducer(s, { type: "recruit/offer", id: p.id, amount, years: 3 });
    const q = rec(s).board.find((x) => x.id === p.id)!;
    expect(s.nilBudget).toBe(nil - amount);
    expect(q).toMatchObject({ offered: true, offerAmt: amount, years: 3 });
    expect(q.you).toBe(Math.min(100, p.you + 5 + 3 + 4));
    // Withdrawing refunds what you offered, not the ask.
    s = reducer(s, { type: "recruit/withdraw", id: p.id });
    expect(s.nilBudget).toBe(nil);
  });

  test("a lowball gets countered unless he's already sold, and accepting the counter is an offer", () => {
    let s = initialState(7);
    const p = rec(s).board.find((x) => !x.offered)!;
    const low = offerAmount(p.ask, 0.9);
    s = withProspect(s, p.id, { you: 20, them: 60 });
    const nil = s.nilBudget;
    s = reducer(s, { type: "recruit/offer", id: p.id, amount: low });
    const q = rec(s).board.find((x) => x.id === p.id)!;
    expect(q.offered).toBe(false);
    expect(s.nilBudget).toBe(nil); // nothing reserved
    expect(q.counter).toBeGreaterThanOrEqual(p.ask);
    expect(rec(s).log[0]).toContain("countered");
    s = reducer(s, { type: "recruit/offer", id: p.id, amount: q.counter });
    expect(rec(s).board.find((x) => x.id === p.id)!).toMatchObject({ offered: true, offerAmt: q.counter, counter: undefined });

    // Sold on you: he takes the lowball.
    let t = withProspect(initialState(7), p.id, { you: 70, them: 30 });
    t = reducer(t, { type: "recruit/offer", id: p.id, amount: low });
    expect(rec(t).board.find((x) => x.id === p.id)!).toMatchObject({ offered: true, offerAmt: low });
  });

  test("raising an offer costs the difference", () => {
    let s = initialState(8);
    const p = rec(s).board.find((x) => !x.offered)!;
    s = reducer(s, { type: "recruit/offer", id: p.id });
    const nil = s.nilBudget;
    const to = nextTier(p.ask, p.ask)!;
    s = reducer(s, { type: "recruit/raise", id: p.id, amount: to });
    expect(rec(s).board.find((x) => x.id === p.id)!.offerAmt).toBe(to);
    expect(s.nilBudget).toBe(nil - (to - p.ask));
    expect(reducer(s, { type: "recruit/raise", id: p.id, amount: to })).toBe(s); // must go up
  });

  test("rivals raise their offers on top prospects you've offered, and signees carry their deal", () => {
    let s = initialState(9);
    const tops = rec(s).board.filter((p) => p.stars >= 4).slice(0, 4);
    for (const p of tops) s = reducer(s, { type: "recruit/offer", id: p.id, amount: offerAmount(p.ask, 1.15), years: 2 });
    const before = new Map(rec(s).board.map((p) => [p.id, p.rivalOffer]));
    while (s.week <= FINAL_WEEK && !rec(s).signed) s = reducer(s, { type: "sim/week" });
    const raised = rec(s).board.filter((p) => (p.rivalOffer ?? 0) > (before.get(p.id) ?? 0));
    for (const p of raised) expect(tops.map((t) => t.id)).toContain(p.id);
    for (const p of s.players.filter((x) => x.source === "recruit" && x.yr === "HS")) {
      const t = tops.find((x) => x.id === p.id);
      if (t) expect(p).toMatchObject({ nil: offerAmount(t.ask, 1.15), contractYears: 2 });
    }
  });
});

describe("contracts", () => {
  test("a locked deal skips repricing until it runs out", () => {
    const base = { id: "x1", name: "X", num: 1, pos: "QB" as const, yr: "So" as const, ovr: 88, pot: 92, hometown: "", nil: 100_000, source: "portal" as const };
    expect(Eco.reprice([{ ...base, contractYears: 1 }])[0].nil).toBe(100_000);
    expect(Eco.reprice([{ ...base, contractYears: 0 }])[0].nil).toBeGreaterThan(100_000);
  });
});

describe("transfer bids", () => {
  const toPortal = (seed: number) => {
    let s = initialState(seed);
    while (!seasonOver(s)) s = reducer(s, { type: "sim/week" });
    return reducer(s, { type: "offseason/start" });
  };

  test("transfers carry rival bids; bids can be above ask and multi-year, never below", () => {
    let s = toPortal(31);
    const pool = s.offseason!.pool;
    for (const t of pool) if (t.rivals > 0) expect(t.rivalBid).toBeGreaterThan(0);
    const t = [...pool].sort((a, b) => a.ask - b.ask)[0];
    const nil = s.nilBudget;
    const low = reducer(s, { type: "offseason/bid", id: t.id, amount: 1 });
    expect(low.offseason!.bids[0].amount).toBe(t.ask);
    const amount = offerAmount(t.ask, 1.15);
    s = reducer(s, { type: "offseason/bid", id: t.id, amount, years: 2 });
    expect(s.offseason!.bids[0]).toMatchObject({ amount, years: 2, status: "pending" });
    expect(s.nilBudget).toBe(nil - amount);
    const to = nextTier(t.ask, amount)!;
    s = reducer(s, { type: "offseason/raiseBid", id: t.id, amount: to });
    expect(s.offseason!.bids[0].amount).toBe(to);
    expect(s.nilBudget).toBe(nil - to);
  });

  test("hot transfers start bidding wars, and signed transfers keep their deal length", () => {
    let wars = 0;
    for (let seed = 40; seed < 52; seed++) {
      let s = toPortal(seed);
      const hot = s.offseason!.pool.filter((t) => t.rivals >= 3 && t.ovr >= 84);
      for (const t of hot) {
        const before = t.rivalBid ?? 0;
        s = { ...s, nilBudget: 50_000_000 };
        s = reducer(s, { type: "offseason/bid", id: t.id, amount: offerAmount(t.ask, 1.3), years: 3 });
        const after = s.offseason!.pool.find((x) => x.id === t.id)!.rivalBid ?? 0;
        if (after > before) wars++;
      }
      s = reducer(s, { type: "offseason/closePortal" });
      for (const b of s.offseason!.bids.filter((x) => x.status === "signed")) {
        expect(s.players.find((p) => p.id === b.id)?.contractYears).toBe(b.years ?? 1);
      }
    }
    expect(wars).toBeGreaterThan(0);
  });
});

describe("migration", () => {
  test("version 11 saves get rival offers, and existing offers keep their asks", () => {
    const s = initialState(12);
    const p = rec(s).board[0];
    const old = {
      ...s,
      version: 11,
      recruiting: { ...rec(s), board: rec(s).board.map((x, i) => ({ ...x, rivalOffer: undefined, offerAmt: undefined, offered: i === 0 })) },
    };
    const m = loadState(JSON.stringify(old));
    expect(m.version).toBe(STATE_VERSION);
    expect(m.recruiting!.board[0]).toMatchObject({ offered: true, offerAmt: p.ask });
    for (const x of m.recruiting!.board) expect(x.rivalOffer).toBeGreaterThanOrEqual(x.ask * 0.7);
  });
});
