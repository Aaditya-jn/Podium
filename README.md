# Podium

Podium is a private, low-pressure practice platform for impromptu speaking and writing.

---

## Key Features

- **Topic Discovery**: Curated categories and trending topics fetched from live feeds.
- **Dual Practice Modes**:
  - **Write Mode**: Anti-cheat typing cadence telemetry and timing analysis.
  - **Speak Mode**: Live in-browser Web Speech API transcription with private audio fallback via Gemini.
- **Scoring & Review**: Fast, deterministic 0–100 scoring based on length, vocabulary richness, clarity, and pacing, paired with AI-driven language feedback.
- **Optional On-Device Delivery Insights**: Ethical, privacy-first camera analysis providing descriptive, observable behavioral cues during speaking sessions.

---

## Camera Delivery Insights (Ethical & Privacy Architecture)

Podium's camera feature is designed with a strict privacy-first and ethical AI architecture:

### 1. 100% On-Device Processing
- All vision analysis is executed locally inside the user's browser using `@mediapipe/tasks-vision` (Face Landmarker blendshapes and 3D transformation matrices).
- **No images, video streams, or raw facial landmarks are ever sent over the network** or uploaded to external services (no Luxand or third-party computer vision APIs).
- The camera preview and frame processing stop immediately whenever the session pauses, ends, or the browser tab becomes hidden.

### 2. Observable, Descriptive Cues Only (No Emotion Inference)
- **Zero Emotion Claims**: Podium never infers or outputs emotion or psychological states (no "happy", "sad", "nervous", "confident", "engaged", "dishonest", or personality labels).
- **Strictly Descriptive**: All metrics report observable physical behaviors relative to the speaker's own baseline:
  - **Gaze toward camera %**: Orientation of eye direction and head pose toward the screen/camera.
  - **Head stability %**: Measured movement deltas across yaw, pitch, and roll.
  - **Brow movement variety**: Range of eyebrow motion relative to neutral baseline.
  - **Smile frequency**: Frequency of smile transitions per minute.
  - **Speaking cadence (mouth activity)**: Measured jaw and mouth activity deltas.
  - **Blink rate**: Blink events per minute.
  - **Face visibility %**: Proportion of frames where the face is reliably detected.

### 3. Individual Baseline Calibration
- The first 3 seconds of every camera-enabled session are dedicated to establishing the user's neutral baseline.
- Subsequent cues are computed relative to that user's own baseline rather than arbitrary universal norms.

### 4. Segmented Timeline
- Delivery signals are computed both in aggregate and segmented across the duration of the talk (4 timeline segments), enabling speakers to see patterns across their talk (e.g., changes in gaze toward the end).

### 5. Quality Guardrails & Contextual Awareness
- **"Not enough data" Protection**: If detection quality is below threshold or the active session is shorter than 8 seconds, delivery signals are displayed as "Not enough data" to avoid misleading feedback.
- **Nuance & Limitations**: Podium explicitly reminds users that lighting conditions, eyeglasses, camera angles, hardware, and individual or cultural differences directly affect camera measurements.
- **Decoupled from Scoring**: Delivery insights are completely optional and never affect the 0–100 practice score.

---

## Commands

```bash
npm run dev    # Start the local development server
npm test       # Run unit test suite (Vitest)
npm run lint   # Run ESLint checks
npm run build  # Create a production build
npm run start  # Serve the production build
```
