# Hyperframes Composition Brief: Podium

## Objective
Create a polished short launch video for Podium showing its promise and its real core flow: choose a prompt, practice speaking or writing, and receive a useful AI review.

## Output
- Composition directory: `brag-output-2026-10-11-132240/composition/`
- Rendered video: `brag-output-2026-10-11-132240/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 20 seconds

## Source Material
- Project root: `/home/aaditya/Desktop/Podium`
- Primary files read: `app/page.tsx`, `app/globals.css`, `components/practice-session.tsx`, `lib/config/categories.ts`, `package.json`
- Product name: Podium
- Tagline / strongest claim: “Confidence isn’t something you’re born with. It’s something you build, one thought at a time.”
- Key UI or visual moment to recreate: prompt selection (label this curated sample “Classic”), Speak practice panel with timer/transcript/pace, then results score and AI review feedback.
- Copy that must appear verbatim: “Find your voice. Then make it heard.” and “One thought at a time.”
- Example values and transcript are fictional presentation samples, not user data.

## Creative Direction
- Tone preset: polished
- Creative direction: warm, premium product film with human pacing.
- Interpretation: restrained editorial typography, real Podium palette, soft transitions, readable text holds.
- Angle: confidence grows through small reps. The story follows one approachable practice loop.
- Hook: “Find your voice.” over Podium’s orbiting sound-wave artwork.
- Outro / punchline: “One thought at a time.” followed by “Practice with Podium.”
- Avoid: generic SaaS claims, abstract filler visuals, fabricated testimonials, personal data, and claims of instant confidence.

## Visual Identity
- Background: `#faf8f3` / warm paper `#f4eee5`
- Text: `#25211e`
- Accent: `#eb775f` coral, `#8d9951` olive
- Display font: Georgia / Times New Roman
- Body font: Arial / Helvetica
- Visual references: the site’s coral three-bar mark, sound-wave orbit art, serif hero headline, paper background, olive status dot, rounded practice cards.

## Storyboard
1. Find your voice — 4s — hero line and Podium mark.
2. Choose a prompt — 5s — categories, Speak mode, difficulty, sample topic.
3. Practice in the moment — 5.5s — timer, transcript, live words and pace.
4. Leave with a next step — 5.5s — score breakdown, AI feedback, final brand lockup.

Use `brag-plan.md` as the creative contract. The durations sum to 20 seconds.

## Audio
- Audio role: warm, steady support.
- Audio arc: subtle opening, gentle UI accents, warm score reveal, soft fade under final logo.
- Music: 20-second edit at `assets/music/podium-launch-bed.mp3`, sourced from bundled vol. 12.
- Music treatment: approximately 0.28 volume; start at zero; fade over the final 0.7 seconds.
- Music cue guidance: use bundled cue metadata at `assets/music/cues/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.json`; prioritize cues near 8.74s and 17.47s only when they support readable timing.
- Audio-reactive treatment: subtle warmth in the existing orbit artwork and halo; no waveform or particle effects.
- Audio-coupled moments: prompt selection, text appearing, and the score reveal.
- SFX selection guidance: a few very quiet click/drop accents matched to visible actions.
- SFX analysis guidance: follow Hyperframes’ bundled SFX guidance if available; favor soft transient sounds.
- Exact SFX choice: select filenames and timestamps based on implemented motion.
- Audio files: edited music and pre-extracted audio-reactive data are under `composition/assets/music/`; soft UI click/drop accents are under `composition/assets/sfx/`.

## Hyperframes Instructions
Build a deterministic, seek-safe HTML composition with all scene transitions and entrances. Keep actual product UI the centerpiece. Follow the `DESIGN.md` in the composition directory and bundled Hyperframes composition/CLI conventions. Run `npx hyperframes check` before render; fix reported errors. Render the final MP4, select a settled poster frame, bake that poster into frame zero, and write share copy.
