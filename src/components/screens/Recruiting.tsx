"use client";

import { ROOK_ASK, ROOK_OFFERS } from "@/lib/game/data";
import { money } from "@/lib/format";
import { useGame } from "../GameProvider";
import { Button, ButtonLink, cx, PageHeader, Panel, Stat, Tag } from "../ui";
import { OffseasonRecruiting } from "./OffseasonRecruiting";

const VISITS = [
  { date: "Oct 12", type: "Official visit", staff: "HC / OC", result: "Committed interest +7" },
  { date: "Sep 28", type: "Home visit", staff: "QB coach", result: "Mom liked campus" },
  { date: "Sep 3", type: "Camp", staff: "OC", result: "Offer extended" },
];

export function Recruiting() {
  const { state } = useGame();
  return state.offseason ? <OffseasonRecruiting state={state} /> : <SeasonRecruiting />;
}

function SeasonRecruiting() {
  const { state, dispatch } = useGame();
  const { rook } = state;
  const offers = ROOK_OFFERS.map((o) => (o.you ? { ...o, offer: rook.offer, interest: rook.interest } : o));
  const visits = rook.decision === "paid" ? [{ date: "Nov 6", type: "Offer", staff: "HC", result: "$1.1M filed" }, ...VISITS] : VISITS;
  const canPay = state.nilBudget >= ROOK_ASK && state.scholarships > 0;

  if (state.season > 1) {
    const signees = state.players.filter((p) => (p.source === "recruit" || p.source === "walkon") && p.yr === "Fr");
    return (
      <>
        <PageHeader title="Recruiting" sub={`Season ${state.season} · Class of next year`} />
        <Panel kicker="Big board" title="Recruiting opens in the offseason">
          <p className="max-w-2xl leading-6 text-muted">
            After the playoff, the offseason opens a big board of high-school prospects. You get three rounds of pitches and official
            visits, make NIL offers, and find out who signs on Signing Day.
          </p>
          {signees.length > 0 && (
            <>
              <p className="font-display mt-5 mb-2 text-xs tracking-widest text-muted">This year&apos;s freshmen</p>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {signees.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 rounded-md border border-line bg-bg-2/70 px-3 py-2">
                    <span className="font-display tabular w-8 text-lg font-bold">{p.ovr}</span>
                    <span className="flex-1 text-sm">
                      <span className="font-semibold">{p.name}</span>
                      <span className="block text-xs text-muted">
                        {p.pos} · {p.hometown}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Recruiting" sub="Season 1 · Class of next year · Big board" />

      <div className="grid gap-5 lg:grid-cols-12">
        <Panel className="lg:col-span-12" bodyClassName="p-0">
          <div className="flex flex-wrap items-center gap-4 bg-gradient-to-r from-accent/20 via-panel-2 to-panel p-5">
            <span className="font-display flex size-16 items-center justify-center rounded-lg bg-white/10 text-2xl font-bold ring-1 ring-white/15">JR</span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-xs tracking-[0.2em] text-gold">★★★★★ · Dual-threat</p>
              <h2 className="font-display text-3xl leading-tight font-bold sm:text-4xl">Jalen Rook</h2>
              <p className="text-sm text-muted">QB · 6&apos;3&quot; · 215 · Austin Prep (TX)</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="National" value="#3" tone="gold" />
              <Stat label="Interest" value={`${rook.interest}%`} tone={rook.interest >= 70 ? "good" : rook.interest < 40 ? "bad" : undefined} />
              <Stat label="Ask" value={money(ROOK_ASK)} />
            </div>
          </div>
        </Panel>

        <Panel kicker="Week 11" title="Active NIL offers" className="lg:col-span-7" bodyClassName="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="font-display border-b border-line text-[10px] tracking-widest text-muted">
                <th className="px-4 py-2 text-left font-normal">School</th>
                <th className="py-2 text-right font-normal">Offer</th>
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

        <Panel kicker="Message" title="Jalen Rook" className="lg:col-span-5">
          <div className="rounded-lg rounded-tl-none border border-line bg-bg-2/80 p-4">
            <p className="leading-6">
              {rook.decision === null && "Coach — $1.1M or I enter the portal Friday. Bayou is still calling. I want an answer tonight."}
              {rook.decision === "paid" && "That's the number. I'm a Stallion. I'll be on campus this weekend — tell them to stop recruiting me like I'm still deciding."}
              {rook.decision === "walked" && "Understood. I'll enter the portal Friday. Nothing personal. If the number changes, you know where to find me."}
            </p>
            <p className="mt-2 text-xs text-dim">Today 8:{rook.decision ? "19" : "14"} AM</p>
          </div>

          {rook.decision === null ? (
            <>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Button variant="outline" onClick={() => dispatch({ type: "rook/walk" })}>
                  Let him walk
                </Button>
                <Button onClick={() => dispatch({ type: "rook/pay" })} disabled={!canPay}>
                  Pay him $1.1M
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted">Paying uses {money(ROOK_ASK)} of your {money(state.nilBudget)} NIL pool and one of {state.scholarships} open scholarships.</p>
            </>
          ) : rook.decision === "paid" ? (
            <p className="mt-4 flex items-center gap-2 text-sm">
              <Tag tone="good">Signed</Tag> Offer filed at $1.1M · interest 93% · one scholarship used
            </p>
          ) : (
            <ButtonLink href="/portal" variant="outline" className="mt-4 w-full">
              See him on the portal board
            </ButtonLink>
          )}
        </Panel>

        <Panel kicker="History" title="Visits & notes" className="lg:col-span-12" bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="font-display border-b border-line text-[10px] tracking-widest text-muted">
                  {["Date", "Type", "Staff", "Result"].map((h) => (
                    <th key={h} className="px-4 py-2 text-left font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visits.map((v) => (
                  <tr key={v.date + v.type} className="border-b border-line/60 last:border-0">
                    <td className="font-display tabular px-4 py-2.5 text-muted">{v.date}</td>
                    <td className="px-4 py-2.5">{v.type}</td>
                    <td className="px-4 py-2.5 text-muted">{v.staff}</td>
                    <td className="px-4 py-2.5">{v.result}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  );
}
