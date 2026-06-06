// FinePrint v2 — citation-backed RAG "ask the law" layer.
//
// answerLawQuestion(question): retrieve the top-k curated LL97 corpus chunks (offline,
// deterministic BM25 from lib/rag/retrieve), then ask Claude to answer ONLY from those
// chunks, citing each claim and refusing when the retrieved text doesn't support an answer.
//
// THE ONE RULE still holds: Claude never invents a citation — every Citation.url is copied
// verbatim from a retrieved chunk, and the structured-output schema forces a quote field.
//
// AI key is OPTIONAL. With no ANTHROPIC_API_KEY (or on any error), the fallback returns the
// top retrieved chunk's text as the answer plus its citation — still grounded, still cited.

import { retrieve, type Chunk } from '@/lib/rag/retrieve';

export interface Citation {
  source: string;
  url: string;
  quote: string;
}

export interface RagAnswer {
  answer: string;
  citations: Citation[];
}

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8';
const TOP_K = 3;

const SYSTEM = `You are a Local Law 97 (NYC building carbon law) explainer.
Answer ONLY from the provided sources. If the sources do not contain the answer, say you cannot answer from the available material — do not use outside knowledge and never invent a citation.
For every claim, cite the supporting source: include its source name, its exact url (copied verbatim from the source — never alter or invent a url), and a short verbatim quote from that source's text.
Write a clear, plain-language answer for a non-expert building owner.`;

// Structured output: the answer plus citations. `url` and `quote` are required so a
// claim can never be surfaced without a checkable source.
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    answer: { type: 'string', description: 'Plain-language answer grounded only in the sources.' },
    citations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          source: { type: 'string', description: 'The source name, copied from a provided source.' },
          url: { type: 'string', description: "The source's url, copied verbatim — never invented." },
          quote: { type: 'string', description: 'A short verbatim quote from the source text.' },
        },
        required: ['source', 'url', 'quote'],
      },
    },
  },
  required: ['answer', 'citations'],
};

function firstSentence(text: string): string {
  const m = text.match(/^[\s\S]*?[.!?](\s|$)/);
  return (m ? m[0] : text).trim().slice(0, 300);
}

/** Deterministic, no-API answer: surface the top retrieved chunk's text + its citation. */
function fallbackAnswer(chunks: Chunk[]): RagAnswer {
  if (chunks.length === 0) {
    return {
      answer:
        'I could not find anything in the Local Law 97 reference material to answer that question.',
      citations: [],
    };
  }
  const top = chunks[0];
  return {
    answer: top.text,
    citations: [{ source: top.source, url: top.url, quote: firstSentence(top.text) }],
  };
}

/**
 * Answer an LL97 question with citations. Retrieves first (always — grounding is offline and
 * deterministic), then asks Claude to answer/cite over the retrieved chunks. Falls back to the
 * top chunk when there is no API key or the call fails.
 */
export async function answerLawQuestion(question: string): Promise<RagAnswer> {
  const chunks = retrieve(question, TOP_K);

  if (!process.env.ANTHROPIC_API_KEY || chunks.length === 0) {
    return fallbackAnswer(chunks);
  }

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic();

    const sources = chunks
      .map((c, i) => `[Source ${i + 1}]\nname: ${c.source}\nurl: ${c.url}\ntext: ${c.text}`)
      .join('\n\n');
    const user = `Question: ${question}\n\nSources (answer only from these):\n\n${sources}`;

    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: user }],
    });

    const textBlock = res.content.find(b => b.type === 'text');
    const parsed = JSON.parse((textBlock as { text?: string } | undefined)?.text ?? '{}');

    const answer = String(parsed.answer ?? '').trim();
    const rawCitations = Array.isArray(parsed.citations) ? parsed.citations : [];

    // Only keep citations whose url matches a retrieved chunk — defends against any
    // invented url slipping through despite the instruction. Source/quote come from the model.
    const allowedUrls = new Set(chunks.map(c => c.url));
    const citations: Citation[] = rawCitations
      .filter((c: unknown): c is Citation =>
        !!c &&
        typeof (c as Citation).url === 'string' &&
        allowedUrls.has((c as Citation).url) &&
        typeof (c as Citation).source === 'string' &&
        typeof (c as Citation).quote === 'string')
      .map((c: Citation) => ({ source: c.source, url: c.url, quote: c.quote }));

    if (!answer) return fallbackAnswer(chunks);
    return { answer, citations };
  } catch {
    return fallbackAnswer(chunks);
  }
}
