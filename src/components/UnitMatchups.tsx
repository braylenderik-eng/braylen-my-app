import { TEAMS, UNITS, type TeamId } from "@/lib/game/data";
import { cx } from "./ui";

export const UNIT_MATCHUPS = [
  { label: "QB vs DB", ours: "QB", theirs: "CB", side: "attack" },
  { label: "RB vs LB", ours: "RB", theirs: "LB", side: "attack" },
  { label: "WR vs CB", ours: "WR", theirs: "CB", side: "attack" },
  { label: "OL vs EDGE", ours: "OL", theirs: "EDGE", side: "attack" },
  { label: "EDGE vs OL", ours: "EDGE", theirs: "OL", side: "stop" },
  { label: "DL vs RB", ours: "DL", theirs: "RB", side: "stop" },
  { label: "CB vs WR", ours: "CB", theirs: "WR", side: "stop" },
  { label: "LB vs QB", ours: "LB", theirs: "QB", side: "stop" },
] as const;

export function unitEdges(us: TeamId, them: TeamId) {
  const a = UNITS[us];
  const b = UNITS[them];
  if (!a || !b) return [];
  return UNIT_MATCHUPS.map((m) => {
    const ours = a[m.ours];
    const theirs = b[m.theirs];
    return { ...m, oursUnit: ours, theirsUnit: theirs, edge: ours.rating - theirs.rating };
  });
}

export function UnitCard({ e, us, them }: { e: ReturnType<typeof unitEdges>[number]; us: TeamId; them: TeamId }) {
  const win = e.edge > 0;
  const even = e.edge === 0;
  return (
    <div className="rounded-md border border-line bg-bg-2/70">
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <span className="font-display text-xs font-semibold tracking-widest text-accent-hi">{e.label}</span>
        <span className={cx("font-display tabular text-xs", even ? "text-muted" : win ? "text-good" : "text-bad")}>
          {even ? "Even" : `${win ? "+" : "−"}${Math.abs(e.edge)} ${win ? "edge" : "deficit"}`}
        </span>
      </div>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{e.oursUnit.name}</p>
          <p className="font-display text-[10px] tracking-widest text-muted">
            {e.ours} · {TEAMS[us].short}
          </p>
        </div>
        <span className={cx("font-display tabular text-2xl font-bold", win ? "text-text" : "text-muted")}>{e.oursUnit.rating}</span>
        <span className="font-display px-1 text-xs text-dim">vs</span>
        <span className={cx("font-display tabular text-2xl font-bold", !win && !even ? "text-text" : "text-muted")}>{e.theirsUnit.rating}</span>
        <div className="min-w-0 flex-1 text-right">
          <p className="truncate text-sm font-semibold">{e.theirsUnit.name}</p>
          <p className="font-display text-[10px] tracking-widest text-muted">
            {e.theirs} · {TEAMS[them].short}
          </p>
        </div>
      </div>
    </div>
  );
}
