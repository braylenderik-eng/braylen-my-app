"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FINAL_WEEK, SCOUTING, TEAMS, USER_TEAM, type TeamId } from "@/lib/game/data";
import type { DefensePlan, Drive, GameResult, OffensePlan, StatLine } from "@/lib/game/sim";
import {
  champion, currentUserFixture, findPortalPlayer, firstWeek, isPlayoffs, PLAYOFF_ROUNDS, PLAYOFF_START, playoffField, playoffFixtures,
  roundOf, scheduleFixture, seasonOver, seasonSummary, seedOf, userEliminated, weekLabel, type GameState, type Score,
  type WeekRecap,
} from "@/lib/game/state";
import { pct } from "@/lib/format";
import { useGame } from "../GameProvider";
import { MatchupHero, useMatchup, type MatchupInfo } from "../Matchup";
import { OffseasonHub } from "../OffseasonHub";
import { Button, cx, PageHeader, Panel, Stat, Tag, TeamBadge } from "../ui";
import { UnitCard, unitEdges } from "../UnitMatchups";

const TITLE_WEEK = PLAYOFF_START + PLAYOFF_ROUNDS.length - 1;

export function SimScreen() {
  const { state } = useGame();
  const [viewWeek, setViewWeek] = useState<number | null>(null);
  const latest = state.recaps[state.recaps.length - 1];
  const viewing = viewWeek !== null ? state.recaps.find((r) => r.week === viewWeek) : state.unseenRecap ? latest : undefined;
  const hasGame = !!currentUserFixture(state);

  let body;
  if (viewing) body = <Recap recap={viewing} fresh={state.unseenRecap && viewing === latest} onBack={() => setViewWeek(null)} />;
  else if (seasonOver(state)) body = <SeasonComplete state={state} />;
  else if (isPlayoffs(state) && !hasGame) body = <PlayoffWatch state={state} />;
  else body = <GamePlan state={state} />;

  return (
    <>
      <WeekStrip state={state} selected={viewing?.week ?? (seasonOver(state) ? null : state.week)} onSelect={setViewWeek} />
      {body}
    </>
  );
}

// ---- Week strip -----------------------------------------------------------------

function WeekStrip({ state, selected, onSelect }: { state: GameState; selected: number | null; onSelect: (w: number | null) => void }) {
  const chips = [];
  for (let w = firstWeek(state); w <= TITLE_WEEK; w++) {
    const recap = state.recaps.find((r) => r.week === w);
    const isCurrent = w === state.week;
    let opp: TeamId | null = null;
    let away = false;
    if (w <= FINAL_WEEK) {
      const f = scheduleFixture(state, w)!;
      opp = f.home === USER_TEAM ? f.away : f.home;
      away = f.home !== USER_TEAM;
    } else if (recap?.game) {
      opp = recap.game.home === USER_TEAM ? recap.game.away : recap.game.home;
    } else if (isCurrent) {
      const f = currentUserFixture(state);
      if (f) opp = f.home === USER_TEAM ? f.away : f.home;
    }
    const result = recap?.game ? outcome(recap.game) : null;
    const label = w <= FINAL_WEEK ? `W${w}` : ["R1", "QF", "SF", "Final"][roundOf(w)];
    chips.push(
      <button
        key={w}
        onClick={() => onSelect(recap ? w : null)}
        disabled={!recap && !isCurrent}
        className={cx(
          "flex shrink-0 items-center gap-2 rounded-md border px-3 py-1.5 transition-colors",
          selected === w ? "border-accent bg-accent/10" : "border-line bg-panel hover:border-line-2",
          !recap && !isCurrent && "opacity-50",
        )}
      >
        <span className="font-display text-xs tracking-widest text-muted">{label}</span>
        {opp ? (
          <>
            <span className="font-display text-xs text-dim">{away ? "@" : "vs"}</span>
            <TeamBadge id={opp} size="sm" />
          </>
        ) : (
          w > FINAL_WEEK && (
            <span className="font-display text-xs text-dim">
              {recap ? (roundOf(w) === 0 && (seedOf(state, USER_TEAM) ?? 99) <= 4 ? "Bye" : "—") : "TBD"}
            </span>
          )
        )}
        {result && (
          <span className={cx("font-display tabular text-xs font-semibold", result.won ? "text-good" : "text-bad")}>
            {result.won ? "W" : "L"} {result.us}–{result.them}
          </span>
        )}
      </button>,
    );
    if (w === FINAL_WEEK) {
      chips.push(
        <span key="sel" className="font-display flex shrink-0 items-center px-1 text-[10px] tracking-widest text-dim">
          Playoffs ›
        </span>,
      );
    }
  }
  return <div className="scrollbar-none mb-5 flex gap-2 overflow-x-auto">{chips}</div>;
}

function outcome(g: GameResult) {
  const home = g.home === USER_TEAM;
  const us = home ? g.homeScore : g.awayScore;
  const them = home ? g.awayScore : g.homeScore;
  return { won: us > them, us, them, opp: (home ? g.away : g.home) as TeamId };
}

// ---- Game plan ------------------------------------------------------------------

const OFFENSE: { id: OffensePlan; name: string; tag: string }[] = [
  { id: "ground", name: "Ground and pound", tag: "Fewer turnovers" },
  { id: "balanced", name: "Balanced", tag: "Steady" },
  { id: "air", name: "Air it out", tag: "Boom or bust" },
];

const DEFENSE: { id: DefensePlan; name: string; tag: string }[] = [
  { id: "pressure", name: "Bring pressure", tag: "More takeaways" },
  { id: "base", name: "Base", tag: "Steady" },
  { id: "bend", name: "Bend, don't break", tag: "No big plays" },
];

/** Hand-written scouting where we have it; a generated report from team ratings otherwise. */
function scoutingFor(state: GameState, id: TeamId) {
  // Hand-written reports describe Season 1; after that, rosters have turned over.
  const known = state.season === 1 ? SCOUTING[id] : undefined;
  if (known) return known;
  const t = state.teamRatings[id];
  const offFirst = t.off >= t.def;
  return {
    scheme: offFirst ? "Spread · up-tempo" : "Multiple · defense first",
    notes: offFirst
      ? ["They want a shootout and play fast to get one.", "Their defense gives up chunk plays on the perimeter.", "They go for it on fourth down more than anyone you've played."]
      : ["They win with defense and field position.", "Their front seven is the best unit on the field.", "Their offense stalls against pressure — they rarely throw past 15 yards."],
    threat: offFirst ? "Their passing game. Keep everything in front of you." : "Their pass rush. Get the ball out fast.",
    keys: offFirst
      ? ["Control the clock and keep their offense on the sideline.", "Tackle well in space.", "Score touchdowns, not field goals."]
      : ["Protect the quarterback.", "Win the field-position battle.", "One explosive play may decide it."],
  };
}

function GamePlan({ state }: { state: GameState }) {
  const { dispatch } = useGame();
  const m = useMatchup(state);
  const [simming, setSimming] = useState(false);
  if (!m) return null;
  const scout = scoutingFor(state, m.them);
  const edges = unitEdges(state, m.us, m.them);
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
      <PageHeader
        title="Game plan"
        sub={`Season ${state.season} · ${weekLabel(state.week)} · ${m.neutral ? "Neutral site" : m.fixture.home === USER_TEAM ? "Home game" : "Road game"}`}
      />
      <SelectionBanner state={state} />
      <MatchupHero state={state} m={m} />

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Panel kicker="The plan" title="Keys to the game">
          <ol className="space-y-2.5">
            {scout.keys.map((k, i) => (
              <li key={k} className="flex gap-3 rounded-md border border-line bg-bg-2/70 p-3">
                <span className="font-display flex size-6 shrink-0 items-center justify-center rounded bg-accent text-sm font-bold">{i + 1}</span>
                <p className="text-sm leading-6">{k}</p>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel kicker="Their sideline" title={`How ${TEAMS[m.them].name.split(" ").slice(-1)[0]} coach it`} right={<Tag tone="muted">{scout.scheme}</Tag>}>
          <ul className="space-y-2">
            {scout.notes.map((n) => (
              <li key={n} className="flex gap-2.5 rounded-md border border-line bg-bg-2/70 px-3 py-2 text-sm leading-6">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent-hi" />
                {n}
              </li>
            ))}
          </ul>
        </Panel>

        <Availability state={state} them={m.them} />
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
          <p className="mt-3 rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-sm">
            <span className="font-display mr-2 text-xs tracking-widest text-accent-hi">Biggest threat</span>
            {scout.threat}
          </p>
        </Panel>
      </div>

      <p className="mt-5 text-sm text-muted">
        Our ratings come from your starters.{" "}
        <Link href="/roster" className="text-accent-hi hover:underline">
          Change the depth chart
        </Link>{" "}
        to move them.
      </p>

      <SimBar
        m={m}
        simming={simming}
        onSim={sim}
        onSimToPlayoffs={
          isPlayoffs(state) || state.week >= FINAL_WEEK
            ? undefined
            : () => {
                setSimming(true);
                setTimeout(() => {
                  dispatch({ type: "sim/toPlayoffs" });
                  setSimming(false);
                  window.scrollTo({ top: 0 });
                }, 900);
              }
        }
      />
    </div>
  );
}

function Availability({ state, them }: { state: GameState; them: TeamId }) {
  const { dispatch } = useGame();
  const hurt = state.players.filter((p) => state.injuries[p.id]);
  return (
    <Panel kicker="Injury report" title="Availability">
      <div className="space-y-4">
        <div>
          <p className="font-display text-xs tracking-widest text-muted">{TEAMS[them].name}</p>
          <p className="mt-1 text-sm">Full strength.</p>
        </div>
        <div>
          <p className="font-display text-xs tracking-widest text-muted">{TEAMS[USER_TEAM].name}</p>
          {hurt.length === 0 && <p className="mt-1 text-sm">Full strength.</p>}
          <ul className="mt-2 space-y-3">
            {hurt.map((p) => {
              const inj = state.injuries[p.id];
              const call = state.gameTime[p.id] ?? "rest";
              return (
                <li key={p.id}>
                  <p className="text-sm">
                    <span className="font-semibold">
                      {p.pos} {p.name}
                    </span>{" "}
                    ({inj.desc}) —{" "}
                    {inj.status === "out" ? (
                      <span className="text-bad">out {inj.weeks > 1 ? `${inj.weeks} games` : "this game"}</span>
                    ) : (
                      <span className="text-gold">questionable</span>
                    )}
                  </p>
                  {inj.status === "questionable" && (
                    <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label={`${p.name} status`}>
                      <Choice
                        active={call === "start"}
                        onClick={() => dispatch({ type: "gametime/set", playerId: p.id, call: "start" })}
                        title="Start him"
                        blurb="Plays at full strength. ~30% chance he gets hurt again mid-game."
                      />
                      <Choice
                        active={call === "rest"}
                        onClick={() => dispatch({ type: "gametime/set", playerId: p.id, call: "rest" })}
                        title="Rest him"
                        blurb="Next man up on the depth chart starts."
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Panel>
  );
}

function PlanPicker<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { id: T; name: string; tag: string }[];
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
        aria-label={label}
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
      className={cx("rounded-md border p-2.5 text-left transition-colors", active ? "border-accent bg-accent/10" : "border-line bg-bg-2/70 hover:border-line-2")}
    >
      <p className="font-display text-sm font-semibold">{title}</p>
      <p className="mt-0.5 text-xs leading-5 text-muted">{blurb}</p>
    </button>
  );
}

function SimBar({ m, simming, onSim, onSimToPlayoffs }: { m: MatchupInfo; simming: boolean; onSim: () => void; onSimToPlayoffs?: () => void }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
        <TeamBadge id={m.us} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="font-display truncate text-sm font-semibold">
            {m.home || m.neutral ? "vs" : "at"} {TEAMS[m.them].name}
          </p>
          <p className="font-display tabular text-xs tracking-wider text-muted">
            Win <span className="text-accent-hi">{pct(m.winProb)}</span> with this plan ·{" "}
            {m.odds ? `Playoff odds ${pct(m.odds.win)} with a win, ${pct(m.odds.loss)} with a loss` : "Win or go home"}
          </p>
        </div>
        {onSimToPlayoffs && (
          <Button variant="outline" onClick={onSimToPlayoffs} disabled={simming} className="hidden px-4 py-3 sm:inline-flex">
            Sim to playoffs
          </Button>
        )}
        <Button onClick={onSim} disabled={simming} className="px-6 py-3 text-base sm:px-10">
          {simming ? "Simulating…" : "Sim game"}
        </Button>
      </div>
    </div>
  );
}

// ---- Playoffs ---------------------------------------------------------------------

/** Shown at the start of the playoffs, before any game is played. */
function SelectionBanner({ state }: { state: GameState }) {
  if (!state.playoff || state.playoff.games.length > 0 || !isPlayoffs(state)) return null;
  const seed = seedOf(state, USER_TEAM);
  return (
    <div
      className={cx(
        "mb-5 rounded-lg border p-5",
        seed ? "border-good/40 bg-gradient-to-br from-good/15 to-panel" : "border-accent/40 bg-gradient-to-br from-accent/15 to-panel",
      )}
    >
      <p className="font-display text-xs tracking-[0.2em] text-muted">Selection day</p>
      <p className="font-display text-3xl leading-tight font-bold sm:text-4xl">
        {seed ? `You're in — No. ${seed} seed${seed <= 4 ? " · first-round bye" : ""}` : "Left out of the 12-team field"}
      </p>
    </div>
  );
}

function PlayoffWatch({ state }: { state: GameState }) {
  const { dispatch } = useGame();
  const [simming, setSimming] = useState(false);
  const round = roundOf(state.week);
  const seed = seedOf(state, USER_TEAM);
  const out = userEliminated(state);
  const sim = () => {
    setSimming(true);
    setTimeout(() => {
      dispatch({ type: "sim/week" });
      setSimming(false);
      window.scrollTo({ top: 0 });
    }, 700);
  };
  return (
    <div>
      <PageHeader
        title={PLAYOFF_ROUNDS[round]}
        sub={`Season ${state.season} · 12-team playoff`}
        right={
          <Button onClick={sim} disabled={simming}>
            {simming ? "Simulating…" : `Sim ${PLAYOFF_ROUNDS[round].toLowerCase()}`}
          </Button>
        }
      />
      <SelectionBanner state={state} />
      <p className="mb-5 rounded-lg border border-line bg-panel px-4 py-3 text-sm">
        {seed && !out
          ? `You have a first-round bye as the No. ${seed} seed. Sim the round to see who you face in the quarterfinals.`
          : seed
            ? "Your season is over. Sim the remaining rounds to crown a champion."
            : "The Stallions missed the field. Sim the rounds to watch the playoff play out."}
      </p>
      <Bracket state={state} />
    </div>
  );
}

function Bracket({ state }: { state: GameState }) {
  const games = state.playoff?.games ?? [];
  const field = playoffField(state);
  return (
    <Panel kicker="12-team field" title="The bracket" bodyClassName="p-0">
      <div className="overflow-x-auto p-4">
        <div className="grid min-w-[880px] grid-cols-4 gap-4">
          {PLAYOFF_ROUNDS.map((name, round) => (
            <div key={name} className="flex flex-col">
              <p className="font-display mb-2 text-xs tracking-widest text-accent-hi">{name}</p>
              <div className="flex flex-1 flex-col justify-around gap-3">
                {playoffFixtures(state, round).map((f, slot) => (
                  <BracketGame key={slot} state={state} f={f} g={games.find((x) => x.round === round && x.slot === slot)} round={round} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted">Byes: {field.slice(0, 4).map((t) => `(${t.seed}) ${TEAMS[t.id].name}`).join(" · ")}</p>
      </div>
    </Panel>
  );
}

function BracketGame({ state, f, g, round }: { state: GameState; f: ReturnType<typeof playoffFixtures>[number]; g?: Score; round: number }) {
  if (!f) {
    return <div className="font-display rounded-md border border-dashed border-line px-3 py-4 text-center text-xs tracking-widest text-dim">TBD</div>;
  }
  const rows: [TeamId, number | undefined][] = [
    [f.home, g?.homeScore],
    [f.away, g?.awayScore],
  ];
  const winner = g ? (g.homeScore > g.awayScore ? g.home : g.away) : null;
  const current = !g && roundOf(state.week) === round;
  return (
    <div className={cx("rounded-md border bg-bg-2/70", current ? "border-accent/60" : "border-line")}>
      {rows.map(([id, pts]) => (
        <div key={id} className={cx("flex items-center gap-2 px-2.5 py-1.5", winner && winner !== id && "opacity-45")}>
          <span className="font-display tabular w-4 text-xs text-dim">{seedOf(state, id)}</span>
          <TeamBadge id={id} size="sm" />
          <span className={cx("flex-1 truncate text-sm", id === USER_TEAM && "font-bold text-accent-hi", winner === id && "font-semibold")}>{TEAMS[id].name}</span>
          {pts !== undefined && <span className="font-display tabular text-base font-semibold">{pts}</span>}
        </div>
      ))}
    </div>
  );
}

function SeasonComplete({ state }: { state: GameState }) {
  const champ = champion(state);
  const won = champ === USER_TEAM;
  return (
    <div>
      <PageHeader title={won ? "National champions" : "Season complete"} sub={`Season ${state.season} · Final`} />
      {champ && (
        <div
          className={cx(
            "mb-5 flex items-center gap-4 rounded-lg border p-5 sm:p-8",
            won ? "border-gold/50 bg-gradient-to-br from-gold/20 via-panel to-panel" : "border-line bg-panel",
          )}
        >
          <TeamBadge id={champ} size="xl" />
          <div>
            <p className="font-display text-xs tracking-[0.2em] text-gold">National champion</p>
            <p className="font-display text-3xl leading-tight font-bold sm:text-5xl">{TEAMS[champ].name}</p>
            <p className="mt-1 text-muted">
              {won ? "The Stallions finish what they started. Now go do it again." : "The offseason starts below."}
            </p>
          </div>
        </div>
      )}
      <Offseason state={state} />
      <div className="mt-5">
        <Bracket state={state} />
      </div>
    </div>
  );
}

function Offseason({ state }: { state: GameState }) {
  const { dispatch } = useGame();
  return (
    <div className="grid gap-5 lg:grid-cols-12">
      <div className="lg:col-span-8">
        {state.offseason ? (
          <OffseasonHub state={state} />
        ) : (
          <Panel kicker="What's next" title="The offseason">
            <p className="max-w-2xl leading-6 text-muted">
              Seniors graduate and everyone else develops. Then the portal window opens — keep your own players from leaving and bid on
              transfers — and you recruit a high-school class over three rounds before Signing Day.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => dispatch({ type: "offseason/start" })}>Start the offseason</Button>
              <Button variant="ghost" onClick={() => dispatch({ type: "season/next" })}>
                Skip straight to Season {state.season + 1}
              </Button>
            </div>
          </Panel>
        )}
      </div>
      <Panel kicker="Program" title="History" className="lg:col-span-4">
        <HistoryTable rows={state.offseason ? state.history : [...state.history, seasonSummary(state)]} />
      </Panel>
    </div>
  );
}

export function HistoryTable({ rows }: { rows: GameState["history"] }) {
  if (!rows.length) return <p className="text-sm text-muted">No completed seasons yet.</p>;
  return (
    <ul className="space-y-2">
      {[...rows].reverse().map((h) => (
        <li key={h.season} className="rounded-md border border-line bg-bg-2/70 px-3 py-2">
          <div className="flex justify-between">
            <span className="font-display text-sm tracking-wider">Season {h.season}</span>
            <span className="font-display tabular text-sm">
              {h.wins}–{h.losses} · #{h.rank}
            </span>
          </div>
          <p className={cx("text-sm", h.finish === "National champions" ? "font-semibold text-gold" : "text-muted")}>
            {h.finish}
            {h.seed ? ` · No. ${h.seed} seed` : ""}
          </p>
          {h.champion && h.champion !== USER_TEAM && <p className="text-xs text-dim">Champion: {TEAMS[h.champion].name}</p>}
        </li>
      ))}
    </ul>
  );
}

// ---- Recap ------------------------------------------------------------------------

function Recap({ recap, fresh, onBack }: { recap: WeekRecap; fresh: boolean; onBack: () => void }) {
  const { state, dispatch } = useGame();
  const router = useRouter();
  const g = recap.game;
  const o = g ? outcome(g) : null;
  const moved = recap.rankBefore - recap.rankAfter;
  const regular = recap.week <= FINAL_WEEK;

  const finish = () => {
    if (fresh) dispatch({ type: "recap/seen" });
    onBack();
    // After a regular-season week, go back to the dashboard; in the playoffs stay here for the next round.
    if (fresh && regular && recap.week !== FINAL_WEEK) router.push("/");
  };

  const title = o ? (o.won ? (recap.week === TITLE_WEEK ? "Champions" : "Victory") : "Defeat") : `${weekLabel(recap.week)} results`;

  return (
    <div>
      <PageHeader
        title={title}
        sub={`Season ${state.season} · ${weekLabel(recap.week)} · Final${g?.overtime ? " / OT" : ""}`}
        right={<Button onClick={finish}>{fresh ? "Continue" : "Back"}</Button>}
      />

      {g && (
        <>
          <Scoreboard g={g} />
          <div className="mt-5 grid gap-5 lg:grid-cols-3">
            <Panel kicker="How it happened" title="Scoring summary" className="lg:col-span-2">
              <ScoringSummary drives={g.drives} g={g} />
            </Panel>
            <div className="space-y-5">
              {regular ? (
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
              ) : (
                <Panel kicker="Playoff" title={o?.won ? (recap.week === TITLE_WEEK ? "National champions" : "Advancing") : "Eliminated"}>
                  <p className="text-sm text-muted">
                    {o?.won ? (recap.week === TITLE_WEEK ? "The title is yours." : `On to the ${PLAYOFF_ROUNDS[roundOf(recap.week) + 1].toLowerCase()}.`) : "The season ends here."}
                  </p>
                </Panel>
              )}
              <FrontOfficeNotes recap={recap} g={g} />
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
        </>
      )}

      {!g && <FrontOfficeNotes recap={recap} />}

      {regular ? (
        <Panel kicker={weekLabel(recap.week)} title="Around the league" className="mt-5">
          <ScoreGrid scores={recap.others} />
        </Panel>
      ) : (
        <div className="mt-5">
          <Bracket state={state} />
        </div>
      )}
    </div>
  );
}

function FrontOfficeNotes({ recap, g }: { recap: WeekRecap; g?: GameResult }) {
  const notes = g?.notes ?? [];
  if (!notes.length && !recap.bidUpdates.length && !recap.injuryUpdates.length) return null;
  return (
    <Panel kicker="Front office" title="Notes">
      <ul className="space-y-2 text-sm">
        {notes.map((n) => (
          <li key={n} className="flex gap-2">
            <Tag tone="gold">Game</Tag>
            <span>{n}</span>
          </li>
        ))}
        {recap.injuryUpdates.map((u) => (
          <li key={u.playerId + u.text} className="flex gap-2">
            <Tag tone={u.text.includes("healthy") ? "good" : "accent"}>Injury</Tag>
            <span>{u.text}</span>
          </li>
        ))}
        {recap.bidUpdates.map((u) => (
          <li key={u.playerId} className="flex gap-2">
            <Tag tone={u.status === "signed" ? "good" : "muted"}>Portal</Tag>
            <span>
              {findPortalPlayer(u.playerId)!.name} {u.status === "signed" ? "signed and joins the depth chart." : "went elsewhere. NIL and scholarship returned."}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function ScoreGrid({ scores }: { scores: Score[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {scores.map((r) => {
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
                <span className={cx("flex-1 truncate text-sm", won ? "font-semibold" : "text-muted")}>{TEAMS[id].name}</span>
                <span className={cx("font-display tabular text-lg", won ? "font-bold" : "text-muted")}>{pts}</span>
              </div>
            ))}
          </div>
        );
      })}
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
              <div className="mt-1 flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-line">
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
