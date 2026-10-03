"use client";

import { useState } from "react";

import { categories, difficulties, type Difficulty } from "@/lib/config/categories";

type Topic = { topic: string; category: string; difficulty: Difficulty; source: "curated" };
type Mode = "speak" | "write";

function readRecentTopics(): string[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem("podium:recent-topics") ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 20) : [];
  } catch {
    return [];
  }
}

export default function Home() {
  const [categoryId, setCategoryId] = useState(categories[0].id);
  const [customCategory, setCustomCategory] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [mode, setMode] = useState<Mode>("speak");
  const [topic, setTopic] = useState<Topic | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
          recentTopics: readRecentTopics(),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "We couldn't find a prompt right now.");
      setTopic(data as Topic);
      const recentTopics = readRecentTopics();
      window.localStorage.setItem("podium:recent-topics", JSON.stringify([data.topic, ...recentTopics.filter((item) => item !== data.topic)].slice(0, 20)));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen overflow-hidden">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />
      <div className="site-shell">
        <header className="topbar">
          <a className="brand" href="#home" aria-label="Podium home">
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

        <section className="practice-card" aria-labelledby="practice-title">
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
          {topic && <div className="topic-result" aria-live="polite"><div className="topic-kicker"><span>YOUR TOPIC</span><button type="button" onClick={getTopic} disabled={loading} aria-label="Shuffle topic">⟳ Shuffle</button></div><p>{topic.topic}</p><span className="topic-meta">{topic.category} <i>·</i> {topic.difficulty} <i>·</i> {mode === "speak" ? "Speaking" : "Writing"}</span><p className="topic-next">Next up: your practice space, timer, and live notes. <span>COMING IN PHASE 2</span></p></div>}
        </section>

        <footer className="page-footer"><span>MADE FOR THE MOMENT BEFORE YOU SPEAK.</span><span>© 2026 PODIUM <i>✳</i></span></footer>
      </div>
    </main>
  );
}
