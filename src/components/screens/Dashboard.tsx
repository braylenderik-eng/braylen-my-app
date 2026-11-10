"use client";

import Link from "next/link";
import { useMemo } from "react";
import { SCHEDULE, TEAMS, USER_TEAM, type TeamId } from "@/lib/game/data";
import { winProbability } from "@/lib/game/sim";
import {
  champion, currentUserFixture, isPlayoffs, playoffFixtures, PLAYOFF_ROUNDS, roundOf, seasonOver, seedOf, standingOf, userEliminated, weekLabel,
  type GameState,
} from "@/lib/game/state";
import { money, pct, spreadFor } from "@/lib/format";
import { useGame } from "../GameProvider";
import { MatchupHero, useMatchup } from "../Matchup";
import { ButtonLink, cx, PageHeader, Panel, Stat, Tag, TeamBadge } from "../ui";
import { UnitCard, unitEdges } from "../UnitMatchups";

export function Dashboard() {
  const { state } = useGame();
  const hasGame = !!currentUserFixture(state);
  const playoffs = isPlayoffs(state);

  return (
    <>
      <PageHeader
        title={seasonOver(state) ? "Season wrap" : playoffs ? "Playoff preview" : "Weekly preview"}
        sub={`Season 1 · ${weekLabel(state.week)}${hasGame ? " · The week ahead" : ""}`}
        right={!seasonOver(state) && <ButtonLink href="/sim">{hasGame ? "Game plan & sim" : "Bracket & sim"}</ButtonLink>}
      />

      {state.unseenRecap && <LastResultBanner state={state} />}
      <Alerts state={state} />

      {hasGame ? <Preview state={state} /> : <SeasonStatus state={state} />}
    </>
  );
}

function Alerts({ state }: { state: GameState }) {
  const questionable = state.players.filter((p) => state.injuries[p.id]?.status === "questionable");
  return (
    <>
      {state.rook.decision === null && (
        <Link href="/recruiting" className="mb-3 flex items-center gap-3 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 transition-colors hover:bg-accent/15">
          <Tag>Urgent</Tag>
          <p className="flex-1 text-sm">
            <span className="font-semibold">Jalen Rook:</span> “$1.1M or I enter the portal Friday.” He wants an answer tonight.
          </p>
          <span className="font-display text-sm tracking-wider text-accent-hi">Respond →</span>
        </Link>
      )}
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
  let body = `${weekLabel(r.week)} results are in`;
  let tone: "good" | "accent" | "muted" = "muted";
  let tag = "Final";
  if (r.game) {
    const home = r.game.home === USER_TEAM;
    const us = home ? r.game.homeScore : r.game.awayScore;
    const them = home ? r.game.awayScore : r.game.homeScore;
    const opp = home ? r.game.away : r.game.home;
    body = `${weekLabel(r.week)}: Stallions ${us}, ${TEAMS[opp].name} ${them}`;
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
    const list = playoffs ? playoffFixtures(state, roundOf(state.week)).filter((f) => f !== null) : (SCHEDULE[state.week] ?? []);
    return list
      .filter((f) => f.home !== USER_TEAM && f.away !== USER_TEAM)
      .map((f) => ({ home: f.home, away: f.away, kickoff: f.kickoff, p: winProbability(f.home, f.away, f.home, { neutral: playoffs && roundOf(state.week) > 0 }, 250) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.week, state.playoff?.games.length]);
  if (!m) return null;
  const me = standingOf(state, USER_TEAM)!;
  const edges = unitEdges(state, m.us, m.them).slice(0, 6);
  const upsets = others.filter((g) => g.p > 0.35 && g.p < 0.65);
  const ranked = others.filter((g) => TEAMS[g.home].ranked && TEAMS[g.away].ranked);

  return (
    <div className="grid gap-5 lg:grid-cols-12">
      <div className="lg:col-span-12">
        <p className="font-display mb-2 text-xs tracking-[0.2em] text-accent-hi">{playoffs ? PLAYOFF_ROUNDS[roundOf(state.week)] : "Game of the week"}</p>
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
            <Row label="NIL budget" value={money(state.nilBudget)} />
            <Row label="Scholarships open" value={String(state.scholarships)} />
          </div>
        </Panel>
      ) : (
        <Panel kicker="The path" title="Road to the title" className="lg:col-span-4">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Seed" value={seedOf(state, USER_TEAM) ?? "—"} tone="gold" />
            <Stat label="Win this round" value={pct(m.winProb)} />
          </div>
          <ol className="mt-4 space-y-1.5 text-sm">
            {PLAYOFF_ROUNDS.map((r, i) => {
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

/** No game this week: bye, eliminated, missed the field, or season over. */
function SeasonStatus({ state }: { state: GameState }) {
  const me = standingOf(state, USER_TEAM)!;
  const seed = seedOf(state, USER_TEAM);
  const champ = champion(state);
  const out = userEliminated(state);
  const title = champ === USER_TEAM ? "National champions" : champ ? `${TEAMS[champ].name} win it all` : seed && !out ? `First-round bye · No. ${seed} seed` : seed ? "Season over" : "Left out of the field";
  return (
    <div className="grid gap-5 lg:grid-cols-12">
      <Panel kicker={seasonOver(state) ? "Season complete" : "Playoffs"} title={title} className="lg:col-span-5">
        <div className="flex items-center gap-4">
          <TeamBadge id={champ ?? USER_TEAM} size="lg" />
          <div>
            <p className="font-display text-2xl font-bold">
              {me.wins}–{me.losses} · Final rank #{me.rank}
            </p>
            <p className="text-sm text-muted">{seed ? `No. ${seed} seed in the 12-team field.` : "The committee left you out."}</p>
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
              const home = g.home === USER_TEAM;
              const us = home ? g.homeScore : g.awayScore;
              const them = home ? g.awayScore : g.homeScore;
              const opp = home ? g.away : g.home;
              return (
                <li key={r.week} className="flex items-center gap-3 rounded-md border border-line bg-bg-2/70 px-3 py-2">
                  <span className="font-display w-24 shrink-0 text-xs text-muted">{weekLabel(r.week)}</span>
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
