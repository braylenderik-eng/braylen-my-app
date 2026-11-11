"use client";

import { useState } from "react";
import { payroll } from "@/lib/game/economy";
import type { GameState } from "@/lib/game/state";
import { money } from "@/lib/format";
import { cx } from "./ui";

/** Money already promised but not yet paid: open recruiting offers and pending transfer bids. */
function committed(s: GameState) {
  const offers = s.recruiting && !s.recruiting.signed ? s.recruiting.board.filter((p) => p.offered && p.status === "open").reduce((n, p) => n + p.ask, 0) : 0;
  const bids = s.offseason ? s.offseason.bids.filter((b) => b.status === "pending").reduce((n, b) => n + b.amount, 0) : 0;
  return { offers, bids };
}

/** "Cap room $X" with a breakdown on hover or tap: budget, payroll, money set aside, and what's left. */
export function CapRoom({ state, compact }: { state: GameState; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const pay = payroll(state.players);
  const { offers, bids } = committed(state);
  const budget = pay + offers + bids + state.nilBudget;
  const row = (label: string, value: string, tone?: string) => (
    <div className="flex justify-between gap-6">
      <span className="text-muted">{label}</span>
      <span className={cx("font-display tabular", tone)}>{value}</span>
    </div>
  );
  return (
    <span
      className="relative"
      // Hover opens it for a mouse only; on touch screens a tap toggles it.
      onPointerEnter={(e) => e.pointerType === "mouse" && setOpen(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setOpen(false)}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-label={`Cap room ${money(state.nilBudget)}. Show the breakdown`}
        onClick={() => setOpen((o) => !o)}
        className={cx(
          "font-display tabular font-semibold text-accent-hi",
          compact ? "tracking-widest" : "rounded-md bg-accent/15 px-2.5 py-1.5 text-sm ring-1 ring-accent/30 hover:bg-accent/25",
        )}
      >
        Cap room {money(state.nilBudget)}
      </button>
      {open && (
        <div
          role="tooltip"
          className="absolute top-full right-0 z-50 mt-2 w-72 rounded-lg border border-line-2 bg-panel p-4 text-left font-sans text-sm font-normal tracking-normal normal-case shadow-2xl"
        >
          <p className="font-display mb-2 text-xs tracking-widest text-accent-hi">Cap room</p>
          <p className="mb-3 text-muted">Money left this season to add players: recruiting offers, transfer bids and raises.</p>
          <div className="space-y-1">
            {row("Player budget", money(budget))}
            <p className="pl-3 text-xs text-dim">
              {money(state.program.revShare)} revenue share + {money(state.program.collective)} collective, adjusted for last season&apos;s results
            </p>
            {row("Payroll (current players)", `−${money(pay)}`)}
            {offers > 0 && row("Offers out (recruits)", `−${money(offers)}`)}
            {bids > 0 && row("Pending transfer bids", `−${money(bids)}`)}
            <div className="my-1 border-t border-line" />
            {row("Cap room", money(state.nilBudget), "text-accent-hi font-semibold")}
          </div>
          <p className="mt-3 text-xs text-dim">Offers set money aside right away; it comes back if the player signs elsewhere. It resets each offseason.</p>
        </div>
      )}
    </span>
  );
}
