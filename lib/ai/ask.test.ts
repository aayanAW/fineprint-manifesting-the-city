import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { retrieve } from '@/lib/rag/retrieve';

const AFFORDABLE_Q = 'What is the affordable housing pathway for rent-regulated buildings?';

describe('retrieve grounding (offline, no AI)', () => {
  it('pulls Article 321 for the affordable-housing question', () => {
    const chunks = retrieve(AFFORDABLE_Q, 3);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].source.toLowerCase()).toContain('article 321');
    // Every retrieved chunk carries a usable url.
    for (const c of chunks) {
      expect(c.url).toMatch(/^https?:\/\//);
    }
  });
});

describe('answerLawQuestion (no API key — fallback)', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => { delete process.env.ANTHROPIC_API_KEY; });
  afterEach(() => { if (originalKey !== undefined) process.env.ANTHROPIC_API_KEY = originalKey; });

  it('returns the top chunk text + a citation with a url', async () => {
    const { answerLawQuestion } = await import('./ask');
    const ans = await answerLawQuestion(AFFORDABLE_Q);
    expect(ans.answer.length).toBeGreaterThan(0);
    expect(ans.citations.length).toBe(1);
    expect(ans.citations[0].url).toMatch(/^https?:\/\//);
    expect(ans.citations[0].source.toLowerCase()).toContain('article 321');
    expect(ans.citations[0].quote.length).toBeGreaterThan(0);
  });

  it('returns an honest no-answer when nothing in the corpus matches', async () => {
    const { answerLawQuestion } = await import('./ask');
    const ans = await answerLawQuestion('zzzqqq nonexistent xyzzy plover');
    expect(ans.citations).toEqual([]);
    expect(ans.answer).toMatch(/could not find/i);
  });
});

describe('answerLawQuestion (mocked AI path — offline)', () => {
  it('returns citations that carry url + quote, keeping only retrieved-source urls', async () => {
    const origKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'sk-test-key-mock';

    vi.resetModules();

    // Capture the prompt so we can assert Article 321 was retrieved and passed to Claude.
    let seenUser = '';
    const mockCreate = vi.fn().mockImplementation(async (req: { messages: { content: string }[] }) => {
      seenUser = req.messages[0].content;
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            answer: 'The Article 321 pathway lets qualifying affordable/rent-regulated buildings comply via prescribed measures instead of the $268/ton penalty.',
            citations: [
              {
                source: 'NYC Administrative Code §28-321 (Article 321)',
                url: 'https://www.nyc.gov/site/buildings/codes/local-law-97.page',
                quote: 'Article 321 is the alternative, lower-cost compliance pathway.',
              },
              {
                // Invented url — must be filtered out (not from a retrieved chunk).
                source: 'Fabricated source',
                url: 'https://example.com/made-up',
                quote: 'not real',
              },
            ],
          }),
        }],
      };
    });

    vi.doMock('@anthropic-ai/sdk', () => ({
      default: function MockAnthropic() {
        return { messages: { create: mockCreate } };
      },
    }));

    try {
      const { answerLawQuestion } = await import('./ask');
      const ans = await answerLawQuestion(AFFORDABLE_Q);

      expect(mockCreate).toHaveBeenCalledOnce();
      // The affordable-housing question pulled Article 321 into the prompt.
      expect(seenUser.toLowerCase()).toContain('article 321');

      expect(ans.answer).toContain('Article 321');
      // The invented-url citation was dropped; the real one survives with a url + quote.
      expect(ans.citations).toHaveLength(1);
      expect(ans.citations[0].url).toBe('https://www.nyc.gov/site/buildings/codes/local-law-97.page');
      expect(ans.citations[0].quote.length).toBeGreaterThan(0);
      for (const c of ans.citations) {
        expect(c.url).toMatch(/^https?:\/\//);
      }
    } finally {
      if (origKey !== undefined) process.env.ANTHROPIC_API_KEY = origKey;
      else delete process.env.ANTHROPIC_API_KEY;
      vi.resetModules();
    }
  });
});
