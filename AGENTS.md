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
- Camera analysis runs strictly on-device using MediaPipe Face Landmarker blendshapes and head pose. Never upload video, images, or raw landmarks to servers or third-party vision APIs (no Luxand).
- Camera signals must be strictly observable and descriptive (gaze toward camera, head stability, brow movement variety, smile frequency, speaking cadence, blink rate, face visibility), calibrated against the user's first 3 seconds baseline.
- Never infer emotion, nervousness, confidence, engagement, honesty, or personality from camera data.
- Camera delivery insights must remain completely out of the 0–100 scoring system.
- Voice delivery analysis runs strictly on-device with the Web Audio API (`AnalyserNode`). Never record, store, upload, or retain audio or raw samples for this feature; only running aggregate numbers may be kept. Reuse an existing microphone stream when one is active, and request microphone permission only when recording starts.
- Voice analysis must stop its own microphone tracks and close the AudioContext on pause, submit, tab hide, page leave and unmount. The separate, consent-gated MediaRecorder transcription fallback keeps its own lifecycle.
- Voice signals are observable only: pause timing and silence, relative volume variation and trailing off, pitch range/variation, words-per-minute pace, and approximate filler counts. Calibrate the noise floor against the user's first 2–3 seconds.
- Never infer emotion, nervousness, confidence, honesty, or personality from voice data, and never label pitch or volume as an emotion. Note that microphones, background noise and accents affect measurements, and show "Not enough data" for short or low-quality sessions.
- Voice delivery insights must remain completely out of the 0–100 scoring system. The voice consent panel must offer per-signal opt-outs (pauses, volume, pitch, pace, fillers).
- Keep pure pause detection, noise-floor calibration, pitch estimation, filler counting and aggregation in `lib/audio/` and cover them with synthetic-signal unit tests.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
