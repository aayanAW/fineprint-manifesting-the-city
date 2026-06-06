// POST /api/ask { question } -> RagAnswer
// RAG over the curated LL97 corpus; Claude answers with citations or refuses.

import { answerLawQuestion } from '@/lib/ai/ask';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let body: { question?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const question = body.question?.trim();
  if (!question) {
    return Response.json({ error: 'question required' }, { status: 400 });
  }

  const answer = await answerLawQuestion(question);
  return Response.json(answer);
}
