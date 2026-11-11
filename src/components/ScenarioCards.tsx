"use client";

import { FINAL_WEEK } from "@/lib/game/data";
import type { GameState } from "@/lib/game/state";
import { useGame } from "./GameProvider";
import { cx, Panel, Tag } from "./ui";

const KIND_LABEL = { flip: "Recruiting", booster: "Collective", discipline: "Discipline", playingTime: "Roster", visit: "Recruiting" } as const;

/** Open in-season scenarios, each with its choices and deadline. */
export function ScenarioCards({ state, compact }: { state: GameState; compact?: boolean }) {
  const { dispatch } = useGame();
  const open = state.scenarios.open;
  if (!open.length) return null;
  return (
    <Panel kicker={`${open.length} open`} title="This week's decisions" className={cx("border-gold/50", compact ? "mb-5" : "")}>
      <ul className="space-y-4">
        {open.map((sc) => (
          <li key={sc.id}>
            <div className="flex flex-wrap items-center gap-2">
              <Tag tone="gold">{KIND_LABEL[sc.kind]}</Tag>
              <p className="font-display text-lg font-semibold">{sc.title}</p>
              <span className="font-display ml-auto text-[10px] tracking-widest text-muted">
                {sc.deadline >= FINAL_WEEK && sc.deadline > state.week ? "Decide before Early Signing Day" : "Decide before this week's game"} · default: {sc.options.find((o) => o.id === sc.defaultOption)?.label}
              </span>
            </div>
            <p className="mt-1 text-sm leading-6 text-muted">{sc.body}</p>
            <div className={cx("mt-2 grid gap-2", sc.options.length > 2 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
              {sc.options.map((o) => (
                <button
                  key={o.id}
                  onClick={() => dispatch({ type: "scenario/choose", id: sc.id, option: o.id })}
                  className="rounded-md border border-line-2 bg-bg-2/70 p-3 text-left transition-colors hover:border-accent hover:bg-accent/10"
                >
                  <p className="font-display font-semibold">{o.label}</p>
                  <p className="mt-0.5 text-xs leading-5 text-muted">{o.detail}</p>
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
