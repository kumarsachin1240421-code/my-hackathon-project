import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    let message = (body.message || body.prompt || '').trim();
    const history = body.history || body.messages || [];

    // Extract message from history if message wasn't passed directly
    if (!message && Array.isArray(history) && history.length > 0) {
      const last = history[history.length - 1];
      message = (last?.content || last?.message || last?.text || '').trim();
    }

    if (!message && (!Array.isArray(history) || history.length === 0)) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY is not configured' }, { status: 500 });
    }

    const systemInstruction =
      'You are CareWell AI, an empathetic, smart health and general knowledge companion. You can chat naturally about anything, explain complex biology, pharmacology, human anatomy, medical conditions, and wellness tips in simple terms. Provide accurate, clear answers. Always advise consulting a doctor for real medical decisions.';

    // Transform conversational history into Gemini's contents format:
    // Role 'user' -> { role: "user", parts: [{ text: content }] }
    // Role 'assistant' -> { role: "model", parts: [{ text: content }] }
    const contents = [];
    if (Array.isArray(history)) {
      for (const item of history) {
        if (item && typeof item === 'object') {
          const role =
            item.role === 'assistant' || item.role === 'model' || item.role === 'bot'
              ? 'model'
              : 'user';
          const text = (item.content || item.message || item.text || '').trim();
          if (text) {
            contents.push({ role, parts: [{ text }] });
          }
        }
      }
    }

    // Append current user message if not already the final item
    if (message) {
      const lastEntry = contents[contents.length - 1];
      if (!lastEntry || lastEntry.role !== 'user' || lastEntry.parts?.[0]?.text !== message) {
        contents.push({ role: 'user', parts: [{ text: message }] });
      }
    }

    if (contents.length === 0) {
      return NextResponse.json({ error: 'No content to process' }, { status: 400 });
    }

    // Connect to Google Generative Language API using gemini-1.5-flash with fallback models
    const models = ['gemini-1.5-flash', 'gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-flash-latest'];
    let replyText = '';
    let lastError = '';

    for (const model of models) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: systemInstruction }],
            },
            contents,
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 1000,
            },
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (candidateText) {
            replyText = candidateText;
            break;
          }
        } else {
          const errText = await response.text();
          lastError = `HTTP ${response.status}: ${errText}`;
        }
      } catch (err) {
        lastError = err?.message || String(err);
      }
    }

    if (!replyText) {
      return NextResponse.json(
        { error: 'Failed to communicate with CareWell AI', details: lastError },
        { status: 502 }
      );
    }

    return NextResponse.json({
      reply: replyText,
      response: replyText,
      message: replyText,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message || String(error) },
      { status: 500 }
    );
  }
}
