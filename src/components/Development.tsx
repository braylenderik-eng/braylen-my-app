"use client";

import { TEAMS } from "@/lib/game/data";
import * as D from "@/lib/game/draft";
import { POS_LABEL } from "@/lib/game/roster";
import type { GameState } from "@/lib/game/state";
import { money, pct } from "@/lib/format";
import { useGame } from "./GameProvider";
import { PlayerFace } from "./PlayerFace";
import { Button, cx, Panel, Tag } from "./ui";

/** Juniors who declared for the NFL Draft: make your pitch (an NIL raise) or wish them well. */
export function DraftDecisions({ state }: { state: GameState }) {
  const { dispatch } = useGame();
  const off = state.offseason!;
  const decls = off.declarations ?? [];
  const open = off.phase === "portal";
  if (!decls.length) return null;
  const color = TEAMS[state.team].color;
  return (
    <Panel kicker="NFL Draft · early entry" title={`${decls.length} junior${decls.length === 1 ? "" : "s"} declared`} bodyClassName="p-0">
      <p className="px-4 pt-3 text-sm text-muted">
        Make your pitch to bring a player back for his senior year: it sets an NIL raise aside now, and you get it back if he goes pro anyway.
        Decisions are final when the transfer window closes.
      </p>
      <ul className="divide-y divide-line/60">
        {decls.map((d) => {
          const p = state.players.find((x) => x.id === d.playerId);
          if (!p) return null;
          const pitched = d.call === "pitch";
          return (
            <li key={d.playerId} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <PlayerFace id={p.id} pos={p.pos} color={color} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {p.name} <Tag tone="gold">Projected {D.roundLabel(d.round)}</Tag>
                </p>
                <p className="text-xs text-muted">
                  {POS_LABEL[p.pos]} · {p.ovr} OVR · stays {pct(D.stayChance(d.round, pitched))} {pitched ? "with your pitch" : "if you say nothing"}
                </p>
              </div>
              {open ? (
                <div className="flex gap-2">
                  <Button
                    variant={pitched ? "primary" : "outline"}
                    className="px-3 py-1.5 text-xs"
                    disabled={!pitched && state.nilBudget < d.cost}
                    onClick={() => dispatch({ type: "offseason/declaration", playerId: d.playerId, call: "pitch" })}
                  >
                    {pitched ? "Pitched" : `Pitch (+${money(d.cost)})`}
                  </Button>
                  <Button
                    variant={d.call === "release" ? "primary" : "ghost"}
                    className="px-3 py-1.5 text-xs"
                    onClick={() => dispatch({ type: "offseason/declaration", playerId: d.playerId, call: "release" })}
                  >
                    Wish him well
                  </Button>
                </div>
              ) : (
                <Tag tone="muted">Decided</Tag>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/** Spring practice: pick two position groups to develop. */
export function SpringFocus({ state }: { state: GameState }) {
  const { dispatch } = useGame();
  const focus = state.offseason?.focus ?? [];
  return (
    <Panel kicker="Spring practice" title="Development focus" right={<span className="font-display text-xs tracking-widest text-muted">{focus.length}/{D.MAX_FOCUS}</span>}>
      <p className="mb-3 text-sm text-muted">Pick two position groups to emphasize. Players there gain 1–3 extra points before the season, up to their potential.</p>
      <div className="flex flex-wrap gap-2">
        {Object.keys(D.FOCUS_GROUPS).map((g) => {
          const on = focus.includes(g);
          return (
            <button
              key={g}
              aria-pressed={on}
              disabled={!on && focus.length >= D.MAX_FOCUS}
              onClick={() => dispatch({ type: "offseason/focus", group: g })}
              className={cx(
                "font-display rounded-md border px-3 py-1.5 text-xs tracking-wider transition-colors disabled:opacity-40",
                on ? "border-accent bg-accent/15 text-accent-hi" : "border-line text-muted hover:text-text",
              )}
            >
              {on ? "✓ " : ""}
              {g}
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

/** This spring's draft class (seniors plus early entries), with projected rounds. */
export function DraftClass({ state }: { state: GameState }) {
  const pool = [...(state.offseason?.draftPool ?? [])].sort((a, b) => D.draftScore(b) - D.draftScore(a));
  const projected = pool.filter((p) => D.projectedRound(p) !== null);
  if (!pool.length) return null;
  return (
    <Panel kicker="NFL Draft · late April" title="Your draft class" bodyClassName="p-0">
      <p className="px-4 pt-3 text-sm text-muted">
        {projected.length} projected to be drafted. Players in the league help recruiting for the next two classes.
      </p>
      <ul className="divide-y divide-line/60">
        {pool.slice(0, 8).map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-4 py-2">
            <PlayerFace id={p.id} pos={p.pos} color={TEAMS[state.team].color} size={32} />
            <span className="min-w-0 flex-1 truncate text-sm">
              <span className="font-semibold">{p.name}</span> · {p.pos} · {p.ovr}
              {p.early && <span className="ml-1.5 text-xs text-gold">early entry</span>}
            </span>
            <span className="font-display text-xs tracking-wider text-muted">{D.roundLabel(D.projectedRound(p))}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** Draft results for the Stats page and season recap. */
export function DraftHistory({ state, limit = 12 }: { state: GameState; limit?: number }) {
  const picks = [...(state.draftHistory ?? [])].filter((d) => d.round !== null).sort((a, b) => b.season - a.season || (a.pick ?? 0) - (b.pick ?? 0));
  if (!picks.length) return null;
  return (
    <Panel kicker="NFL Draft" title="Players in the league" bodyClassName="p-0">
      <ul className="divide-y divide-line/60">
        {picks.slice(0, limit).map((d) => (
          <li key={`${d.season}-${d.playerId}`} className="flex items-center gap-3 px-4 py-2">
            <PlayerFace id={d.playerId} pos={d.pos} color={TEAMS[state.team].color} size={32} />
            <span className="min-w-0 flex-1 truncate text-sm">
              <span className="font-semibold">{d.name}</span> · {d.pos}
              {d.early && <span className="ml-1.5 text-xs text-gold">early entry</span>}
            </span>
            <span className="font-display tabular text-xs tracking-wider text-muted">
              {2026 + d.season} · Rd {d.round}, No. {d.pick}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
