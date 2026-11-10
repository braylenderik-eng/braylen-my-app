"use client";

import { useMemo } from "react";
import { TEAMS, USER_TEAM, type Fixture, type TeamId } from "@/lib/game/data";
import { hashSeed, simulateGame } from "@/lib/game/sim";
import { boostsFor, playoffOdds, standingOf, userFixture, type GameState } from "@/lib/game/state";
import { pct, spreadFor } from "@/lib/format";
import { ProbBar, TeamBadge } from "./ui";

export interface MatchupInfo {
  fixture: Fixture;
  us: TeamId;
  them: TeamId;
  home: boolean;
  winProb: number; // for the user
  spread: number; // user's line (negative = favored)
  total: number; // over/under
  odds: { now: number; win: number; loss: number };
}

/** Odds, line and playoff stakes for the user's game this week. Recomputes when the plan changes. */
export function useMatchup(state: GameState): MatchupInfo | null {
  const fixture = userFixture(state.week);
  const { plan, hype } = state;
  const boostsKey = JSON.stringify(boostsFor(state));
  const standingsKey = state.standings.map((t) => t.score).join(",");

  return useMemo(() => {
    if (!fixture) return null;
    const boosts = JSON.parse(boostsKey);
    const home = fixture.home === USER_TEAM;
    const them = home ? fixture.away : fixture.home;
    const runs = 500;
    let wins = 0;
    let points = 0;
    for (let i = 0; i < runs; i++) {
      const g = simulateGame(fixture.home, fixture.away, hashSeed("line", state.week, i), {
        userTeam: USER_TEAM,
        plan,
        hype,
        boosts,
        fast: true,
      });
      const ours = home ? g.homeScore : g.awayScore;
      const theirs = home ? g.awayScore : g.homeScore;
      if (ours > theirs) wins++;
      points += g.homeScore + g.awayScore;
    }
    const winProb = wins / runs;
    return {
      fixture,
      us: USER_TEAM,
      them,
      home,
      winProb,
      spread: spreadFor(winProb),
      total: Math.round((points / runs) * 2) / 2,
      odds: { now: playoffOdds(state), win: playoffOdds(state, "win"), loss: playoffOdds(state, "loss") },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixture, plan, hype, boostsKey, standingsKey, state.week]);
}

export function MatchupHero({ state, m, compact }: { state: GameState; m: MatchupInfo; compact?: boolean }) {
  const left = m.home ? m.them : m.us; // away team on the left, "AT" home team
  const right = m.home ? m.us : m.them;
  const leftProb = left === m.us ? m.winProb : 1 - m.winProb;
  const fav = m.spread <= 0 ? m.us : m.them;
  const line = Math.abs(m.spread) < 0.5 ? "Pick 'em" : `${TEAMS[fav].short} −${Math.abs(m.spread)}`;

  const side = (id: TeamId, align: "left" | "right") => {
    const st = standingOf(state, id)!;
    return (
      <div className={`flex min-w-0 flex-1 items-center gap-3 sm:gap-4 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
        <TeamBadge id={id} size={compact ? "lg" : "xl"} />
        <div className="min-w-0">
          <p className="font-display text-[10px] tracking-[0.2em] text-muted">{id === m.us ? "Us" : "Opponent"}</p>
          <p className="font-display truncate text-xl leading-tight font-bold sm:text-3xl">
            <span className="text-accent-hi">#{st.rank}</span> {TEAMS[id].name}
          </p>
          <p className="font-display tabular text-sm text-muted">
            {st.wins}–{st.losses} · {TEAMS[id].conf}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="relative overflow-hidden rounded-lg border border-line bg-gradient-to-br from-panel-2 via-panel to-bg-2 p-4 sm:p-6">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1/3 opacity-25" style={{ background: `linear-gradient(90deg, ${TEAMS[left].color}, transparent)` }} />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 opacity-25" style={{ background: `linear-gradient(270deg, ${TEAMS[right].color}, transparent)` }} />
      <div className="relative flex flex-col gap-5 md:flex-row md:items-center">
        {side(left, "left")}
        <div className="flex shrink-0 flex-col items-center gap-2 md:w-72">
          <span className="font-display rounded border border-line-2 bg-bg/60 px-3 py-0.5 text-sm font-bold tracking-widest">AT</span>
          <div className="font-display tabular flex w-full items-center justify-between text-lg font-bold">
            <span style={{ color: left === m.us ? "var(--accent-hi)" : "var(--muted)" }}>{pct(leftProb)}</span>
            <span className="text-[10px] font-normal tracking-[0.2em] text-muted">Win probability</span>
            <span style={{ color: right === m.us ? "var(--accent-hi)" : "var(--muted)" }}>{pct(1 - leftProb)}</span>
          </div>
          <div className="w-full">
            <ProbBar left={leftProb} leftColor={left === m.us ? "var(--accent)" : "#56607d"} rightColor={right === m.us ? "var(--accent)" : "#56607d"} />
          </div>
          <div className="grid w-full grid-cols-2 overflow-hidden rounded border border-line text-center">
            <div className="border-r border-line px-2 py-1.5">
              <p className="font-display tabular font-semibold">{line}</p>
              <p className="font-display text-[9px] tracking-widest text-muted">The line</p>
            </div>
            <div className="px-2 py-1.5">
              <p className="font-display tabular font-semibold">{m.total}</p>
              <p className="font-display text-[9px] tracking-widest text-muted">Over / under</p>
            </div>
          </div>
          <p className="font-display text-center text-xs tracking-widest text-muted">
            {m.fixture.kickoff}
            {m.fixture.venue && <> · {m.fixture.venue}</>}
            {m.fixture.label && <span className="text-accent-hi"> · {m.fixture.label}</span>}
          </p>
        </div>
        {side(right, "right")}
      </div>
    </div>
  );
}
