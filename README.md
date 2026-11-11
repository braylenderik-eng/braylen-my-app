# Portal Wars

A college football GM game prototype. You run the Lone Star Stallions as a multi-season dynasty in a fictional
40-team league: set your depth chart and game plan, play games live (4th downs, two-point tries, halftime adjustments,
clock management) or quick-sim them, handle in-season situations, recruit during the season, work the January transfer
window, and chase a title. All teams and players are fictional.

### The calendar follows real college football

| When (in game) | Real date | What happens |
| --- | --- | --- |
| Regular season, weeks 1–12 | late Aug – rivalry week (Sat after Thanksgiving) | Games, weekly scenarios, and the recruiting board for next year's class |
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

Simplifications: the game tracks ~40 key players (real rosters are capped at 105), and the "NIL budget" is the money
still uncommitted for new revenue-share/NIL deals, not the full ~$20.5M cap.

## Getting started

```bash
npm ci
npm run dev
```

Then open http://localhost:3000.

## Pages

| Route         | What it is                                                                      |
| ------------- | ------------------------------------------------------------------------------- |
| `/`           | Weekly preview: game of the week, position matchups, playoff odds, league games |
| `/sim`        | Game plan, **Play live** / **Quick sim**, recaps, playoff bracket, offseason     |
| `/roster`     | Depth chart, injuries and player cards                                          |
| `/recruiting` | In-season recruiting board (and the Season 1 Rook scenario)                     |
| `/portal`     | Portal watch in season; the January transfer window in the offseason            |
| `/rankings`   | Committee rankings                                                              |
| `/news`       | Headlines and the press conference                                              |

## How the sim works

`src/lib/game/sim.ts` plays a game drive by drive with a seeded random generator. The engine is a generator
(`playGame`) that can pause for the user's calls in a live game; `simulateGame` runs the same engine straight through
with the default calls, so a live game where you accept every default plays out exactly like a quick sim. Each save gets its own seed, so
seasons play out differently, but a given save is reproducible. Each drive ends in a touchdown, field goal, punt or
turnover, with odds driven by offense vs. defense ratings, home field (none at neutral playoff sites) and your game plan.

`src/lib/game/roster.ts` turns the Stallions depth chart into those ratings: the top healthy players at each position
start, and their OVRs (weighted by position) move the team's offense and defense ratings. Questionable players sit
unless you start them, and a started questionable player can get hurt again mid-game. Transfers you sign join the
depth chart; high-school signees (December) enroll in the offseason.

`src/lib/game/season.ts` handles the jump between seasons: a generated 12-week schedule for all 20 teams, opponent
ratings that drift each year, and the offseason (seniors graduate, everyone else moves up a class and grows toward a
hidden potential, signees enroll), and walk-ons that fill any position still short when a season starts.

`src/lib/game/recruiting.ts` runs the in-season recruiting board: each week you spend points on pitches and official
visits while rival schools push back; only prospects with an NIL/revenue-share offer can sign, and on Early Signing
Day each picks you or his top rival depending on who leads. `src/lib/game/offseason.ts` runs the January transfer
window: backups who want to transfer, and a pool of transfers with bids that resolve when the window closes.

`src/lib/game/events.ts` defines the in-season scenarios: when each can come up, its choices, and their effects.

`src/lib/game/state.ts` holds the save: decisions, bids, injuries, season stats, the weekly sim of every game,
committee re-ranking, playoff odds, the field and bracket (12 or 24 teams by season), and program history. Season 1
covers weeks 11–12; later seasons weeks 1–12; then the playoff rounds. All four are plain TypeScript with no React, and have tests in
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
