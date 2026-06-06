"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchAsk } from "@/lib/client/api";
import { MOCK_ASK_SEEDS } from "@/lib/mock";
import type { RagAnswer } from "@/lib/ai/types";

// Ask-the-law: live RAG over the curated LL97 corpus (/api/ask). When the
// backend is unreachable, fall back to the seeded demo answers, labeled.
export function AskPanel() {
  const [question, setQuestion] = useState("");
  const [current, setCurrent] = useState<{
    q: string;
    a: RagAnswer;
    offline: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(q: string) {
    setLoading(true);
    setError(null);
    try {
      const a = await fetchAsk(q);
      setCurrent({ q, a, offline: false });
    } catch {
      const seed = MOCK_ASK_SEEDS.find(
        (s) =>
          s.question === q ||
          s.question.toLowerCase().includes(q.trim().toLowerCase()),
      );
      if (seed) {
        setCurrent({ q: seed.question, a: seed.answer, offline: true });
      } else {
        setCurrent(null);
        setError(
          "Backend unreachable and that question is outside the demo set.",
        );
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[0.45fr_1fr]">
      <div>
        <p className="legal-label">Ask the law</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (question.trim()) ask(question.trim());
          }}
          className="mt-3 flex items-end gap-4"
        >
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What does §28-320 require?"
            aria-label="Question about Local Law 97"
            className="text-lg"
          />
          <Button
            type="submit"
            variant="outline"
            disabled={loading}
            className="shrink-0"
          >
            {loading ? "…" : "Ask"}
          </Button>
        </form>
        <ul className="mt-5 space-y-2">
          {MOCK_ASK_SEEDS.map((s) => (
            <li key={s.question}>
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setQuestion(s.question);
                  ask(s.question);
                }}
                className="text-left text-xs text-ink-60 underline decoration-ink-20 underline-offset-4 transition-colors hover:text-ink hover:decoration-ink disabled:opacity-50"
              >
                {s.question}
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-6 max-w-[48ch] text-[0.65rem] leading-relaxed text-ink-40">
          Answers draw on a curated LL97 corpus and cite their sources. Verify
          against the cited text.
        </p>
      </div>

      <div aria-live="polite">
        {loading && <p className="legal-label">Reading the statute…</p>}
        {error && !loading && (
          <p className="text-xs leading-relaxed text-ink-60">{error}</p>
        )}
        {current && !loading && (
          <article className="rise">
            {current.offline && (
              <p className="legal-label mb-3" role="status">
                Offline · seeded demo answer
              </p>
            )}
            <p className="font-display text-2xl font-light italic leading-snug">
              {current.q}
            </p>
            <p className="mt-4 max-w-[68ch] text-sm leading-relaxed">
              {current.a.answer}
            </p>
            <div className="mt-6 space-y-4">
              {current.a.citations.map((c, i) => (
                <blockquote
                  key={`${c.url}-${i}`}
                  className="border-t border-hairline pt-3"
                >
                  <p className="text-[0.7rem] italic leading-relaxed text-ink-60">
                    “{c.quote}”
                  </p>
                  <cite className="legal-label mt-2 block not-italic">
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline decoration-ink-20 underline-offset-4 hover:decoration-ink"
                    >
                      {c.source}
                    </a>
                  </cite>
                </blockquote>
              ))}
            </div>
          </article>
        )}
        {!current && !error && !loading && (
          <p className="text-xs leading-relaxed text-ink-40">
            Pick a question. Every answer arrives with the exact clause it
            stands on.
          </p>
        )}
      </div>
    </div>
  );
}
