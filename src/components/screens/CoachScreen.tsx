"use client";

import { TEAMS } from "@/lib/game/data";
import { careerTotals } from "@/lib/game/career";
import { DEFENSE_STYLES, OFFENSE_STYLES } from "@/lib/game/program";
import { useGame } from "../GameProvider";
import { SecurityMeter } from "../Career";
import { ButtonLink, cx, PageHeader, Panel, Stat, TeamBadge } from "../ui";

/** The coach's résumé: career record, every stop, and every season against expectations. */
export function CoachScreen() {
  const { state } = useGame();
  const { coach, career } = state;
  if (!coach || !career) {
    return (
      <>
        <PageHeader title="Coach" sub="Quick start" />
        <Panel title="No coaching career in the quick start">
          <p className="text-sm text-muted">Start a new dynasty to name your coach, pick your schemes and build a career.</p>
          <ButtonLink href="/new" className="mt-3">
            New dynasty
          </ButtonLink>
        </Panel>
      </>
    );
  }
  const t = careerTotals(career);
  const pct = t.wins + t.losses ? Math.round((t.wins / (t.wins + t.losses)) * 1000) / 10 : 0;
  return (
    <>
      <PageHeader
        title={coach.name}
        sub={`Head coach · ${career.status === "over" ? "Retired" : TEAMS[state.team].name}${coach.almaMater ? ` · ${coach.almaMater} alum` : ""}`}
      />
      <div className="grid gap-5 lg:grid-cols-12">
        <Panel kicker="Career" title="Résumé" className="lg:col-span-8">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Stat label="Record" value={`${t.wins}–${t.losses}`} />
            <Stat label="Win %" value={`${pct}%`} />
            <Stat label="Playoffs" value={t.playoffs} />
            <Stat label="Titles" value={t.titles} tone="gold" />
            <Stat label="Programs" value={career.stints.length} />
          </div>
          <h3 className="font-display mt-5 mb-2 text-xs tracking-widest text-muted">Stops</h3>
          <ul className="space-y-2">
            {[...career.stints].reverse().map((s) => (
              <li key={`${s.team}-${s.from}`} className="flex items-center gap-3 rounded-md border border-line bg-bg-2/70 p-3">
                <TeamBadge id={s.team} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{TEAMS[s.team].name}</p>
                  <p className="font-display text-[11px] tracking-wider text-muted">
                    Season {s.from}
                    {s.to === null ? "–present" : s.to > s.from ? `–${s.to}` : ""}
                  </p>
                </div>
                <div className="font-display tabular text-right text-sm">
                  <p>
                    {s.wins}–{s.losses}
                  </p>
                  <p className="text-[11px] tracking-wider text-muted">
                    {s.playoffs} playoff{s.playoffs === 1 ? "" : "s"}
                    {s.titles ? ` · ${s.titles} title${s.titles === 1 ? "" : "s"}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
        <div className="space-y-5 lg:col-span-4">
          <Panel kicker="Now" title="Standing">
            {career.status === "over" ? <p className="text-sm text-muted">Out of coaching.</p> : <SecurityMeter value={career.security} />}
            <p className="mt-3 text-sm text-muted">
              Each season moves it: exceeding your win target +20, meeting it +10, falling short −15, the hot seat −35; a playoff trip +5, a
              title +30. At zero, you&apos;re fired.
            </p>
          </Panel>
          <Panel kicker="Identity" title="Schemes">
            <p className="text-sm">
              <span className="text-muted">Offense:</span> {OFFENSE_STYLES[coach.offense].name}
            </p>
            <p className="text-sm">
              <span className="text-muted">Defense:</span> {DEFENSE_STYLES[coach.defense].name}
            </p>
          </Panel>
        </div>
        <Panel kicker="Season by season" title="Against expectations" className="lg:col-span-12" bodyClassName="p-0">
          {state.history.length === 0 ? (
            <p className="p-4 text-sm text-muted">Your first season is under way.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="font-display border-b border-line text-left text-[10px] tracking-widest text-muted">
                  <th className="px-4 py-2">Season</th>
                  <th className="px-2 py-2">Program</th>
                  <th className="px-2 py-2">Record</th>
                  <th className="px-2 py-2">Target</th>
                  <th className="px-2 py-2">Verdict</th>
                  <th className="hidden px-4 py-2 sm:table-cell">Finish</th>
                </tr>
              </thead>
              <tbody>
                {[...state.history].reverse().map((h) => (
                  <tr key={h.season} className="border-b border-line/60 last:border-0">
                    <td className="font-display px-4 py-2">{h.season}</td>
                    <td className="px-2 py-2">{TEAMS[h.team ?? state.team].name}</td>
                    <td className="font-display tabular px-2 py-2">
                      {h.wins}–{h.losses}
                    </td>
                    <td className="font-display tabular px-2 py-2">{h.target ?? "—"}</td>
                    <td className={cx("px-2 py-2", h.expectation === "Hot seat" ? "text-bad" : h.expectation === "Fell short" ? "text-dim" : "text-good")}>
                      {h.expectation ?? "—"}
                    </td>
                    <td className="hidden px-4 py-2 text-muted sm:table-cell">{h.finish}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </>
  );
}
