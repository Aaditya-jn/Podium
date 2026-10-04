# Podium project guide

## Stack
- Next.js App Router with TypeScript and React.
- Tailwind CSS v4 for utility styling, with custom tokens in `app/globals.css`.
- Zod for validating route inputs and model output.
- LLM requests are invoked only by server route handlers through `server-only` helpers. Read secrets from environment variables; never prefix secrets with `NEXT_PUBLIC_`.
- Vitest will cover pure scoring and anti-cheat logic.
- Browser `localStorage` is the only planned history store. Do not add login, authentication, a database, or a leaderboard.
- Target deployment: Vercel.

## Commands
- `npm run dev` — start the local development server.
- `npm run build` — create a production build.
- `npm run start` — serve a production build.
- `npm run lint` — run ESLint.
- `npm test` — run unit tests (to be configured in the scoring phase).

## Conventions
- Keep category definitions and curated topics data-driven in `lib/config/categories.ts`.
- Keep trending queries in `lib/trending/queries.ts` and provider requests in server-only adapters under `lib/trending/` and `lib/llm/`.
- Keep LLM providers swappable through the adapter in `lib/llm/`; read provider keys from server environment variables and validate every structured response with Zod.
- Add API endpoints as `app/api/**/route.ts`; validate untrusted input at the route boundary.
- Keep reusable UI in `components/` and pure domain logic in `lib/`.
- Prefer server components; add `"use client"` only for browser interactions.
- Keep components accessible: semantic HTML, labels, keyboard support, and visible focus.
- Do not trust client-supplied scores. Recompute them on the server.
- Avoid external persistence; cap and validate user-submitted content.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
