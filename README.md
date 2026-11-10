# Portal Wars

A college football GM game prototype. You run the Lone Star Stallions through the end of Season 1: answer a five-star
recruit's $1.1M ultimatum, work the transfer portal, set a game plan, sim your games and see if the committee puts you
in the 12-team field. All teams and players are fictional.

Built with Next.js 16, TypeScript and Tailwind CSS. Progress is saved in the browser.

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
| `/sim`        | Game plan and the **Sim game** button; post-game recap; Selection Day           |
| `/recruiting` | Jalen Rook's ultimatum and NIL offers                                           |
| `/portal`     | Transfer portal: search, filter, scout and bid                                  |
| `/rankings`   | Committee rankings                                                              |
| `/news`       | Headlines and the press conference                                              |

## How the sim works

`src/lib/game/sim.ts` plays a game drive by drive with a seeded random generator, so the same week always plays out
the same way. Each drive ends in a touchdown, field goal, punt or turnover, with odds driven by offense vs. defense
ratings, home field, and your game plan. `src/lib/game/state.ts` holds the season: decisions, bids, the weekly sim
of every game, committee re-ranking and playoff odds. Both are plain TypeScript with no React, and have tests in
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
