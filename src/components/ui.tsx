// Shared broadcast-style building blocks.

import Link from "next/link";
import type { ReactNode } from "react";
import { TEAMS, type TeamId } from "@/lib/game/data";

export function cx(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}

export function PageHeader({ title, sub, right }: { title: string; sub: string; right?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-3xl leading-none font-bold sm:text-4xl">{title}</h1>
        <p className="font-display mt-1.5 text-xs tracking-widest text-muted">{sub}</p>
      </div>
      {right}
    </div>
  );
}

export function Panel({
  title,
  kicker,
  right,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  kicker?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cx("overflow-hidden rounded-lg border border-line bg-panel/90 shadow-lg shadow-black/20", className)}>
      {title && (
        <header className="flex items-end justify-between gap-3 border-b border-line px-4 pt-3 pb-2.5">
          <div className="border-l-[3px] border-accent pl-2.5">
            {kicker && <p className="font-display text-[10px] leading-none tracking-[0.18em] text-accent-hi">{kicker}</p>}
            <h2 className="font-display mt-0.5 text-lg leading-tight font-semibold">{title}</h2>
          </div>
          {right}
        </header>
      )}
      <div className={cx("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function TeamBadge({ id, size = "md" }: { id: TeamId; size?: "sm" | "md" | "lg" | "xl" }) {
  const t = TEAMS[id];
  const dims = { sm: "size-7 text-[10px]", md: "size-10 text-xs", lg: "size-14 text-base", xl: "size-20 text-xl sm:size-24 sm:text-2xl" }[size];
  return (
    <span
      aria-hidden
      className={cx("font-display inline-flex shrink-0 items-center justify-center rounded-lg font-bold text-white ring-1 ring-white/15", dims)}
      style={{ background: `linear-gradient(145deg, ${t.color}, color-mix(in srgb, ${t.color} 45%, black))` }}
    >
      {t.short}
    </span>
  );
}

export function ProbBar({ left, leftColor, rightColor }: { left: number; leftColor: string; rightColor: string }) {
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-line" role="presentation">
      <div style={{ width: `${left * 100}%`, background: leftColor }} />
      <div style={{ width: `${(1 - left) * 100}%`, background: rightColor }} />
    </div>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: "good" | "bad" | "gold" }) {
  return (
    <div className="rounded-md border border-line bg-bg-2/70 px-3 py-2 text-center">
      <p
        className={cx(
          "font-display tabular text-xl leading-none font-semibold",
          tone === "good" && "text-good",
          tone === "bad" && "text-bad",
          tone === "gold" && "text-gold",
        )}
      >
        {value}
      </p>
      <p className="font-display mt-1 text-[10px] tracking-widest text-muted">{label}</p>
    </div>
  );
}

export function Tag({ children, tone = "accent" }: { children: ReactNode; tone?: "accent" | "good" | "gold" | "muted" }) {
  const cls = {
    accent: "bg-accent/15 text-accent-hi ring-accent/30",
    good: "bg-good/15 text-good ring-good/30",
    gold: "bg-gold/15 text-gold ring-gold/30",
    muted: "bg-white/5 text-muted ring-white/10",
  }[tone];
  return <span className={cx("font-display inline-block rounded px-1.5 py-0.5 text-[10px] tracking-widest ring-1", cls)}>{children}</span>;
}

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  className,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "outline";
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  const cls = {
    primary: "bg-accent text-white hover:bg-accent-hi shadow-lg shadow-accent/20",
    ghost: "text-muted hover:text-text hover:bg-white/5",
    outline: "border border-accent/70 text-text hover:bg-accent/10",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "font-display inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        cls,
        className,
      )}
    >
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  children,
  variant = "primary",
  className,
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "outline";
  className?: string;
}) {
  const cls = variant === "primary" ? "bg-accent text-white hover:bg-accent-hi shadow-lg shadow-accent/20" : "border border-accent/70 text-text hover:bg-accent/10";
  return (
    <Link
      href={href}
      className={cx("font-display inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold tracking-wider transition-colors", cls, className)}
    >
      {children}
    </Link>
  );
}

export function Dialog({ open, title, children, onClose }: { open: boolean; title: string; children: ReactNode; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-lg border border-line-2 bg-panel p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-4">
          <h2 className="font-display text-xl font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="-mt-1 -mr-1 rounded p-1 text-muted hover:text-text">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
