export function money(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(n / 1000)}K`;
}

export function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

/** Point spread implied by a win probability (negative = favored). */
export function spreadFor(p: number): number {
  const clamped = Math.min(0.99, Math.max(0.01, p));
  const pts = Math.log(clamped / (1 - clamped)) * 6.5;
  return -Math.round(pts * 2) / 2;
}

/** Signed change for the rankings table: +3, −2, or an em dash for no change. */
export function signed(n: number): string {
  if (n === 0) return "—";
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}
