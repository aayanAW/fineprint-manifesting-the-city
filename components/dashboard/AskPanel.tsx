"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MOCK_ASK_SEEDS } from "@/lib/mock";
import type { RagAnswer } from "@/lib/ai/types";

// Ask-the-law. Mock mode answers only the seeded questions and says so
// honestly; the BM25 RAG over the curated corpus lands in P1.
export function AskPanel() {
  const [question, setQuestion] = useState("");
  const [current, setCurrent] = useState<{ q: string; a: RagAnswer } | null>(
    null,
  );
  const [miss, setMiss] = useState(false);

  function ask(q: string) {
    const seed = MOCK_ASK_SEEDS.find(
      (s) =>
        s.question === q ||
        s.question.toLowerCase().includes(q.trim().toLowerCase()),
    );
    if (seed) {
      setCurrent({ q: seed.question, a: seed.answer });
      setMiss(false);
    } else {
      setCurrent(null);
      setMiss(true);
    }
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[0.45fr_1fr]">
      <div>
        <p className="legal-label">Ask the law</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (question.trim()) ask(question);
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
          <Button type="submit" variant="outline" className="shrink-0">
            Ask
          </Button>
        </form>
        <ul className="mt-5 space-y-2">
          {MOCK_ASK_SEEDS.map((s) => (
            <li key={s.question}>
              <button
                type="button"
                onClick={() => {
                  setQuestion(s.question);
                  ask(s.question);
                }}
                className="text-left text-xs text-ink-60 underline decoration-ink-20 underline-offset-4 transition-colors hover:text-ink hover:decoration-ink"
              >
                {s.question}
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-[0.65rem] leading-relaxed text-ink-40">
          Answers draw on a curated LL97 corpus and cite their sources; verify
          against the cited text. Demo mode answers the seeded questions only.
        </p>
      </div>

      <div aria-live="polite">
        {miss && (
          <p className="text-xs leading-relaxed text-ink-60">
            That question is outside the demo corpus. The live build retrieves
            over the full statute, Article 320/321, and DOB rules; here, try a
            seeded question.
          </p>
        )}
        {current && (
          <article className="rise">
            <p className="font-display text-2xl font-light italic leading-snug">
              {current.q}
            </p>
            <p className="mt-4 max-w-[68ch] text-sm leading-relaxed">
              {current.a.answer}
            </p>
            <div className="mt-6 space-y-4">
              {current.a.citations.map((c) => (
                <blockquote
                  key={c.url}
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
        {!current && !miss && (
          <p className="text-xs leading-relaxed text-ink-40">
            Pick a question. Every answer arrives with the exact clause it
            stands on.
          </p>
        )}
      </div>
    </div>
  );
}
