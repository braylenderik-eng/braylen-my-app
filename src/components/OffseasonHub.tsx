"use client";

import Link from "next/link";
import { RECRUIT_ROUNDS, ROSTER_MAX } from "@/lib/game/offseason";
import { rosterSpots, type GameState } from "@/lib/game/state";
import { money } from "@/lib/format";
import { useGame } from "./GameProvider";
import { Button, ButtonLink, cx, Panel, Stat, Tag } from "./ui";

/** The four offseason steps, with where you are and what to do next. */
export function OffseasonHub({ state }: { state: GameState }) {
  const { dispatch } = useGame();
  const off = state.offseason!;
  const r = state.lastOffseason!;
  const next = state.season + 1;
  const step = off.phase === "portal" ? 1 : off.phase === "recruiting" ? 2 : 3;
  const signedTransfers = off.bids.filter((b) => b.status === "signed").length;
  const signedRecruits = off.board.filter((p) => p.status === "signed").length;
  const gains = [...r.progressed].sort((a, b) => b.to - b.from - (a.to - a.from)).slice(0, 4);

  const steps = [
    {
      title: "Graduation & development",
      body: `${r.graduated.length} seniors graduated. ${r.progressed.length} players improved${gains.length ? ` — biggest: ${gains.map((g) => `${g.player.name} ${g.from}→${g.to}`).join(", ")}` : ""}.${
        r.enrolled.length ? ` Enrolled: ${r.enrolled.map((p) => p.name).join(", ")}.` : ""
      }`,
      action: null,
    },
    {
      title: "Portal window",
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
      title: "Recruiting",
      body:
        step < 2
          ? "Opens when the portal window closes."
          : step === 2
            ? `Round ${off.round} of ${RECRUIT_ROUNDS} · ${off.points} recruiting points left · ${off.board.filter((p) => p.offered).length} offers out.`
            : `Signing Day is done: ${signedRecruits} signed.`,
      action:
        step === 2 ? (
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/recruiting">Open the board</ButtonLink>
            <Button variant="outline" onClick={() => dispatch({ type: "recruit/endRound" })}>
              {off.round < RECRUIT_ROUNDS ? "End round" : "Signing Day"}
            </Button>
          </div>
        ) : null,
    },
    {
      title: `Begin Season ${next}`,
      body: step === 3 ? "Walk-ons fill any position that's still short, then the new schedule and preseason poll are set." : "After Signing Day.",
      action: step === 3 ? <Button onClick={() => dispatch({ type: "offseason/begin" })}>Begin Season {next}</Button> : null,
    },
  ];

  return (
    <Panel kicker={`Heading into Season ${next}`} title="Offseason">
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="NIL budget" value={money(state.nilBudget)} tone="gold" />
        <Stat label="Roster spots open" value={rosterSpots(state)} />
        <Stat label="Roster" value={`${state.players.length}/${ROSTER_MAX}`} />
        <Stat label="Signed" value={signedTransfers + signedRecruits} tone="good" />
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
        In a hurry?{" "}
        <button className="underline hover:text-text" onClick={() => dispatch({ type: "season/next" })}>
          Skip the rest of the offseason
        </button>{" "}
        — pending bids and offers resolve, and walk-ons fill any gaps.{" "}
        <Link href="/roster" className="underline hover:text-text">
          Roster
        </Link>
      </p>
    </Panel>
  );
}
