"use client";

import Link from "next/link";
import { ROSTER_MAX } from "@/lib/game/offseason";
import { keyDates, rosterSpots, type GameState } from "@/lib/game/state";
import { money } from "@/lib/format";
import { TEAMS } from "@/lib/game/data";
import { useGame } from "./GameProvider";
import { Button, ButtonLink, cx, Panel, Stat, Tag } from "./ui";

/** The offseason steps: graduation and development, the January transfer window, then the new season. */
export function OffseasonHub({ state }: { state: GameState }) {
  const { dispatch } = useGame();
  const off = state.offseason!;
  const r = state.lastOffseason!;
  const next = state.season + 1;
  const step = off.phase === "portal" ? 1 : 2;
  const signedTransfers = off.bids.filter((b) => b.status === "signed").length;
  const gains = [...r.progressed].sort((a, b) => b.to - b.from - (a.to - a.from)).slice(0, 4);

  const last = state.history[state.history.length - 1];
  const newJob = !!last?.team && last.team !== state.team;
  const steps = [
    {
      title: newJob ? "New job" : "Graduation, development & enrollment",
      body: newJob
        ? `You took over the ${TEAMS[state.team].name}. You inherit their roster, an NIL budget of ${money(state.program.baseBudget)} and a ${state.program.winTarget}-win target.`
        : `${r.graduated.length} seniors graduated. ${r.progressed.length} players improved${
        gains.length ? ` — biggest: ${gains.map((g) => `${g.player.name} ${g.from}→${g.to}`).join(", ")}` : ""
      }. ${r.enrolled.length ? `${r.enrolled.length} signee${r.enrolled.length === 1 ? "" : "s"} from December enrolled.` : "No December signees to enroll."}`,
      action: null,
    },
    {
      title: `January transfer window (${keyDates(state.season).portalWindow})`,
      body:
        step === 1
          ? `${off.departures.length} of your players want to transfer. ${off.pool.length} players are in the portal. ${off.bids.length} bid${off.bids.length === 1 ? "" : "s"} filed.`
          : `${r.transfersOut.length} left, ${signedTransfers} signed.`,
      action:
        step === 1 ? (
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/portal">Open the portal</ButtonLink>
            <Button variant="outline" onClick={() => dispatch({ type: "offseason/closePortal" })}>
              Close window
            </Button>
          </div>
        ) : null,
    },
    {
      title: `Begin Season ${next}`,
      body:
        step === 2
          ? "Walk-ons fill any position that's still short, then the new schedule, preseason poll and next year's recruiting board are set."
          : "After the window closes.",
      action: step === 2 ? <Button onClick={() => dispatch({ type: "offseason/begin" })}>Begin Season {next}</Button> : null,
    },
  ];

  return (
    <Panel kicker={`Heading into Season ${next}`} title="Offseason">
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="NIL budget" value={money(state.nilBudget)} tone="gold" />
        <Stat label="Roster spots open" value={rosterSpots(state)} />
        <Stat label="Roster" value={`${state.players.length}/${ROSTER_MAX}`} />
        <Stat label="Transfers signed" value={signedTransfers} tone="good" />
      </div>
      <ol className="space-y-2">
        {steps.map((st, i) => {
          const done = i < step;
          const current = i === step;
          return (
            <li key={st.title} className={cx("rounded-md border p-3", current ? "border-accent bg-accent/5" : "border-line bg-bg-2/70", !done && !current && "opacity-60")}>
              <div className="flex items-center gap-2">
                <span className={cx("font-display flex size-6 items-center justify-center rounded text-sm font-bold", done ? "bg-good/20 text-good" : current ? "bg-accent" : "bg-white/10 text-muted")}>
                  {done ? "✓" : i + 1}
                </span>
                <p className="font-display font-semibold tracking-wide">{st.title}</p>
                {current && <Tag>Now</Tag>}
              </div>
              <p className="mt-1.5 text-sm leading-6 text-muted">{st.body}</p>
              {current && st.action && <div className="mt-3">{st.action}</div>}
            </li>
          );
        })}
      </ol>
      {off.log.length > 0 && (
        <details className="mt-4">
          <summary className="font-display cursor-pointer text-xs tracking-widest text-muted">Offseason log</summary>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {off.log.slice(0, 20).map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </details>
      )}
      <p className="mt-4 text-xs text-dim">
        Your recruiting class signed in December; the transfer window is the only way to add players now. In a hurry?{" "}
        <button className="underline hover:text-text" onClick={() => dispatch({ type: "season/next" })}>
          Skip the rest of the offseason
        </button>{" "}
        — pending bids resolve and walk-ons fill any gaps.{" "}
        <Link href="/roster" className="underline hover:text-text">
          Roster
        </Link>
      </p>
    </Panel>
  );
}
