"use client";

import { useState } from "react";
import { MAX_YEARS, OFFER_TIERS, offerAmount } from "@/lib/game/negotiation";
import { money } from "@/lib/format";
import { Button, cx } from "./ui";

/**
 * The offer sheet: pick an amount tier and a deal length, see the rival's number, then send it.
 * Recruits can be lowballed; transfers start at their ask.
 */
export function OfferSheet({
  ask,
  rival,
  rivalLabel,
  budget,
  lowball,
  onSend,
  onCancel,
}: {
  ask: number;
  rival?: number;
  rivalLabel: string;
  budget: number;
  lowball: boolean;
  onSend: (amount: number, years: number) => void;
  onCancel: () => void;
}) {
  const tiers = OFFER_TIERS.filter((t) => lowball || t.id !== "low");
  const [tier, setTier] = useState("ask");
  const [years, setYears] = useState(1);
  const pick = tiers.find((t) => t.id === tier) ?? tiers[0];
  const amount = offerAmount(ask, pick.mult);
  return (
    <div className="w-full rounded-md border border-line bg-bg-2/60 p-3" role="group" aria-label="Offer sheet">
      <p className="text-xs text-muted">
        His ask <span className="font-semibold text-text">{money(ask)}</span>
        {rival ? (
          <>
            {" "}· {rivalLabel} <span className={cx("font-semibold", rival > ask ? "text-gold" : "text-text")}>{money(rival)}</span>
          </>
        ) : (
          " · No rival offer yet"
        )}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {tiers.map((t) => {
          const amt = offerAmount(ask, t.mult);
          return (
            <button
              key={t.id}
              aria-pressed={tier === t.id}
              disabled={amt > budget}
              onClick={() => setTier(t.id)}
              className={cx(
                "rounded-md border px-2.5 py-1.5 text-left text-xs disabled:cursor-not-allowed disabled:opacity-40",
                tier === t.id ? "border-accent bg-accent/15 text-accent-hi" : "border-line text-muted hover:text-text",
              )}
            >
              <span className="font-display block text-[10px] tracking-widest">{t.label}</span>
              <span className="tabular font-semibold">{money(amt)}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="font-display text-[10px] tracking-widest text-muted">Length</span>
        {Array.from({ length: MAX_YEARS }, (_, i) => i + 1).map((y) => (
          <button
            key={y}
            aria-pressed={years === y}
            onClick={() => setYears(y)}
            className={cx("rounded border px-2 py-1 text-xs", years === y ? "border-accent bg-accent/15 text-accent-hi" : "border-line text-muted hover:text-text")}
          >
            {y} yr{y > 1 ? "s" : ""}
          </button>
        ))}
        <span className="ml-auto flex gap-1.5">
          <Button variant="ghost" className="px-2.5 py-1.5 text-xs" onClick={onCancel}>
            Cancel
          </Button>
          <Button className="px-3 py-1.5 text-xs" disabled={amount > budget} onClick={() => onSend(amount, years)}>
            Send {money(amount)}
          </Button>
        </span>
      </div>
      <p className="mt-2 text-[11px] text-dim">
        {pick.id === "low"
          ? "Below his ask: he only takes it if he's already sold on you, otherwise he counters."
          : years > 1
            ? `Multi-year deals win players over, but lock the price for ${years} seasons: no raise if he develops, no saving if he doesn't.`
            : "One year: he'll be repriced at market value after the season."}
      </p>
    </div>
  );
}
