"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { money } from "@/lib/format";
import { weekLabel } from "@/lib/game/state";
import { Button, cx, Dialog } from "./ui";
import { useGame } from "./GameProvider";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/sim", label: "Game plan" },
  { href: "/roster", label: "Roster" },
  { href: "/recruiting", label: "Recruiting" },
  { href: "/portal", label: "Portal" },
  { href: "/rankings", label: "Rankings" },
  { href: "/news", label: "News" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { state, dispatch, hydrated } = useGame();
  const path = usePathname();
  const [confirmReset, setConfirmReset] = useState(false);
  const pendingRook = state.rook.decision === null;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4">
          <Link href="/" className="font-display shrink-0 py-3 text-xl font-bold tracking-wide">
            <span className="text-accent">Portal</span>Wars
          </Link>
          <nav aria-label="Main" className="scrollbar-none -mb-px flex flex-1 gap-1 overflow-x-auto">
            {NAV.map((n) => {
              const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
              const hurt = Object.values(state.injuries).some((i) => i.status === "questionable");
              const dot = (n.href === "/recruiting" && pendingRook) || (n.href === "/sim" && state.unseenRecap) || (n.href === "/roster" && hurt);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "font-display relative shrink-0 border-b-2 px-3 py-4 text-sm tracking-wider transition-colors",
                    active ? "border-accent text-text" : "border-transparent text-muted hover:text-text",
                  )}
                >
                  {n.label}
                  {dot && <span className="absolute top-3 right-1 size-1.5 rounded-full bg-accent-hi" />}
                </Link>
              );
            })}
          </nav>
          <div className="hidden shrink-0 items-center gap-3 md:flex">
            <div className="text-right leading-tight">
              <p className="font-display text-sm font-semibold">Season 1</p>
              <p className="font-display text-[10px] tracking-widest text-muted">{weekLabel(state.week)}</p>
            </div>
            <span className="font-display tabular rounded-md bg-accent/15 px-2.5 py-1.5 text-sm font-semibold text-accent-hi ring-1 ring-accent/30">
              NIL {money(state.nilBudget)}
            </span>
          </div>
        </div>
      </header>

      <div className="border-b border-line bg-bg-2/60 md:hidden">
        <div className="font-display mx-auto flex max-w-7xl items-center justify-between px-4 py-2 text-xs tracking-widest text-muted">
          <span>Season 1 · {weekLabel(state.week)}</span>
          <span className="text-accent-hi">NIL {money(state.nilBudget)}</span>
        </div>
      </div>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        {/* Always render the page (Next validates every segment); hide it until the save has loaded. */}
        {!hydrated && <p className="font-display py-20 text-center tracking-widest text-muted">Loading season…</p>}
        <div hidden={!hydrated}>{children}</div>
      </main>

      <footer className="border-t border-line">
        <div className="font-display mx-auto flex max-w-7xl items-center justify-between px-4 py-3 text-[11px] tracking-widest text-dim">
          <span>Game concept · prototype · all teams and players are fictional</span>
          <button onClick={() => setConfirmReset(true)} className="hover:text-text">
            Reset save
          </button>
        </div>
      </footer>

      <Dialog open={confirmReset} title="Start the season over?" onClose={() => setConfirmReset(false)}>
        <p className="text-sm text-muted">This erases your decisions, bids, depth chart and results and goes back to Week 11.</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="outline" onClick={() => setConfirmReset(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              dispatch({ type: "reset" });
              setConfirmReset(false);
            }}
          >
            Reset
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
