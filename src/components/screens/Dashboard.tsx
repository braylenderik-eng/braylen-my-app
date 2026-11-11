"use client";

import Link from "next/link";
import { useMemo } from "react";
import { TEAMS, type TeamId } from "@/lib/game/data";
import { winProbability } from "@/lib/game/sim";
import {
  champion, currentUserFixture, dateLabel, isPlayoffs, playoffFixtures, playoffFormat, roundOf, seasonOver, seedOf, standingOf, userEliminated, weekLabel,
  type GameState,
} from "@/lib/game/state";
import { money, pct, spreadFor } from "@/lib/format";
import { useGame } from "../GameProvider";
import { MatchupHero, useMatchup } from "../Matchup";
import { ButtonLink, cx, PageHeader, Panel, Stat, Tag, TeamBadge } from "../ui";
import { UnitCard, unitEdges } from "../UnitMatchups";
import { HistoryTable } from "./SimScreen";
import { OffseasonHub } from "../OffseasonHub";
import { DEFENSE_STYLES, OFFENSE_STYLES } from "@/lib/game/program";
import { ScenarioCards } from "../ScenarioCards";
import { AwardRaceCard, Carousel, CareerOver, ConferenceCard, RivalryBanner, RivalryCard, SecurityMeter } from "../Career";

export function Dashboard() {
  const { state } = useGame();
  const hasGame = !!currentUserFixture(state);
  const playoffs = isPlayoffs(state);

  return (
    <>
      <PageHeader
        title={state.offseason ? "Offseason" : seasonOver(state) ? "Season wrap" : playoffs ? "Playoff preview" : "Weekly preview"}
        sub={`Season ${state.season} · ${state.offseason ? "Offseason" : `${weekLabel(state.week, state.season)} · ${dateLabel(state.week, state.season)}`}`}
        right={!seasonOver(state) && <ButtonLink href="/sim">{hasGame ? "Game plan & sim" : "Bracket & sim"}</ButtonLink>}
      />

      {state.unseenRecap && <LastResultBanner state={state} />}
      <Alerts state={state} />
      {!state.offseason && <RivalryBanner state={state} />}
      {state.coach && !state.offseason && <ProgramCard state={state} />}
      {state.career?.status === "over" && <CareerOver state={state} />}
      {state.offseason && state.career && state.career.status !== "over" && (state.career.offers.length > 0 || state.career.status === "fired") && <Carousel state={state} />}
      {state.season > 1 && state.recaps.length === 0 && <NewSeason state={state} />}

      {state.offseason ? (
        <div className="grid gap-5 lg:grid-cols-12">
          <div className="lg:col-span-8">{state.career?.status === "over" || state.career?.status === "fired" ? null : <OffseasonHub state={state} />}</div>
          <Panel kicker="Program" title="History" className="lg:col-span-4">
            <HistoryTable rows={state.history} />
          </Panel>
        </div>
      ) : hasGame ? (
        <>
          <Preview state={state} />
          {!isPlayoffs(state) && (
            <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              <RivalryCard state={state} />
              <ConferenceCard state={state} />
              <AwardRaceCard state={state} />
            </div>
          )}
        </>
      ) : (
        <SeasonStatus state={state} />
      )}
    </>
  );
}

function Alerts({ state }: { state: GameState }) {
  const questionable = state.players.filter((p) => state.injuries[p.id]?.status === "questionable");
  return (
    <>
      <ScenarioCards state={state} compact />
      {questionable.length > 0 && !seasonOver(state) && (
        <Link href="/sim" className="mb-3 flex items-center gap-3 rounded-lg border border-gold/40 bg-gold/10 px-4 py-3 transition-colors hover:bg-gold/15">
          <Tag tone="gold">Game-time call</Tag>
          <p className="flex-1 text-sm">
            {questionable.map((p) => `${p.pos} ${p.name} (${state.injuries[p.id].desc})`).join(", ")} {questionable.length > 1 ? "are" : "is"} questionable. Decide on the game plan.
          </p>
          <span className="font-display text-sm tracking-wider text-gold">Decide →</span>
        </Link>
      )}
      <div className="mb-2" />
    </>
  );
}

function LastResultBanner({ state }: { state: GameState }) {
  const r = state.recaps[state.recaps.length - 1];
  if (!r) return null;
  let body = `${weekLabel(r.week, state.season)} results are in`;
  let tone: "good" | "accent" | "muted" = "muted";
  let tag = "Final";
  if (r.game) {
    const home = r.game.home === state.team;
    const us = home ? r.game.homeScore : r.game.awayScore;
    const them = home ? r.game.awayScore : r.game.homeScore;
    const opp = home ? r.game.away : r.game.home;
    body = `${weekLabel(r.week, state.season)}: ${TEAMS[state.team].name} ${us}, ${TEAMS[opp].name} ${them}`;
    tone = us > them ? "good" : "accent";
    tag = us > them ? "Final · W" : "Final · L";
  }
  return (
    <Link href="/sim" className="mb-3 flex items-center gap-3 rounded-lg border border-line-2 bg-panel-2 px-4 py-3 transition-colors hover:border-accent">
      <Tag tone={tone}>{tag}</Tag>
      <p className="font-display tabular flex-1 text-sm tracking-wide">{body}</p>
      <span className="font-display text-sm tracking-wider text-accent-hi">Recap →</span>
    </Link>
  );
}

function Preview({ state }: { state: GameState }) {
  const m = useMatchup(state);
  const playoffs = isPlayoffs(state);
  const others = useMemo(() => {
    const list = playoffs ? playoffFixtures(state, roundOf(state.week)).filter((f) => f !== null) : (state.schedule[state.week] ?? []);
    return list
      .filter((f) => f.home !== state.team && f.away !== state.team)
      .map((f) => ({ home: f.home, away: f.away, kickoff: f.kickoff, p: winProbability(f.home, f.away, f.home, { neutral: playoffs && roundOf(state.week) > 0, ratings: state.teamRatings }, 250) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.season, state.week, state.playoff?.games.length]);
  if (!m) return null;
  const me = standingOf(state, state.team)!;
  const edges = unitEdges(state, m.us, m.them).slice(0, 6);
  const upsets = others.filter((g) => g.p > 0.35 && g.p < 0.65);
  const rankOf = (id: TeamId) => standingOf(state, id)?.rank ?? 99;
  const ranked = others.filter((g) => rankOf(g.home) <= 25 && rankOf(g.away) <= 25);

  return (
    <div className="grid gap-5 lg:grid-cols-12">
      <div className="lg:col-span-12">
        <p className="font-display mb-2 text-xs tracking-[0.2em] text-accent-hi">{playoffs ? playoffFormat(state.season).rounds[roundOf(state.week)] : "Game of the week"}</p>
        <MatchupHero state={state} m={m} />
      </div>

      <Panel kicker="This week" title="Position matchups" className="lg:col-span-8">
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {edges.map((e) => (
            <UnitCard key={e.label} e={e} us={m.us} them={m.them} />
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          Our side comes from your starters.{" "}
          <Link href="/roster" className="text-accent-hi hover:underline">
            Depth chart
          </Link>
        </p>
      </Panel>

      {m.odds ? (
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
            <Row label="Cap room" value={money(state.nilBudget)} />
            <Row label="Scholarships open" value={String(state.scholarships)} />
          </div>
        </Panel>
      ) : (
        <Panel kicker="The path" title="Road to the title" className="lg:col-span-4">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Seed" value={seedOf(state, state.team) ?? "—"} tone="gold" />
            <Stat label="Win this round" value={pct(m.winProb)} />
          </div>
          <ol className="mt-4 space-y-1.5 text-sm">
            {playoffFormat(state.season).rounds.map((r, i) => {
              const now = roundOf(state.week);
              return (
                <li key={r} className={cx("flex justify-between", i < now ? "text-good" : i === now ? "font-semibold" : "text-muted")}>
                  <span>{r}</span>
                  <span className="font-display text-xs tracking-widest">{i < now ? "Through" : i === now ? "This week" : "—"}</span>
                </li>
              );
            })}
          </ol>
        </Panel>
      )}

      {others.length > 0 && (
        <>
          <Panel kicker="Coin flips" title="Upset alert" className="lg:col-span-4">
            <GameList games={upsets.length ? upsets : others.slice(0, 4)} />
          </Panel>
          {!playoffs && (
            <Panel kicker="Ranked vs ranked" title="Top matchups" className="lg:col-span-4">
              <GameList games={ranked} />
            </Panel>
          )}
        </>
      )}

      <Headlines state={state} className={playoffs ? "lg:col-span-8" : "lg:col-span-4"} />
    </div>
  );
}

function Headlines({ state, className }: { state: GameState; className?: string }) {
  return (
    <Panel kicker="The wire" title="Headlines" className={className} right={<Link href="/news" className="font-display text-xs tracking-widest text-accent-hi">All news</Link>}>
      <ul className="space-y-2">
        {state.news.slice(0, 5).map((n) => (
          <li key={n.id} className="flex gap-2 text-sm">
            <Tag tone={n.tag === "GAME" || n.tag === "PLAYOFF" ? "accent" : n.tag === "INJURY" ? "gold" : "muted"}>{n.tag}</Tag>
            <span className="leading-5">{n.headline}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function GameList({ games }: { games: { home: TeamId; away: TeamId; p: number; kickoff: string }[] }) {
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

/** Start of a new season: what changed over the offseason, and the program's history. */
/** Your coach, schemes and what the administration expects this season. */
function ProgramCard({ state }: { state: GameState }) {
  const coach = state.coach!;
  const me = standingOf(state, state.team)!;
  const gamesLeft = state.schedule ? Object.keys(state.schedule).filter((w) => Number(w) >= state.week && (state.schedule[Number(w)] ?? []).some((f) => f.home === state.team || f.away === state.team)).length : 0;
  const need = Math.max(0, state.program.winTarget - me.wins);
  const pace = need === 0 ? "Target reached" : need > gamesLeft ? "Out of reach" : `${need} more win${need === 1 ? "" : "s"} needed`;
  return (
    <Panel kicker={`Head coach · ${coach.almaMater ? `${coach.almaMater} alum` : "First-year hire"}`} title={coach.name} className="mb-5">
      {state.career && (
        <div className="mb-3">
          <SecurityMeter value={state.career.security} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="Program" value={state.program.tier} tone="gold" />
        <Stat label="Win target" value={state.program.winTarget} />
        <Stat label="Pace" value={pace} tone={need === 0 ? "good" : need > gamesLeft ? "bad" : undefined} />
        <Stat label="Offense" value={OFFENSE_STYLES[coach.offense].name} />
        <Stat label="Defense" value={DEFENSE_STYLES[coach.defense].name} />
      </div>
      <p className="mt-3 text-sm text-muted">
        Calling your scheme&apos;s game plan gives a small edge. Meeting the win target grows next year&apos;s player budget and your job
        security; missing it drains both, and at zero security you&apos;re fired. Big seasons bring offers from bigger programs.
      </p>
    </Panel>
  );
}

function NewSeason({ state }: { state: GameState }) {
  const r = state.lastOffseason;
  if (!r) return null;
  const me = standingOf(state, state.team)!;
  const gains = [...r.progressed].sort((a, b) => b.to - b.from - (a.to - a.from)).slice(0, 4);
  return (
    <div className="mb-5 grid gap-5 lg:grid-cols-12">
      <Panel kicker="Offseason recap" title={`Season ${state.season} is here`} className="lg:col-span-8">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Preseason rank" value={`#${me.rank}`} tone="gold" />
          <Stat label="Graduated" value={r.graduated.length} />
          <Stat label="Newcomers" value={r.transfersIn.length + r.enrolled.length + r.walkOns.length} tone="good" />
          <Stat label="Cap room" value={money(state.nilBudget)} />
        </div>
        <p className="mt-3 text-sm text-muted">
          {r.enrolled.length} December signee{r.enrolled.length === 1 ? "" : "s"} enrolled, {r.transfersIn.length} transfer{r.transfersIn.length === 1 ? "" : "s"} signed in January
          {r.walkOns.length ? `, ${r.walkOns.length} walk-on${r.walkOns.length === 1 ? "" : "s"} added` : ""}
          {r.transfersOut.length ? `; ${r.transfersOut.length} transferred out` : ""}.
        </p>
        {gains.length > 0 && (
          <p className="mt-1 text-sm text-muted">
            Biggest jumps: {gains.map((g) => `${g.player.name} (${g.from}→${g.to})`).join(", ")}.{" "}
            <Link href="/roster" className="text-accent-hi hover:underline">
              Set the depth chart
            </Link>
          </p>
        )}
      </Panel>
      <Panel kicker="Program" title="History" className="lg:col-span-4">
        <HistoryTable rows={state.history} />
      </Panel>
    </div>
  );
}

/** No game this week: bye, eliminated, missed the field, or season over. */
function SeasonStatus({ state }: { state: GameState }) {
  const me = standingOf(state, state.team)!;
  const seed = seedOf(state, state.team);
  const champ = champion(state);
  const out = userEliminated(state);
  const title = champ === state.team ? "National champions" : champ ? `${TEAMS[champ].name} win it all` : seed && !out ? `First-round bye · No. ${seed} seed` : seed ? "Season over" : "Left out of the field";
  return (
    <div className="grid gap-5 lg:grid-cols-12">
      <Panel kicker={seasonOver(state) ? "Season complete" : "Playoffs"} title={title} className="lg:col-span-5">
        <div className="flex items-center gap-4">
          <TeamBadge id={champ ?? state.team} size="lg" />
          <div>
            <p className="font-display text-2xl font-bold">
              {me.wins}–{me.losses} · Final rank #{me.rank}
            </p>
            <p className="text-sm text-muted">{seed ? `No. ${seed} seed in the ${playoffFormat(state.season).size}-team field.` : "The committee left you out."}</p>
          </div>
        </div>
        <ButtonLink href="/sim" variant="outline" className="mt-4">
          {seasonOver(state) ? "See the bracket" : "Bracket & sim"}
        </ButtonLink>
      </Panel>
      <Panel kicker="Results" title="Our games" className="lg:col-span-7">
        <ul className="space-y-2">
          {state.recaps
            .filter((r) => r.game)
            .map((r) => {
              const g = r.game!;
              const home = g.home === state.team;
              const us = home ? g.homeScore : g.awayScore;
              const them = home ? g.awayScore : g.homeScore;
              const opp = home ? g.away : g.home;
              return (
                <li key={r.week} className="flex items-center gap-3 rounded-md border border-line bg-bg-2/70 px-3 py-2">
                  <span className="font-display w-24 shrink-0 text-xs text-muted">{weekLabel(r.week, state.season)}</span>
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
      <Headlines state={state} className="lg:col-span-12" />
    </div>
  );
}
