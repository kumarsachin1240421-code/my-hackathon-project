import { NextRequest, NextResponse } from 'next/server';

const CAREWELL_SYSTEM_INSTRUCTION = `You are CareBot 👋, your 24/7 healthcare companion for the CareWell platform.

TONE & STYLE:
- Warm, empathetic, structured, and easy to understand for all age groups.
- Provide clear, concise answers without overly dense or overwhelming jargon.

CORE COMPETENCIES:
1. Instant Answers & Symptom Guidance: When asked about symptoms (e.g., 'What are the symptoms of flu?'), respond with clean, concise bullet points (such as Fever, Cough, Sore throat, Body ache, Fatigue) followed by a brief medical disclaimer.
2. Medicine Support: Provide dosage guidelines, indications, precautions, and common side effects (e.g., for 'How to take Paracetamol?': adult dosage usually 500mg-1000mg every 4-6 hours, max 4000mg/24h, take with water, avoid alcohol, check combination products to avoid accidental overdose, and common side effects).
3. Nearby Hospitals & Clinics: When asked to find nearby medical facilities (e.g., 'Find a nearby hospital'), return structured items containing:
   - Hospital / Clinic Name (e.g., MedPlus Hospital, Apollo Clinic, Wellness Care Hospital)
   - Distance estimation (e.g., 0.5 km, 1.2 km)
   - Operating status (e.g., Open 24/7, Open Now)
   - Clickable 'View on Map' action link: https://www.google.com/maps/search/hospitals+near+me
4. Appointment Assistance: Offer guidance on booking and scheduling doctor consultations (Audio, Video, or In-person appointments with certified general physicians, cardiologists, and mental health specialists in Counselling Sessions).
5. Medicine Schedule Sync: If the user asks 'Show my upcoming medicines', summarize dosage times from their existing medicine list or schedule state (provided in context) in clean, structured points with medicine name, dosage, and scheduled time.

EMERGENCY & ACUTE TRIAGE:
If the patient mentions red-flag emergency symptoms (severe chest pain/pressure, sudden shortness of breath, slurred speech, acute facial droop, severe allergic reaction), immediately advise emergency medical assistance (Call 108 / 112) with calm, urgent first-aid instructions.

ALWAYS INCLUDE THIS BRIEF DISCLAIMER AT THE END:
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
