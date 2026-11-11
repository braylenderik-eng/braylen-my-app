"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { isPowerConf, TEAMS, type TeamId } from "@/lib/game/data";
import {
  DEFENSE_STYLES, OFFENSE_STYLES, programProfile, schemeFit,
  type DefenseStyle, type OffenseStyle, type Tier,
} from "@/lib/game/program";
import { ALL_TEAMS } from "@/lib/game/season";
import { money } from "@/lib/format";
import { useGame } from "../GameProvider";
import { Button, cx, PageHeader, Panel, Stat, Tag, TeamBadge } from "../ui";

const STEPS = ["Coach", "Program", "Schemes", "Review"] as const;
const TIER_TONE: Record<Tier, "gold" | "accent" | "good" | "muted"> = { "Blue blood": "gold", Contender: "accent", Rising: "good", Rebuild: "muted" };
const CONFS = [...new Set(ALL_TEAMS.map((id) => TEAMS[id].conf))].sort((a, b) => Number(isPowerConf(b)) - Number(isPowerConf(a)));

/** New dynasty setup: name your coach, pick a program, choose your schemes, start at Week 1. */
export function NewDynasty() {
  const { state, dispatch, fresh } = useGame();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [almaMater, setAlmaMater] = useState("");
  const [team, setTeam] = useState<TeamId | null>(null);
  const [conf, setConf] = useState<string>("All");
  const [offense, setOffense] = useState<OffenseStyle>("spread");
  const [defense, setDefense] = useState<DefenseStyle>("multiple");

  const teams = useMemo(
    () => ALL_TEAMS.filter((id) => conf === "All" || TEAMS[id].conf === conf).sort((a, b) => TEAMS[b].off + TEAMS[b].def - (TEAMS[a].off + TEAMS[a].def)),
    [conf],
  );
  const canNext = [name.trim().length >= 2, team !== null, true, true][step];
  const hasSave = !fresh && (state.recaps.length > 0 || state.season > 1 || state.coach !== null);

  const start = () => {
    if (!team) return;
    dispatch({ type: "dynasty/create", coach: { name: name.trim(), almaMater: almaMater.trim(), offense, defense }, team });
    router.push("/");
  };

  return (
    <>
      <PageHeader title="New dynasty" sub={`Step ${step + 1} of ${STEPS.length} · ${STEPS[step]}`} />

      <ol className="mb-5 grid grid-cols-4 gap-2" aria-label="Setup steps">
        {STEPS.map((s, i) => (
          <li
            key={s}
            aria-current={i === step ? "step" : undefined}
            className={cx("font-display rounded-md border px-3 py-2 text-center text-xs tracking-widest", i === step ? "border-accent bg-accent/10 text-text" : i < step ? "border-line text-accent-hi" : "border-line text-dim")}
          >
            {i < step ? "✓ " : ""}
            {s}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Panel kicker="Step 1" title="Your coach">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="font-display text-xs tracking-widest text-muted">Coach name</span>
              <input
                autoFocus
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Coach Ray Dalton"
                className="mt-1 w-full rounded-md border border-line bg-bg-2 px-3 py-2.5 text-text outline-none focus:border-accent"
              />
            </label>
            <label className="block">
              <span className="font-display text-xs tracking-widest text-muted">Alma mater (optional)</span>
              <input
                value={almaMater}
                maxLength={40}
                onChange={(e) => setAlmaMater(e.target.value)}
                placeholder="Where you played or studied"
                className="mt-1 w-full rounded-md border border-line bg-bg-2 px-3 py-2.5 text-text outline-none focus:border-accent"
              />
            </label>
          </div>
          <p className="mt-3 text-sm text-muted">You&apos;ll start as a first-year head coach in Week 1 of the 2026 season.</p>
        </Panel>
      )}

      {step === 1 && (
        <Panel kicker="Step 2" title="Pick a program" bodyClassName="p-0">
          <div className="scrollbar-none flex gap-1 overflow-x-auto border-b border-line px-3 py-2" role="tablist" aria-label="Conference">
            {["All", ...CONFS].map((c) => (
              <button
                key={c}
                role="tab"
                aria-selected={conf === c}
                onClick={() => setConf(c)}
                className={cx("font-display shrink-0 rounded px-2.5 py-1.5 text-xs tracking-wider", conf === c ? "bg-accent/15 text-accent-hi" : "text-muted hover:text-text")}
              >
                {c}
              </button>
            ))}
          </div>
          <ul className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
            {teams.map((id) => {
              const t = TEAMS[id];
              const p = programProfile(id);
              const picked = team === id;
              return (
                <li key={id}>
                  <button
                    onClick={() => setTeam(id)}
                    aria-pressed={picked}
                    className={cx("flex w-full items-center gap-3 rounded-md border p-3 text-left transition-colors", picked ? "border-accent bg-accent/10" : "border-line bg-bg-2/60 hover:border-line-2")}
                  >
                    <TeamBadge id={id} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{t.name}</span>
                      <span className="font-display block text-[11px] tracking-wider text-muted">
                        {t.conf} · OFF {t.off} · DEF {t.def}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Tag tone={TIER_TONE[p.tier]}>{p.tier}</Tag>
                        <span className="font-display text-[11px] tracking-wider text-dim">
                          {p.winTarget} wins expected · NIL {money(p.baseBudget)}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      {step === 2 && (
        <div className="grid gap-5 lg:grid-cols-2">
          <StylePicker
            kicker="Step 3 · Offense"
            title="Offensive philosophy"
            options={OFFENSE_STYLES}
            value={offense}
            onChange={(v) => setOffense(v as OffenseStyle)}
            planLabel={(p) => ({ air: "Air it out", balanced: "Balanced", ground: "Ground game" })[p as string] ?? p}
          />
          <StylePicker
            kicker="Step 3 · Defense"
            title="Defensive philosophy"
            options={DEFENSE_STYLES}
            value={defense}
            onChange={(v) => setDefense(v as DefenseStyle)}
            planLabel={(p) => ({ pressure: "Bring pressure", base: "Base", bend: "Bend, don't break" })[p as string] ?? p}
          />
          <p className="text-sm text-muted lg:col-span-2">
            Your schemes set your default game plan, give a small edge when you call them, and make prospects at
            {" "}
            <strong className="text-text">{schemeFit({ offense, defense }).join(", ")}</strong> easier to land.
          </p>
        </div>
      )}

      {step === 3 && team && (
        <Panel kicker="Step 4" title="Review and start">
          <div className="flex items-center gap-4">
            <TeamBadge id={team} size="lg" />
            <div>
              <p className="font-display text-xl font-semibold">{TEAMS[team].name}</p>
              <p className="text-sm text-muted">
                Head coach {name.trim()}
                {almaMater.trim() ? ` (${almaMater.trim()})` : ""} · {TEAMS[team].conf}
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Stat label="Program" value={programProfile(team).tier} tone="gold" />
            <Stat label="Win target" value={programProfile(team).winTarget} />
            <Stat label="NIL budget" value={money(programProfile(team).baseBudget)} tone="good" />
            <Stat label="Offense" value={OFFENSE_STYLES[offense].name} />
            <Stat label="Defense" value={DEFENSE_STYLES[defense].name} />
          </div>
          <p className="mt-4 text-sm text-muted">
            Season 1 starts at Week 1 of 2026: 12 regular-season games, the recruiting board for next year&apos;s class, Early Signing
            Day in December, then the 12-team playoff. The 24-team format starts in Season 2.
          </p>
          {hasSave && <p className="mt-2 text-sm text-gold">Starting a new dynasty replaces your current save.</p>}
        </Panel>
      )}

      <div className="mt-5 flex justify-between gap-3">
        <Button variant="ghost" onClick={() => (step === 0 ? router.push("/") : setStep(step - 1))}>
          {step === 0 ? "Cancel" : "Back"}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button disabled={!canNext} onClick={() => setStep(step + 1)}>
            Next
          </Button>
        ) : (
          <Button onClick={start}>Start dynasty</Button>
        )}
      </div>
    </>
  );
}

function StylePicker<K extends string>({
  kicker,
  title,
  options,
  value,
  onChange,
  planLabel,
}: {
  kicker: string;
  title: string;
  options: Record<K, { name: string; blurb: string; plan: string; fit: string[] }>;
  value: K;
  onChange: (v: K) => void;
  planLabel: (plan: string) => string;
}) {
  return (
    <Panel kicker={kicker} title={title}>
      <div role="radiogroup" aria-label={title} className="grid gap-2">
        {(Object.keys(options) as K[]).map((k) => {
          const o = options[k];
          const on = value === k;
          return (
            <button
              key={k}
              role="radio"
              aria-checked={on}
              onClick={() => onChange(k)}
              className={cx("rounded-md border p-3 text-left transition-colors", on ? "border-accent bg-accent/10" : "border-line bg-bg-2/60 hover:border-line-2")}
            >
              <span className="font-display block font-semibold tracking-wide">{o.name}</span>
              <span className="block text-sm text-muted">{o.blurb}</span>
              <span className="font-display mt-1 block text-[11px] tracking-wider text-dim">
                Plan: {planLabel(o.plan)} · Recruits: {o.fit.join(", ")}
              </span>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}
