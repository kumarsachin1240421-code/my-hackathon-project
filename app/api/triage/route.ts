import { NextRequest, NextResponse } from 'next/server';
import { TriageRequest, TriageResponse, TriageSeverity } from '@/types/triage';

// Critical life-threatening trigger terms for immediate safety override
const CRITICAL_EMERGENCY_TRIGGERS: RegExp[] = [
  /heart\s*attack/i,
  /chest\s*(pain|tightness|pressure|squeezing)/i,
  /stroke|facial\s*droop|arm\s*weakness|slurred\s*speech/i,
  /can('t|not)\s*breathe|severe\s*shortness\s*of\s*breath|suffocating/i,
  /unconscious|fainted|passed\s*out|unresponsive/i,
  /severe\s*(bleeding|hemorrhage)|vomiting\s*blood/i,
  /anaphylaxis|throat\s*swelling|blue\s*lips/i,
  /seizure|convulsions/i,
  /poison(ing)?|overdose/i,
];

// Fallback rule-based triage heuristic if AI service encounters network degradation
function getRuleBasedTriage(lastUserMessage: string): TriageResponse {
  const text = lastUserMessage.toLowerCase();
  const isEmergency = CRITICAL_EMERGENCY_TRIGGERS.some((pattern) => pattern.test(text));

  if (isEmergency) {
    return {
      ai_message:
        "CRITICAL EMERGENCY ALERT: Your symptoms indicate a potential life-threatening situation. Please call emergency services (108 / 112 / 911) immediately or proceed to the nearest emergency trauma center. Do not drive yourself.",
      summary: "Potential life-threatening acute emergency requiring immediate intervention.",
      severity: 'critical_emergency',
      is_emergency: true,
      recommended_specialty: 'Emergency Medicine / Trauma Center',
      search_keywords: ['emergency trauma center', 'cardiac hospital', 'critical care hospital'],
      emergency_instructions:
        'Sit upright, remain calm, loosen tight clothing, and call 108/112 immediately. If experiencing chest pain, do not exert yourself.',
    };
  }

  if (/fever|chills|shivering|temperature/i.test(text)) {
    const isHigh = /high|10[2-5]|severe|vomiting/i.test(text);
    return {
      ai_message:
        "You appear to be experiencing feverish symptoms. Keep yourself well hydrated with electrolytes and monitor your body temperature regularly. If fever exceeds 102°F (39°C) or persists over 48 hours, consult a physician.",
      summary: isHigh ? 'High grade fever requiring prompt medical evaluation' : 'Moderate febrile episode',
      severity: isHigh ? 'high' : 'medium',
      is_emergency: false,
      recommended_specialty: 'General Medicine / Internal Medicine',
      search_keywords: ['general hospital', 'internal medicine clinic', 'multispecialty hospital'],
      emergency_instructions: 'Stay hydrated, rest in a cool ventilated room, and take prescribed antipyretics if advised by a doctor.',
    };
  }

  if (/cough|sore\s*throat|cold|congestion|flu|sneezing/i.test(text)) {
    return {
      ai_message:
        "Your symptoms suggest an upper respiratory irritation or viral infection. Rest, stay warm, and take steam inhalation. If you develop wheezing, chest congestion, or colored sputum, please visit a pulmonologist or clinic.",
      summary: 'Upper respiratory infection symptoms',
      severity: 'low',
      is_emergency: false,
      recommended_specialty: 'Pulmonology / General Physician',
      search_keywords: ['pulmonology clinic', 'general physician clinic', 'community health center'],
    };
  }

  if (/stomach|abdomen|nausea|diarrhea|cramps|vomit/i.test(text)) {
    const isSevere = /severe|sharp|blood|unbearable/i.test(text);
    return {
      ai_message:
        "Gastrointestinal discomfort detected. Avoid heavy or oily foods, drink oral rehydration solutions (ORS), and rest. If pain becomes severe or localized in the lower right abdomen, seek urgent care.",
      summary: isSevere ? 'Acute abdominal pain requiring medical assessment' : 'Mild gastrointestinal discomfort',
      severity: isSevere ? 'high' : 'medium',
      is_emergency: false,
      recommended_specialty: 'Gastroenterology / General Medicine',
      search_keywords: ['gastroenterology hospital', 'emergency clinic', 'multispecialty hospital'],
      emergency_instructions: isSevere ? 'Do not take heavy painkillers without doctor advice. Drink small sips of water.' : undefined,
    };
  }

  return {
    ai_message:
      "Thank you for sharing your symptoms. Based on your description, a clinical consultation with a general physician is recommended to evaluate your condition and guide appropriate treatment.",
    summary: 'General clinical consultation advised',
    severity: 'medium',
    is_emergency: false,
    recommended_specialty: 'General Medicine / Family Medicine',
    search_keywords: ['general hospital', 'family medicine clinic', 'multispecialty clinic'],
  };
}

export async function POST(req: NextRequest) {
  try {
    const body: TriageRequest = await req.json();

    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json(
        { error: 'Invalid request: "messages" array is required.' },
        { status: 400 }
      );
    }

    const lastUserMessage = [...body.messages].reverse().find((m) => m.role === 'user')?.content || '';

    // Safety First: Instant deterministic check for critical triggers
    const isCritical = CRITICAL_EMERGENCY_TRIGGERS.some((p) => p.test(lastUserMessage));

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    // If API key is missing or prompt is critical, return immediate safe triage
    if (!apiKey) {
      const fallbackResult = getRuleBasedTriage(lastUserMessage);
      return NextResponse.json(fallbackResult);
    }

    const systemInstruction = `
You are the CarePill Clinical AI Triage Engine, an expert, empathetic medical AI triage system.
Your mission is to evaluate patient symptoms, assign an accurate clinical triage severity, identify the ideal medical specialty, and recommend hospital search keywords for spatial routing.

CLINICAL TRIAGE GUARDRAILS:
1. Always maintain empathy, precision, and calmness.
2. If the user expresses ANY sign of a cardiac event, acute stroke, respiratory arrest, severe hemorrhage, anaphylaxis, or altered consciousness, immediately set "severity" to "critical_emergency" and "is_emergency" to true.
3. Provide practical first-aid/emergency survival steps in "emergency_instructions" when "is_emergency" is true.
4. Always structure "search_keywords" into 3-4 spatial search terms (e.g. ["cardiology hospital", "cardiac trauma centre", "emergency hospital"]).
5. Always output STRICT JSON conforming exactly to the requested schema. Do not include markdown code blocks (like \`\`\`json) in the response.

JSON SCHEMA:
{
  "ai_message": "string (Empathetic, clear patient guidance including next clinical steps)",
  "summary": "string (1-sentence clinical symptom summary)",
  "severity": "low" | "medium" | "high" | "critical_emergency",
  "is_emergency": boolean,
  "recommended_specialty": "string (e.g., Cardiology, Neurology, Pediatrics, Orthopedics, General Medicine, Pulmonology, Emergency Medicine)",
  "search_keywords": ["string", "string", "string"],
  "emergency_instructions": "string (optional emergency guidance or survival tip)"
}
`;

    const conversationContext = body.messages
      .map((m) => `${m.role === 'user' ? 'Patient' : 'CarePill'}: ${m.content}`)
      .join('\n');

    const prompt = `Patient Conversation History:\n${conversationContext}\n\nEvaluate the latest symptoms and produce the required JSON triage response.`;

    // Attempt preferred models in sequence with graceful fallback
    const candidateModels = ['gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-flash-latest'];
    let triageData: TriageResponse | null = null;

    for (const model of candidateModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            systemInstruction: { parts: [{ text: systemInstruction }] },
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.2,
            },
          }),
        });

        if (!response.ok) {
          continue;
        }

        const data = await response.json();
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          const cleanedText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
          triageData = JSON.parse(cleanedText) as TriageResponse;
          break;
        }
      } catch {
        continue;
      }
    }

    // If Gemini parsing succeeded, apply safety override if critical triggers matched
    if (triageData) {
      if (isCritical) {
        triageData.severity = 'critical_emergency';
        triageData.is_emergency = true;
        if (!triageData.emergency_instructions) {
          triageData.emergency_instructions =
            'Call emergency services (108 / 112) immediately. Sit down, loosen restrictive clothing, and avoid exertion.';
        }
      }
      return NextResponse.json(triageData);
    }

    // Fallback if AI models were unavailable
    const ruleBased = getRuleBasedTriage(lastUserMessage);
    return NextResponse.json(ruleBased);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Triage Server Error';
    return NextResponse.json(
      {
        error: message,
        fallback: getRuleBasedTriage('General illness evaluation needed'),
      },
      { status: 500 }
    );
  }
}
