// NIL negotiations: how much to offer, for how long, and how your money stacks up against the rival
// school's. Money matters, but it's capped both ways: overpaying can't buy a player who wants to play
// elsewhere, and a lowball can't sink you on its own. Pure functions.

export interface OfferTier {
  id: "low" | "ask" | "above" | "max";
  label: string;
  mult: number;
}

export const OFFER_TIERS: OfferTier[] = [
  { id: "low", label: "Lowball", mult: 0.9 },
  { id: "ask", label: "His ask", mult: 1 },
  { id: "above", label: "Above ask", mult: 1.15 },
  { id: "max", label: "Max offer", mult: 1.3 },
];

export const MAX_YEARS = 3;

const round5k = (x: number) => Math.round(x / 5_000) * 5_000;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export const offerAmount = (ask: number, mult: number) => round5k(ask * mult);

/** Interest points from money: your offer against the rival's, relative to his ask. Capped at -15 / +10. */
export function moneyEdge(offer: number, rival: number, ask: number) {
  if (!offer || !rival || !ask) return 0;
  return clamp(Math.round(((offer - rival) / ask) * 20), -15, 10);
}

/** A multi-year deal is security: players like it (and it locks the price, so no raise when he develops). */
export const yearsBonus = (years = 1) => (years >= 2 ? 4 : 0);

/** A rival's opening offer: usually near the ask, sometimes well above it for top players. */
export const rivalOpening = (ask: number, r: number, heat = 0) => round5k(ask * (0.85 + heat + r * 0.35));

/** A rival raising its offer in a bidding war. */
export const rivalRaise = (current: number, r: number) => round5k(current * (1.08 + r * 0.14));

/** The next offer tier above an amount, for "Raise". */
export function nextTier(ask: number, current: number) {
  return OFFER_TIERS.map((t) => offerAmount(ask, t.mult)).find((a) => a > current) ?? null;
}

/** Transfer odds from money: your bid against the best rival bid. */
export function bidEdge(bid: number, rival: number, ask: number) {
  if (!bid || !rival || !ask) return 0;
  return clamp(((bid - rival) / ask) * 0.4, -0.25, 0.15);
}
