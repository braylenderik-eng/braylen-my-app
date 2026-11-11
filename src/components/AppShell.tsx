"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { money } from "@/lib/format";
import { weekLabel, type GameState } from "@/lib/game/state";
import { TEAMS } from "@/lib/game/data";
import { Button, ButtonLink, cx, Dialog } from "./ui";
import { useGame } from "./GameProvider";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/sim", label: "Game plan" },
  { href: "/roster", label: "Roster" },
  { href: "/recruiting", label: "Recruiting" },
  { href: "/portal", label: "Portal" },
  { href: "/rankings", label: "Rankings" },
  { href: "/stats", label: "Stats" },
  { href: "/news", label: "News" },
  { href: "/coach", label: "Coach" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { state, dispatch, hydrated, title, hasSave, closeTitle } = useGame();
  const path = usePathname();
  const showTitle = hydrated && title && path !== "/new";
  const [confirmReset, setConfirmReset] = useState(false);
  const router = useRouter();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4">
          <Link href="/" className="font-display shrink-0 py-3 text-xl font-bold tracking-wide">
            <span className="text-accent">Portal</span>Wars
          </Link>
          <nav aria-label="Main" hidden={showTitle} className="scrollbar-none -mb-px flex flex-1 gap-1 overflow-x-auto">
            {NAV.filter((n) => n.href !== "/coach" || state.coach).map((n) => {
              const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
              const hurt = Object.values(state.injuries).some((i) => i.status === "questionable");
              const offPhase = state.offseason?.phase;
              const dot = (n.href === "/" && (state.scenarios.open.length > 0 || (state.career?.offers.length ?? 0) > 0)) || (n.href === "/portal" && offPhase === "portal") || (n.href === "/sim" && state.unseenRecap) || (n.href === "/roster" && hurt);
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
          <div className={cx("hidden shrink-0 items-center gap-3", !showTitle && "md:flex")}>
            <div className="text-right leading-tight">
              <p className="font-display text-sm font-semibold">Season {state.season}</p>
              <p className="font-display text-[10px] tracking-widest text-muted">{state.offseason ? "Offseason" : weekLabel(state.week, state.season)}</p>
            </div>
            <span className="font-display tabular rounded-md bg-accent/15 px-2.5 py-1.5 text-sm font-semibold text-accent-hi ring-1 ring-accent/30">
              NIL {money(state.nilBudget)}
            </span>
          </div>
        </div>
      </header>

      <div hidden={showTitle} className="border-b border-line bg-bg-2/60 md:hidden">
        <div className="font-display mx-auto flex max-w-7xl items-center justify-between px-4 py-2 text-xs tracking-widest text-muted">
          <span>Season {state.season} · {state.offseason ? "Offseason" : weekLabel(state.week, state.season)}</span>
          <span className="text-accent-hi">NIL {money(state.nilBudget)}</span>
        </div>
      </div>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        {/* Always render the page (Next validates every segment); hide it until the save has loaded. */}
        {!hydrated && <p className="font-display py-20 text-center tracking-widest text-muted">Loading season…</p>}
        {showTitle && <TitleScreen state={state} hasSave={hasSave} onContinue={closeTitle} onQuickStart={() => dispatch({ type: "reset" })} />}
        <div hidden={!hydrated || showTitle}>{children}</div>
      </main>

      <footer className="border-t border-line">
        <div className="font-display mx-auto flex max-w-7xl items-center justify-between px-4 py-3 text-[11px] tracking-widest text-dim">
          <span>Game concept · prototype · all teams and players are fictional</span>
          <button onClick={() => setConfirmReset(true)} className="hover:text-text">
            New dynasty
          </button>
        </div>
      </footer>

      <Dialog open={confirmReset} title="Start a new dynasty?" onClose={() => setConfirmReset(false)}>
        <p className="text-sm text-muted">
          Set up a new coach and program. Your current save ({state.coach ? `${state.coach.name}, ` : ""}Season {state.season}) is replaced once you
          start the new one.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="outline" onClick={() => setConfirmReset(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setConfirmReset(false);
              router.push("/new");
            }}
          >
            Set up
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

/** The title screen: every visit starts here. */
function TitleScreen({ state, hasSave, onContinue, onQuickStart }: { state: GameState; hasSave: boolean; onContinue: () => void; onQuickStart: () => void }) {
  const where = state.offseason ? "Offseason" : weekLabel(state.week, state.season);
  return (
    <div className="mx-auto max-w-2xl py-10 text-center">
      <p className="font-display text-xs tracking-[0.3em] text-accent-hi">College football GM</p>
      <h1 className="font-display mt-2 text-5xl font-bold sm:text-6xl">
        <span className="text-accent">Portal</span>Wars
      </h1>
      <p className="mx-auto mt-4 max-w-lg text-muted">
        Pick a program, set your schemes, recruit through the season, survive Early Signing Day and the January transfer window, and
        chase a title in the new playoff.
      </p>
      <div className="mx-auto mt-8 grid max-w-md gap-3">
        <ButtonLink href="/new" className="py-4 text-base">
          New dynasty
        </ButtonLink>
        {hasSave && (
          <Button variant="outline" onClick={onContinue} className="py-4 text-base">
            Continue: {TEAMS[state.team].name} · Season {state.season}, {where}
          </Button>
        )}
        <Button variant="ghost" onClick={onQuickStart} className="py-3">
          Quick start: Lone Star, Week 11
        </Button>
      </div>
      <p className="mt-3 text-xs text-dim">
        The quick start drops you into a playoff push with two weeks left in the 2026 season{hasSave ? " and replaces your current save" : ""}.
      </p>
    </div>
  );
}
