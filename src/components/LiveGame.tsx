"use client";

import { useCallback, useEffect, useState } from "react";
import { TEAMS, USER_TEAM, type TeamId } from "@/lib/game/data";
import {
  hashSeed, liveWinProbability, playGame, type Answer, type Decision, type DefensePlan, type Drive, type GameEvent, type GameResult,
  type OffensePlan,
} from "@/lib/game/sim";
import { userSimOptions, type GameState } from "@/lib/game/state";
import { pct } from "@/lib/format";
import { useGame } from "./GameProvider";
import type { MatchupInfo } from "./Matchup";
import { Button, cx, Panel, Tag, TeamBadge } from "./ui";

type Speed = 1 | 2;
const DELAY: Record<Speed, number> = { 1: 1100, 2: 450 };

const OFFENSE_NAMES: Record<OffensePlan, string> = { ground: "Ground and pound", balanced: "Balanced", air: "Air it out" };
const DEFENSE_NAMES: Record<DefensePlan, string> = { pressure: "Bring pressure", base: "Base", bend: "Bend, don't break" };

/** What a quick sim would have done: the default answer to any call. */
function defaultAnswer(d: Decision): Answer {
  if (d.kind === "fourth") return { kind: "fourth", choice: d.usual };
  if (d.kind === "two") return { kind: "two", choice: "pat" };
  if (d.kind === "clock") return { kind: "clock", choice: "no" };
  return { kind: "halftime", plan: d.plan };
}

export function LiveGame({ state, m, onExit }: { state: GameState; m: MatchupInfo; onExit: () => void }) {
  const { dispatch } = useGame();
  const fixture = m.fixture;
  // Same seed as a quick sim of this game, so with default calls it plays out identically.
  const [gen] = useState<Generator<GameEvent, GameResult, Answer | undefined>>(() =>
    playGame(fixture.home, fixture.away, hashSeed("game", state.seed, state.season, state.week, fixture.home, fixture.away), {
      ...userSimOptions(state),
      neutral: m.neutral,
      interactive: true,
    }),
  );
  const [feed, setFeed] = useState<Drive[]>([]);
  const [progress, setProgress] = useState({ remaining: 1, total: 1 });
  const [pending, setPending] = useState<Decision | null>(null);
  const [result, setResult] = useState<GameResult | null>(null);
  const [speed, setSpeed] = useState<Speed>(1);
  const [paused, setPaused] = useState(false);
  const [skip, setSkip] = useState<null | "call" | "end">(null);

  /** Advance the engine by one event (or, while skipping, until something stops us), feeding it an answer if we're resolving a call. */
  const advance = useCallback(
    (mode: null | "call" | "end", answer?: Answer) => {
      let step = gen.next(answer);
    // While skipping, keep going until something stops us.
    const drivesThisTick: Drive[] = [];
    let last: { remaining: number; total: number } | null = null;
    for (;;) {
      if (step.done) {
        setResult(step.value);
        break;
      }
      const ev = step.value;
      if (ev.type === "decision") {
        if (mode === "end") {
          step = gen.next(defaultAnswer(ev.decision));
          continue;
        }
        setPending(ev.decision);
        if (mode === "call") setSkip(null);
        break;
      }
      drivesThisTick.push(ev.drive);
      last = { remaining: ev.remaining, total: ev.total };
      if (!mode) break;
      step = gen.next();
    }
    if (drivesThisTick.length) setFeed((f) => [...f, ...drivesThisTick]);
    if (last) setProgress(last);
    },
    [gen],
  );

  // The game clock: one drive per tick unless paused, waiting on a call, or finished.
  useEffect(() => {
    if (result || pending || paused) return;
    const t = setTimeout(() => advance(skip), skip ? 0 : feed.length === 0 ? 500 : DELAY[speed]);
    return () => clearTimeout(t);
  }, [advance, feed.length, pending, paused, result, skip, speed]);

  const answer = (a: Answer) => {
    setPending(null);
    advance(skip, a);
  };

  const lastDrive = feed[feed.length - 1];
  const homeScore = result?.homeScore ?? lastDrive?.homeScore ?? 0;
  const awayScore = result?.awayScore ?? lastDrive?.awayScore ?? 0;
  const usHome = fixture.home === USER_TEAM;
  const margin = (usHome ? homeScore - awayScore : awayScore - homeScore) as number;
  const quarter = lastDrive?.quarter ?? 1;
  const fractionLeft = result ? 0 : progress.total ? progress.remaining / progress.total : 1;
  const wp = liveWinProbability(margin, feed.length ? fractionLeft : 1, -m.spread);
  const ball: TeamId | null = result ? null : lastDrive ? (lastDrive.team === fixture.home ? fixture.away : fixture.home) : null;

  const finish = () => {
    if (!result) return;
    dispatch({ type: "sim/week", userGame: result });
    window.scrollTo({ top: 0 });
    onExit();
  };

  return (
    <div className="pb-10">
      {/* Scoreboard */}
      <div className="sticky top-[57px] z-20 -mx-4 mb-4 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          {[fixture.away, fixture.home].map((id, i) => (
            <div key={id} className={cx("flex min-w-0 flex-1 items-center gap-2", i === 1 && "flex-row-reverse text-right")}>
              <TeamBadge id={id} size="md" />
              <div className="min-w-0">
                <p className="font-display truncate text-sm font-semibold sm:text-lg">
                  {TEAMS[id].name}
                  {ball === id && <span className="ml-1.5 text-gold" aria-label="has the ball">●</span>}
                </p>
                <p className="font-display text-[10px] tracking-widest text-muted">{id === USER_TEAM ? "You" : "Opponent"}</p>
              </div>
              <span className="font-display tabular text-4xl font-bold sm:text-5xl">{i === 0 ? awayScore : homeScore}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-3">
          <span className="font-display w-16 shrink-0 text-xs tracking-widest text-accent-hi">
            {result ? (result.overtime ? "Final/OT" : "Final") : quarter === 5 ? "OT" : `Q${quarter}`}
          </span>
          {/* Fills from your side of the scoreboard. */}
          <div className={cx("flex h-1.5 flex-1 overflow-hidden rounded-full bg-line", usHome && "flex-row-reverse")} title="Your win probability">
            <div className="bg-accent transition-all duration-500" style={{ width: `${wp * 100}%` }} />
          </div>
          <span className="font-display tabular w-24 shrink-0 text-right text-xs tracking-wider text-muted">Win {pct(wp)}</span>
        </div>
      </div>

      {/* Controls */}
      {!result && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button variant="outline" className="px-3 py-1.5 text-xs" onClick={() => setPaused((p) => !p)} disabled={!!pending}>
            {paused ? "▶ Resume" : "❚❚ Pause"}
          </Button>
          {([1, 2] as Speed[]).map((s) => (
            <Button key={s} variant={speed === s ? "primary" : "outline"} className="px-3 py-1.5 text-xs" onClick={() => setSpeed(s)}>
              {s}×
            </Button>
          ))}
          <Button variant="outline" className="px-3 py-1.5 text-xs" disabled={!!pending} onClick={() => { setPaused(false); setSkip("call"); }}>
            Skip to my next call
          </Button>
          <Button variant="outline" className="px-3 py-1.5 text-xs" disabled={!!pending} onClick={() => { setPaused(false); setSkip("end"); }}>
            Sim to the end
          </Button>
          <button onClick={onExit} className="font-display ml-auto text-xs tracking-widest text-dim hover:text-text">
            Leave game (not saved)
          </button>
        </div>
      )}

      {pending && <DecisionCard d={pending} onAnswer={answer} />}

      {result && (
        <Panel className="mb-4 border-accent/50">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-display text-xs tracking-[0.2em] text-muted">Final{result.overtime ? " · overtime" : ""}</p>
              <p className="font-display text-3xl font-bold">{margin > 0 ? "Victory" : "Defeat"}</p>
            </div>
            <Button onClick={finish} className="px-8 py-3 text-base">
              See the recap
            </Button>
          </div>
        </Panel>
      )}

      <Feed feed={feed} />
    </div>
  );
}

function DecisionCard({ d, onAnswer }: { d: Decision; onAnswer: (a: Answer) => void }) {
  const [offense, setOffense] = useState<OffensePlan>(d.kind === "halftime" ? d.plan.offense : "balanced");
  const [defense, setDefense] = useState<DefensePlan>(d.kind === "halftime" ? d.plan.defense : "base");
  const scoreLine = `You ${d.scoreUs}, them ${d.scoreThem}`;

  let title = "";
  let body: React.ReactNode = null;
  if (d.kind === "fourth") {
    title = `4th & ${d.distance} at ${d.spot}`;
    body = (
      <div className={cx("grid gap-2", d.canKick && d.usual === "punt" ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
        <Option onClick={() => onAnswer({ kind: "fourth", choice: "go" })} title="Go for it" odds={`${pct(d.goPct)} to convert`} note="Fail and they get a short field." />
        {d.canKick && (
          <Option onClick={() => onAnswer({ kind: "fourth", choice: "kick" })} title="Kick the field goal" odds={`${pct(d.kickPct)} to make`} note="Take the points." />
        )}
        {d.usual === "punt" && (
          <Option onClick={() => onAnswer({ kind: "fourth", choice: "punt" })} title="Punt" odds="Flip the field" note="Make them drive the length of the field." />
        )}
      </div>
    );
  } else if (d.kind === "two") {
    title = "Touchdown! Extra point or two?";
    body = (
      <div className="grid gap-2 sm:grid-cols-2">
        <Option onClick={() => onAnswer({ kind: "two", choice: "pat" })} title="Kick the extra point" odds={`${pct(d.kickPct)} for 1`} />
        <Option onClick={() => onAnswer({ kind: "two", choice: "two" })} title="Go for two" odds={`${pct(d.twoPct)} for 2`} />
      </div>
    );
  } else if (d.kind === "clock") {
    title = d.mode === "milk" ? "Protect the lead?" : "Need to speed it up?";
    body = (
      <div className="grid gap-2 sm:grid-cols-2">
        <Option
          onClick={() => onAnswer({ kind: "clock", choice: "yes" })}
          title={d.mode === "milk" ? "Milk the clock" : "Go hurry-up"}
          odds={d.mode === "milk" ? "Run it, protect the ball" : "Throw it, take risks"}
          note={d.mode === "milk" ? "If you don't turn it over, they lose a possession." : "You get one extra possession at the end."}
        />
        <Option onClick={() => onAnswer({ kind: "clock", choice: "no" })} title="Play it straight" odds="Stick to the game plan" />
      </div>
    );
  } else {
    title = "Halftime";
    const row = (label: string, a: number, b: number) => (
      <div className="font-display tabular flex justify-between text-sm">
        <span>{a}</span>
        <span className="text-[10px] tracking-widest text-muted">{label}</span>
        <span>{b}</span>
      </div>
    );
    body = (
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 rounded-md border border-line bg-bg-2/70 p-3">
          <div className="font-display flex justify-between text-xs tracking-widest text-muted">
            <span>You</span>
            <span>Them</span>
          </div>
          {row("Passing yds", d.totals.us.passYds, d.totals.them.passYds)}
          {row("Rushing yds", d.totals.us.rushYds, d.totals.them.rushYds)}
          {row("Turnovers", d.totals.us.turnovers, d.totals.them.turnovers)}
        </div>
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="font-display text-xs tracking-widest text-muted">Second-half offense</span>
            <select value={offense} onChange={(e) => setOffense(e.target.value as OffensePlan)} className="mt-1 w-full rounded border border-line-2 bg-bg-2 px-2 py-2 text-sm">
              {(Object.keys(OFFENSE_NAMES) as OffensePlan[]).map((k) => (
                <option key={k} value={k}>
                  {OFFENSE_NAMES[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-display text-xs tracking-widest text-muted">Second-half defense</span>
            <select value={defense} onChange={(e) => setDefense(e.target.value as DefensePlan)} className="mt-1 w-full rounded border border-line-2 bg-bg-2 px-2 py-2 text-sm">
              {(Object.keys(DEFENSE_NAMES) as DefensePlan[]).map((k) => (
                <option key={k} value={k}>
                  {DEFENSE_NAMES[k]}
                </option>
              ))}
            </select>
          </label>
          <Button className="w-full" onClick={() => onAnswer({ kind: "halftime", plan: { offense, defense } })}>
            Start the second half
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Panel kicker={`Your call · ${scoreLine}`} title={title} className="mb-4 border-gold/60 shadow-gold/10">
      {body}
    </Panel>
  );
}

function Option({ onClick, title, odds, note }: { onClick: () => void; title: string; odds: string; note?: string }) {
  return (
    <button onClick={onClick} className="rounded-md border border-line-2 bg-bg-2/70 p-3 text-left transition-colors hover:border-accent hover:bg-accent/10">
      <p className="font-display text-lg font-semibold">{title}</p>
      <p className="font-display text-sm tracking-wide text-gold">{odds}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </button>
  );
}

function Feed({ feed }: { feed: Drive[] }) {
  if (!feed.length) return <p className="font-display py-10 text-center tracking-widest text-muted">Kickoff…</p>;
  const groups: { q: number; drives: Drive[] }[] = [];
  for (const d of [...feed].reverse()) {
    const g = groups[groups.length - 1];
    if (g && g.q === d.quarter) g.drives.push(d);
    else groups.push({ q: d.quarter, drives: [d] });
  }
  return (
    <div className="space-y-4" aria-live="polite">
      {groups.map((g) => (
        <div key={g.q}>
          <p className="font-display mb-1.5 text-xs tracking-widest text-muted">{g.q === 5 ? "Overtime" : `${["1st", "2nd", "3rd", "4th"][g.q - 1]} quarter`}</p>
          <ul className="divide-y divide-line/60 rounded-md border border-line bg-panel/90">
            {g.drives.map((d, i) => {
              const scored = d.result === "TD" || d.result === "FG";
              const turnover = d.result === "INT" || d.result === "FUM" || d.result === "DOWNS";
              return (
                <li key={`${d.quarter}-${i}-${d.homeScore}-${d.awayScore}`} className={cx("flex items-center gap-3 px-3 py-2", scored && d.team === USER_TEAM && "bg-accent/10")}>
                  <TeamBadge id={d.team} size="sm" />
                  <Tag tone={scored ? (d.team === USER_TEAM ? "accent" : "muted") : turnover ? "gold" : "muted"}>{d.result === "FUM" ? "TO" : d.result}</Tag>
                  <div className="min-w-0 flex-1">
                    <p className={cx("text-sm", scored ? "font-semibold" : "text-muted")}>{d.text}</p>
                    <p className="text-xs text-dim">
                      {d.plays} plays, {Math.max(0, d.yards)} yds
                    </p>
                  </div>
                  <span className="font-display tabular text-sm text-muted">
                    {d.awayScore}–{d.homeScore}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
