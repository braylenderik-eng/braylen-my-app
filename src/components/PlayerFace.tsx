// Generated player portraits. Every player gets a face built from his id (skin tone, face shape, hair,
// brows, facial hair, eye black) wearing his team's jersey, so the same player always looks the same,
// including a recruit who signs and joins the roster. All players are fictional; no photos are used.

import { useId } from "react";
import { FACE_POOL } from "@/lib/game/facePool";
import { hashSeed, makeRng } from "@/lib/game/rng";
import { cx } from "./ui";

/** Which portrait pool a position draws from. */
export function buildFor(pos?: string): keyof typeof FACE_POOL {
  if (pos === "OT" || pos === "IOL" || pos === "DT") return "big";
  if (pos === "QB" || pos === "WR" || pos === "CB" || pos === "K" || pos === "P") return "lean";
  return "mid";
}

/** The AI portrait for a player, or null if that build's pool is empty. */
export function portraitFor(id: string, pos?: string): number | null {
  const pool = FACE_POOL[buildFor(pos)];
  return pool.length ? pool[hashSeed("portrait", id) % pool.length] : null;
}

const SKIN = ["#f6d5b8", "#eac09b", "#d9a477", "#c68a5c", "#a96e45", "#8d5a36", "#6f4429", "#56331f", "#3f2618"];
const HAIR = ["#14100d", "#14100d", "#14100d", "#2b1d14", "#2b1d14", "#4a3020", "#7a5634", "#b98a4e", "#8f3b1f"];
type Hair = "buzz" | "short" | "fade" | "high" | "afro" | "locs" | "curly" | "bald" | "swoop" | "braids";
const HAIRS: Hair[] = ["buzz", "buzz", "short", "short", "fade", "fade", "high", "afro", "locs", "curly", "bald", "swoop", "braids"];
type Beard = "none" | "stubble" | "mustache" | "goatee" | "full" | "chin";
const BEARDS: Beard[] = ["none", "none", "none", "none", "stubble", "stubble", "mustache", "goatee", "full", "chin"];

const pick = <T,>(r: () => number, xs: readonly T[]) => xs[Math.floor(r() * xs.length)];

export interface FaceTraits {
  skin: string;
  hairColor: string;
  hair: Hair;
  beard: Beard;
  faceW: number; // head half-width
  jaw: number; // jaw squareness 0-1
  brow: number; // brow thickness
  eyeBlack: boolean;
  smile: number; // -1 frown .. 1 smile
  eyeGap: number;
  ears: number;
}

export function faceTraits(id: string): FaceTraits {
  const r = makeRng(hashSeed("face", id));
  const skinIdx = Math.floor(r() * SKIN.length);
  const darker = skinIdx >= 4;
  let hair = pick(r, HAIRS);
  // Lighter-skinned players lean toward straighter styles; darker toward coils, locs and braids.
  if (!darker && (hair === "afro" || hair === "locs" || hair === "braids") && r() < 0.7) hair = pick(r, ["short", "swoop", "buzz", "curly"] as Hair[]);
  if (darker && hair === "swoop" && r() < 0.7) hair = pick(r, ["high", "fade", "locs", "braids"] as Hair[]);
  let hairColor = pick(r, HAIR);
  if (darker) hairColor = r() < 0.85 ? "#14100d" : "#2b1d14";
  return {
    skin: SKIN[skinIdx],
    hairColor,
    hair,
    beard: pick(r, BEARDS),
    faceW: 15 + r() * 3.5,
    jaw: r(),
    brow: 1.6 + r() * 1.6,
    eyeBlack: r() < 0.22,
    smile: r() * 1.6 - 0.5,
    eyeGap: 6.2 + r() * 1.4,
    ears: 3 + r() * 1.2,
  };
}

/** Darken a hex colour (for shadows and outlines). */
function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * (1 - amt))));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => f(c).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * A player's portrait: an AI-rendered headshot from the pool for his build, with the gray practice jersey
 * tinted to his team's colour. Falls back to the drawn face when there's no portrait for his build.
 */
export function PlayerFace({
  id,
  pos,
  color,
  num,
  size = 40,
  className,
}: {
  id: string;
  pos?: string;
  color?: string; // jersey colour
  num?: number | string;
  size?: number;
  className?: string;
}) {
  const n = portraitFor(id, pos);
  if (n === null) return <DrawnFace id={id} color={color ?? "#475069"} num={num} size={size} className={className} />;
  return (
    <span
      className={cx("relative inline-block shrink-0 overflow-hidden rounded-md bg-[#141c2e] ring-1 ring-white/10", className)}
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny pre-sized static WebPs; next/image adds nothing here */}
      <img src={`/faces/${String(n).padStart(3, "0")}.webp`} alt="Player portrait" width={size} height={size} loading="lazy" decoding="async" className="size-full object-cover" />
      {/* Tint the jersey to the team colour. */}
      {color && <span aria-hidden className="absolute inset-x-0 bottom-0 h-[24%] mix-blend-color" style={{ background: color, opacity: 0.85 }} />}
      {num !== undefined && size >= 64 && (
        <span aria-hidden className="font-display absolute inset-x-0 bottom-0.5 text-center text-xs font-bold text-white/90">
          {num}
        </span>
      )}
    </span>
  );
}

/** The drawn (SVG) face. */
export function DrawnFace({
  id,
  color = "#3a4458",
  num,
  size = 40,
  className,
}: {
  id: string;
  color?: string;
  num?: number | string;
  size?: number;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const t = faceTraits(id);
  const skinShadow = shade(t.skin, 0.18);
  const hc = t.hairColor;
  const cx0 = 50;
  const top = 26; // top of skull
  const w = t.faceW;
  const chinY = 66;
  const jawW = w * (0.62 + t.jaw * 0.2);
  const head = `M ${cx0 - w} 40 C ${cx0 - w} ${top - 2}, ${cx0 + w} ${top - 2}, ${cx0 + w} 40 L ${cx0 + w - 0.5} 52 C ${cx0 + w - 1} 60, ${cx0 + jawW} ${chinY}, ${cx0} ${chinY} C ${cx0 - jawW} ${chinY}, ${cx0 - w + 1} 60, ${cx0 - w + 0.5} 52 Z`;
  const eyeY = 45;
  const g = t.eyeGap;

  return (
    <svg
      viewBox="13 11 74 74"
      width={size}
      height={size}
      role="img"
      aria-label="Player portrait"
      className={cx("shrink-0 rounded-md ring-1 ring-white/10", className)}
    >
      <defs>
        <linearGradient id={`bg${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1f2940" />
          <stop offset="1" stopColor="#0d1220" />
        </linearGradient>
        <radialGradient id={`lt${uid}`} cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#fff" stopOpacity="0.14" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="100" height="100" fill={`url(#bg${uid})`} />

      {/* Shoulders and jersey */}
      <path d="M 8 100 C 10 82, 26 74, 40 72 L 60 72 C 74 74, 90 82, 92 100 Z" fill={color} />
      <path d="M 8 100 C 10 82, 26 74, 40 72 L 44 72 C 30 76, 20 84, 18 100 Z" fill={shade(color, 0.25)} />
      <path d="M 92 100 C 90 82, 74 74, 60 72 L 56 72 C 70 76, 80 84, 82 100 Z" fill={shade(color, 0.25)} />
      {/* Neck and collar */}
      <path d={`M ${cx0 - 8} 60 L ${cx0 - 9} 75 Q ${cx0} 81 ${cx0 + 9} 75 L ${cx0 + 8} 60 Z`} fill={skinShadow} />
      <path d={`M ${cx0 - 11} 72 Q ${cx0} 84 ${cx0 + 11} 72`} fill="none" stroke={shade(color, 0.45)} strokeWidth="3" />
      {num !== undefined && size >= 64 && (
        <text x="50" y="83.5" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#fff" fillOpacity="0.9" fontFamily="var(--font-display), sans-serif">
          {num}
        </text>
      )}

      {/* Back hair (long styles sit behind the head) */}
      {t.hair === "locs" && (
        <g fill={hc}>
          {[-1, 1].flatMap((side) =>
            [0, 1, 2].map((i) => <rect key={`${side}${i}`} x={cx0 + side * (w - 1 + i * 2.2) - 1.6} y={38} width={3.2} height={22 + i * 3} rx={1.6} />),
          )}
        </g>
      )}
      {t.hair === "afro" && <ellipse cx={cx0} cy={34} rx={w + 7} ry={17} fill={hc} />}

      {/* Ears */}
      <ellipse cx={cx0 - w} cy={47} rx={t.ears} ry={5} fill={skinShadow} />
      <ellipse cx={cx0 + w} cy={47} rx={t.ears} ry={5} fill={skinShadow} />

      {/* Head */}
      <path d={head} fill={t.skin} />
      <path d={head} fill={`url(#lt${uid})`} />

      {/* Hair on top */}
      <Hair kind={t.hair} color={hc} w={w} cx={cx0} top={top} />

      {/* Brows */}
      <g stroke={t.hair === "bald" && hc === "#b98a4e" ? "#4a3020" : hc} strokeWidth={t.brow} strokeLinecap="round" fill="none">
        <path d={`M ${cx0 - g - 4} ${eyeY - 4.5} Q ${cx0 - g} ${eyeY - 6.2} ${cx0 - g + 3.5} ${eyeY - 4.8}`} />
        <path d={`M ${cx0 + g + 4} ${eyeY - 4.5} Q ${cx0 + g} ${eyeY - 6.2} ${cx0 + g - 3.5} ${eyeY - 4.8}`} />
      </g>
      {/* Eye black */}
      {t.eyeBlack && (
        <g fill="#0b0b0b" opacity="0.9">
          <rect x={cx0 - g - 3.5} y={eyeY + 3} width={6.5} height={2.6} rx={1} />
          <rect x={cx0 + g - 3} y={eyeY + 3} width={6.5} height={2.6} rx={1} />
        </g>
      )}
      {/* Eyes */}
      {[-1, 1].map((side) => (
        <g key={side}>
          <ellipse cx={cx0 + side * g} cy={eyeY} rx={2.9} ry={1.9} fill="#f4f1ea" />
          <circle cx={cx0 + side * g} cy={eyeY + 0.1} r={1.4} fill="#2a1c12" />
          <circle cx={cx0 + side * g + 0.5} cy={eyeY - 0.4} r={0.4} fill="#fff" />
        </g>
      ))}
      {/* Nose */}
      <path d={`M ${cx0 - 0.5} ${eyeY + 1} Q ${cx0 - 1.2} ${eyeY + 8} ${cx0 - 3.2} ${eyeY + 10} Q ${cx0} ${eyeY + 11.6} ${cx0 + 3.2} ${eyeY + 10}`} fill="none" stroke={skinShadow} strokeWidth="1.4" strokeLinecap="round" />

      {/* Facial hair */}
      <Beard kind={t.beard} color={hc} cx={cx0} w={w} jawW={jawW} chinY={chinY} />

      {/* Mouth */}
      <path
        d={`M ${cx0 - 4.5} 59 Q ${cx0} ${59 + t.smile * 2.4} ${cx0 + 4.5} 59`}
        fill="none"
        stroke={shade(t.skin, 0.45)}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Hair({ kind, color, w, cx, top }: { kind: Hair; color: string; w: number; cx: number; top: number }) {
  const cap = (lift: number, drop: number) =>
    `M ${cx - w - 0.5} ${40 - drop} C ${cx - w - 1} ${top - lift}, ${cx + w + 1} ${top - lift}, ${cx + w + 0.5} ${40 - drop} C ${cx + w - 3} ${33 - drop}, ${cx - w + 3} ${33 - drop}, ${cx - w - 0.5} ${40 - drop} Z`;
  switch (kind) {
    case "bald":
      return null;
    case "buzz":
      return <path d={cap(1, 2)} fill={color} opacity={0.55} />;
    case "fade":
      return (
        <g fill={color}>
          <path d={cap(3, 3)} />
          <path d={`M ${cx - w - 0.5} 40 L ${cx - w} 46 L ${cx - w + 1.5} 38 Z M ${cx + w + 0.5} 40 L ${cx + w} 46 L ${cx + w - 1.5} 38 Z`} opacity={0.45} />
        </g>
      );
    case "short":
      return <path d={cap(3.5, 1)} fill={color} />;
    case "high":
      return <path d={`M ${cx - w + 1} 36 L ${cx - w + 1} ${top - 6} Q ${cx} ${top - 9} ${cx + w - 1} ${top - 6} L ${cx + w - 1} 36 Q ${cx} 31 ${cx - w + 1} 36 Z`} fill={color} />;
    case "afro":
      return <path d={cap(9, 3)} fill={color} />;
    case "curly":
      return (
        <g fill={color}>
          <path d={cap(4, 2)} />
          {[-12, -8, -4, 0, 4, 8, 12].map((dx, i) => (
            <circle key={dx} cx={cx + dx * (w / 15)} cy={top - 1 + (i % 2) * 1.5 + Math.abs(dx) * 0.25} r={3.4} />
          ))}
        </g>
      );
    case "locs":
      return (
        <g fill={color}>
          <path d={cap(5, 2)} />
          {[-10, -5, 0, 5, 10].map((dx) => (
            <rect key={dx} x={cx + dx - 1.6} y={top - 2} width={3.2} height={9} rx={1.6} />
          ))}
        </g>
      );
    case "braids":
      return (
        <g>
          <path d={cap(3, 2)} fill={color} />
          {[-9, -4.5, 0, 4.5, 9].map((dx) => (
            <path key={dx} d={`M ${cx + dx} ${top} L ${cx + dx * 1.1} 36`} stroke={shade(color === "#14100d" ? "#3a2a1e" : color, -0.2)} strokeWidth={0.9} opacity={0.6} />
          ))}
        </g>
      );
    case "swoop":
      return <path d={`${cap(4, 1)} M ${cx - w} 36 Q ${cx - 4} ${top - 6} ${cx + w + 1} 33 Q ${cx + 2} 30 ${cx - w} 36 Z`} fill={color} />;
  }
}

function Beard({ kind, color, cx, w, jawW, chinY }: { kind: Beard; color: string; cx: number; w: number; jawW: number; chinY: number }) {
  switch (kind) {
    case "none":
      return null;
    case "stubble":
      return (
        <path
          d={`M ${cx - w + 1} 52 C ${cx - w + 1} 60, ${cx - jawW} ${chinY}, ${cx} ${chinY} C ${cx + jawW} ${chinY}, ${cx + w - 1} 60, ${cx + w - 1} 52 C ${cx + 6} 60, ${cx - 6} 60, ${cx - w + 1} 52 Z`}
          fill={color}
          opacity={0.22}
        />
      );
    case "mustache":
      return <path d={`M ${cx - 5.5} 57.4 Q ${cx} 54.6 ${cx + 5.5} 57.4 Q ${cx} 56.6 ${cx - 5.5} 57.4 Z`} fill={color} stroke={color} strokeWidth={1.4} strokeLinejoin="round" />;
    case "goatee":
      return (
        <g fill={color}>
          <path d={`M ${cx - 5.5} 57.4 Q ${cx} 54.6 ${cx + 5.5} 57.4 Q ${cx} 56.6 ${cx - 5.5} 57.4 Z`} stroke={color} strokeWidth={1.2} />
          <path d={`M ${cx - 3.5} 61.5 Q ${cx} 60.5 ${cx + 3.5} 61.5 L ${cx + 2.5} ${chinY + 0.5} Q ${cx} ${chinY + 1.5} ${cx - 2.5} ${chinY + 0.5} Z`} />
        </g>
      );
    case "chin":
      return <path d={`M ${cx - jawW + 2} ${chinY - 3} Q ${cx} ${chinY + 3} ${cx + jawW - 2} ${chinY - 3} Q ${cx} ${chinY} ${cx - jawW + 2} ${chinY - 3} Z`} fill={color} />;
    case "full":
      return (
        <path
          d={`M ${cx - w + 0.5} 50 C ${cx - w + 0.5} 61, ${cx - jawW} ${chinY + 2}, ${cx} ${chinY + 2} C ${cx + jawW} ${chinY + 2}, ${cx + w - 0.5} 61, ${cx + w - 0.5} 50 C ${cx + w - 3} 56, ${cx + 6} 55, ${cx + 4} 57 Q ${cx} 55.5 ${cx - 4} 57 C ${cx - 6} 55, ${cx - w + 3} 56, ${cx - w + 0.5} 50 Z M ${cx - 4} 60.5 Q ${cx} 62.5 ${cx + 4} 60.5 Q ${cx} 59.5 ${cx - 4} 60.5 Z`}
          fill={color}
          fillRule="evenodd"
          opacity={0.92}
        />
      );
  }
}
