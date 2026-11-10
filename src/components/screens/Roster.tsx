"use client";

import { useState } from "react";
import { USER_TEAM } from "@/lib/game/data";
import { attributes, isAvailable, POS_LABEL, POS_ORDER, SIDE, STARTERS, starters, teamRatings, type Player, type Pos } from "@/lib/game/roster";
import { lineup, shortPositions, type GameState } from "@/lib/game/state";
import { money } from "@/lib/format";
import { useGame } from "../GameProvider";
import { cx, Dialog, PageHeader, Panel, Stat, Tag } from "../ui";

export function Roster() {
  const { state } = useGame();
  const [open, setOpen] = useState<Player | null>(null);
  const inp = lineup(state);
  const ratings = teamRatings(USER_TEAM, inp);
  const st = starters(inp);
  const starterIds = new Set(Object.values(st).flat().map((p) => p.id));
  const active = state.players.filter((p) => p.yr !== "HS");
  const signees = state.players.filter((p) => p.yr === "HS");
  const nil = state.players.reduce((n, p) => n + p.nil, 0);
  const injured = active.filter((p) => state.injuries[p.id]).length;
  const short = shortPositions(state);

  return (
    <>
      <PageHeader title="Roster" sub={`Lone Star Stallions · ${active.length} players · Depth chart`} />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Offense" value={Math.round(ratings.off)} tone="gold" />
        <Stat label="Defense" value={Math.round(ratings.def)} tone="gold" />
        <Stat label="NIL committed" value={money(nil)} />
        <Stat label="Scholarships open" value={state.scholarships} />
        <Stat label="Injured" value={injured} tone={injured ? "bad" : undefined} />
      </div>

      {short.length > 0 && (
        <p className="mb-5 rounded-md border border-accent/40 bg-accent/10 px-4 py-3 text-sm">
          Not enough healthy players at {short.join(", ")}. The sim plays the rest of the group a man short — sign a transfer or wait for players to heal.
        </p>
      )}

      <p className="mb-4 text-sm text-muted">
        The top healthy players at each position start, and their ratings drive the sim. Use the arrows to reorder; tap a name for the player card.
      </p>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {POS_ORDER.map((pos) => (
          <PositionGroup key={pos} pos={pos} state={state} starterIds={starterIds} onOpen={setOpen} />
        ))}
        {signees.length > 0 && (
          <Panel kicker="Class of next year" title="Incoming signees">
            <ul className="space-y-2">
              {signees.map((p) => (
                <li key={p.id}>
                  <button onClick={() => setOpen(p)} className="flex w-full items-center gap-3 rounded-md border border-line bg-bg-2/70 px-3 py-2 text-left hover:border-line-2">
                    <span className="font-display tabular w-8 text-lg font-bold text-gold">{p.ovr}</span>
                    <span className="flex-1">
                      <span className="font-semibold">{p.name}</span>
                      <span className="block text-xs text-muted">
                        {p.pos} · {money(p.nil)} NIL · enrolls next season
                      </span>
                    </span>
                    <Tag tone="gold">Signed</Tag>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>

      <PlayerCard player={open} state={state} onClose={() => setOpen(null)} />
    </>
  );
}

function PositionGroup({ pos, state, starterIds, onOpen }: { pos: Pos; state: GameState; starterIds: Set<string>; onOpen: (p: Player) => void }) {
  const { dispatch } = useGame();
  const byId = new Map(state.players.map((p) => [p.id, p]));
  const list = state.depth[pos].map((id) => byId.get(id)!).filter(Boolean);
  const side = SIDE[pos];
  return (
    <Panel
      kicker={side === "off" ? "Offense" : side === "def" ? "Defense" : "Special teams"}
      title={POS_LABEL[pos]}
      right={<span className="font-display text-xs tracking-widest text-muted">{STARTERS[pos]} start</span>}
      bodyClassName="p-2"
    >
      <ol>
        {list.map((p, i) => {
          const inj = state.injuries[p.id];
          const starting = starterIds.has(p.id);
          const available = isAvailable(p.id, lineup(state));
          return (
            <li key={p.id} className={cx("flex items-center gap-2 rounded-md px-2 py-1.5", starting && "bg-white/[0.03]")}>
              <span className="font-display tabular w-5 text-center text-xs text-dim">{i + 1}</span>
              <button onClick={() => onOpen(p)} className="group min-w-0 flex-1 text-left">
                <span className={cx("block truncate text-sm group-hover:text-accent-hi", starting ? "font-semibold" : "text-muted")}>
                  {p.name}
                  {p.source === "portal" && <span className="font-display ml-1.5 text-[10px] text-gold">PORTAL</span>}
                </span>
                <span className="block text-[11px] text-dim">
                  #{p.num} · {p.yr}
                  {inj && (
                    <span className={inj.status === "out" ? "text-bad" : "text-gold"}>
                      {" "}
                      · {inj.status === "out" ? `Out (${inj.desc})` : `Questionable (${inj.desc})`}
                    </span>
                  )}
                </span>
              </button>
              {starting ? <Tag tone="accent">Starter</Tag> : !available ? <Tag tone="muted">Out</Tag> : null}
              <span className={cx("font-display tabular w-7 text-right text-lg font-bold", starting ? "text-text" : "text-muted")}>{p.ovr}</span>
              <div className="flex flex-col">
                <button
                  aria-label={`Move ${p.name} up`}
                  disabled={i === 0}
                  onClick={() => dispatch({ type: "depth/move", pos, playerId: p.id, dir: -1 })}
                  className="rounded px-1.5 text-xs leading-4 text-muted hover:bg-white/10 hover:text-text disabled:opacity-20"
                >
                  ▲
                </button>
                <button
                  aria-label={`Move ${p.name} down`}
                  disabled={i === list.length - 1}
                  onClick={() => dispatch({ type: "depth/move", pos, playerId: p.id, dir: 1 })}
                  className="rounded px-1.5 text-xs leading-4 text-muted hover:bg-white/10 hover:text-text disabled:opacity-20"
                >
                  ▼
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

function PlayerCard({ player, state, onClose }: { player: Player | null; state: GameState; onClose: () => void }) {
  if (!player) return null;
  const p = player;
  const inj = state.injuries[p.id];
  const depthIndex = p.yr === "HS" ? -1 : state.depth[p.pos].indexOf(p.id);
  const s = state.seasonStats[p.id];
  const statLines: string[] = [];
  if (s?.att) statLines.push(`${s.cmp}/${s.att} passing, ${s.passYds} yds, ${s.passTd ?? 0} TD, ${s.int ?? 0} INT`);
  if (s?.car) statLines.push(`${s.car} carries, ${s.rushYds} yds, ${s.rushTd ?? 0} TD`);
  else if (s?.rushTd) statLines.push(`${s.rushTd} rushing TD`);
  if (s?.rec) statLines.push(`${s.rec} catches, ${s.recYds} yds, ${s.recTd ?? 0} TD`);
  if (s?.sacks) statLines.push(`${s.sacks} sack${s.sacks > 1 ? "s" : ""}`);
  if (s?.takeaways) statLines.push(`${s.takeaways} takeaway${s.takeaways > 1 ? "s" : ""}`);

  return (
    <Dialog open title={p.name} onClose={onClose}>
      <div className="flex items-center gap-4">
        <div className="font-display flex size-16 shrink-0 flex-col items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent/40 text-white ring-1 ring-white/15">
          <span className="text-[10px] tracking-widest opacity-80">#{p.num}</span>
          <span className="text-2xl leading-none font-bold">{p.ovr}</span>
        </div>
        <div className="min-w-0">
          <p className="font-display text-xs tracking-widest text-accent-hi">
            {POS_LABEL[p.pos]} · {p.yr === "HS" ? "Incoming" : p.yr}
          </p>
          <p className="text-sm text-muted">{p.hometown}</p>
          <p className="text-sm">
            NIL deal <span className="font-display tabular">{money(p.nil)}</span>
          </p>
        </div>
      </div>

      <ul className="mt-4 space-y-2">
        {attributes(p).map((a) => (
          <li key={a.label}>
            <div className="flex justify-between text-sm">
              <span className="text-muted">{a.label}</span>
              <span className="font-display tabular">{a.value}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full" style={{ width: `${a.value}%`, background: a.value >= 85 ? "var(--gold)" : a.value >= 75 ? "var(--accent)" : "#56607d" }} />
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-4 space-y-1.5 border-t border-line pt-3 text-sm">
        <p>
          <span className="text-muted">Depth: </span>
          {depthIndex < 0 ? "Enrolls next season" : `${p.pos}${depthIndex + 1}${depthIndex < STARTERS[p.pos] ? " (starter)" : ""}`}
        </p>
        <p>
          <span className="text-muted">Status: </span>
          {inj ? (
            <span className={inj.status === "out" ? "text-bad" : "text-gold"}>
              {inj.status === "out" ? `Out ${inj.weeks} game${inj.weeks > 1 ? "s" : ""}` : "Questionable"} ({inj.desc})
            </span>
          ) : (
            <span className="text-good">Healthy</span>
          )}
        </p>
        <p>
          <span className="text-muted">Season ({s?.games ?? 0} sim game{s?.games === 1 ? "" : "s"}): </span>
          {statLines.length ? statLines.join(" · ") : "No stats yet"}
        </p>
      </div>
    </Dialog>
  );
}
