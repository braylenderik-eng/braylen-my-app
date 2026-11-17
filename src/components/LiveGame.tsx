"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TEAMS, type TeamId } from "@/lib/game/data";
import {
  hashSeed, liveWinProbability, ordinal, playGame, type Answer, type Decision, type DefensePlan, type Drive, type GameEvent, type GameResult,
  type OffensePlan,
} from "@/lib/game/sim";
import { statText, tally, type Play, type Tally } from "@/lib/game/pbp";
import { PlayerFace } from "./PlayerFace";
import { userSimOptions, type GameState } from "@/lib/game/state";
import { pct } from "@/lib/format";
import { useGame } from "./GameProvider";
import type { MatchupInfo } from "./Matchup";
import { Button, cx, Panel, TeamBadge } from "./ui";

type Speed = 1 | 2 | 4;
const DELAY: Record<Speed, number> = { 1: 1000, 2: 450, 4: 150 };

const OFFENSE_NAMES: Record<OffensePlan, string> = { ground: "Ground and pound", balanced: "Balanced", air: "Air it out" };
const DEFENSE_NAMES: Record<DefensePlan, string> = { pressure: "Bring pressure", base: "Base", bend: "Bend, don't break" };

/** What a quick sim would have done: the default answer to any call. */
function defaultAnswer(d: Decision): Answer {
  if (d.kind === "fourth") return { kind: "fourth", choice: d.usual };
  if (d.kind === "two") return { kind: "two", choice: "pat" };
  if (d.kind === "clock") return { kind: "clock", choice: "no" };
  return { kind: "halftime", plan: d.plan };
}

/** Something in the feed: the start of a possession, a snap, or the end of a possession. */
type Item =
  | { kind: "start"; key: string; drive: Drive; spot: number }
  | { kind: "play"; key: string; drive: Drive; play: Play; stat: string; remaining: number; total: number }
  | { kind: "end"; key: string; drive: Drive; remaining: number; total: number };

/** A drive's snaps (the overtime walk-off has none, so it gets one). */
function snapsOf(d: Drive): Play[] {
  if (d.pbp?.length) return d.pbp;
  return [{ quarter: d.quarter, clock: "OT", team: d.team, down: 1, toGo: 10, spot: 75, kind: "fg", yards: 0, label: "Field goal", text: d.text, homeScore: d.homeScore, awayScore: d.awayScore, scoring: true }];
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
  const [shown, setShown] = useState<Item[]>([]);
  const [queue, setQueue] = useState<Item[]>([]);
  const [pending, setPending] = useState<Decision | null>(null);
  const [result, setResult] = useState<GameResult | null>(null);
  const [speed, setSpeed] = useState<Speed>(1);
  const [paused, setPaused] = useState(false);
  const [skip, setSkip] = useState<null | "call" | "end">(null);
  const tallies = useRef(new Map<string, Tally>());
  const driveCount = useRef(0);

  /** Running stat lines are computed as items are shown, in order. */
  const reveal = useCallback((items: Item[]) => {
    const out = items.map((it) => {
      if (it.kind !== "play") return it;
      tally(tallies.current, it.play);
      return { ...it, stat: statText(it.play, tallies.current) };
    });
    setShown((s) => [...s, ...out]);
  }, []);

  /** Advance the engine by one event (or, while skipping, until something stops us), feeding it an answer if we're resolving a call. */
  const advance = useCallback(
    (mode: null | "call" | "end", answer?: Answer) => {
      let step = gen.next(answer);
      const items: Item[] = [];
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
        const d = ev.drive;
        const n = driveCount.current++;
        const plays = snapsOf(d);
        items.push({ kind: "start", key: `s${n}`, drive: d, spot: plays[0].spot });
        plays.forEach((p, j) => items.push({ kind: "play", key: `p${n}-${j}`, drive: d, play: p, stat: "", remaining: ev.remaining + 1, total: ev.total }));
        items.push({ kind: "end", key: `e${n}`, drive: d, remaining: ev.remaining, total: ev.total });
        if (!mode) break;
        step = gen.next();
      }
      // Skipping shows everything at once; otherwise the snaps play out one at a time.
      if (mode) reveal(items);
      else setQueue(items);
    },
    [gen, reveal],
  );

  // The game clock: one snap per tick unless paused, waiting on a call, or finished.
  useEffect(() => {
    if (pending || paused) return;
    if (queue.length) {
      if (skip) {
        const t = setTimeout(() => {
          reveal(queue);
          setQueue([]);
        }, 0);
        return () => clearTimeout(t);
      }
      // Possession changes and scores get a beat longer.
      const next = queue[0];
      const wait = next.kind === "play" ? DELAY[speed] * (next.play.scoring ? 1.6 : 1) : next.kind === "start" ? DELAY[speed] * 0.4 : 0;
      const t = setTimeout(() => {
        reveal([next]);
        setQueue((q) => q.slice(1));
      }, wait);
      return () => clearTimeout(t);
    }
    if (result) return;
    const t = setTimeout(() => advance(skip), shown.length === 0 ? 500 : 0);
    return () => clearTimeout(t);
  }, [advance, pending, paused, queue, result, reveal, shown.length, skip, speed]);

  const answer = (a: Answer) => {
    setPending(null);
    advance(skip, a);
  };

  const final = result && queue.length === 0 ? result : null;
  const lastPlay = [...shown].reverse().find((x): x is Extract<Item, { kind: "play" }> => x.kind === "play");
  const lastProgress = [...shown].reverse().find((x) => x.kind !== "start") as Extract<Item, { kind: "play" | "end" }> | undefined;
  const homeScore = final?.homeScore ?? lastPlay?.play.homeScore ?? 0;
  const awayScore = final?.awayScore ?? lastPlay?.play.awayScore ?? 0;
  const usHome = fixture.home === state.team;
  const margin = (usHome ? homeScore - awayScore : awayScore - homeScore) as number;
  const quarter = lastPlay?.play.quarter ?? 1;
  const fractionLeft = final ? 0 : lastProgress ? lastProgress.remaining / Math.max(1, lastProgress.total) : 1;
  const wp = liveWinProbability(margin, fractionLeft, -m.spread);
  const current = [...shown].reverse().find((x) => x.kind === "play" || x.kind === "start");
  const offense: TeamId | null = final || !current ? null : current.drive.team;
  const drivePlays = current ? shown.filter((x): x is Extract<Item, { kind: "play" }> => x.kind === "play" && x.drive === current.drive) : [];

  const finish = () => {
    if (!result) return;
    // The snaps are for watching; the saved recap keeps the drive summaries.
    dispatch({ type: "sim/week", userGame: { ...result, drives: result.drives.map((d) => ({ ...d, pbp: undefined })) } });
    window.scrollTo({ top: 0 });
    onExit();
  };

  return (
    <div className="pb-10">
      {/* Scoreboard */}
      <div className="sticky top-[53px] z-20 -mx-4 mb-4 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          {[fixture.away, fixture.home].map((id, i) => (
            <div key={id} className={cx("flex min-w-0 flex-1 items-center gap-2", i === 1 && "flex-row-reverse text-right")}>
              <TeamBadge id={id} size="md" />
              <div className="min-w-0">
                <p className="font-display truncate text-sm font-semibold sm:text-lg">
                  {TEAMS[id].name}
                  {offense === id && <span className="ml-1.5 text-gold" aria-label="has the ball">●</span>}
                </p>
                <p className="font-display text-[10px] tracking-widest text-muted">{id === state.team ? "You" : "Opponent"}</p>
              </div>
              <span className="font-display tabular text-4xl font-bold sm:text-5xl">{i === 0 ? awayScore : homeScore}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-3">
          <span className="font-display tabular w-24 shrink-0 text-xs tracking-widest text-accent-hi">
            {final ? (final.overtime ? "Final/OT" : "Final") : quarter === 5 ? "OT" : `Q${quarter} · ${lastPlay?.play.clock ?? "15:00"}`}
          </span>
          {/* Fills from your side of the scoreboard. */}
          <div className={cx("flex h-1.5 flex-1 overflow-hidden rounded-full bg-line", usHome && "flex-row-reverse")} title="Your win probability">
            <div className="bg-accent transition-all duration-500" style={{ width: `${wp * 100}%` }} />
          </div>
          <span className="font-display tabular w-20 shrink-0 text-right text-xs tracking-wider text-muted">Win {pct(wp)}</span>
        </div>
      </div>

      <FieldView home={fixture.home} away={fixture.away} play={final ? null : (lastPlay?.play ?? null)} current={final ? null : (current ?? null)} drivePlays={final ? [] : drivePlays.map((x) => x.play)} over={!!final} />

      {/* Controls */}
      {!final && (
        <div className="my-4 flex flex-wrap items-center gap-2">
          <Button variant="outline" className="px-3 py-1.5 text-xs" onClick={() => setPaused((p) => !p)} disabled={!!pending}>
            {paused ? "▶ Resume" : "❚❚ Pause"}
          </Button>
          {([1, 2, 4] as Speed[]).map((s) => (
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

      {pending && queue.length === 0 && <DecisionCard d={pending} onAnswer={answer} />}

      {final && (
        <Panel className="my-4 border-accent/50">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-display text-xs tracking-[0.2em] text-muted">Final{final.overtime ? " · overtime" : ""}</p>
              <p className="font-display text-3xl font-bold">{margin > 0 ? "Victory" : "Defeat"}</p>
            </div>
            <Button onClick={finish} className="px-8 py-3 text-base">
              See the recap
            </Button>
          </div>
        </Panel>
      )}

      <Feed items={shown} state={state} home={fixture.home} away={fixture.away} />
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

/** "JAX 27" / "50" from the offense's yardline. */
function spotLabel(spot: number, offense: TeamId, defense: TeamId) {
  if (spot === 50) return "50";
  return spot < 50 ? `${TEAMS[offense].short} ${spot}` : `${TEAMS[defense].short} ${100 - spot}`;
}

const downText = (p: Pick<Play, "down" | "toGo" | "spot">) => `${ordinal(p.down)} & ${p.toGo >= 100 - p.spot ? "Goal" : p.toGo}`;

/**
 * The field, top down: the away team's end zone on the left, so the away offense drives left to right.
 * Shows the line of scrimmage, the line to gain, and the current drive's path.
 */
function FieldView({
  home,
  away,
  play,
  current,
  drivePlays,
  over,
}: {
  home: TeamId;
  away: TeamId;
  play: Play | null;
  current: Item | null;
  drivePlays: Play[];
  over: boolean;
}) {
  const offense = current?.drive.team ?? null;
  const defense = offense === home ? away : home;
  // After a snap, the ball sits where it ended up.
  const ball = play && offense ? Math.max(1, Math.min(99, play.spot + (play.kind === "td" ? 100 - play.spot : play.yards))) : null;
  const startSpot = current?.kind === "start" ? current.spot : drivePlays[0]?.spot;
  const x = (spot: number) => 10 + (offense === home ? 100 - spot : spot); // svg x of an offense yardline
  const nextDown = play && ball !== null && offense ? nextState(play, ball) : null;

  return (
    <div className="mx-auto max-w-3xl overflow-hidden rounded-lg border border-line bg-panel">
      <svg viewBox="0 0 120 34" className="block w-full" role="img" aria-label={nextDown && offense ? `${TEAMS[offense].name} ball, ${downText(nextDown)} at ${spotLabel(nextDown.spot, offense, defense)}` : "The field"}>
        {/* Turf in ten-yard bands */}
        {Array.from({ length: 10 }, (_, i) => (
          <rect key={i} x={10 + i * 10} y={0} width={10} height={34} fill={i % 2 ? "#1f5a33" : "#22633a"} />
        ))}
        {/* End zones */}
        {[away, home].map((id, i) => (
          <g key={id}>
            <rect x={i === 0 ? 0 : 110} y={0} width={10} height={34} fill={TEAMS[id].color} />
            <text x={i === 0 ? 5 : 115} y={17} fill="white" fontSize={3.2} fontWeight={700} textAnchor="middle" dominantBaseline="middle" transform={`rotate(${i === 0 ? -90 : 90} ${i === 0 ? 5 : 115} 17)`} style={{ letterSpacing: 0.4 }}>
              {TEAMS[id].short}
            </text>
          </g>
        ))}
        {/* Yard lines and numbers */}
        {Array.from({ length: 19 }, (_, i) => {
          const yl = (i + 1) * 5;
          const big = yl % 10 === 0;
          return <line key={yl} x1={10 + yl} x2={10 + yl} y1={0} y2={34} stroke="white" strokeOpacity={big ? 0.45 : 0.18} strokeWidth={big ? 0.25 : 0.15} />;
        })}
        {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((yl) => (
          <text key={yl} x={10 + yl} y={30.5} fill="white" fillOpacity={0.55} fontSize={2.6} textAnchor="middle">
            {yl <= 50 ? yl : 100 - yl}
          </text>
        ))}
        {/* This drive so far */}
        {offense && startSpot !== undefined && ball !== null && (
          <rect x={Math.min(x(startSpot), x(ball))} y={14.5} width={Math.abs(x(ball) - x(startSpot))} height={5} rx={1} fill={TEAMS[offense].color} fillOpacity={0.55} />
        )}
        {/* Line to gain and line of scrimmage */}
        {nextDown && nextDown.toGo < 100 - nextDown.spot && <line x1={x(nextDown.spot + nextDown.toGo)} x2={x(nextDown.spot + nextDown.toGo)} y1={0} y2={34} stroke="#facc15" strokeWidth={0.5} />}
        {ball !== null && <line x1={x(ball)} x2={x(ball)} y1={0} y2={34} stroke="#60a5fa" strokeWidth={0.4} />}
        {ball !== null && <ellipse cx={x(ball)} cy={17} rx={1.4} ry={0.9} fill="#8b4513" stroke="white" strokeWidth={0.2} />}
      </svg>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2">
        <div className="flex items-center gap-1" aria-label="Down">
          {[1, 2, 3, 4].map((dn) => (
            <span key={dn} className={cx("font-display tabular grid h-6 w-6 place-items-center rounded-full text-xs", nextDown?.down === dn ? "bg-accent text-white" : "bg-bg-2 text-dim")}>
              {dn}
            </span>
          ))}
          {nextDown && <span className="font-display ml-1.5 text-sm">& {nextDown.toGo >= 100 - nextDown.spot ? "Goal" : nextDown.toGo}</span>}
        </div>
        <span className="font-display text-xs tracking-widest text-muted">
          {offense && nextDown ? (
            <>
              Ball on <span className="text-text">{spotLabel(nextDown.spot, offense, defense)}</span>
            </>
          ) : play ? (
            play.label
          ) : over ? (
            "Final"
          ) : (
            "Kickoff"
          )}
        </span>
        {offense && drivePlays.length > 0 && (
          <span className="font-display text-xs tracking-widest text-muted">
            Drive: {drivePlays.filter((p) => p.kind !== "try").length} play{drivePlays.filter((p) => p.kind !== "try").length === 1 ? "" : "s"}, {Math.max(0, (ball ?? 0) - (startSpot ?? 0))} yds
          </span>
        )}
      </div>
    </div>
  );
}

/** Down and distance after a snap (for the down marker). */
function nextState(p: Play, ball: number): Pick<Play, "down" | "toGo" | "spot"> | null {
  // Scores, kicks and turnovers end the possession.
  if (["try", "td", "fg", "miss", "punt", "int", "fumble", "downs", "kneel"].includes(p.kind)) return null;
  if (p.yards >= p.toGo) return { down: 1, toGo: Math.min(10, 100 - ball), spot: ball };
  return { down: Math.min(4, p.down + 1), toGo: p.toGo - p.yards, spot: ball };
}

const RESULT_TEXT: Record<Drive["result"], string> = {
  TD: "Touchdown",
  FG: "Field goal",
  MISS: "Missed field goal",
  PUNT: "Punt",
  INT: "Interception",
  FUM: "Fumble",
  DOWNS: "Turnover on downs",
  END: "End of half",
};

function Feed({ items, state, home, away }: { items: Item[]; state: GameState; home: TeamId; away: TeamId }) {
  const faces = useMemo(() => {
    const m = new Map<string, { id: string; num?: number }>();
    for (const p of state.players) m.set(`${state.team}:${p.name}`, { id: p.id, num: p.num });
    for (const s of state.league?.stars ?? []) m.set(`${s.team}:${s.name}`, { id: s.id });
    return m;
  }, [state.players, state.team, state.league]);
  if (!items.length) return <p className="font-display py-10 text-center tracking-widest text-muted">Kickoff…</p>;

  return (
    <ol className="mt-4 space-y-2" aria-live="polite">
      {[...items].reverse().map((it) => {
        const d = it.drive;
        const color = TEAMS[d.team].color;
        if (it.kind === "start") {
          return (
            <li key={it.key} className="font-display flex items-center gap-2 pt-2 text-xs tracking-widest text-muted">
              <TeamBadge id={d.team} size="sm" />
              <span>
                {TEAMS[d.team].name} ball{d.quarter === 5 ? " · overtime" : ""}
              </span>
              <span className="h-px flex-1 bg-line" />
            </li>
          );
        }
        if (it.kind === "end") {
          const good = d.result === "TD" || d.result === "FG";
          const bad = d.result === "INT" || d.result === "FUM" || d.result === "DOWNS";
          return (
            <li key={it.key} className="flex items-center gap-2 text-[11px] text-dim">
              <span className={cx("font-display tracking-widest", good ? "text-gold" : bad ? "text-accent-hi" : "text-muted")}>{RESULT_TEXT[d.result]}</span>
              <span>
                · {d.plays} plays, {Math.max(0, d.yards)} yds
              </span>
            </li>
          );
        }
        const p = it.play;
        const who = p.player;
        const face = who ? faces.get(`${who.team}:${who.name}`) : undefined;
        const big = p.kind === "td" || (p.kind === "try" && p.scoring) || p.kind === "fg";
        const turnover = p.kind === "int" || p.kind === "fumble" || p.kind === "downs";
        const defense = p.team === home ? away : home;
        return (
          <li
            key={it.key}
            className={cx("overflow-hidden rounded-md border bg-panel/90", big ? "border-gold/60" : turnover ? "border-accent/50" : "border-line")}
            style={{ borderLeft: `3px solid ${color}` }}
          >
            <div className="font-display tabular flex items-center gap-3 border-b border-line/60 bg-bg-2/60 px-3 py-1.5 text-[11px] tracking-wider text-muted">
              <span className="w-16 shrink-0">
                {p.clock === "OT" ? "OT" : `${p.clock} · Q${p.quarter}`}
              </span>
              <span className="min-w-0 flex-1 truncate text-text">
                {p.kind === "try" ? p.label : `${downText(p)} on ${spotLabel(p.spot, p.team, defense)}`}
              </span>
              <span className="shrink-0">
                {TEAMS[away].short} {p.awayScore} – {p.homeScore} {TEAMS[home].short}
              </span>
            </div>
            <div className="flex items-center gap-3 px-3 py-2.5">
              {who && (
                <div className="flex w-16 shrink-0 flex-col items-center gap-1">
                  <PlayerFace id={face?.id ?? `${who.team}:${who.name}`} pos={who.pos} color={TEAMS[who.team].color} num={face?.num} size={44} />
                  <span className="w-full truncate text-center text-[10px] text-muted">
                    {who.name.split(" ")[0][0]}. {who.name.split(" ").slice(1).join(" ")}
                  </span>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className={cx("text-sm", big && "font-semibold")}>{p.text}</p>
                {it.stat && <p className="font-display tabular mt-1 text-[11px] tracking-wider text-dim">{it.stat}</p>}
              </div>
              <div className="w-20 shrink-0 text-right">
                <p className={cx("font-display text-sm font-semibold", big ? "text-gold" : turnover ? "text-accent-hi" : "")}>{p.label}</p>
                {(p.kind === "pass" || p.kind === "run" || p.kind === "sack" || p.kind === "td") && (
                  <p className="font-display tabular text-xs text-muted">
                    {p.yards > 0 ? "+" : ""}
                    {p.yards} yds
                  </p>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
