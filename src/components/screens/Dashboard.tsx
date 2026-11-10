"use client";

import Link from "next/link";
import { useMemo } from "react";
import { FINAL_WEEK, SCHEDULE, TEAMS, USER_TEAM } from "@/lib/game/data";
import { winProbability } from "@/lib/game/sim";
import { playoffField, standingOf, type GameState } from "@/lib/game/state";
import { money, pct, spreadFor } from "@/lib/format";
import { useGame } from "../GameProvider";
import { MatchupHero, useMatchup } from "../Matchup";
import { ButtonLink, cx, PageHeader, Panel, Stat, Tag, TeamBadge } from "../ui";
import { UnitCard, unitEdges } from "../UnitMatchups";

export function Dashboard() {
  const { state } = useGame();
  const over = state.week > FINAL_WEEK;
  const last = state.recaps[state.recaps.length - 1];

  return (
    <>
      <PageHeader
        title={over ? "Season wrap" : "Weekly preview"}
        sub={over ? "Season 1 · Selection day" : `Season 1 · Week ${state.week} · The week ahead`}
        right={
          !over && (
            <ButtonLink href="/sim">Game plan & sim</ButtonLink>
          )
        }
      />

      {last && state.unseenRecap && <LastResultBanner state={state} />}
      {state.rook.decision === null && (
        <Link
          href="/recruiting"
          className="mb-5 flex items-center gap-3 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 transition-colors hover:bg-accent/15"
        >
          <Tag>Urgent</Tag>
          <p className="flex-1 text-sm">
            <span className="font-semibold">Jalen Rook:</span> “$1.1M or I enter the portal Friday.” He wants an answer tonight.
          </p>
          <span className="font-display text-sm tracking-wider text-accent-hi">Respond →</span>
        </Link>
      )}

      {over ? <SeasonWrap state={state} /> : <Preview state={state} />}
    </>
  );
}

function LastResultBanner({ state }: { state: GameState }) {
  const r = state.recaps[state.recaps.length - 1];
  const home = r.game.home === USER_TEAM;
  const us = home ? r.game.homeScore : r.game.awayScore;
  const them = home ? r.game.awayScore : r.game.homeScore;
  const opp = home ? r.game.away : r.game.home;
  return (
    <Link
      href="/sim"
      className="mb-5 flex items-center gap-3 rounded-lg border border-line-2 bg-panel-2 px-4 py-3 transition-colors hover:border-accent"
    >
      <Tag tone={us > them ? "good" : "accent"}>{us > them ? "Final · W" : "Final · L"}</Tag>
      <p className="font-display tabular flex-1 text-sm tracking-wide">
        Week {r.week}: Stallions {us}, {TEAMS[opp].name} {them}
      </p>
      <span className="font-display text-sm tracking-wider text-accent-hi">Recap →</span>
    </Link>
  );
}

function Preview({ state }: { state: GameState }) {
  const m = useMatchup(state);
  const others = useMemo(
    () =>
      (SCHEDULE[state.week] ?? [])
        .filter((f) => f.home !== USER_TEAM && f.away !== USER_TEAM)
        .map((f) => ({ ...f, p: winProbability(f.home, f.away, f.home, {}, 250) })),
    [state.week],
  );
  if (!m) return null;
  const me = standingOf(state, USER_TEAM)!;
  const edges = unitEdges(m.us, m.them).slice(0, 6);
  const upsets = others.filter((g) => g.p > 0.35 && g.p < 0.65);
  const ranked = others.filter((g) => TEAMS[g.home].ranked && TEAMS[g.away].ranked);

  return (
    <div className="grid gap-5 lg:grid-cols-12">
      <div className="lg:col-span-12">
        <p className="font-display mb-2 text-xs tracking-[0.2em] text-accent-hi">Game of the week</p>
        <MatchupHero state={state} m={m} />
      </div>

      <Panel kicker="This week" title="Position matchups" className="lg:col-span-8">
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {edges.map((e) => (
            <UnitCard key={e.label} e={e} us={m.us} them={m.them} />
          ))}
        </div>
      </Panel>

      <Panel kicker="Bubble watch" title="Playoff chances" className="lg:col-span-4">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Now" value={pct(m.odds.now)} />
          <Stat label="With win" value={pct(m.odds.win)} tone="good" />
          <Stat label="With loss" value={pct(m.odds.loss)} tone="bad" />
        </div>
        <div className="mt-4 space-y-2 text-sm">
          <Row label="Committee rank" value={`#${me.rank} · ${me.rank <= 12 ? "in the field" : "outside"}`} />
          <Row label="Record" value={`${me.wins}–${me.losses}`} />
          <Row label="Strength of schedule" value={me.sos.toFixed(3).replace(/^0/, "")} />
          <Row label="NIL budget" value={money(state.nilBudget)} />
          <Row label="Scholarships open" value={String(state.scholarships)} />
        </div>
      </Panel>

      <Panel kicker="Coin flips" title="Upset alert" className="lg:col-span-4">
        <GameList games={upsets.length ? upsets : others.slice(0, 4)} />
      </Panel>

      <Panel kicker="Ranked vs ranked" title="Top matchups" className="lg:col-span-4">
        <GameList games={ranked} />
      </Panel>

      <Panel kicker="The wire" title="Headlines" className="lg:col-span-4" right={<Link href="/news" className="font-display text-xs tracking-widest text-accent-hi">All news</Link>}>
        <ul className="space-y-2">
          {state.news.slice(0, 5).map((n) => (
            <li key={n.id} className="flex gap-2 text-sm">
              <Tag tone={n.tag === "GAME" ? "accent" : "muted"}>{n.tag}</Tag>
              <span className="leading-5">{n.headline}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function GameList({ games }: { games: { home: keyof typeof TEAMS; away: keyof typeof TEAMS; p: number; kickoff: string }[] }) {
  return (
    <ul className="divide-y divide-line/60">
      {games.map((g) => {
        const spread = spreadFor(g.p);
        const fav = spread <= 0 ? g.home : g.away;
        return (
          <li key={g.home} className="flex items-center gap-2 py-2">
            <TeamBadge id={g.away} size="sm" />
            <span className="font-display text-[10px] text-dim">@</span>
            <TeamBadge id={g.home} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">
                {TEAMS[g.away].name.split(" ").slice(-1)} at {TEAMS[g.home].name.split(" ").slice(-1)}
              </p>
              <p className="text-xs text-dim">{g.kickoff}</p>
            </div>
            <span className="font-display tabular text-sm text-muted">{Math.abs(spread) < 0.5 ? "Pick 'em" : `${TEAMS[fav].short} −${Math.abs(spread)}`}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-line/60 pb-1.5">
      <span className="text-muted">{label}</span>
      <span className="font-display tabular">{value}</span>
    </div>
  );
}

function SeasonWrap({ state }: { state: GameState }) {
  const me = standingOf(state, USER_TEAM)!;
  const seed = playoffField(state).find((t) => t.id === USER_TEAM)?.seed;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel kicker="Selection day" title={seed ? `In the field · No. ${seed} seed` : "Left out of the field"}>
        <div className="flex items-center gap-4">
          <TeamBadge id={USER_TEAM} size="lg" />
          <div>
            <p className="font-display text-2xl font-bold">
              {me.wins}–{me.losses} · #{me.rank}
            </p>
            <p className="text-sm text-muted">{seed ? "The bracket is set." : "The committee left you on the outside."}</p>
          </div>
        </div>
        <ButtonLink href="/sim" variant="outline" className="mt-4">
          See the bracket
        </ButtonLink>
      </Panel>
      <Panel kicker="Results" title="Run-in">
        <ul className="space-y-2">
          {state.recaps.map((r) => {
            const home = r.game.home === USER_TEAM;
            const us = home ? r.game.homeScore : r.game.awayScore;
            const them = home ? r.game.awayScore : r.game.homeScore;
            const opp = home ? r.game.away : r.game.home;
            return (
              <li key={r.week} className="flex items-center gap-3 rounded-md border border-line bg-bg-2/70 px-3 py-2">
                <span className="font-display w-8 text-xs text-muted">W{r.week}</span>
                <TeamBadge id={opp} size="sm" />
                <span className="flex-1 truncate text-sm">
                  {home ? "vs" : "at"} {TEAMS[opp].name}
                </span>
                <span className={cx("font-display tabular", us > them ? "text-good" : "text-bad")}>
                  {us > them ? "W" : "L"} {us}–{them}
                </span>
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
