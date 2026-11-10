"use client";

import { useState } from "react";
import { TEAM_NEEDS, type PortalPlayer } from "@/lib/game/data";
import { canBid, portalBoard } from "@/lib/game/state";
import { money } from "@/lib/format";
import { useGame } from "../GameProvider";
import { Button, cx, Dialog, PageHeader, Panel, Tag } from "../ui";

export function Portal() {
  const { state, dispatch } = useGame();
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState<"All" | string>("All");
  const [bidding, setBidding] = useState<PortalPlayer | null>(null);
  const [scouted, setScouted] = useState<PortalPlayer | null>(null);

  const board = portalBoard(state);
  const listed = 1284 + (state.rook.decision === "walked" ? 1 : 0);
  const q = query.trim().toLowerCase();
  const rows = board.filter(
    (p) => (pos === "All" || p.pos === pos) && (!q || [p.name, p.from, p.pos].some((x) => x.toLowerCase().includes(q))),
  );

  return (
    <>
      <PageHeader
        title="Transfer portal"
        sub={`Window open · ${listed.toLocaleString()} listed`}
        right={
          <p className="font-display text-xs tracking-widest text-muted">
            Needs: <span className="text-text">{TEAM_NEEDS.join(", ")}</span> · Budget <span className="text-text">{money(state.nilBudget)}</span> ·{" "}
            <span className="text-text">{state.scholarships}</span> scholarships open
          </p>
        }
      />

      <Panel bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, school, pos…"
            aria-label="Search the portal"
            className="min-w-0 flex-1 rounded-md border border-line bg-bg-2 px-3 py-2 text-sm placeholder:text-dim"
          />
          {["All", ...TEAM_NEEDS].map((p) => (
            <button
              key={p}
              onClick={() => setPos(p)}
              aria-pressed={pos === p}
              className={cx(
                "font-display rounded-md border px-3 py-2 text-xs tracking-widest",
                pos === p ? "border-accent bg-accent text-white" : "border-line text-muted hover:text-text",
              )}
            >
              {p}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="font-display border-b border-line text-[10px] tracking-widest text-muted">
                <th className="px-4 py-2 text-left font-normal">Player</th>
                {["Pos", "Yr", "OVR", "POT", "Ask", "Bids"].map((h) => (
                  <th key={h} className="px-2 py-2 text-right font-normal">
                    {h}
                  </th>
                ))}
                <th className="px-4 py-2 text-right font-normal">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const bid = state.bids.find((b) => b.playerId === p.id);
                const isScouted = state.scouts.includes(p.id);
                const check = canBid(state, p);
                const need = TEAM_NEEDS.includes(p.pos);
                return (
                  <tr key={p.id} className={cx("border-b border-line/60 last:border-0", bid?.status === "signed" && "bg-good/5")}>
                    <td className="px-4 py-2.5">
                      <p className="font-semibold">
                        {p.name} {p.tag && <Tag tone={p.tag === "HOT" ? "accent" : "gold"}>{p.tag}</Tag>}
                      </p>
                      <p className="text-xs text-muted">
                        {p.yr === "HS" ? p.from : `ex-${p.from}`} · {p.stat}
                      </p>
                    </td>
                    <td className={cx("font-display px-2 text-right", need && "text-accent-hi")}>{p.pos}</td>
                    <td className="font-display px-2 text-right text-muted">{p.yr}</td>
                    <td className="font-display tabular px-2 text-right text-base font-semibold">{p.ovr}</td>
                    <td className="font-display tabular px-2 text-right text-muted">{p.pot}</td>
                    <td className="font-display tabular px-2 text-right">{money(p.ask)}</td>
                    <td className="font-display tabular px-2 text-right text-muted">{p.rivals}</td>
                    <td className="px-4 text-right">
                      {bid ? (
                        <Tag tone={bid.status === "signed" ? "good" : bid.status === "lost" ? "muted" : "gold"}>
                          {bid.status === "pending" ? "Bid filed" : bid.status === "signed" ? "Signed" : "Lost"}
                        </Tag>
                      ) : p.biddable || isScouted ? (
                        <div className="flex justify-end gap-1.5">
                          {isScouted && (
                            <button onClick={() => setScouted(p)} className="font-display px-2 text-xs tracking-wider text-muted hover:text-text">
                              Report
                            </button>
                          )}
                          <Button className="px-3 py-1.5 text-xs" disabled={!check.ok} onClick={() => setBidding(p)}>
                            {check.ok ? "Bid" : check.reason}
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          className="px-3 py-1.5 text-xs"
                          onClick={() => {
                            dispatch({ type: "portal/scout", playerId: p.id });
                            setScouted(p);
                          }}
                        >
                          Scout
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted">
                    No one on your shortlist matches.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-4 py-3 text-xs text-muted">
          Shortlist on your board. {listed.toLocaleString()} names are listed in the window. Bids resolve when you sim the week.
        </p>
      </Panel>

      <Dialog open={!!bidding} title={bidding ? `File a bid on ${bidding.name}` : ""} onClose={() => setBidding(null)}>
        {bidding && (
          <>
            <p className="text-sm text-muted">
              Ask is {money(bidding.ask)}. This spends fictional NIL dollars and one scholarship now. {bidding.rivals} other school{bidding.rivals === 1 ? " is" : "s are"} bidding;
              you&apos;ll find out when the week is simmed. If he goes elsewhere, the money and scholarship come back.
            </p>
            <p className="font-display mt-4 text-sm tracking-wider">
              Pool {money(state.nilBudget)} · {state.scholarships} scholarships open
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={() => setBidding(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  dispatch({ type: "portal/bid", playerId: bidding.id });
                  setBidding(null);
                }}
              >
                File bid
              </Button>
            </div>
          </>
        )}
      </Dialog>

      <Dialog open={!!scouted} title={scouted ? `Scouting report: ${scouted.name}` : ""} onClose={() => setScouted(null)}>
        {scouted && (
          <>
            <p className="font-display text-xs tracking-widest text-muted">
              {scouted.pos} · {scouted.yr} · OVR {scouted.ovr} / POT {scouted.pot}
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
