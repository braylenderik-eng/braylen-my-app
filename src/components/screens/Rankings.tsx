"use client";

import { BYE_SEEDS, FINAL_WEEK, PLAYOFF_FIELD, TEAMS, USER_TEAM } from "@/lib/game/data";
import { playoffOdds, standingOf, userFixture } from "@/lib/game/state";
import { pct, signed } from "@/lib/format";
import { useMemo } from "react";
import { useGame } from "../GameProvider";
import { cx, PageHeader, Panel, Stat, Tag, TeamBadge } from "../ui";

export function Rankings() {
  const { state } = useGame();
  const me = standingOf(state, USER_TEAM)!;
  const over = state.week > FINAL_WEEK;
  const odds = useMemo(() => playoffOdds(state), [state]);
  const next = userFixture(state.week);
  const opp = next ? (next.home === USER_TEAM ? next.away : next.home) : null;

  return (
    <>
      <PageHeader title="Committee rankings" sub={`12-team field · ${over ? "Final" : `Week ${state.week}`}`} />

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <Stat label="Your rank" value={`#${me.rank}`} tone={me.rank <= PLAYOFF_FIELD ? "good" : "bad"} />
        <Stat label="Record" value={`${me.wins}–${me.losses}`} />
        <Stat label="Playoff odds" value={pct(odds)} tone="gold" />
        <Stat label="Proj seed" value={me.rank <= PLAYOFF_FIELD ? `${me.rank} / 12` : "Out"} />
      </div>

      <Panel kicker={`Seeds 1–${BYE_SEEDS} get byes`} title="National rankings" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="font-display border-b border-line text-[10px] tracking-widest text-muted">
                <th className="w-12 px-4 py-2 text-left font-normal">#</th>
                <th className="py-2 text-left font-normal">Team</th>
                <th className="px-3 py-2 text-right font-normal">Rec</th>
                <th className="px-3 py-2 text-right font-normal">SOS</th>
                <th className="px-4 py-2 text-right font-normal">Chg</th>
              </tr>
            </thead>
            <tbody>
              {state.standings.map((t) => {
                const chg = t.prevRank - t.rank;
                const status =
                  t.id === USER_TEAM ? "You" : t.rank === PLAYOFF_FIELD ? "Last at-large" : t.rank === PLAYOFF_FIELD + 1 ? "First team out" : t.id === opp ? "Your next opp" : null;
                return (
                  <tr
                    key={t.id}
                    className={cx(
                      "border-b border-line/60 last:border-0",
                      t.id === USER_TEAM && "bg-accent/10",
                      t.rank === PLAYOFF_FIELD && "border-b-2 border-b-accent/60",
                    )}
                  >
                    <td className={cx("font-display tabular px-4 py-2.5 text-lg font-bold", t.rank <= BYE_SEEDS ? "text-gold" : t.rank <= PLAYOFF_FIELD ? "text-text" : "text-dim")}>
                      {t.rank}
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-3">
                        <TeamBadge id={t.id} size="sm" />
                        <div className="min-w-0">
                          <p className={cx("truncate font-semibold", t.id === USER_TEAM && "text-accent-hi")}>{TEAMS[t.id].name}</p>
                          <p className="text-xs text-muted">
                            {TEAMS[t.id].conf}
                            {status && (
                              <>
                                {" · "}
                                <span className={t.id === USER_TEAM ? "text-accent-hi" : ""}>{status}</span>
                              </>
                            )}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="font-display tabular px-3 text-right">
                      {t.wins}–{t.losses}
                    </td>
                    <td className="font-display tabular px-3 text-right text-muted">{t.sos.toFixed(3).replace(/^0/, "")}</td>
                    <td className={cx("font-display tabular px-4 text-right", chg > 0 ? "text-good" : chg < 0 ? "text-bad" : "text-dim")}>{signed(chg)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="flex items-center gap-2 border-t border-line px-4 py-3 text-xs text-muted">
          <Tag tone="gold">1–4</Tag> bye <Tag tone="muted">5–12</Tag> first round · the red line is the cut
        </p>
      </Panel>
    </>
  );
}
