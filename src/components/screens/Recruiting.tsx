"use client";

import { ROOK_ASK, ROOK_CURRENT, ROOK_OFFERS } from "@/lib/game/data";
import { KEY_DATES, rookOpen, type GameState } from "@/lib/game/state";
import { money } from "@/lib/format";
import { useGame } from "../GameProvider";
import { Button, cx, PageHeader, Panel, Stat, Tag } from "../ui";
import { RecruitingBoard } from "./RecruitingBoard";

export function Recruiting() {
  const { state } = useGame();
  const enrolling = state.offseason ? state.lastOffseason?.enrolled ?? [] : [];

  return (
    <>
      <PageHeader
        title="Recruiting"
        sub={
          state.offseason
            ? `Offseason · the Class of Season ${state.season + 1} is enrolling`
            : `Season ${state.season} · Early Signing Day ${KEY_DATES.signingDay}`
        }
      />

      {state.season === 1 && !state.offseason && <RookScenario state={state} />}

      {state.offseason ? (
        <Panel kicker={`Class of Season ${state.season + 1}`} title="Enrolling now">
          {enrolling.length ? (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {enrolling.map((p) => (
                <li key={p.id} className="flex items-center gap-3 rounded-md border border-line bg-bg-2/70 px-3 py-2">
                  <span className="font-display tabular w-8 text-lg font-bold">{p.ovr}</span>
                  <span className="flex-1 text-sm">
                    <span className="font-semibold">{p.name}</span>
                    <span className="block text-xs text-muted">
                      {p.pos} · {money(p.nil)} · {p.hometown}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nobody signed in December. Walk-ons will fill any position that&apos;s still short when the season starts.</p>
          )}
          <p className="mt-4 text-sm text-muted">
            The board for next year&apos;s class opens with the new season. Until then, the January transfer window is where you can add players.
          </p>
        </Panel>
      ) : state.recruiting ? (
        <RecruitingBoard state={state} />
      ) : null}
    </>
  );
}

/** Season 1: Rook is committed, but Bayou has offered more. Decide before Early Signing Day. */
function RookScenario({ state }: { state: GameState }) {
  const { dispatch } = useGame();
  const { rook } = state;
  const open = rookOpen(state);
  const offers = ROOK_OFFERS.map((o) => (o.you ? { ...o, offer: rook.decision === "match" ? ROOK_ASK : ROOK_CURRENT, interest: rook.interest } : o));

  const message =
    rook.outcome === "signed"
      ? "Signed, sealed. See you on campus in January, Coach."
      : rook.outcome === "flipped"
        ? "Coach, I appreciate everything. I'm signing with Bayou. Nothing personal — it's a business now."
        : rook.decision === "match"
          ? "That's the number. I'm a Stallion. I'll sign the first morning of the signing period."
          : rook.decision === "hold"
            ? "Heard. I'll think on it. Bayou's still calling every day."
            : `Coach — Bayou put $1.1M on the table. I'm still committed to you, but I need you to match it before Early Signing Day (${KEY_DATES.signingDay}).`;

  return (
    <div className="mb-5 grid gap-5 lg:grid-cols-12">
      <Panel className="lg:col-span-12" bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-4 bg-gradient-to-r from-accent/20 via-panel-2 to-panel p-5">
          <span className="font-display flex size-16 items-center justify-center rounded-lg bg-white/10 text-2xl font-bold ring-1 ring-white/15">JR</span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-xs tracking-[0.2em] text-gold">★★★★★ · Dual-threat · Committed to Lone Star</p>
            <h2 className="font-display text-3xl leading-tight font-bold sm:text-4xl">Jalen Rook</h2>
            <p className="text-sm text-muted">QB · 6&apos;3&quot; · 215 · Austin Prep (TX) · high school senior</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="National" value="#3" tone="gold" />
            <Stat label="Interest" value={`${rook.interest}%`} tone={rook.interest >= 70 ? "good" : rook.interest < 40 ? "bad" : undefined} />
            <Stat label="Bayou offer" value={money(ROOK_ASK)} />
          </div>
        </div>
      </Panel>

      <Panel kicker="Revenue share + NIL" title="Offers on the table" className="lg:col-span-7" bodyClassName="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="font-display border-b border-line text-[10px] tracking-widest text-muted">
              <th className="px-4 py-2 text-left font-normal">School</th>
              <th className="py-2 text-right font-normal">Offer / yr</th>
              <th className="py-2 text-right font-normal">Int</th>
              <th className="py-2 pr-4 text-right font-normal">Rank</th>
            </tr>
          </thead>
          <tbody>
            {offers.map((o) => (
              <tr key={o.school} className={cx("border-b border-line/60 last:border-0", o.you && "bg-accent/10")}>
                <td className="px-4 py-2.5">
                  <p className="font-semibold">{o.school}</p>
                  <p className="text-xs text-muted">{o.conf}</p>
                </td>
                <td className="font-display tabular py-2.5 text-right text-base">{money(o.offer)}</td>
                <td className={cx("font-display tabular py-2.5 text-right text-base", o.interest >= 60 ? "text-good" : "text-bad")}>{o.interest}%</td>
                <td className="font-display tabular py-2.5 pr-4 text-right text-base text-muted">{o.rank}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel kicker={open ? `Deadline: Early Signing Day, ${KEY_DATES.signingDay}` : "Decided"} title="Message · Jalen Rook" className="lg:col-span-5">
        <div className="rounded-lg rounded-tl-none border border-line bg-bg-2/80 p-4">
          <p className="leading-6">{message}</p>
        </div>
        {open ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={() => dispatch({ type: "rook/walk" })}>
                Hold at {money(ROOK_CURRENT)}
              </Button>
              <Button onClick={() => dispatch({ type: "rook/pay" })} disabled={state.nilBudget < ROOK_ASK}>
                Match {money(ROOK_ASK)}
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted">
              Matching locks him in and sets aside {money(ROOK_ASK)} of your {money(state.nilBudget)} pool now. Holding keeps the money; whether he signs
              then depends on his interest on Signing Day (the press conference can move it). If you don&apos;t decide, you&apos;re holding.
            </p>
          </>
        ) : (
          <p className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            {rook.outcome === "signed" && <Tag tone="good">Signed</Tag>}
            {rook.outcome === "flipped" && <Tag tone="muted">Flipped to Bayou</Tag>}
            {!rook.outcome && rook.decision === "match" && <Tag tone="good">Matched · signs on Signing Day</Tag>}
            {!rook.outcome && rook.decision === "hold" && <Tag tone="gold">Holding · decides on Signing Day</Tag>}
            {rook.outcome === "signed" && <span className="text-muted">Enrolls after the season.</span>}
          </p>
        )}
      </Panel>
    </div>
  );
}
