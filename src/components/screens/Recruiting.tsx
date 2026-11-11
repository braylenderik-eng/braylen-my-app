"use client";

import { keyDates } from "@/lib/game/state";
import { money } from "@/lib/format";
import { ScenarioCards } from "../ScenarioCards";
import { useGame } from "../GameProvider";
import { PageHeader, Panel } from "../ui";
import { RecruitingBoard } from "./RecruitingBoard";

export function Recruiting() {
  const { state } = useGame();
  const enrolling = state.offseason ? state.lastOffseason?.enrolled ?? [] : [];

  return (
    <>
      <PageHeader
        title="Recruiting"
        sub={
          state.offseason
            ? `Offseason · the Class of Season ${state.season + 1} is enrolling`
            : `Season ${state.season} · Early Signing Day ${keyDates(state.season).signingDay}`
        }
      />

      {state.offseason ? (
        <Panel kicker={`Class of Season ${state.season + 1}`} title="Enrolling now">
          {enrolling.length ? (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {enrolling.map((p) => (
                <li key={p.id} className="flex items-center gap-3 rounded-md border border-line bg-bg-2/70 px-3 py-2">
                  <span className="font-display tabular w-8 text-lg font-bold">{p.ovr}</span>
                  <span className="flex-1 text-sm">
                    <span className="font-semibold">{p.name}</span>
                    <span className="block text-xs text-muted">
                      {p.pos} · {money(p.nil)} · {p.hometown}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nobody signed in December. Walk-ons will fill any position that&apos;s still short when the season starts.</p>
          )}
          <p className="mt-4 text-sm text-muted">
            The board for next year&apos;s class opens with the new season. Until then, the January transfer window is where you can add players.
          </p>
        </Panel>
      ) : state.recruiting ? (
        <>
          {state.scenarios.open.some((x) => x.kind === "flip" || x.kind === "visit") && <ScenarioCards state={state} compact />}
          <RecruitingBoard state={state} />
        </>
      ) : null}
    </>
  );
}
