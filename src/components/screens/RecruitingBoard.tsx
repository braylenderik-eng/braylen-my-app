"use client";

import { useState } from "react";
import { TEAMS } from "@/lib/game/data";
import { commitChance, MAX_PITCHES_PER_WEEK, PITCH_COST, VISIT_COST, type Prospect } from "@/lib/game/recruiting";
import { POS_LABEL, STARTERS, type Pos } from "@/lib/game/roster";
import { keyDates, rosterSpots, type GameState } from "@/lib/game/state";
import { money, pct } from "@/lib/format";
import { useGame } from "../GameProvider";
import { Button, cx, Panel, Stat, Tag } from "../ui";
import { PlayerFace } from "../PlayerFace";

type Filter = "All" | "Needs" | "Fit" | "Offered" | 2 | 3 | 4 | 5;

/** Positions short of a starter plus a backup next season (seniors counted as gone). */
export function nextYearNeeds(state: GameState): Pos[] {
  return (Object.keys(STARTERS) as Pos[]).filter((pos) => {
    const have = state.players.filter((p) => p.pos === pos && p.yr !== "Sr").length;
    return have < STARTERS[pos] + (pos === "K" || pos === "P" ? 0 : 1);
  });
}

/** Next year's recruiting class, worked week by week during the season. */
export function RecruitingBoard({ state }: { state: GameState }) {
  const rec = state.recruiting!;
  const [filter, setFilter] = useState<Filter>("All");
  const needs = nextYearNeeds(state);
  const spots = rosterSpots(state);
  const active = !rec.signed && state.week <= 12;

  const rows = rec.board
    .filter((p) => (filter === "All" ? true : filter === "Needs" ? needs.includes(p.pos) : filter === "Fit" ? !!p.fit : filter === "Offered" ? p.offered : p.stars === filter))
    .sort((a, b) => b.stars - a.stars || b.pot - a.pot);
  const offers = rec.board.filter((p) => p.offered && p.status === "open").length;
  const signed = rec.board.filter((p) => p.status === "signed");

  return (
    <Panel
      kicker={`Class of Season ${rec.classSeason}`}
      title={rec.signed ? "Signing Day results" : "Recruiting board"}
      right={
        <span className="font-display text-xs tracking-widest text-muted">
          {rec.signed ? `Signed ${signed.length}` : `Week ${Math.min(rec.week, rec.weeks)} of ${rec.weeks} · Early Signing Day ${keyDates(state.season).signingDay}`}
        </span>
      }
      bodyClassName="p-0"
    >
      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        <Stat label="Points this week" value={active ? rec.points : "—"} tone="gold" />
        <Stat label="Cap room" value={money(state.nilBudget)} />
        <Stat label="Spots next season" value={spots} />
        <Stat label={rec.signed ? "Signed" : "Offers out"} value={rec.signed ? signed.length : offers} tone={rec.signed ? "good" : undefined} />
      </div>

      {active && (
        <p className="px-4 pb-3 text-sm text-muted">
          Points refresh each week you play. A <b className="text-text">pitch</b> costs {PITCH_COST} (up to {MAX_PITCHES_PER_WEEK} per prospect a week, each worth a
          little less); an <b className="text-text">official visit</b> costs {VISIT_COST} and is a big boost, once per prospect. Only prospects with an{" "}
          <b className="text-text">NIL/revenue-share offer</b> can sign; offers reserve the money and a spot. Rivals push every week. On Early Signing Day,
          right after the last regular-season game, each offered prospect signs with you or his top rival. Signees enroll after the season.
        </p>
      )}

      <div className="flex flex-wrap gap-2 border-y border-line p-3">
        {(["All", "Needs", ...(state.coach ? ["Fit"] : []), "Offered", 5, 4, 3, 2] as Filter[]).map((f) => (
          <button
            key={String(f)}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={cx("font-display rounded-md border px-3 py-1.5 text-xs tracking-widest", filter === f ? "border-accent bg-accent text-white" : "border-line text-muted hover:text-text")}
          >
            {typeof f === "number" ? `${f}★` : f}
          </button>
        ))}
        {needs.length > 0 && <span className="self-center text-xs text-muted">Next-year needs: {needs.join(", ")}</span>}
      </div>
      <ul className="divide-y divide-line/60">
        {rows.map((p) => (
          <ProspectRow key={p.id} p={p} state={state} needs={needs} spots={spots} active={active} />
        ))}
        {rows.length === 0 && <li className="px-4 py-8 text-center text-muted">Nobody matches this filter.</li>}
      </ul>
    </Panel>
  );
}

function ProspectRow({ p, state, needs, spots, active }: { p: Prospect; state: GameState; needs: Pos[]; spots: number; active: boolean }) {
  const { dispatch } = useGame();
  const rec = state.recruiting!;
  const leading = p.you >= p.them;
  return (
    <li className={cx("flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3", p.status === "signed" && "bg-good/5", p.status === "lost" && "opacity-50")}>
      <PlayerFace id={p.id} pos={p.pos} size={44} />
      <div className="w-56 min-w-0">
        <p className="font-display text-xs tracking-wider text-gold">
          {"★".repeat(p.stars)} {p.fit && <span className="ml-1"><Tag tone="accent">Scheme fit</Tag></span>} {p.local && <span className="ml-1"><Tag tone="muted">Home region</Tag></span>} {p.room === "path" && <span className="ml-1"><Tag tone="good">Path to start</Tag></span>} {p.room === "crowded" && <span className="ml-1"><Tag tone="muted">Crowded room</Tag></span>}
        </p>
        <p className="truncate font-semibold">{p.name}</p>
        <p className="text-xs text-muted">
          <span className={cx(needs.includes(p.pos) && "text-accent-hi")}>{POS_LABEL[p.pos]}</span> · {p.hometown}
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
        {p.offered && p.status === "open" && <p className="mt-1 text-[11px] text-muted">If Signing Day were today: {pct(commitChance(p))} he signs with you</p>}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {p.status === "signed" && <Tag tone="good">Signed</Tag>}
        {p.status === "lost" && <Tag tone="muted">{p.offered ? `Signed with ${TEAMS[p.rival].short}` : "Elsewhere"}</Tag>}
        {p.status === "open" && (
          <>
            {p.offered && p.you >= p.them && <Tag tone="good">Committed</Tag>}
            {p.visited && <Tag tone="gold">Visited</Tag>}
            <Button
              variant="outline"
              className="px-2.5 py-1.5 text-xs"
              disabled={!active || rec.points < PITCH_COST || p.pitchesThisWeek >= MAX_PITCHES_PER_WEEK}
              onClick={() => dispatch({ type: "recruit/pitch", id: p.id })}
            >
              Pitch {p.pitchesThisWeek ? `${p.pitchesThisWeek}/${MAX_PITCHES_PER_WEEK}` : ""}
            </Button>
            {!p.visited && (
              <Button variant="outline" className="px-2.5 py-1.5 text-xs" disabled={!active || rec.points < VISIT_COST} onClick={() => dispatch({ type: "recruit/visit", id: p.id })}>
                Visit
              </Button>
            )}
            {p.offered ? (
              <Button variant="ghost" className="px-2.5 py-1.5 text-xs" disabled={!active} onClick={() => dispatch({ type: "recruit/withdraw", id: p.id })}>
                Withdraw {money(p.ask)}
              </Button>
            ) : (
              <Button className="px-2.5 py-1.5 text-xs" disabled={!active || state.nilBudget < p.ask || spots < 1} onClick={() => dispatch({ type: "recruit/offer", id: p.id })}>
                Offer {money(p.ask)}
              </Button>
            )}
          </>
        )}
      </div>
    </li>
  );
}
