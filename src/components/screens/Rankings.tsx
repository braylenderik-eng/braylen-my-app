"use client";

import { useMemo } from "react";
import { TEAMS, isPowerConf } from "@/lib/game/data";
import { playoffFormat, playoffOdds, regularSeasonOver, scheduleFixture, selectField, standingOf } from "@/lib/game/state";
import { pct, signed } from "@/lib/format";
import { useGame } from "../GameProvider";
import { cx, PageHeader, Panel, Stat, Tag, TeamBadge } from "../ui";

export function Rankings() {
  const { state } = useGame();
  const me = standingOf(state, state.team)!;
  const over = regularSeasonOver(state);
  const fmt = playoffFormat(state.season);
  const odds = useMemo(() => playoffOdds(state), [state]);
  const next = scheduleFixture(state, state.week);
  const opp = next ? (next.home === state.team ? next.away : next.home) : null;

  // The field as it would be picked today (or the actual field once it's set).
  const field = state.playoff ?? selectField(state.standings, state.season);
  const seedOf = new Map(field.seeds.map((id, i) => [id, i + 1]));
  const auto = new Set(field.autoBids ?? []);
  const rows = state.standings.filter((t) => t.rank <= 25 || t.id === state.team || seedOf.has(t.id));
  const mySeed = seedOf.get(state.team);

  return (
    <>
      <PageHeader title="Committee rankings" sub={`${fmt.size}-team field · ${over ? "Final" : `Week ${state.week}`} · Season ${state.season}`} />

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <Stat label="Your rank" value={`#${me.rank}`} tone={mySeed ? "good" : "bad"} />
        <Stat label="Record" value={`${me.wins}–${me.losses}`} />
        <Stat label="Playoff odds" value={pct(odds)} tone="gold" />
        <Stat label={over ? "Seed" : "Proj seed"} value={mySeed ? `${mySeed} / ${fmt.size}` : "Out"} />
      </div>

      <p className="mb-4 text-sm text-muted">
        {fmt.size === 12
          ? "12-team field: the five highest-ranked conference champions get automatic bids, plus seven at-large. Seeds 1–4 get byes."
          : "24-team field: the four Power conference champions and the top team from the other conferences get automatic bids, plus 19 at-large. Seeds 1–8 get byes; the first two rounds are on campus."}{" "}
        A conference champion is its best-record team.
      </p>

      <Panel kicker={`Top 25${rows.length > 25 ? " + projected field" : ""}`} title="National rankings" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="font-display border-b border-line text-[10px] tracking-widest text-muted">
                <th className="w-12 px-4 py-2 text-left font-normal">#</th>
                <th className="py-2 text-left font-normal">Team</th>
                <th className="px-3 py-2 text-right font-normal">Rec</th>
                <th className="px-3 py-2 text-right font-normal">SOS</th>
                <th className="px-3 py-2 text-right font-normal">{over ? "Seed" : "Proj"}</th>
                <th className="px-4 py-2 text-right font-normal">Chg</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const chg = t.prevRank - t.rank;
                const seed = seedOf.get(t.id);
                const status = t.id === state.team ? "You" : t.id === opp ? "Your next opp" : null;
                return (
                  <tr key={t.id} className={cx("border-b border-line/60 last:border-0", t.id === state.team && "bg-accent/10", !seed && "opacity-70")}>
                    <td className={cx("font-display tabular px-4 py-2.5 text-lg font-bold", seed && seed <= fmt.byes ? "text-gold" : seed ? "text-text" : "text-dim")}>{t.rank}</td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-3">
                        <TeamBadge id={t.id} size="sm" />
                        <div className="min-w-0">
                          <p className={cx("truncate font-semibold", t.id === state.team && "text-accent-hi")}>
                            {TEAMS[t.id].name}
                            {auto.has(t.id) && <span className="font-display ml-1.5 text-[10px] tracking-widest text-gold" title="Automatic bid">AQ</span>}
                          </p>
                          <p className="text-xs text-muted">
                            {TEAMS[t.id].conf}
                            {!isPowerConf(TEAMS[t.id].conf) && " (non-Power)"}
                            {status && (
                              <>
                                {" · "}
                                <span className={t.id === state.team ? "text-accent-hi" : ""}>{status}</span>
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
                    <td className="font-display tabular px-3 text-right">{seed ?? "—"}</td>
                    <td className={cx("font-display tabular px-4 text-right", chg > 0 ? "text-good" : chg < 0 ? "text-bad" : "text-dim")}>{signed(chg)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3 text-xs text-muted">
          <Tag tone="gold">1–{fmt.byes}</Tag> bye <Tag tone="muted">{fmt.byes + 1}–{fmt.size}</Tag> first round · <span className="text-gold">AQ</span> automatic bid ·
          faded rows are outside the field
        </p>
      </Panel>
    </>
  );
}
