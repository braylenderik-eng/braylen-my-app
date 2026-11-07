# braylen-my-app

App building — a [Next.js](https://nextjs.org) 16 + TypeScript starter with Tailwind CSS, ESLint and Vitest.

## Getting started

```bash
npm ci
npm run dev
```

Then open http://localhost:3000. Edit `src/app/page.tsx` and the page updates as you save.

## Scripts

| Command             | What it does                               |
| ------------------- | ------------------------------------------ |
| `npm run dev`       | Start the dev server on port 3000          |
| `npm run build`     | Production build (also type-checks)        |
| `npm start`         | Serve the production build                 |
| `npm run lint`      | Lint with ESLint                           |
| `npm run typecheck` | Type-check with `tsc --noEmit`             |
| `npm test`          | Run the Vitest test suite once             |

Tests live next to the code in `__tests__` folders (see `src/app/__tests__/page.test.tsx`).

## Notes

- Fonts load through `next/font/google`, so `npm run build` fetches them from `fonts.googleapis.com` and `fonts.gstatic.com`.
- Node.js 20.9 or newer is required (developed on Node 22).
