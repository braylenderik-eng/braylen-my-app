"use client";

import { useMemo, useState } from "react";
import { TEAMS } from "@/lib/game/data";
import * as A from "@/lib/game/awards";
import { POS_LABEL } from "@/lib/game/roster";
import { awardsEnabled, weekLabel } from "@/lib/game/state";
import type { StatLine } from "@/lib/game/sim";
import { useGame } from "../GameProvider";
import { PlayerFace } from "../PlayerFace";
import { DraftHistory } from "../Development";
import { cx, PageHeader, Panel, Tag, TeamBadge } from "../ui";

const CATEGORIES: { key: keyof StatLine; label: string; fmt?: (c: A.Candidate) => string }[] = [
  { key: "passYds", label: "Passing yards", fmt: (c) => `${c.passTd ?? 0} TD, ${c.int ?? 0} INT` },
  { key: "rushYds", label: "Rushing yards", fmt: (c) => `${c.rushTd ?? 0} TD` },
  { key: "recYds", label: "Receiving yards", fmt: (c) => `${c.rec ?? 0} rec, ${c.recTd ?? 0} TD` },
  { key: "sacks", label: "Sacks" },
  { key: "takeaways", label: "Takeaways" },
];

/** League leaders, the national award race, season awards and All-Conference. */
export function StatsScreen() {
  const { state } = useGame();
  const [cat, setCat] = useState(0);
  const cands = useMemo(
    () => (state.league ? A.candidates(state.league, state.seasonStats, state.players, state.standings) : []),
    [state.league, state.seasonStats, state.players, state.standings],
  );
  const color = (team: string) => TEAMS[team as keyof typeof TEAMS]?.color;
  const thisSeason = state.awards.filter((a) => a.season === state.season);
  const past = state.awards.filter((a) => a.season < state.season && a.award === A.AWARDS.crown);
  const enabled = awardsEnabled(state);
  const c = CATEGORIES[cat];
  const top = A.leaders(cands, c.key, 10);

  return (
    <>
      <PageHeader title="Stats & awards" sub={`Season ${state.season} · ${state.offseason ? "Offseason" : weekLabel(state.week, state.season)}`} />
      <div className="grid gap-5 lg:grid-cols-12">
        {thisSeason.length > 0 ? (
          <Panel kicker={`Season ${state.season}`} title="Award winners" className="lg:col-span-7" bodyClassName="p-0">
            <ul className="divide-y divide-line/60">
              {thisSeason.map((a) => (
                <li key={a.award} className={cx("flex items-center gap-3 px-4 py-3", a.mine && "bg-accent/5")}>
                  {a.pos === "HC" ? <TeamBadge id={a.team} /> : <PlayerFace id={a.id} pos={a.pos} color={color(a.team)} size={44} />}
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-[11px] tracking-widest text-gold">{a.award}</p>
                    <p className="truncate font-semibold">
                      {a.name} {a.mine && <Tag tone="good">Yours</Tag>}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {a.pos !== "HC" && `${a.pos}${a.yr ? ` · ${a.yr}` : ""} · `}
                      {TEAMS[a.team].name} · {a.line}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        ) : (
          <Panel kicker={A.AWARDS.crown} title="Award race" className="lg:col-span-7" bodyClassName="p-0">
            {!enabled ? (
              <p className="p-4 text-sm text-muted">The quick start joins at Week 11, so awards begin next season.</p>
            ) : cands.length === 0 ? (
              <p className="p-4 text-sm text-muted">The race starts after Week 1.</p>
            ) : (
              <ol className="divide-y divide-line/60">
                {cands.slice(0, 8).map((x, i) => (
                  <li key={x.id} className={cx("flex items-center gap-3 px-4 py-2.5", x.mine && "bg-accent/5")}>
                    <span className="font-display tabular w-5 text-right text-sm text-dim">{i + 1}</span>
                    <PlayerFace id={x.id} pos={x.pos} color={color(x.team)} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">
                        {x.name} {x.mine && <Tag tone="good">Yours</Tag>}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {x.pos} · {TEAMS[x.team].short} · {A.statSummary(x)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {enabled && <p className="px-4 pb-3 text-xs text-dim">Production plus team success. Winners are announced after rivalry week.</p>}
          </Panel>
        )}

        <Panel kicker="National" title="Leaders" className="lg:col-span-5" bodyClassName="p-0">
          <div className="scrollbar-none flex gap-1 overflow-x-auto border-b border-line px-3 py-2" role="tablist" aria-label="Category">
            {CATEGORIES.map((k, i) => (
              <button
                key={k.key}
                role="tab"
                aria-selected={cat === i}
                onClick={() => setCat(i)}
                className={cx("font-display shrink-0 rounded px-2.5 py-1.5 text-xs tracking-wider", cat === i ? "bg-accent/15 text-accent-hi" : "text-muted hover:text-text")}
              >
                {k.label}
              </button>
            ))}
          </div>
          {top.length === 0 ? (
            <p className="p-4 text-sm text-muted">No games played yet.</p>
          ) : (
            <ol className="divide-y divide-line/60">
              {top.map((x, i) => (
                <li key={x.id} className={cx("flex items-center gap-3 px-4 py-2", x.mine && "bg-accent/5")}>
                  <span className="font-display tabular w-5 text-right text-xs text-dim">{i + 1}</span>
                  <PlayerFace id={x.id} pos={x.pos} color={color(x.team)} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className={cx("truncate text-sm font-semibold", x.mine && "text-accent-hi")}>{x.name}</p>
                    <p className="truncate text-[11px] text-muted">
                      {x.pos} · {TEAMS[x.team].short}
                      {c.fmt ? ` · ${c.fmt(x)}` : ""}
                    </p>
                  </div>
                  <span className="font-display tabular text-lg font-semibold">{(x[c.key] as number).toLocaleString()}</span>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        {state.allConference && state.allConference.season === state.season && (
          <Panel kicker={TEAMS[state.team].conf} title="All-Conference first team" className="lg:col-span-12">
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {state.allConference.picks.map((p) => (
                <li key={`${p.pos}-${p.id}`} className={cx("flex items-center gap-3 rounded-md border px-3 py-2", p.mine ? "border-accent/50 bg-accent/5" : "border-line bg-bg-2/60")}>
                  <PlayerFace id={p.id} pos={p.pos} color={color(p.team)} size={36} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{p.name}</p>
                    <p className="truncate text-[11px] text-muted">
                      {POS_LABEL[p.pos]} · {TEAMS[p.team].short}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        <div className="lg:col-span-12">
          <DraftHistory state={state} />
        </div>

        {past.length > 0 && (
          <Panel kicker="History" title={`${A.AWARDS.crown} winners`} className="lg:col-span-12" bodyClassName="p-0">
            <ul className="divide-y divide-line/60">
              {[...past].reverse().map((a) => (
                <li key={a.season} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="font-display w-20 text-sm text-muted">Season {a.season}</span>
                  <PlayerFace id={a.id} pos={a.pos} color={color(a.team)} size={32} />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    <span className="font-semibold">{a.name}</span> · {a.pos} · {TEAMS[a.team].name}
                  </span>
                  {a.mine && <Tag tone="good">Yours</Tag>}
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </>
  );
}
