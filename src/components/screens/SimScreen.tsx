"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FINAL_WEEK, FIRST_WEEK, SCOUTING, TEAMS, USER_TEAM, type TeamId } from "@/lib/game/data";
import type { DefensePlan, Drive, GameResult, OffensePlan, StatLine } from "@/lib/game/sim";
import { findPortalPlayer, playoffField, standingOf, userFixture, type GameState, type WeekRecap } from "@/lib/game/state";
import { pct } from "@/lib/format";
import { useGame } from "../GameProvider";
import { MatchupHero, useMatchup, type MatchupInfo } from "../Matchup";
import { Button, cx, PageHeader, Panel, Stat, Tag, TeamBadge } from "../ui";
import { UnitCard, unitEdges } from "../UnitMatchups";

export function SimScreen() {
  const { state } = useGame();
  const [viewWeek, setViewWeek] = useState<number | null>(null);
  const over = state.week > FINAL_WEEK;
  const latest = state.recaps[state.recaps.length - 1];
  const viewing = viewWeek !== null ? state.recaps.find((r) => r.week === viewWeek) : state.unseenRecap ? latest : undefined;

  return (
    <>
      <WeekStrip state={state} selected={viewing?.week ?? (over ? null : state.week)} onSelect={setViewWeek} />
      {viewing ? (
        <Recap recap={viewing} fresh={state.unseenRecap && viewing === latest} onBack={() => setViewWeek(null)} />
      ) : over ? (
        <SelectionDay state={state} />
      ) : (
        <GamePlan state={state} />
      )}
    </>
  );
}

// ---- Week strip -----------------------------------------------------------------

function WeekStrip({ state, selected, onSelect }: { state: GameState; selected: number | null; onSelect: (w: number | null) => void }) {
  const weeks = [];
  for (let w = FIRST_WEEK; w <= FINAL_WEEK; w++) weeks.push(w);
  return (
    <div className="scrollbar-none mb-5 flex gap-2 overflow-x-auto">
      {weeks.map((w) => {
        const f = userFixture(w)!;
        const opp = f.home === USER_TEAM ? f.away : f.home;
        const recap = state.recaps.find((r) => r.week === w);
        const result = recap ? outcome(recap.game) : null;
        const isCurrent = w === state.week;
        return (
          <button
            key={w}
            onClick={() => onSelect(recap ? w : null)}
            disabled={!recap && !isCurrent}
            className={cx(
              "flex shrink-0 items-center gap-2 rounded-md border px-3 py-1.5 transition-colors",
              selected === w ? "border-accent bg-accent/10" : "border-line bg-panel hover:border-line-2",
              !recap && !isCurrent && "opacity-60",
            )}
          >
            <span className="font-display text-xs tracking-widest text-muted">W{w}</span>
            <span className="font-display text-xs text-dim">{f.home === USER_TEAM ? "vs" : "@"}</span>
            <TeamBadge id={opp} size="sm" />
            {result && (
              <span className={cx("font-display tabular text-xs font-semibold", result.won ? "text-good" : "text-bad")}>
                {result.won ? "W" : "L"} {result.us}–{result.them}
              </span>
            )}
          </button>
        );
      })}
      <span
        className={cx(
          "font-display flex shrink-0 items-center rounded-md border px-3 py-1.5 text-xs tracking-widest",
          state.week > FINAL_WEEK ? "border-accent bg-accent/10 text-text" : "border-line text-dim",
        )}
      >
        Selection day
      </span>
    </div>
  );
}

function outcome(g: GameResult) {
  const home = g.home === USER_TEAM;
  const us = home ? g.homeScore : g.awayScore;
  const them = home ? g.awayScore : g.homeScore;
  return { won: us > them, us, them, opp: (home ? g.away : g.home) as TeamId };
}

// ---- Game plan ------------------------------------------------------------------

const OFFENSE: { id: OffensePlan; name: string; blurb: string; tag: string }[] = [
  { id: "ground", name: "Ground and pound", blurb: "Run first, shorten the game, protect the ball.", tag: "Fewer turnovers" },
  { id: "balanced", name: "Balanced", blurb: "Take what the defense gives you.", tag: "Steady" },
  { id: "air", name: "Air it out", blurb: "Spread them out and push the ball downfield.", tag: "Boom or bust" },
];

const DEFENSE: { id: DefensePlan; name: string; blurb: string; tag: string }[] = [
  { id: "pressure", name: "Bring pressure", blurb: "Blitz early and often. Force mistakes.", tag: "More takeaways" },
  { id: "base", name: "Base", blurb: "Play your scheme and tackle well.", tag: "Steady" },
  { id: "bend", name: "Bend, don't break", blurb: "Two deep safeties. Make them settle for field goals.", tag: "No big plays" },
];

function GamePlan({ state }: { state: GameState }) {
  const { dispatch } = useGame();
  const m = useMatchup(state);
  const [simming, setSimming] = useState(false);
  if (!m) return null;
  const scout = SCOUTING[m.them];
  const edges = unitEdges(m.us, m.them);
  const attack = edges.filter((e) => e.side === "attack");
  const stop = edges.filter((e) => e.side === "stop");

  const sim = () => {
    setSimming(true);
    setTimeout(() => {
      dispatch({ type: "sim/week" });
      setSimming(false);
      window.scrollTo({ top: 0 });
    }, 900);
  };

  return (
    <div className="pb-28">
      <PageHeader title="Game plan" sub={`Season 1 · Week ${state.week} · ${m.fixture.home === USER_TEAM ? "Home" : "Road"} game`} />
      <MatchupHero state={state} m={m} />

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Panel kicker="The plan" title="Keys to the game">
          <ol className="space-y-2.5">
            {scout?.keys.map((k, i) => (
              <li key={k} className="flex gap-3 rounded-md border border-line bg-bg-2/70 p-3">
                <span className="font-display flex size-6 shrink-0 items-center justify-center rounded bg-accent text-sm font-bold">{i + 1}</span>
                <p className="text-sm leading-6">{k}</p>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel kicker="Their sideline" title={`How ${TEAMS[m.them].name.split(" ").slice(-1)[0]} coach it`} right={<Tag tone="muted">{scout?.scheme}</Tag>}>
          <ul className="space-y-2">
            {scout?.notes.map((n) => (
              <li key={n} className="flex gap-2.5 rounded-md border border-line bg-bg-2/70 px-3 py-2 text-sm leading-6">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent-hi" />
                {n}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel kicker="Injury report" title="Availability">
          <div className="space-y-4">
            <div>
              <p className="font-display text-xs tracking-widest text-muted">{TEAMS[m.them].name}</p>
              <p className="mt-1 text-sm">Full strength.</p>
            </div>
            <div>
              <p className="font-display text-xs tracking-widest text-muted">{TEAMS[m.us].name}</p>
              <p className="mt-1 text-sm">
                <span className="font-semibold">RT Andre Marquez</span> (ankle) — limited this week. Game-time call.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Andre Marquez status">
                <Choice
                  active={state.plan.injury === "start"}
                  onClick={() => dispatch({ type: "plan/set", plan: { injury: "start" } })}
                  title="Start him"
                  blurb="Full-strength line. ~30% chance he re-injures it mid-game."
                />
                <Choice
                  active={state.plan.injury === "rest"}
                  onClick={() => dispatch({ type: "plan/set", plan: { injury: "rest" } })}
                  title="Rest him"
                  blurb="Backup Luke Ivers starts. Slightly weaker edge all game."
                />
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel kicker="Attack" title="Where we win" right={<PlanPicker options={OFFENSE} value={state.plan.offense} onChange={(offense) => dispatch({ type: "plan/set", plan: { offense } })} label="Offensive plan" />}>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {attack.map((e) => (
              <UnitCard key={e.label} e={e} us={m.us} them={m.them} />
            ))}
          </div>
        </Panel>
        <Panel kicker="Stop" title="Where they can hurt us" right={<PlanPicker options={DEFENSE} value={state.plan.defense} onChange={(defense) => dispatch({ type: "plan/set", plan: { defense } })} label="Defensive plan" />}>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {stop.map((e) => (
              <UnitCard key={e.label} e={e} us={m.us} them={m.them} />
            ))}
          </div>
          {scout && (
            <p className="mt-3 rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-sm">
              <span className="font-display mr-2 text-xs tracking-widest text-accent-hi">Biggest threat</span>
              {scout.threat}
            </p>
          )}
        </Panel>
      </div>

      <SimBar m={m} simming={simming} onSim={sim} />
    </div>
  );
}

function PlanPicker<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { id: T; name: string; blurb: string; tag: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <label className="font-display flex items-center gap-2 text-[10px] tracking-widest text-muted">
      <span className="hidden sm:inline">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="font-display rounded border border-line-2 bg-bg-2 px-2 py-1.5 text-xs tracking-wider text-text"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name} — {o.tag}
          </option>
        ))}
      </select>
    </label>
  );
}

function Choice({ active, onClick, title, blurb }: { active: boolean; onClick: () => void; title: string; blurb: string }) {
  return (
    <button
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cx(
        "rounded-md border p-2.5 text-left transition-colors",
        active ? "border-accent bg-accent/10" : "border-line bg-bg-2/70 hover:border-line-2",
      )}
    >
      <p className="font-display text-sm font-semibold">{title}</p>
      <p className="mt-0.5 text-xs leading-5 text-muted">{blurb}</p>
    </button>
  );
}

function SimBar({ m, simming, onSim }: { m: MatchupInfo; simming: boolean; onSim: () => void }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
        <TeamBadge id={m.us} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="font-display truncate text-sm font-semibold">
            {m.home ? "vs" : "at"} {TEAMS[m.them].name}
          </p>
          <p className="font-display tabular text-xs tracking-wider text-muted">
            Win <span className="text-accent-hi">{pct(m.winProb)}</span> with this plan · Playoff odds {pct(m.odds.win)} with a win, {pct(m.odds.loss)} with a loss
          </p>
        </div>
        <Button onClick={onSim} disabled={simming} className="px-6 py-3 text-base sm:px-10">
          {simming ? "Simulating…" : "Sim game"}
        </Button>
      </div>
    </div>
  );
}

// ---- Recap ------------------------------------------------------------------------

function Recap({ recap, fresh, onBack }: { recap: WeekRecap; fresh: boolean; onBack: () => void }) {
  const { dispatch } = useGame();
  const router = useRouter();
  const g = recap.game;
  const o = outcome(g);
  const moved = recap.rankBefore - recap.rankAfter;

  const finish = () => {
    if (fresh) dispatch({ type: "recap/seen" });
    onBack();
    if (fresh) router.push("/");
  };

  return (
    <div>
      <PageHeader
        title={o.won ? "Victory" : "Defeat"}
        sub={`Season 1 · Week ${recap.week} · Final${g.overtime ? " / OT" : ""}`}
        right={<Button onClick={finish}>{fresh ? "Continue" : "Back to game plan"}</Button>}
      />

      <Scoreboard g={g} />

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Panel kicker="How it happened" title="Scoring summary" className="lg:col-span-2">
          <ScoringSummary drives={g.drives} g={g} />
        </Panel>
        <div className="space-y-5">
          <Panel kicker="Committee" title="Rankings impact">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Before" value={`#${recap.rankBefore}`} />
              <Stat label="After" value={`#${recap.rankAfter}`} tone={moved > 0 ? "good" : moved < 0 ? "bad" : undefined} />
              <Stat label="Move" value={moved === 0 ? "—" : moved > 0 ? `▲${moved}` : `▼${-moved}`} tone={moved > 0 ? "good" : moved < 0 ? "bad" : undefined} />
            </div>
            <p className="mt-3 text-sm text-muted">
              {recap.rankAfter <= 12 ? "Inside the 12-team field." : `${recap.rankAfter - 12} spot${recap.rankAfter - 12 === 1 ? "" : "s"} outside the field.`}{" "}
              <Link href="/rankings" className="text-accent-hi hover:underline">
                Full rankings
              </Link>
            </p>
          </Panel>
          {(g.notes.length > 0 || recap.bidUpdates.length > 0) && (
            <Panel kicker="Front office" title="Notes">
              <ul className="space-y-2 text-sm">
                {g.notes.map((n) => (
                  <li key={n} className="flex gap-2">
                    <Tag tone="gold">Injury</Tag>
                    <span>{n}</span>
                  </li>
                ))}
                {recap.bidUpdates.map((u) => (
                  <li key={u.playerId} className="flex gap-2">
                    <Tag tone={u.status === "signed" ? "good" : "muted"}>Portal</Tag>
                    <span>
                      {findPortalPlayer(u.playerId)!.name} {u.status === "signed" ? "signed with the Stallions." : "went elsewhere. NIL and scholarship returned."}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Panel kicker="Box score" title="Top performers" className="lg:col-span-2">
          <Performers g={g} />
        </Panel>
        <Panel kicker="Tale of the tape" title="Team stats">
          <TeamStats g={g} />
        </Panel>
      </div>

      <Panel kicker={`Week ${recap.week}`} title="Around the league" className="mt-5">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {recap.others.map((r) => {
            const homeWon = r.homeScore > r.awayScore;
            return (
              <div key={r.home} className="rounded-md border border-line bg-bg-2/70 px-3 py-2">
                {(
                  [
                    [r.away, r.awayScore, !homeWon],
                    [r.home, r.homeScore, homeWon],
                  ] as const
                ).map(([id, pts, won]) => (
                  <div key={id} className="flex items-center gap-2 py-0.5">
                    <TeamBadge id={id} size="sm" />
                    <span className={cx("flex-1 truncate text-sm", won ? "font-semibold" : "text-muted")}>
                      {TEAMS[id].name}
                    </span>
                    <span className={cx("font-display tabular text-lg", won ? "font-bold" : "text-muted")}>{pts}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

function Scoreboard({ g }: { g: GameResult }) {
  const rows = [
    { id: g.away, t: g.totals.away, pts: g.awayScore },
    { id: g.home, t: g.totals.home, pts: g.homeScore },
  ];
  const ot = (t: { points: number; quarters: number[] }) => t.points - t.quarters.reduce((a, b) => a + b, 0);
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-gradient-to-br from-panel-2 to-bg-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px]">
          <thead>
            <tr className="font-display border-b border-line text-xs tracking-widest text-muted">
              <th className="px-4 py-2 text-left font-normal">Final{g.overtime ? " / OT" : ""}</th>
              {["1", "2", "3", "4", ...(g.overtime ? ["OT"] : [])].map((q) => (
                <th key={q} className="w-12 py-2 font-normal">
                  {q}
                </th>
              ))}
              <th className="w-20 py-2 pr-4 text-right font-normal">T</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const won = r.pts === Math.max(g.homeScore, g.awayScore);
              return (
                <tr key={r.id} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <TeamBadge id={r.id} />
                      <span className={cx("font-display text-lg sm:text-xl", won ? "font-bold" : "text-muted")}>
                        {TEAMS[r.id].name}
                        {r.id === USER_TEAM && <span className="ml-2 text-xs text-accent-hi">You</span>}
                      </span>
                    </div>
                  </td>
                  {r.t.quarters.map((q, i) => (
                    <td key={i} className="font-display tabular text-center text-lg text-muted">
                      {q}
                    </td>
                  ))}
                  {g.overtime && <td className="font-display tabular text-center text-lg text-muted">{ot(r.t)}</td>}
                  <td className={cx("font-display tabular pr-4 text-right text-4xl", won ? "font-bold text-text" : "text-muted")}>{r.pts}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScoringSummary({ drives, g }: { drives: Drive[]; g: GameResult }) {
  const scoring = drives.filter((d) => d.result === "TD" || d.result === "FG" || d.result === "INT" || d.result === "FUM");
  const quarters = [...new Set(scoring.map((d) => d.quarter))];
  return (
    <div className="space-y-4">
      {quarters.map((q) => (
        <div key={q}>
          <p className="font-display mb-1.5 text-xs tracking-widest text-muted">{q === 5 ? "Overtime" : `${["1st", "2nd", "3rd", "4th"][q - 1]} quarter`}</p>
          <ul className="divide-y divide-line/60 rounded-md border border-line bg-bg-2/70">
            {scoring
              .filter((d) => d.quarter === q)
              .map((d, i) => {
                const score = d.result === "TD" || d.result === "FG";
                return (
                  <li key={i} className="flex items-center gap-3 px-3 py-2">
                    <TeamBadge id={d.team} size="sm" />
                    <Tag tone={!score ? "gold" : d.team === USER_TEAM ? "accent" : "muted"}>{d.result === "FUM" ? "TO" : d.result}</Tag>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{d.text}</p>
                      <p className="text-xs text-dim">
                        {d.plays} plays, {Math.max(0, d.yards)} yds
                      </p>
                    </div>
                    {score && (
                      <span className="font-display tabular text-sm text-muted">
                        {TEAMS[g.away].short} {d.awayScore} – {d.homeScore} {TEAMS[g.home].short}
                      </span>
                    )}
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Performers({ g }: { g: GameResult }) {
  const by = (team: TeamId, key: keyof StatLine) =>
    g.stats.filter((s) => s.team === team && (s[key] as number | undefined) !== undefined).sort((a, b) => ((b[key] as number) ?? 0) - ((a[key] as number) ?? 0))[0];
  const opp = g.home === USER_TEAM ? g.away : g.home;
  const cards = [
    { label: "Passing", s: by(USER_TEAM, "passYds"), line: (s: StatLine) => `${s.cmp}/${s.att}, ${s.passYds} yds, ${s.passTd ?? 0} TD, ${s.int ?? 0} INT` },
    { label: "Rushing", s: by(USER_TEAM, "rushYds"), line: (s: StatLine) => `${s.car} car, ${s.rushYds} yds, ${s.rushTd ?? 0} TD` },
    { label: "Receiving", s: by(USER_TEAM, "recYds"), line: (s: StatLine) => `${s.rec} rec, ${s.recYds} yds, ${s.recTd ?? 0} TD` },
    {
      label: "Defense",
      s: g.stats.filter((s) => s.team === USER_TEAM && (s.sacks || s.takeaways)).sort((a, b) => (b.sacks ?? 0) + (b.takeaways ?? 0) * 2 - (a.sacks ?? 0) - (a.takeaways ?? 0) * 2)[0],
      line: (s: StatLine) => [s.sacks && `${s.sacks} sack${s.sacks > 1 ? "s" : ""}`, s.takeaways && `${s.takeaways} takeaway${s.takeaways > 1 ? "s" : ""}`].filter(Boolean).join(", "),
    },
    { label: "Their passer", s: by(opp, "passYds"), line: (s: StatLine) => `${s.cmp}/${s.att}, ${s.passYds} yds, ${s.passTd ?? 0} TD, ${s.int ?? 0} INT` },
    { label: "Their top target", s: by(opp, "recYds"), line: (s: StatLine) => `${s.rec} rec, ${s.recYds} yds, ${s.recTd ?? 0} TD` },
  ];
  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      {cards.map(
        (c) =>
          c.s && (
            <div key={c.label} className="flex items-center gap-3 rounded-md border border-line bg-bg-2/70 p-3">
              <TeamBadge id={c.s.team} size="md" />
              <div className="min-w-0">
                <p className="font-display text-[10px] tracking-widest text-accent-hi">{c.label}</p>
                <p className="truncate font-semibold">
                  {c.s.name} <span className="font-display text-xs text-muted">{c.s.pos}</span>
                </p>
                <p className="tabular text-sm text-muted">{c.line(c.s)}</p>
              </div>
            </div>
          ),
      )}
    </div>
  );
}

function TeamStats({ g }: { g: GameResult }) {
  const rows: [string, number, number, boolean?][] = [
    ["Passing yds", g.totals.away.passYds, g.totals.home.passYds],
    ["Rushing yds", g.totals.away.rushYds, g.totals.home.rushYds],
    ["Total yds", g.totals.away.passYds + g.totals.away.rushYds, g.totals.home.passYds + g.totals.home.rushYds],
    ["Turnovers", g.totals.away.turnovers, g.totals.home.turnovers, true],
  ];
  return (
    <div>
      <div className="mb-2 flex justify-between">
        <TeamBadge id={g.away} size="sm" />
        <TeamBadge id={g.home} size="sm" />
      </div>
      <ul className="space-y-3">
        {rows.map(([label, a, h, lowerIsBetter]) => {
          const total = Math.max(1, a + h);
          const aBetter = lowerIsBetter ? a < h : a > h;
          const hBetter = lowerIsBetter ? h < a : h > a;
          return (
            <li key={label}>
              <div className="font-display tabular flex justify-between text-sm">
                <span className={aBetter ? "font-bold" : "text-muted"}>{a}</span>
                <span className="text-[10px] tracking-widest text-muted">{label}</span>
                <span className={hBetter ? "font-bold" : "text-muted"}>{h}</span>
              </div>
              <div className="mt-1 flex h-1.5 gap-0.5 overflow-hidden rounded-full">
                <div style={{ width: `${(a / total) * 100}%`, background: g.away === USER_TEAM ? "var(--accent)" : "#56607d" }} />
                <div style={{ width: `${(h / total) * 100}%`, background: g.home === USER_TEAM ? "var(--accent)" : "#56607d" }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---- Selection day ------------------------------------------------------------------

function SelectionDay({ state }: { state: GameState }) {
  const field = playoffField(state);
  const me = standingOf(state, USER_TEAM)!;
  const seed = field.find((t) => t.id === USER_TEAM)?.seed;
  const firstRound = [
    [5, 12],
    [6, 11],
    [7, 10],
    [8, 9],
  ];
  return (
    <div>
      <PageHeader title="Selection day" sub="Season 1 · The 12-team field is set" />
      <div
        className={cx(
          "rounded-lg border p-5 sm:p-8",
          seed ? "border-good/40 bg-gradient-to-br from-good/15 to-panel" : "border-accent/40 bg-gradient-to-br from-accent/15 to-panel",
        )}
      >
        <div className="flex items-center gap-4">
          <TeamBadge id={USER_TEAM} size="xl" />
          <div>
            <p className="font-display text-xs tracking-[0.2em] text-muted">
              {me.wins}–{me.losses} · Final ranking #{me.rank}
            </p>
            <p className="font-display text-3xl leading-tight font-bold sm:text-5xl">{seed ? `You're in — No. ${seed} seed` : "Left out of the field"}</p>
            <p className="mt-1 text-muted">
              {seed
                ? seed <= 4
                  ? "First-round bye. Rest up — the quarterfinal comes to you."
                  : `First round: ${seed <= 8 ? "hosting" : "at"} No. ${17 - seed} ${TEAMS[field[16 - seed].id].name}.`
                : `${me.rank - 12} spot${me.rank - 12 === 1 ? "" : "s"} short. The committee went with ${TEAMS[field[11].id].name} for the last at-large.`}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel kicker="The bracket" title="First round">
          <ul className="space-y-2">
            {firstRound.map(([a, b]) => (
              <li key={a} className="flex items-center gap-2 rounded-md border border-line bg-bg-2/70 px-3 py-2">
                {[a, b].map((s, i) => {
                  const t = field[s - 1];
                  return (
                    <div key={s} className={cx("flex flex-1 items-center gap-2", i === 1 && "flex-row-reverse text-right")}>
                      <span className="font-display tabular w-5 text-sm text-dim">{s}</span>
                      <TeamBadge id={t.id} size="sm" />
                      <span className={cx("truncate text-sm", t.id === USER_TEAM && "font-bold text-accent-hi")}>{TEAMS[t.id].name}</span>
                    </div>
                  );
                })}
              </li>
            ))}
          </ul>
        </Panel>
        <Panel kicker="Seeds 1–4" title="First-round byes">
          <ul className="space-y-2">
            {field.slice(0, 4).map((t) => (
              <li key={t.id} className="flex items-center gap-3 rounded-md border border-line bg-bg-2/70 px-3 py-2">
                <span className="font-display tabular w-5 text-lg font-bold text-accent-hi">{t.seed}</span>
                <TeamBadge id={t.id} size="sm" />
                <span className={cx("flex-1 truncate", t.id === USER_TEAM && "font-bold text-accent-hi")}>{TEAMS[t.id].name}</span>
                <span className="font-display tabular text-sm text-muted">
                  {t.wins}–{t.losses}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted">The playoff itself is coming in a later update. For now, start a new season from the footer to replay the run-in.</p>
        </Panel>
      </div>
    </div>
  );
}
