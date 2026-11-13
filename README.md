# Portal Wars

A college football GM game prototype. You run a program of your choice as a multi-season dynasty in a fictional
40-team league: set your depth chart and game plan, play games live (4th downs, two-point tries, halftime adjustments,
clock management) or quick-sim them, handle in-season situations, recruit during the season, work the January transfer
window, and chase a title. All teams and players are fictional.

### Starting a dynasty

The app always opens on a title screen: **New dynasty**, **Continue** your save (if you have one), or **Quick start**.

- **New dynasty**: a setup flow at `/new`.
  1. Name your coach and alma mater.
  2. Pick any of the 40 programs.
  3. Choose an offensive and a defensive philosophy.
  4. Start at Week 1 of the 2026 season.
- **Quick start**: drops you into the Lone Star Stallions' Week 11 playoff push (replaces your save).

"New dynasty" in the footer starts over. There are no accounts yet; the save lives in your browser.

What your choices change:

- **Program expectations.** Stronger programs are Blue bloods or Contenders, with bigger NIL budgets and higher win
  targets (10 or 9 wins). Rising and Rebuild programs get smaller budgets and lower targets (7 or 5 wins). At the end of
  each season the record is judged against the target, and next year's budget moves with it:

  | Verdict | Budget change |
  | --- | --- |
  | Exceeded | +$300K |
  | Met | +$100K |
  | Fell short | none |
  | Hot seat | −$250K |

- **Offensive and defensive philosophy.**
  - Offense: Air Raid, Spread Option, Pro Style or Ground & Pound.
  - Defense: Attacking, Multiple, or Bend, Don't Break.

  Each sets your default game plan. Calling the plan your scheme is built around adds +1 to that side's rating.
- **Scheme fit in recruiting.**
  - Prospects at the positions your schemes use (e.g. QB/WR for Air Raid, EDGE/LB for Attacking) start keener on you.
  - Others start a little cooler.
  - The board tags them "Scheme fit".

### Coaching career

New dynasties track your coach's career.

- **Job security** (0–100, starts at 60) moves after each season:

  | Result | Change |
  | --- | --- |
  | Exceeded the win target | +20 |
  | Met it | +10 |
  | Fell short | −15 |
  | Hot seat | −35 |
  | Playoff trip | +5 |
  | National title | +30 |

  At zero you're fired. Two hot-seat seasons in a row will do it.
- **Job offers.** Exceeding expectations (or winning it all) brings two offers from bigger programs; meeting expectations
  and making the playoff can bring one. Take a job in the offseason and you inherit that program's roster, budget, win
  target and January transfer window; offers lapse when the new season starts.
- **Fired.** A smaller program may offer you a way back in; until you take it (or walk away) the next season can't start.
  If nobody calls, your career is over.
- **`/coach`** is your résumé: career record, every stop, and every season against expectations.

### Rivalries and conferences

- **Rivalries.** Every dynasty draws its own rivalries, almost all within a conference, each with a trophy, a series
  record and a holder (the quick start keeps Stallions–Rangers). Rivalry week is Week 12: everyone plays their rival.
  - The underdog in a rivalry game plays a little above itself (+2 to both ratings).
  - A rivalry win raises your hype and swings recruits your way, most of all in your home region, right before Early
    Signing Day. A loss does the opposite.
- **Conference identities.** Each conference has a style and a home recruiting region:

  | Conference | Style | Region |
  | --- | --- | --- |
  | Delta League | Defense first | LA, MS, AL |
  | Redrock Circuit | Air it out | AZ, NM, NV, UT, CO, CA |
  | Atlantic Circuit | Pro style | VA, NC, MD, KY, PA, OH |
  | Mesa League | Ground game | TX, OK, AR |
  | Sun Coast Conference | Speed in space | FL, GA, SC |
  | Plains Athletic | Ball control | KS, NE, SD, ND, IA |

  Over the seasons, teams' ratings drift toward their conference's style. Prospects from your conference's region start
  keener on you and are tagged "Home region" on the board. The Dashboard shows your rivalry and the conference race.

### Stats and awards

- **League stars.** Every other program has five stars (QB, RB, WR, edge rusher, safety) whose season lines build
  week by week from their real game scores. Your players use their actual game stats.
- **The award race.** The `/stats` page and the Dashboard track the race for **The Crown Trophy** (national player of
  the year), which counts production and team success.
- **Awards.** They're handed out after rivalry week, before Early Signing Day:

  | Award | Goes to |
  | --- | --- |
  | The Crown Trophy | National player of the year |
  | Field General | Top quarterback |
  | Workhorse | Top running back |
  | Deep Threat | Top receiver |
  | Iron Wall | Top defensive player |
  | Rising Star | Top freshman |
  | Coach of the Year | Best coaching job |

  Your conference also names a first-team **All-Conference** squad.
- **What winning does for you.** Your winners get badges on their player cards, and every award and All-Conference pick
  nudges recruits your way right before Signing Day.
- **Leaders and career totals.** `/stats` lists national leaders (passing, rushing, receiving, sacks, takeaways), and
  player cards show career totals once a season is banked.
- The quick start joins at Week 11, so awards begin in its second season.

### Player development and the NFL Draft

- **Early entry (January).** Juniors with a top-three-round grade may declare for the draft. The better his stock, the
  likelier he goes:

  | Projected round | Chance he declares |
  | --- | --- |
  | Round 1 | 90% |
  | Round 2 | 65% |
  | Round 3 | 40% |

  For each one, make your pitch (an NIL raise set aside now, refunded if he leaves anyway) or wish him well.
  Decisions settle when the transfer window closes. A projected first-rounder rarely comes back, even with a pitch.
- **Draft grades** come from rating, position (QBs, edge rushers and tackles go higher) and awards. Player cards show
  juniors' and seniors' projected rounds.
- **The draft (late April)** runs as the new season begins. Graduating seniors and early entries are picked by round,
  and the picks appear on the Stats page.
- **Draft pedigree.** Players drafted in the last two springs make your pitch easier: up to +4 interest on next year's
  recruiting board. Big programs pay for that by losing stars early.
- **Spring practice.** Choose two position groups (for example Quarterbacks, Offensive line or Secondary). Players
  there gain 1–3 points before the season, up to their potential.
- **Redshirts.** Through Week 4, a freshman can be redshirted from his player card. He sits the season, keeps his class
  year and develops a bit extra. It's once per career.

### Player portraits

Players and prospects show realistic, game-style headshots: a pool of 319 AI-rendered portraits of fictional people
(`public/faces`, 256px WebP, about 5 KB each) grouped by build: big for linemen, mid for backs, tight ends, linebackers,
edge rushers and safeties, lean for quarterbacks, receivers, corners and specialists. Each player is assigned one from his
position's group by his id, so he always looks the same (a recruit keeps his face when he signs). The gray practice
jersey is tinted to the team colour; recruits stay in gray. `src/components/PlayerFace.tsx` also has a drawn SVG face
used as a fallback. No real people or photos are used.

### The calendar follows real college football

| When (in game) | Real date | What happens |
| --- | --- | --- |
| Regular season, weeks 1–12 | Labor Day weekend – rivalry week (Sat after Thanksgiving), with an open week in mid-October | Games, weekly scenarios, and the recruiting board for next year's class |
| Right after Week 12 | early December (Dec 2–4 in 2026) | **Early Signing Day** — offered prospects sign with you or a rival |
| Selection | early December | The playoff field is set (see below) |
| Playoff | December – January | 12 teams in Season 1 (2026); **24 teams from Season 2 (2027-28)** |
| Offseason | January | Seniors graduate, players develop, signees enroll, **one transfer window** (no spring or in-season window) |

**Playoff formats.** Season 1 is the 2026 season: 12 teams, the five highest-ranked conference champions get automatic
bids plus seven at-large, seeds 1–4 get byes. From Season 2 (the 2027-28 season) it's the 24-team format announced on
Nov 9, 2026: the four Power conference champions and the highest-ranked team from the other conferences get automatic
bids plus 19 at-large; seeds 1–8 get byes; seeds 9–16 host 17–24 in the first round and the bye seeds host the second
round on campus; quarterfinals and semifinals are bowls. Seeding is straight by ranking. There are no conference title
games, so a conference champion is its best-record team.

**In-season scenarios.** Most weeks something comes up that needs a decision before the game — a flip threat on a
recruit you've offered, a booster pledge with strings attached, a discipline call on a starter, a frustrated backup
eyeing the January portal, or a top prospect asking to visit for your home game. Each has choices with real effects;
anything unanswered resolves with the default at its deadline.

**Money at 2026-27 scale.** Two sources pay players:

- **Revenue sharing** from the school, capped at $21.58M per school, with about 75% going to football. Every school
  gets about the same; smaller programs fund a bit less.
- **Collective and booster NIL** on top. This is where the big programs pull ahead. Player budgets by tier:

  | Tier | Player budget |
  | --- | --- |
  | Blue blood | ~$34M |
  | Contender | ~$24M |
  | Rising | ~$15.5M |
  | Rebuild | ~$11M |

Pay follows position and rating:

| Player | Pay |
| --- | --- |
| Elite quarterback | $4–6.5M |
| Star edge rusher / WR / OT | $1.5–3M |
| Typical starter | $300K–$1M |
| Backup | under $150K |

Recruits ask $0.6–2.2M (5-star), $150–400K (4-star) and $30–80K (3-star). Transfers ask their market value plus a
portal premium.

**Parity.** Big money doesn't buy everyone:

- **Good rosters are expensive to keep.** Players who develop get raises each offseason, so a blue blood's cap room
  (budget minus payroll) ends up close to everyone else's, about $3–6M to start.
- **Playing time matters.** Recruits and transfers who see a path to start lean your way; a crowded depth chart
  pushes them off, whatever you pay.
- **Prestige counts less** in a recruit's starting interest than it used to. Fit, region, pitches and visits matter as much.
- **The rival schools** recruiting against you are spread across all 40 programs.

**NIL negotiations.** Every offer is a negotiation against a rival school's number:

- **Offer sheet.** Pick an amount (lowball at 90% of his ask, his ask, above ask at 115%, or a max offer at 130%)
  and a length of 1–3 seasons. Each recruit shows his ask next to his top rival's offer; each transfer shows the best
  bid from the schools chasing him.
- **Counteroffers.** A recruit takes a lowball only if he already leans your way. Otherwise he counters at his ask or
  the rival's offer, whichever is higher. Accepting the counter makes it a regular offer. Transfers don't take lowballs.
- **Money moves the needle, within limits.** Beating the rival's offer adds up to +10 interest for a recruit (a much
  lower offer costs up to −15), and up to +15% signing odds for a transfer. It can't overcome fit, playing time or a
  big interest gap.
- **Bidding wars.** Each week, rival schools may raise their offers on 4- and 5-star prospects you've offered. Hot
  transfers (84+ OVR with three or more suitors) can get an immediate counter-bid. Use **Raise** to step up to the
  next tier; it costs only the difference.
- **Multi-year deals.** Players like the security (+4 interest), but the price is locked: no raise if he develops,
  no savings if he doesn't. A signee's clock starts when he enrolls, and the player card shows the seasons left.

Simplification: the game tracks ~40 key players (real rosters are capped at 105), so its payrolls cover the players
who take most of a real budget.

## Getting started

```bash
npm ci
npm run dev
```

Then open http://localhost:3000.

## Pages

| Route         | What it is                                                                      |
| ------------- | ------------------------------------------------------------------------------- |
| `/`           | Weekly preview: game of the week, your program and expectations, playoff odds   |
| `/new`        | New dynasty setup: coach, program, schemes                                      |
| `/stats`      | Award race, national leaders, award winners, All-Conference                     |
| `/coach`      | Your coach's résumé and job security (new dynasties)                            |
| `/sim`        | Game plan, **Play live** / **Quick sim**, recaps, playoff bracket, offseason     |
| `/roster`     | Depth chart, injuries and player cards                                          |
| `/recruiting` | In-season recruiting board for next year's class                                |
| `/portal`     | Portal watch in season; the January transfer window in the offseason            |
| `/rankings`   | Committee rankings                                                              |
| `/news`       | Headlines and the press conference                                              |

## How the sim works

`src/lib/game/sim.ts` plays a game drive by drive with a seeded random generator. The engine is a generator
(`playGame`) that can pause for the user's calls in a live game; `simulateGame` runs the same engine straight through
with the default calls, so a live game where you accept every default plays out exactly like a quick sim. Each save gets its own seed, so
seasons play out differently, but a given save is reproducible. Each drive ends in a touchdown, field goal, punt or
turnover, with odds driven by offense vs. defense ratings, home field (none at neutral playoff sites) and your game plan.

`src/lib/game/roster.ts` turns your depth chart into those ratings (and builds a starting roster for any program): the top healthy players at each position
start, and their OVRs (weighted by position) move the team's offense and defense ratings. Questionable players sit
unless you start them, and a started questionable player can get hurt again mid-game. Transfers you sign join the
depth chart; high-school signees (December) enroll in the offseason.

`src/lib/game/season.ts` handles the jump between seasons: a generated 12-week schedule for all 40 teams, opponent
ratings that drift each year, and the offseason (seniors graduate, everyone else moves up a class and grows toward a
hidden potential, signees enroll), and walk-ons that fill any position still short when a season starts.

`src/lib/game/recruiting.ts` runs the in-season recruiting board: each week you spend points on pitches and official
visits while rival schools push back; only prospects with an NIL/revenue-share offer can sign, and on Early Signing
Day each picks you or his top rival depending on who leads. `src/lib/game/offseason.ts` runs the January transfer
window: backups who want to transfer, and a pool of transfers with bids that resolve when the window closes.

`src/lib/game/career.ts` handles job security, firing and offers; `src/lib/game/league.ts` conference identities and
rivalries. `src/lib/game/program.ts` holds coaching styles, scheme fit, program tiers and expectations.
`src/lib/game/events.ts` defines the in-season scenarios: when each can come up, its choices, and their effects.

`src/lib/game/state.ts` holds the save: decisions, bids, injuries, season stats, the weekly sim of every game,
committee re-ranking, playoff odds, the field and bracket (12 or 24 teams by season), and program history. A new
dynasty covers weeks 1–12 every season (the quick start's Season 1 covers weeks 11–12); then the playoff rounds. All four are plain TypeScript with no React, and have tests in
`src/lib/game/__tests__`.

## Scripts

| Command             | What it does                        |
| ------------------- | ----------------------------------- |
| `npm run dev`       | Start the dev server on port 3000   |
| `npm run build`     | Production build (also type-checks) |
| `npm start`         | Serve the production build          |
| `npm run lint`      | Lint with ESLint                    |
| `npm run typecheck` | Type-check with `tsc --noEmit`      |
| `npm test`          | Run the Vitest test suite once      |

## Notes

- Fonts load through `next/font/google`, so `npm run build` fetches them from `fonts.googleapis.com` and `fonts.gstatic.com`.
- Node.js 20.9 or newer is required (developed on Node 22).
