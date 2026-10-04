"use client";

import { useCallback, useEffect, useRef } from "react";
import type { TypingTelemetry } from "@/lib/scoring";

type Props = { value: string; onChange(value: string): void; onTelemetry(value: TypingTelemetry): void; maxLength?: number; disabled?: boolean };

export default function ProtectedTextarea({ value, onChange, onTelemetry, maxLength = 12_000, disabled = false }: Props) {
  const element = useRef<HTMLTextAreaElement>(null);
  const previousValue = useRef(value);
  const startedAt = useRef<number | null>(null);
  const lastKeystrokeAt = useRef<number | null>(null);
  const awayAtTypingStart = useRef(0);
  const awayAtLastKeystroke = useRef(0);
  const keystrokes = useRef(0);
  const flags = useRef(0);
  const blurs = useRef(0);
  const awayMs = useRef(0);
  const awayStartedAt = useRef<number | null>(null);

  const report = useCallback(() => {
    const now = Date.now();
    const away = awayMs.current + (awayStartedAt.current === null ? 0 : now - awayStartedAt.current);
    onTelemetry({
      keystrokeCount: keystrokes.current,
      typingDurationMs: startedAt.current === null || lastKeystrokeAt.current === null ? 0 : Math.max(0, lastKeystrokeAt.current - startedAt.current - Math.max(0, awayAtLastKeystroke.current - awayAtTypingStart.current)),
      flagCount: flags.current,
      tabBlurCount: blurs.current,
      timeAwayMs: away,
    });
  }, [onTelemetry]);

  useEffect(() => {
    function handleBlur() { if (awayStartedAt.current === null) { awayStartedAt.current = Date.now(); blurs.current += 1; report(); } }
    function handleFocus() { if (awayStartedAt.current !== null) { awayMs.current += Date.now() - awayStartedAt.current; awayStartedAt.current = null; report(); } }
    function handleVisibility() { if (document.hidden) handleBlur(); else handleFocus(); }
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => { window.removeEventListener("blur", handleBlur); window.removeEventListener("focus", handleFocus); document.removeEventListener("visibilitychange", handleVisibility); };
  }, [report]);

  function flag() { flags.current += 1; report(); }

  return (
    <div className="protected-input-wrap">
      <label className="field-label" htmlFor="practice-response">Your response</label>
      <textarea
        ref={element}
        id="practice-response"
        className="protected-textarea"
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        placeholder="Start with the idea you want to share…"
        aria-describedby="paste-note"
        onPaste={(event) => { event.preventDefault(); flag(); }}
        onDrop={(event) => { event.preventDefault(); flag(); }}
        onCut={(event) => { event.preventDefault(); flag(); }}
        onContextMenu={(event) => { event.preventDefault(); }}
        onKeyDown={(event) => {
          const paste = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v";
          const cut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "x";
          if (paste || cut || (event.shiftKey && event.key === "Insert")) { event.preventDefault(); flag(); }
        }}
        onBeforeInput={(event) => {
          const native = event.nativeEvent as InputEvent;
          if (["insertFromPaste", "insertFromDrop", "insertFromPasteAsQuotation", "insertFromYank", "deleteByCut"].includes(native.inputType)) { event.preventDefault(); flag(); return; }
          if (!native.isComposing && native.data && native.data.length > 30) { event.preventDefault(); flag(); }
        }}
        onCompositionStart={() => { if (startedAt.current === null) { startedAt.current = Date.now(); awayAtTypingStart.current = awayMs.current; } }}
        onChange={(event) => {
          const next = event.currentTarget.value;
          const prior = previousValue.current;
          const delta = Math.abs(next.length - prior.length);
          const composing = (event.nativeEvent as InputEvent).isComposing;
          if (!composing && delta > 30) { event.currentTarget.value = prior; flag(); return; }
          if (startedAt.current === null) { startedAt.current = Date.now(); awayAtTypingStart.current = awayMs.current; }
          if (delta > 0) { keystrokes.current += Math.min(delta, 30); lastKeystrokeAt.current = Date.now(); awayAtLastKeystroke.current = awayMs.current; }
          previousValue.current = next;
          onChange(next);
          report();
        }}
      />
      <div className="protected-input-meta"><span id="paste-note">Pasting, dropping, and cutting text are disabled. This discourages copying but cannot prove how an answer was created.</span><span>{value.length.toLocaleString()}/{maxLength.toLocaleString()}</span></div>
    </div>
  );
}
