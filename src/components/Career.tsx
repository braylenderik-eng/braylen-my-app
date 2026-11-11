"use client";

import { TEAMS, isPowerConf } from "@/lib/game/data";
import { careerTotals, securityLabel } from "@/lib/game/career";
import { CONFERENCES, isRivalry, rivalOf, rivalryOf, trophyRef } from "@/lib/game/league";
import { programProfile } from "@/lib/game/program";
import { FINAL_WEEK } from "@/lib/game/data";
import { awardsEnabled, currentUserFixture, type GameState } from "@/lib/game/state";
import * as Aw from "@/lib/game/awards";
import { PlayerFace } from "./PlayerFace";
import { money } from "@/lib/format";
import { useGame } from "./GameProvider";
import { Button, ButtonLink, cx, Panel, Stat, Tag, TeamBadge } from "./ui";

/** Job security as a bar: green when safe, red on the hot seat. */
export function SecurityMeter({ value }: { value: number }) {
  const tone = value >= 50 ? "var(--good)" : value >= 25 ? "var(--gold)" : "var(--bad)";
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="font-display text-[10px] tracking-widest text-muted">Job security</span>
        <span className="font-display text-sm font-semibold" style={{ color: tone }}>
          {securityLabel(value)}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-line" role="meter" aria-label="Job security" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full" style={{ width: `${Math.max(3, value)}%`, background: tone }} />
      </div>
    </div>
  );
}

/** The coaching carousel: offers after a big year, or a way back in after a firing. */
export function Carousel({ state }: { state: GameState }) {
  const { dispatch } = useGame();
  const c = state.career!;
  const fired = c.status === "fired";
  const here = TEAMS[state.team].name;
  return (
    <Panel
      kicker={fired ? "You've been fired" : "Coaching carousel"}
      title={fired ? `${here} have moved on` : `${c.offers.length} program${c.offers.length === 1 ? "" : "s"} want to talk`}
      className="mb-5"
    >
      <p className="mb-3 text-sm text-muted">
        {fired
          ? "The athletic director made the call after another season below expectations. A smaller program is willing to give you another shot. Take it, or walk away from coaching."
          : `Strong seasons get noticed. Take a job and you inherit that program's roster, budget and expectations for Season ${state.season + 1}. Or stay at ${here}; offers lapse when the new season starts.`}
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {c.offers.map((o) => {
          const p = programProfile(o.team);
          return (
            <li key={o.team} className="rounded-md border border-line bg-bg-2/70 p-3">
              <div className="flex items-center gap-3">
                <TeamBadge id={o.team} />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{TEAMS[o.team].name}</p>
                  <p className="font-display text-[11px] tracking-wider text-muted">
                    {TEAMS[o.team].conf} · {p.tier} · {p.winTarget} wins expected · {money(p.baseBudget)} budget
                  </p>
                </div>
              </div>
              <p className="mt-2 text-xs text-dim">{o.reason}</p>
              <Button className="mt-3 w-full" onClick={() => dispatch({ type: "career/accept", team: o.team })}>
                Take the job
              </Button>
            </li>
          );
        })}
      </ul>
      <Button variant="ghost" className="mt-3" onClick={() => dispatch({ type: "career/decline" })}>
        {fired ? "Walk away from coaching" : `Stay at ${here}`}
      </Button>
    </Panel>
  );
}

/** Out of coaching: the résumé, and a way to start over. */
export function CareerOver({ state }: { state: GameState }) {
  const t = careerTotals(state.career!);
  return (
    <Panel kicker="Career over" title={`${state.coach!.name}'s coaching career has ended`} className="mb-5">
      <p className="text-sm text-muted">Nobody called after the firing. Here&apos;s how it went.</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Record" value={`${t.wins}–${t.losses}`} />
        <Stat label="Programs" value={state.career!.stints.length} />
        <Stat label="Playoffs" value={t.playoffs} />
        <Stat label="Titles" value={t.titles} tone="gold" />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <ButtonLink href="/new">New dynasty</ButtonLink>
        <ButtonLink href="/coach" variant="outline">
          Full résumé
        </ButtonLink>
      </div>
    </Panel>
  );
}

/** Your rivalry: the trophy, the series and when you play. */
export function RivalryCard({ state }: { state: GameState }) {
  const r = rivalryOf(state.rivalries, state.team);
  if (!r) return null;
  const opp = rivalOf(r, state.team);
  const us = r.series[state.team] ?? 0;
  const them = r.series[opp] ?? 0;
  const meet = Object.entries(state.schedule).find(
    ([w, fs]) => Number(w) <= FINAL_WEEK && fs.some((f) => (f.home === state.team && f.away === opp) || (f.home === opp && f.away === state.team)),
  );
  const week = meet ? Number(meet[0]) : null;
  return (
    <Panel kicker="Rivalry" title={r.trophy}>
      <div className="flex items-center gap-3">
        <TeamBadge id={opp} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{TEAMS[opp].name}</p>
          <p className="font-display text-[11px] tracking-wider text-muted">Since {r.since}</p>
        </div>
        <Tag tone={r.holder === state.team ? "good" : "muted"}>{r.holder === state.team ? "You hold it" : "They hold it"}</Tag>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Series" value={`${us}–${them}`} tone={us >= them ? "good" : "bad"} />
        <Stat label="Last" value={r.last ? `${r.last.winner === state.team ? "W" : "L"} ${r.last.score}` : "—"} />
        <Stat label="This year" value={week === null ? "—" : week < state.week ? "Played" : `Wk ${week}`} tone="gold" />
      </div>
      <p className="mt-3 text-sm text-muted">
        Records go out the window: the underdog plays above itself. A win swings recruits your way, most of all in your home region; a loss
        hands {TEAMS[opp].name} a pitch against you.
      </p>
    </Panel>
  );
}

/** Your conference: identity, home region and the race for the title (best record wins it). */
export function ConferenceCard({ state }: { state: GameState }) {
  const conf = TEAMS[state.team].conf;
  const id = CONFERENCES[conf];
  const table = state.standings.filter((t) => TEAMS[t.id].conf === conf).sort((a, b) => b.wins - a.wins || a.rank - b.rank);
  return (
    <Panel kicker={`Conference · ${id?.style ?? ""}`} title={conf}>
      {id && (
        <p className="text-sm text-muted">
          {id.tagline}. Home region: <span className="text-text">{id.states.join(", ")}</span>; recruits from there start keener on you.
        </p>
      )}
      <ol className="mt-3 space-y-1">
        {table.map((t, i) => (
          <li key={t.id} className={cx("flex items-center gap-2 rounded px-2 py-1 text-sm", t.id === state.team && "bg-accent/10")}>
            <span className="font-display w-4 text-right text-xs text-dim">{i + 1}</span>
            <TeamBadge id={t.id} size="sm" />
            <span className={cx("flex-1 truncate", t.id === state.team && "font-semibold text-accent-hi")}>{TEAMS[t.id].name}</span>
            <span className="font-display tabular text-xs text-muted">#{t.rank}</span>
            <span className="font-display tabular w-10 text-right">
              {t.wins}–{t.losses}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-dim">
        {isPowerConf(conf) ? "The champion (best record) gets an automatic playoff bid." : "The best champion outside the Power conferences gets an automatic bid."}
      </p>
    </Panel>
  );
}

/** This week's game is your rivalry game: a banner across the top of the Dashboard. */
export function RivalryBanner({ state }: { state: GameState }) {
  const f = currentUserFixture(state);
  const r = rivalryOf(state.rivalries, state.team);
  if (!f || !r || !isRivalry([r], f.home, f.away) || state.week > FINAL_WEEK) return null;
  const opp = rivalOf(r, state.team);
  const us = r.series[state.team] ?? 0;
  const them = r.series[opp] ?? 0;
  return (
    <div
      className="mb-5 flex flex-wrap items-center gap-4 overflow-hidden rounded-lg border border-gold/40 px-4 py-3"
      style={{ background: `linear-gradient(100deg, color-mix(in srgb, ${TEAMS[state.team].color} 35%, transparent), transparent 45%, color-mix(in srgb, ${TEAMS[opp].color} 35%, transparent))` }}
    >
      <TeamBadge id={state.team} />
      <div className="min-w-0 flex-1">
        <p className="font-display text-[11px] tracking-[0.2em] text-gold">Rivalry week</p>
        <p className="font-display text-xl leading-tight font-semibold">
          {r.trophy} <span className="text-muted">vs</span> {TEAMS[opp].name}
        </p>
        <p className="text-xs text-muted">
          Series {us}–{them} · {r.holder === state.team ? `You hold ${trophyRef(r)}` : `${TEAMS[opp].short} hold ${trophyRef(r)}`} · Records go out the window
        </p>
      </div>
      <TeamBadge id={opp} />
    </div>
  );
}

/** Where your best player stands in the national award race. */
export function AwardRaceCard({ state }: { state: GameState }) {
  if (!state.league || !awardsEnabled(state)) return null;
  const c = Aw.candidates(state.league, state.seasonStats, state.players, state.standings);
  if (!c.length) return null;
  const myIdx = c.findIndex((x) => x.mine);
  const color = (t: string) => TEAMS[t as keyof typeof TEAMS]?.color;
  const show = c.slice(0, 3);
  const mine = myIdx >= 3 ? c[myIdx] : null;
  const row = (x: Aw.Candidate, i: number) => (
    <li key={x.id} className={cx("flex items-center gap-2.5 rounded px-1.5 py-1", x.mine && "bg-accent/10")}>
      <span className="font-display tabular w-5 text-right text-xs text-dim">{i + 1}</span>
      <PlayerFace id={x.id} pos={x.pos} color={color(x.team)} size={30} />
      <span className="min-w-0 flex-1">
        <span className={cx("block truncate text-sm font-semibold", x.mine && "text-accent-hi")}>{x.name}</span>
        <span className="block truncate text-[11px] text-muted">
          {x.pos} · {TEAMS[x.team].short} · {Aw.statSummary(x)}
        </span>
      </span>
    </li>
  );
  return (
    <Panel kicker="National award race" title={Aw.AWARDS.crown}>
      <ol className="space-y-1">
        {show.map(row)}
        {mine && <li className="px-1.5 text-center text-xs text-dim">…</li>}
        {mine && row(mine, myIdx)}
      </ol>
      <ButtonLink href="/stats" variant="outline" className="mt-3 w-full">
        Stats &amp; awards
      </ButtonLink>
    </Panel>
  );
}
