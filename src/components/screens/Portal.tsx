"use client";

import { useState } from "react";
import { TEAMS, type PortalPlayer } from "@/lib/game/data";
import { keyDates, watchList } from "@/lib/game/state";
import { money } from "@/lib/format";
import { useGame } from "../GameProvider";
import { PlayerFace } from "../PlayerFace";
import { Button, cx, Dialog, PageHeader, Panel, Tag } from "../ui";
import { OffseasonPortal } from "./OffseasonPortal";

export function Portal() {
  const { state } = useGame();
  return state.offseason ? <OffseasonPortal state={state} /> : <PortalWatch />;
}

/**
 * During the season there is no transfer window — players can only move in January. This page is a
 * watch list: scout the players expected to enter so you're ready when the window opens.
 */
function PortalWatch() {
  const { state, dispatch } = useGame();
  const [query, setQuery] = useState("");
  const [scouted, setScouted] = useState<PortalPlayer | null>(null);
  const list = state.season === 1 && !state.coach ? watchList() : [];
  const q = query.trim().toLowerCase();
  const rows = list.filter((p) => !q || [p.name, p.from, p.pos].some((x) => x.toLowerCase().includes(q)));

  return (
    <>
      <PageHeader title="Portal watch" sub={`Season ${state.season} · window closed until January (${keyDates(state.season).portalWindow})`} />

      <div className="mb-5 rounded-lg border border-line bg-panel px-4 py-3 text-sm leading-6 text-muted">
        College football has one transfer window, in early January — there&apos;s no in-season or spring window. Use the season to scout who&apos;s
        expected to enter; you can bid once the window opens in the offseason, with next year&apos;s cap room.
      </div>

      <Panel kicker="Expected to enter" title={list.length ? `${list.length} players on your radar` : "Watch list"} bodyClassName="p-0">
        {list.length > 0 && (
          <div className="border-b border-line p-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, school, pos…"
              aria-label="Search the watch list"
              className="w-full rounded-md border border-line bg-bg-2 px-3 py-2 text-sm placeholder:text-dim"
            />
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="font-display border-b border-line text-[10px] tracking-widest text-muted">
                <th className="px-4 py-2 text-left font-normal">Player</th>
                {["Pos", "Yr", "OVR", "POT", "Exp. ask", "Interest"].map((h) => (
                  <th key={h} className="px-2 py-2 text-right font-normal">
                    {h}
                  </th>
                ))}
                <th className="px-4 py-2 text-right font-normal">Scouting</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const isScouted = state.scouts.includes(p.id);
                return (
                  <tr key={p.id} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                      <PlayerFace id={p.id} pos={p.pos} color={Object.values(TEAMS).find((t) => t.name === p.from)?.color} size={36} />
                      <div className="min-w-0">
                      <p className="font-semibold">
                        {p.name} {p.tag && <Tag tone={p.tag === "HOT" ? "accent" : "gold"}>{p.tag}</Tag>}
                      </p>
                      <p className="text-xs text-muted">
                        {p.from} · {p.stat}
                      </p>
                      </div>
                      </div>
                    </td>
                    <td className="font-display px-2 text-right">{p.pos}</td>
                    <td className="font-display px-2 text-right text-muted">{p.yr}</td>
                    <td className="font-display tabular px-2 text-right text-base font-semibold">{p.ovr}</td>
                    <td className="font-display tabular px-2 text-right text-muted">{p.pot}</td>
                    <td className="font-display tabular px-2 text-right">{money(p.ask)}</td>
                    <td className="font-display tabular px-2 text-right text-muted">{p.rivals} schools</td>
                    <td className="px-4 text-right">
                      <Button
                        variant={isScouted ? "ghost" : "outline"}
                        className="px-3 py-1.5 text-xs"
                        onClick={() => {
                          dispatch({ type: "portal/scout", playerId: p.id });
                          setScouted(p);
                        }}
                      >
                        {isScouted ? "Report" : "Scout"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted">
                    {list.length ? "No one matches." : "Nobody has signaled they're leaving yet. Check back when the January window opens."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {list.length > 0 && (
          <p className={cx("border-t border-line px-4 py-3 text-xs text-muted")}>
            These players will be in the January portal pool. Asking prices and competition are estimates until the window opens.
          </p>
        )}
      </Panel>

      <Dialog open={!!scouted} title={scouted ? `Scouting report: ${scouted.name}` : ""} onClose={() => setScouted(null)}>
        {scouted && (
          <>
            <p className="font-display text-xs tracking-widest text-muted">
              {scouted.pos} · {scouted.yr} · OVR {scouted.ovr} / POT {scouted.pot} · {scouted.from}
            </p>
            <p className="mt-3 leading-6">{scouted.note}</p>
            <Button className="mt-5 w-full" onClick={() => setScouted(null)}>
              Got it
            </Button>
          </>
        )}
      </Dialog>
    </>
  );
}
