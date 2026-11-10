"use client";

import type { PressChoice } from "@/lib/game/state";
import { money } from "@/lib/format";
import { useGame } from "../GameProvider";
import { cx, PageHeader, Panel, Stat, Tag } from "../ui";

export function News() {
  const { state, dispatch } = useGame();
  const d = state.rook.decision;
  const question =
    state.season > 1
      ? `Coach, Season ${state.season}. The fans expect more after last year. What's the message?`
      : d === null
      ? "Coach, Rook wants $1.1M or he walks Friday. Bayou is in his ear. Are you paying him, or pivoting to the portal?"
      : d === "walked"
        ? "Coach, Rook is headed to the portal. Was that the plan, or did Bayou beat you?"
        : "Coach, $1.1M for a high schooler. Was Rook worth it with a playoff spot on the line?";

  const answers: { id: PressChoice; quote: string; effect: string }[] = [
    {
      id: "match",
      quote: state.season > 1 ? "We're here to win it all. Nothing less." : "We're matching. Stallions finish what we start.",
      effect: d === null && state.season === 1 ? "Rook interest up · −$50K budget · fan reaction +" : "Hype up · fans buy in",
    },
    {
      id: "board",
      quote: state.season > 1 ? "We trust the process and our young guys." : "We trust our board. Portal opens Friday.",
      effect: d === null && state.season === 1 ? "Rook interest down · save budget · locker room calm" : "Budget stays put · locker room calm",
    },
    { id: "nocomment", quote: state.season > 1 ? "We'll let the games do the talking." : "No comment on recruiting dollars.", effect: "Neutral · media trust down slightly" },
  ];

  return (
    <>
      <PageHeader title="News & press" sub={`Season ${state.season} · Stallions desk · the wire`} />
      <div className="grid gap-5 lg:grid-cols-12">
        <Panel kicker="Latest" title="Headlines" className="lg:col-span-7" bodyClassName="p-0">
          <ul className="divide-y divide-line/60">
            {state.news.map((n) => (
              <li key={n.id} className="flex gap-3 px-4 py-3">
                <span className="font-display w-12 shrink-0 text-xs text-dim">{n.when}</span>
                <div>
                  <Tag tone={n.tag === "GAME" ? "accent" : n.tag === "INJURY" ? "gold" : "muted"}>{n.tag}</Tag>
                  <p className="mt-1 leading-6">{n.headline}</p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel kicker="Austin Grid Wire · post-practice" title="Press conference" className="lg:col-span-5">
          <p className="rounded-md border border-line bg-bg-2/80 p-3 leading-6">
            <span className="font-display mr-1 text-xs tracking-widest text-accent-hi">Reporter</span> {question}
          </p>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {state.season === 1 ? <Stat label="Rook int" value={`${state.rook.interest}%`} /> : <Stat label="Season" value={state.season} />}
            <Stat label="Hype" value={state.hype} />
            <Stat label="Trust" value={state.mediaTrust} />
            <Stat label="NIL" value={money(state.nilBudget)} />
          </div>
          <div className="mt-4 space-y-2">
            {answers.map((a) => {
              const chosen = state.press === a.id;
              return (
                <button
                  key={a.id}
                  disabled={!!state.press}
                  onClick={() => dispatch({ type: "press/answer", choice: a.id })}
                  className={cx(
                    "w-full rounded-md border p-3 text-left transition-colors",
                    chosen ? "border-accent bg-accent/10" : "border-line bg-bg-2/70",
                    !state.press && "hover:border-line-2",
                    state.press && !chosen && "opacity-40",
                  )}
                >
                  <p className="font-semibold">“{a.quote}”</p>
                  <p className="mt-0.5 text-xs text-muted">{a.effect}</p>
                </button>
              );
            })}
          </div>
          {state.press && <p className="mt-3 text-sm text-muted">The quote is on the wire. A new question comes after you sim the week.</p>}
        </Panel>
      </div>
    </>
  );
}
