"use client";

import { useEffect, useState } from "react";

import { categories, difficulties, type Difficulty } from "@/lib/config/categories";
import PracticeSession, { type AttemptResult } from "@/components/practice-session";

type Topic = {
  topic: string;
  category: string;
  difficulty: Difficulty;
  source: "trending" | "classic";
  source_title: string;
  source_url: string;
  published_at: string;
  source_name: string;
  style: "explainer" | "pros-cons" | "personal-experience" | "classic";
};
type RecentTopic = { topic: string; style: Topic["style"] };
type Mode = "speak" | "write";
type Screen = "home" | "practice" | "results";

function readAttempts(): AttemptResult[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem("podium:attempts") ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.flatMap((item): AttemptResult[] => item && typeof item === "object"
      && "id" in item && typeof item.id === "string"
      && "topic" in item && typeof item.topic === "string"
      && "score" in item && typeof item.score === "number"
      && "createdAt" in item && typeof item.createdAt === "string"
      ? [item as AttemptResult]
      : []).slice(0, 20);
  } catch { return []; }
}

function readRecentTopics(): RecentTopic[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem("podium:recent-topics") ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.flatMap((item): RecentTopic[] => {
      if (typeof item === "string") return [{ topic: item, style: "classic" }];
      if (item && typeof item === "object" && "topic" in item && typeof item.topic === "string") {
        const style = "style" in item && ["explainer", "pros-cons", "personal-experience", "classic"].includes(String(item.style))
          ? item.style as Topic["style"]
          : "classic";
        return [{ topic: item.topic, style }];
      }
      return [];
    }).slice(0, 30);
  } catch {
    return [];
  }
}

function formatPublishedDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(value));
}

export default function Home() {
  const [categoryId, setCategoryId] = useState(categories[0].id);
  const [customCategory, setCustomCategory] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [mode, setMode] = useState<Mode>("speak");
  const [topic, setTopic] = useState<Topic | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [screen, setScreen] = useState<Screen>("home");
  const [attempts, setAttempts] = useState<AttemptResult[]>([]);
  const [result, setResult] = useState<AttemptResult | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setAttempts(readAttempts()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function getTopic() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId,
          customCategory,
          difficulty,
          recentTopics: readRecentTopics().map((item) => item.topic),
          recentStyles: readRecentTopics().map((item) => item.style),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "We couldn't find a prompt right now.");
      const newTopic = data as Topic;
      setTopic(newTopic);
      setScreen("practice");
      const recentTopics = readRecentTopics();
      window.localStorage.setItem("podium:recent-topics", JSON.stringify([
        { topic: newTopic.topic, style: newTopic.style },
        ...recentTopics.filter((item) => item.topic !== newTopic.topic),
      ].slice(0, 30)));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function completeAttempt(attempt: AttemptResult) {
    const next = [attempt, ...attempts].slice(0, 20);
    setAttempts(next);
    try { window.localStorage.setItem("podium:attempts", JSON.stringify(next)); } catch { /* history is optional */ }
    setResult(attempt);
    setScreen("results");
  }

  function startAnotherTopic() {
    setResult(null);
    setTopic(null);
    setScreen("home");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="min-h-screen overflow-hidden">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />
      <div className="site-shell">
        <header className="topbar">
          <a className="brand" href="#home" aria-label="Podium home" onClick={(event) => { if (screen !== "home") { event.preventDefault(); startAnotherTopic(); } }}>
            <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
            <span>podium</span>
          </a>
          <div className="topbar-note"><span className="live-dot" /> A little practice goes a long way</div>
          <button className="profile-button" type="button" aria-label="Your practice profile">✳</button>
        </header>

        <section className="hero" id="home">
          <div className="hero-copy">
            <p className="eyebrow"><span className="eyebrow-line" /> YOUR SPACE TO PRACTICE</p>
            <h1>Find your <span>voice.</span><br />Then make it heard.</h1>
            <p className="hero-description">Confidence isn’t something you’re born with.<br className="desktop-break" /> It’s something you build, one thought at a time.</p>
            <div className="hero-footnote"><span className="sparkle">✳</span> No pressure. Just progress.</div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="art-orbit orbit-outer" /><div className="art-orbit orbit-inner" />
            <div className="art-core"><div className="core-halo" /><div className="sound-wave"><i /><i /><i /><i /><i /><i /><i /><i /><i /></div><span className="core-star">✳</span></div>
            <div className="art-label label-top"><span className="label-dot dot-lime" /> ONE THOUGHT AT A TIME</div>
            <div className="art-label label-bottom"><span className="label-dot dot-pink" /> YOUR VOICE, YOUR PACE</div>
            <span className="orbit-spark spark-a">✳</span><span className="orbit-spark spark-b">✳</span>
          </div>
        </section>

        {screen === "practice" && topic && <PracticeSession key={`${topic.topic}-${mode}`} topic={topic} mode={mode} onBack={() => setScreen("home")} onComplete={completeAttempt} onShuffle={getTopic} shuffling={loading} />}

        {screen === "results" && result && <section className="practice-card results-card" aria-labelledby="results-title">
          <div className="session-kicker"><span className="step-pill"><span>03</span> &nbsp; YOUR REVIEW</span><span className="topic-meta">{result.category} · {result.mode === "speak" ? "Speaking" : "Writing"}</span></div>
          <div className="results-score-row"><div><p className="field-optional">PRACTICE SCORE</p><strong className="results-score">{result.score}<small>/100</small></strong></div><div className="results-summary"><span>{result.wordCount} words</span><span>{result.paceWpm} wpm</span><span>{Math.floor(result.durationSeconds / 60)}:{String(result.durationSeconds % 60).padStart(2, "0")} practiced</span></div></div>
          <h2 id="results-title">A little progress, every time.</h2>
          <div className="breakdown-grid">{[["Length", result.breakdown.length, 40], ["Vocabulary", result.breakdown.vocabulary, 25], ["Clarity", result.breakdown.clarity, 20], ["Pace", result.breakdown.pace, 15]].map(([label, value, max]) => <div className="breakdown-item" key={String(label)}><span>{label}</span><strong>{value}<small>/{max}</small></strong><div className="breakdown-track"><i style={{ width: `${(Number(value) / Number(max)) * 100}%` }} /></div></div>)}</div>
          {result.flags > 0 && <p className="flag-note" role="status">This attempt had {result.flags} anti-copy-paste flag{result.flags === 1 ? "" : "s"}. Each flag reduced the score by 5 points. {result.labels.join(" · ")}</p>}
          {result.reviewFallback ? <div className="review-section"><p>{result.review.structure_feedback}</p></div> : <>
            <div className="review-section"><h3>Structure & flow</h3><p>{result.review.structure_feedback}</p></div>
            <div className="review-columns"><div><h3>What worked</h3><ul>{result.review.strengths.map((item, index) => <li key={index}>{item}</li>)}</ul></div><div><h3>Try next</h3><ul>{result.review.improvements.map((item, index) => <li key={index}>{item}</li>)}</ul></div></div>
            {result.review.grammar_corrections.length > 0 && <div className="review-section"><h3>Language notes</h3>{result.review.grammar_corrections.map((item, index) => <p key={index}><b>{item.original}</b> → {item.suggestion} <span>{item.reason}</span></p>)}</div>}
          {result.review.improved_sentence && <div className="improved-sentence"><span>ONE WAY TO REPHRASE</span><p>{result.review.improved_sentence}</p></div>}
          </>}
          {result.transcriptionSource === "audio-fallback" && <div className="review-section result-transcript"><h3>Your transcript</h3><p>{result.text}</p></div>}
          {result.deliveryInsights && <div className="delivery-results"><p className="camera-eyebrow">OPTIONAL · NOT SCORED</p><h3>Delivery insights</h3>{result.deliveryInsights.lowConfidence ? <p>Detection quality was low during this session, so these measurements may not be reliable.</p> : <div className="delivery-metrics"><p><b>{result.deliveryInsights.facePresencePercent}%</b><span>face in frame</span></p><p><b>{result.deliveryInsights.handsInFramePercent}%</b><span>hands in frame</span></p><p><b>{result.deliveryInsights.gestureActivityPerMinute}</b><span>gesture changes/min</span></p><p><b>{result.deliveryInsights.averageShoulderTiltChangeDegrees}°</b><span>average shoulder tilt change</span></p><p><b>{result.deliveryInsights.averageTorsoLeanChangeDegrees}°</b><span>average torso lean change</span></p><p><b>{result.deliveryInsights.fidgetMovementsPerMinute}</b><span>small movement reversals/min</span></p></div>}<p className="delivery-caveat">These are suggestions about observable movement only, not emotion or personality. Lighting, glasses, camera angle, and individual differences can affect measurements.</p></div>}
          <button className="start-button result-next-button" type="button" onClick={startAnotherTopic}><span>Try another topic</span><span className="button-arrow">↗</span></button>
        </section>}

        {screen === "home" && <section className="practice-card" aria-labelledby="practice-title">
          <div className="card-topline"><span className="step-pill"><span>01</span> &nbsp; START HERE</span><span className="card-meta">TAKES JUST A FEW MINUTES <span>↗</span></span></div>
          <div className="card-heading-row">
            <div><h2 id="practice-title">Set the scene.</h2><p>Choose what feels right for today.</p></div>
            <div className="mini-progress" aria-label="Step 1 of 3"><span className="progress-active" /><span /><span /></div>
          </div>

          <div className="field-label-row"><label className="field-label" htmlFor="category">01 <span>Pick a topic area</span></label><span className="field-optional">YOU CAN CHANGE THIS ANYTIME</span></div>
          <div className="category-grid" role="group" aria-label="Topic category">
            {categories.map((category) => <button key={category.id} type="button" aria-pressed={categoryId === category.id} className={`category-tile ${categoryId === category.id ? "selected" : ""}`} onClick={() => setCategoryId(category.id)}><span className="category-icon">{category.icon}</span><span className="category-name">{category.name}</span>{categoryId === category.id && <span className="tile-check" aria-hidden="true">✓</span>}</button>)}
            <button type="button" aria-pressed={categoryId === "custom"} className={`category-tile custom-tile ${categoryId === "custom" ? "selected" : ""}`} onClick={() => setCategoryId("custom")}><span className="category-icon">＋</span><span className="category-name">Your own</span>{categoryId === "custom" && <span className="tile-check" aria-hidden="true">✓</span>}</button>
          </div>
          {categoryId === "custom" && <label className="custom-input-label" htmlFor="custom-category">Your topic area<input id="custom-category" value={customCategory} onChange={(event) => setCustomCategory(event.target.value.slice(0, 60))} placeholder="e.g. travel, science, cooking" maxLength={60} /></label>}

          <div className="form-divider" />
          <div className="setting-columns">
            <div className="setting-block"><label className="field-label" id="mode-label">02 <span>How do you want to practice?</span></label><div className="segmented-control" role="group" aria-labelledby="mode-label"><button type="button" aria-pressed={mode === "speak"} className={mode === "speak" ? "active" : ""} onClick={() => setMode("speak")}><span className="mode-symbol">◖</span> Speak</button><button type="button" aria-pressed={mode === "write"} className={mode === "write" ? "active" : ""} onClick={() => setMode("write")}><span className="mode-symbol write-symbol">✎</span> Write</button></div></div>
            <div className="setting-block difficulty-block"><label className="field-label" id="difficulty-label">03 <span>Set your level</span></label><div className="difficulty-options" role="group" aria-labelledby="difficulty-label">{difficulties.map((option) => <button key={option.id} className={`difficulty-option ${difficulty === option.id ? "active" : ""}`} type="button" aria-pressed={difficulty === option.id} onClick={() => setDifficulty(option.id)}><span className={`difficulty-indicator ${option.id}`} />{option.name}</button>)}</div><p className="difficulty-hint">{difficulties.find((item) => item.id === difficulty)?.hint} <span>·</span> no wrong answers</p></div>
          </div>

          <div className="card-bottom"><div className="privacy-note"><span className="lock-icon">◇</span><span>Your practice is personal.<br /><b>No account needed.</b></span></div><button className="start-button" type="button" onClick={getTopic} disabled={loading || (categoryId === "custom" && !customCategory.trim())}><span>{loading ? "Finding a prompt…" : "Get my topic"}</span><span className="button-arrow">↗</span></button></div>
          {error && <p className="error-message" role="alert">{error}</p>}
          {topic && <div className="topic-result" aria-live="polite"><div className="topic-kicker"><span>YOUR TOPIC</span><button type="button" onClick={getTopic} disabled={loading} aria-label="Shuffle topic">⟳ Shuffle</button></div><p>{topic.topic}</p><span className="topic-meta">{topic.category} <i>·</i> {topic.difficulty} <i>·</i> {mode === "speak" ? "Speaking" : "Writing"}</span><p className="topic-source-label">{topic.source === "trending" ? <><span className="trending-pill">Trending</span><a href={topic.source_url} target="_blank" rel="noreferrer noopener" title={topic.source_title}>{topic.source_name} · {formatPublishedDate(topic.published_at)} ↗</a></> : <span className="classic-pill">Classic</span>}</p><button className="start-button" type="button" onClick={() => setScreen("practice")}><span>Start practice</span><span className="button-arrow">↗</span></button></div>}
          {attempts.length > 0 && <section className="recent-attempts" aria-labelledby="recent-title"><div><h3 id="recent-title">Your recent attempts</h3><p>Personal best <strong>{Math.max(...attempts.map((item) => item.score))}/100</strong></p></div><button className="text-button" type="button" onClick={() => { try { window.localStorage.removeItem("podium:attempts"); } catch { /* history may be unavailable */ } setAttempts([]); }}>Clear history</button><ul>{attempts.slice(0, 3).map((item) => <li key={item.id}><span>{item.topic}</span><strong>{item.score}</strong><small>{new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(item.createdAt))}</small></li>)}</ul></section>}
        </section>
        }

        <footer className="page-footer"><span>MADE FOR THE MOMENT BEFORE YOU SPEAK.</span><span>© 2026 PODIUM <i>✳</i></span></footer>
      </div>
    </main>
  );
}
