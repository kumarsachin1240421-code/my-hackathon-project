import { NextRequest, NextResponse } from 'next/server';

const CAREWELL_SYSTEM_INSTRUCTION = `You are CareWell AI, an empathetic, highly intelligent clinical healthcare and wellness assistant for the CareWell platform.

YOUR CORE ROLES & CAPABILITIES:
1. Clinical, Biological & Pharmacological Expertise: Explain complex anatomy, cellular biology, diseases, medications, dosages, and interactions in clear, supportive, and accessible language.
2. Patient Medication & Context Awareness: When patient context (active medications, daily schedule, weekly adherence rate, missed doses) is provided, ground your answers directly in their specific health regimen.
3. Platform Navigation Guidance: Guide patients on utilizing CareWell features (Today's Schedule, Medicine Reports, Counselling & Doctor Appointments, Emergency SOS, Nearby Pharmacies).
4. Acute Triage & Emergency Safety: If the patient mentions red-flag symptoms (severe chest pressure/tightness radiating to arm/jaw, sudden shortness of breath, slurred speech, acute facial droop, severe allergic reaction), immediately advise emergency medical assistance (Call 108 / 112) with calm, actionable first-aid steps.

COMMUNICATION STYLE:
- Empathetic, warm, encouraging, and scientifically sound.
- Structure answers with clean formatting, bullet points, and concise explanations.
- Always include this polite reminder at the end of clinical guidance:
⚠️ Disclaimer: I provide general health guidance. Please consult a qualified doctor for medical diagnoses, prescriptions, or emergencies.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    let message = body.message || body.prompt || '';
    if (!message && Array.isArray(body.messages) && body.messages.length > 0) {
      const last = body.messages[body.messages.length - 1];
      message = last?.content || last?.message || '';
    }

    if (!message && (!Array.isArray(body.messages) || body.messages.length === 0)) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY is not configured' }, { status: 500 });
    }

    // Multi-turn contents builder
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
    const msgList = body.messages || body.history;
    if (Array.isArray(msgList) && msgList.length > 0) {
      for (const m of msgList) {
        if (typeof m === 'object' && m !== null) {
          const role = m.role === 'assistant' || m.role === 'bot' || m.role === 'model' ? 'model' : 'user';
          const text = (m.content || m.message || m.text || '').trim();
          if (text) {
            contents.push({ role, parts: [{ text }] });
          }
        }
      }
    }

    if (contents.length === 0) {
      contents.push({ role: 'user', parts: [{ text: String(message).trim() }] });
    }

    let activeSystemInstruction = CAREWELL_SYSTEM_INSTRUCTION;
    if (body.context) {
      activeSystemInstruction = `${CAREWELL_SYSTEM_INSTRUCTION}\n\nPATIENT LIVE CONTEXT:\n${body.context}`;
    }

    // High-performance models in sequence
    const models = ['gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-flash-latest', 'gemini-1.5-flash'];
    let aiText = '';
    let chosenModel = '';
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
              parts: [{ text: activeSystemInstruction }],
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
            aiText = candidateText;
            chosenModel = model;
            break;
          }
        } else {
          const errText = await response.text();
          lastError = `HTTP ${response.status}: ${errText}`;
        }
      } catch (fetchErr: any) {
        lastError = fetchErr?.message || String(fetchErr);
      }
    }

    if (!aiText) {
      return NextResponse.json(
        { error: 'Failed to communicate with Gemini API', details: lastError },
        { status: 502 }
      );
    }

    return NextResponse.json({
      reply: aiText,
      response: aiText,
      message: aiText,
      source: 'gemini_api',
      model: chosenModel,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Internal server error', details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
