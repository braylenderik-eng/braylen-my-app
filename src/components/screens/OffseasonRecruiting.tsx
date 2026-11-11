"use client";

import { useState } from "react";
import { TEAMS } from "@/lib/game/data";
import { commitChance, MAX_PITCHES_PER_ROUND, PITCH_COST, RECRUIT_ROUNDS, VISIT_COST, type Prospect } from "@/lib/game/offseason";
import { POS_LABEL, type Pos } from "@/lib/game/roster";
import { rosterSpots, type GameState } from "@/lib/game/state";
import { money, pct } from "@/lib/format";
import { useGame } from "../GameProvider";
import { Button, cx, PageHeader, Panel, Stat, Tag } from "../ui";
import { thinPositions } from "./OffseasonPortal";

type Filter = "All" | "Needs" | "Offered" | 2 | 3 | 4 | 5;

export function OffseasonRecruiting({ state }: { state: GameState }) {
  const { dispatch } = useGame();
  const off = state.offseason!;
  const [filter, setFilter] = useState<Filter>("All");
  const thin = thinPositions(state);
  const spots = rosterSpots(state);
  const active = off.phase === "recruiting";
  const done = off.phase === "ready";

  const rows = off.board
    .filter((p) =>
      filter === "All" ? true : filter === "Needs" ? thin.includes(p.pos) : filter === "Offered" ? p.offered : p.stars === filter,
    )
    .sort((a, b) => b.stars - a.stars || b.pot - a.pot);
  const offers = off.board.filter((p) => p.offered);

  return (
    <>
      <PageHeader
        title="Recruiting"
        sub={`Class of Season ${state.season + 1} · ${active ? `Round ${off.round} of ${RECRUIT_ROUNDS}` : done ? "Signing Day complete" : "Opens after the portal window"}`}
        right={
          active && (
            <Button onClick={() => dispatch({ type: "recruit/endRound" })}>{off.round < RECRUIT_ROUNDS ? `End round ${off.round}` : "Signing Day"}</Button>
          )
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Points left" value={active ? off.points : "—"} tone="gold" />
        <Stat label="NIL budget" value={money(state.nilBudget)} />
        <Stat label="Roster spots open" value={spots} />
        <Stat label="Offers out" value={offers.filter((p) => p.status === "open").length} />
        <Stat label="Signed" value={off.board.filter((p) => p.status === "signed").length} tone="good" />
      </div>

      {!active && !done && (
        <p className="mb-5 rounded-md border border-line bg-panel px-4 py-3 text-sm text-muted">
          You can scout the board now. Pitches, visits and offers open once you close the portal window.
        </p>
      )}

      {active && (
        <p className="mb-4 text-sm text-muted">
          Each round you get recruiting points. A <b className="text-text">pitch</b> costs {PITCH_COST} (up to {MAX_PITCHES_PER_ROUND} per prospect a round, each worth a
          little less); an <b className="text-text">official visit</b> costs {VISIT_COST} and is a big boost, once per prospect. Only prospects with an
          <b className="text-text"> NIL offer</b> can sign; offers reserve the money and a roster spot. At the end of each round, rival schools make their
          push. On Signing Day, each offered prospect picks you or his top rival — the bigger your lead, the likelier he&apos;s yours.
        </p>
      )}

      <Panel bodyClassName="p-0">
        <div className="flex flex-wrap gap-2 border-b border-line p-3">
          {(["All", "Needs", "Offered", 5, 4, 3, 2] as Filter[]).map((f) => (
            <button
              key={String(f)}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={cx(
                "font-display rounded-md border px-3 py-1.5 text-xs tracking-widest",
                filter === f ? "border-accent bg-accent text-white" : "border-line text-muted hover:text-text",
              )}
            >
              {typeof f === "number" ? `${f}★` : f}
            </button>
          ))}
          {thin.length > 0 && <span className="self-center text-xs text-muted">Needs: {thin.join(", ")}</span>}
        </div>
        <ul className="divide-y divide-line/60">
          {rows.map((p) => (
            <ProspectRow key={p.id} p={p} state={state} thin={thin} spots={spots} active={active} dispatch={dispatch} />
          ))}
          {rows.length === 0 && <li className="px-4 py-8 text-center text-muted">Nobody matches this filter.</li>}
        </ul>
      </Panel>
    </>
  );
}

function ProspectRow({
  p,
  state,
  thin,
  spots,
  active,
  dispatch,
}: {
  p: Prospect;
  state: GameState;
  thin: Pos[];
  spots: number;
  active: boolean;
  dispatch: ReturnType<typeof useGame>["dispatch"];
}) {
  const off = state.offseason!;
  const leading = p.you >= p.them;
  return (
    <li className={cx("flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3", p.status === "signed" && "bg-good/5", p.status === "lost" && "opacity-50")}>
      <div className="w-56 min-w-0">
        <p className="font-display text-xs tracking-wider text-gold">{"★".repeat(p.stars)}</p>
        <p className="truncate font-semibold">{p.name}</p>
        <p className="text-xs text-muted">
          <span className={cx(thin.includes(p.pos) && "text-accent-hi")}>{POS_LABEL[p.pos]}</span> · {p.hometown}
        </p>
      </div>
      <div className="font-display tabular w-20 text-center">
        <span className="text-lg font-bold">{p.ovr}</span>
        <span className="text-xs text-muted"> → {p.pot}</span>
        <p className="text-[9px] tracking-widest text-dim">OVR → POT</p>
      </div>
      <div className="min-w-48 flex-1">
        <div className="flex justify-between text-xs">
          <span className={cx(leading ? "font-semibold text-accent-hi" : "text-muted")}>You {p.you}</span>
          <span className={cx(!leading ? "font-semibold text-text" : "text-muted")}>
            {TEAMS[p.rival].name.split(" ").slice(-1)} {p.them}
          </span>
        </div>
        <div className="mt-1 flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-line">
          <div style={{ width: `${(p.you / Math.max(1, p.you + p.them)) * 100}%`, background: "var(--accent)" }} />
          <div style={{ width: `${(p.them / Math.max(1, p.you + p.them)) * 100}%`, background: TEAMS[p.rival].color }} />
        </div>
        {p.offered && p.status === "open" && <p className="mt-1 text-[11px] text-muted">If Signing Day were now: {pct(commitChance(p))} he picks you</p>}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {p.status === "signed" && <Tag tone="good">Signed</Tag>}
        {p.status === "lost" && <Tag tone="muted">{p.offered ? `Picked ${TEAMS[p.rival].short}` : "Elsewhere"}</Tag>}
        {p.status === "open" && (
          <>
            {p.visited && <Tag tone="gold">Visited</Tag>}
            <Button
              variant="outline"
              className="px-2.5 py-1.5 text-xs"
              disabled={!active || off.points < PITCH_COST || p.pitchesThisRound >= MAX_PITCHES_PER_ROUND}
              onClick={() => dispatch({ type: "recruit/pitch", id: p.id })}
            >
              Pitch {p.pitchesThisRound ? `${p.pitchesThisRound}/${MAX_PITCHES_PER_ROUND}` : ""}
            </Button>
            {!p.visited && (
              <Button
                variant="outline"
                className="px-2.5 py-1.5 text-xs"
                disabled={!active || off.points < VISIT_COST}
                onClick={() => dispatch({ type: "recruit/visit", id: p.id })}
              >
                Visit
              </Button>
            )}
            {p.offered ? (
              <Button variant="ghost" className="px-2.5 py-1.5 text-xs" disabled={!active} onClick={() => dispatch({ type: "recruit/withdraw", id: p.id })}>
                Withdraw {money(p.ask)}
              </Button>
            ) : (
              <Button
                className="px-2.5 py-1.5 text-xs"
                disabled={!active || state.nilBudget < p.ask || spots < 1}
                onClick={() => dispatch({ type: "recruit/offer", id: p.id })}
              >
                Offer {money(p.ask)}
              </Button>
            )}
          </>
        )}
      </div>
    </li>
  );
}
