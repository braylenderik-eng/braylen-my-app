"use client";

import { useState } from "react";
import { TEAMS } from "@/lib/game/data";
import { signChance } from "@/lib/game/offseason";
import { POS_LABEL, STARTERS, type Pos } from "@/lib/game/roster";
import { prestige, rosterSpots, type GameState } from "@/lib/game/state";
import { money, pct } from "@/lib/format";
import { useGame } from "../GameProvider";
import { Button, cx, PageHeader, Panel, Stat, Tag } from "../ui";

/** Positions where you have fewer than a starter plus one backup (graduation and departures counted). */
export function thinPositions(state: GameState): Pos[] {
  const leaving = new Set(state.offseason?.departures.filter((d) => d.call !== "keep").map((d) => d.playerId) ?? []);
  return (Object.keys(STARTERS) as Pos[]).filter((pos) => {
    const have = state.players.filter((p) => p.pos === pos && p.yr !== "HS" && !leaving.has(p.id)).length;
    return have < STARTERS[pos] + (pos === "K" || pos === "P" ? 0 : 1);
  });
}

export function OffseasonPortal({ state }: { state: GameState }) {
  const { dispatch } = useGame();
  const off = state.offseason!;
  const open = off.phase === "portal";
  const [pos, setPos] = useState<"All" | Pos>("All");
  const thin = thinPositions(state);
  const spots = rosterSpots(state);
  const byId = new Map(state.players.map((p) => [p.id, p]));
  const rows = off.pool.filter((t) => pos === "All" || t.pos === pos);

  return (
    <>
      <PageHeader
        title="Transfer portal"
        sub={`Offseason · heading into Season ${state.season + 1} · ${open ? "Window open" : "Window closed"}`}
        right={
          open && (
            <Button onClick={() => dispatch({ type: "offseason/closePortal" })}>Close window</Button>
          )
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="NIL budget" value={money(state.nilBudget)} tone="gold" />
        <Stat label="Roster spots open" value={spots} />
        <Stat label="Bids filed" value={off.bids.length} />
        <Stat label="Thin positions" value={thin.length} tone={thin.length ? "bad" : "good"} />
      </div>
      {thin.length > 0 && (
        <p className="-mt-2 mb-5 text-sm text-muted">
          Short of a starter plus a backup at: <span className="text-accent-hi">{thin.join(", ")}</span>. Anything still short when the season starts is
          filled with walk-ons.
        </p>
      )}

      {off.departures.length > 0 && (
        <Panel kicker="Your players" title="Want to transfer" className="mb-5">
          <p className="mb-3 text-sm text-muted">These backups want more playing time. Pay an NIL raise to keep them, or let them go and use the roster spot.</p>
          <ul className="space-y-2">
            {off.departures.map((d) => {
              const p = byId.get(d.playerId);
              if (!p) {
                return null;
              }
              return (
                <li key={d.playerId} className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-bg-2/70 px-3 py-2">
                  <span className="font-display tabular w-8 text-lg font-bold">{p.ovr}</span>
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{p.name}</span>
                    <span className="block text-xs text-muted">
                      {POS_LABEL[p.pos]} · {p.yr} · now {money(p.nil - (d.call === "keep" ? d.keepCost : 0))} NIL
                    </span>
                  </span>
                  {open ? (
                    <div className="flex gap-2">
                      <Button
                        variant={d.call === "keep" ? "primary" : "outline"}
                        className="px-3 py-1.5 text-xs"
                        disabled={d.call !== "keep" && state.nilBudget < d.keepCost}
                        onClick={() => dispatch({ type: "offseason/departure", playerId: d.playerId, call: "keep" })}
                      >
                        Keep · +{money(d.keepCost)}
                      </Button>
                      <Button
                        variant={d.call === "release" ? "primary" : "outline"}
                        className="px-3 py-1.5 text-xs"
                        onClick={() => dispatch({ type: "offseason/departure", playerId: d.playerId, call: "release" })}
                      >
                        Let him go
                      </Button>
                    </div>
                  ) : (
                    <Tag tone={d.call === "keep" ? "good" : "muted"}>{d.call === "keep" ? "Stayed" : "Left"}</Tag>
                  )}
                </li>
              );
            })}
          </ul>
          {open && <p className="mt-2 text-xs text-dim">Anyone you haven&apos;t decided on leaves when the window closes.</p>}
        </Panel>
      )}

      <Panel kicker="Other schools" title={`In the portal · ${off.pool.length} players`} bodyClassName="p-0">
        <div className="flex flex-wrap gap-2 border-b border-line p-3">
          {(["All", ...thin.filter((x) => off.pool.some((t) => t.pos === x))] as ("All" | Pos)[]).concat(
            [...new Set(off.pool.map((t) => t.pos))].filter((x) => !thin.includes(x)),
          ).map((p) => (
            <button
              key={p}
              onClick={() => setPos(p)}
              aria-pressed={pos === p}
              className={cx(
                "font-display rounded-md border px-3 py-1.5 text-xs tracking-widest",
                pos === p ? "border-accent bg-accent text-white" : thin.includes(p as Pos) ? "border-accent/50 text-accent-hi" : "border-line text-muted hover:text-text",
              )}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="font-display border-b border-line text-[10px] tracking-widest text-muted">
                <th className="px-4 py-2 text-left font-normal">Player</th>
                {["Pos", "Yr", "OVR", "POT", "Ask", "Rivals", "Odds"].map((h) => (
                  <th key={h} className="px-2 py-2 text-right font-normal">
                    {h}
                  </th>
                ))}
                <th className="px-4 py-2 text-right font-normal">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const bid = off.bids.find((b) => b.id === t.id);
                const can = open && !bid && state.nilBudget >= t.ask && spots > 0;
                return (
                  <tr key={t.id} className={cx("border-b border-line/60 last:border-0", bid?.status === "signed" && "bg-good/5")}>
                    <td className="px-4 py-2.5">
                      <p className="font-semibold">{t.name}</p>
                      <p className="text-xs text-muted">
                        ex-{TEAMS[t.from].name} · {t.note}
                      </p>
                    </td>
                    <td className={cx("font-display px-2 text-right", thin.includes(t.pos) && "text-accent-hi")}>{t.pos}</td>
                    <td className="font-display px-2 text-right text-muted">{t.yr}</td>
                    <td className="font-display tabular px-2 text-right text-base font-semibold">{t.ovr}</td>
                    <td className="font-display tabular px-2 text-right text-muted">{t.pot}</td>
                    <td className="font-display tabular px-2 text-right">{money(t.ask)}</td>
                    <td className="font-display tabular px-2 text-right text-muted">{t.rivals}</td>
                    <td className="font-display tabular px-2 text-right text-muted">{pct(signChance(t, state.hype, prestige(state)))}</td>
                    <td className="px-4 text-right">
                      {bid ? (
                        <Tag tone={bid.status === "signed" ? "good" : bid.status === "lost" ? "muted" : "gold"}>
                          {bid.status === "pending" ? "Bid filed" : bid.status === "signed" ? "Signed" : "Lost"}
                        </Tag>
                      ) : open ? (
                        <Button className="px-3 py-1.5 text-xs" disabled={!can} onClick={() => dispatch({ type: "offseason/bid", id: t.id })}>
                          {spots < 1 ? "No spots" : state.nilBudget < t.ask ? "Short on NIL" : "Bid"}
                        </Button>
                      ) : (
                        <span className="text-xs text-dim">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-4 py-3 text-xs text-muted">
          A bid spends the ask and a roster spot now. Bids resolve when you close the window; if he picks another school, both come back.
          Odds improve with hype and last season&apos;s finish.
        </p>
      </Panel>
    </>
  );
}
