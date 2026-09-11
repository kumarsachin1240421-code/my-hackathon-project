'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Message, TriageResponse, TriageSeverity, UserLocation } from '@/types/triage';

interface SymptomTriageChatbotProps {
  userLocation?: UserLocation;
  onTriageComplete?: (triageData: TriageResponse) => void;
  className?: string;
}

const QUICK_CHIPS = [
  { label: '🫀 Chest tightness & pressure', text: 'I am experiencing sudden chest tightness, heaviness and cold sweat.' },
  { label: '🔥 High fever & chills', text: 'I have a high fever of 103°F with intense shivering and body ache.' },
  { label: '⚡ Severe migraine', text: 'Extreme throbbing headache with nausea and light sensitivity.' },
  { label: '👶 Pediatric cough & wheezing', text: 'My child has continuous barking cough and difficulty breathing.' },
  { label: '🤢 Acute abdominal pain', text: 'Severe sharp pain in the lower right stomach area for 4 hours.' },
];

export const SymptomTriageChatbot: React.FC<SymptomTriageChatbotProps> = ({
  userLocation,
  onTriageComplete,
  className = '',
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        'Hello, I am the CarePill Clinical AI Triage Assistant. Describe your symptoms or choose a quick prompt below so I can assess your condition and guide you to the best nearby medical care.',
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lastTriage, setLastTriage] = useState<TriageResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSend = async (customText?: string) => {
    const textToSend = (customText || inputText).trim();
    if (!textToSend || isLoading) return;

    setInputText('');
    setErrorMsg(null);

    const newMessages: Message[] = [...messages, { role: 'user', content: textToSend }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const response = await fetch('/api/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          userLocation,
        }),
      });

      if (!response.ok) {
        throw new Error(`Triage server error: ${response.statusText}`);
      }

      const triageData: TriageResponse = await response.json();
      setLastTriage(triageData);

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: triageData.ai_message,
        },
      ]);

      if (onTriageComplete) {
        onTriageComplete(triageData);
      }
    } catch (err) {
      console.error('Triage dispatch failure:', err);
      setErrorMsg('Triage service temporarily unavailable. Please proceed to an emergency clinic or call 108.');
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            'I encountered a network difficulty while connecting to clinical services. If your symptoms are severe, please dial 108 / 112 immediately or visit the closest emergency hospital.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const getSeverityBadge = (severity?: TriageSeverity) => {
    switch (severity) {
      case 'critical_emergency':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-red-600 text-white animate-pulse shadow-sm">
            🚨 Critical Emergency
          </span>
        );
      case 'high':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500 text-white shadow-sm">
            ⚠️ High Urgency
          </span>
        );
      case 'medium':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-blue-600 text-white shadow-sm">
            ℹ️ Moderate Care
          </span>
        );
      case 'low':
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-600 text-white shadow-sm">
            ✅ Mild / Outpatient
          </span>
        );
    }
  };

  return (
    <div
      className={`flex flex-col h-full bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-md text-slate-100 ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 bg-slate-950/80 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          <div>
            <h2 className="font-semibold text-white tracking-wide text-sm flex items-center gap-2">
              CarePill AI Triage
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            </h2>
            <p className="text-xs text-slate-400">Real-time Gemini Clinical Assessment</p>
          </div>
        </div>

        {lastTriage && getSeverityBadge(lastTriage.severity)}
      </div>

      {/* Urgent Emergency Alert Banner */}
      {lastTriage?.is_emergency && (
        <div className="bg-gradient-to-r from-red-600 via-rose-600 to-red-700 text-white px-4 py-3 border-b border-red-500 shadow-xl flex items-center justify-between animate-pulse">
          <div className="flex items-center space-x-2">
            <span className="text-xl">🚨</span>
            <div>
              <p className="text-xs font-black uppercase tracking-wider">Life-Threatening Condition Detected</p>
              <p className="text-xs text-red-100 font-medium">
                {lastTriage.emergency_instructions || 'Immediate medical intervention needed. Do not delay.'}
              </p>
            </div>
          </div>
          <a
            href="tel:108"
            className="ml-3 shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white text-red-700 font-bold text-xs rounded-xl shadow-lg hover:bg-red-50 active:scale-95 transition-all"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 4V3z" />
            </svg>
            Call 108
          </a>
        </div>
      )}

      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
        {messages.map((msg, index) => {
          const isUser = msg.role === 'user';
          return (
            <div key={index} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-md ${
                  isUser
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : 'bg-slate-800 text-slate-200 border border-slate-700/80 rounded-bl-sm'
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
            </div>
          );
        })}

        {/* Loading Skeleton */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl rounded-bl-sm px-4 py-3 max-w-[70%] space-y-2">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce"></div>
                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce [animation-delay:0.2s]"></div>
                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce [animation-delay:0.4s]"></div>
                <span className="text-xs text-cyan-400 font-medium ml-1">Analyzing triage symptoms...</span>
              </div>
              <div className="h-2 w-36 bg-slate-700 rounded animate-pulse"></div>
            </div>
          </div>
        )}

        {/* Clinical Summary Chip Card */}
        {lastTriage && (
          <div className="p-3.5 bg-slate-800/60 border border-cyan-900/40 rounded-xl space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-cyan-300">Recommended Specialty:</span>
              <span className="font-bold text-white bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800">
                {lastTriage.recommended_specialty}
              </span>
            </div>
            {lastTriage.summary && (
              <p className="text-slate-300 italic border-l-2 border-cyan-500 pl-2">
                &ldquo;{lastTriage.summary}&rdquo;
              </p>
            )}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {lastTriage.search_keywords?.map((kw, idx) => (
                <span key={idx} className="bg-slate-700/70 text-slate-300 px-2 py-0.5 rounded-full text-[11px]">
                  🔍 {kw}
                </span>
              ))}
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="text-xs text-red-400 bg-red-950/40 p-2.5 rounded-lg border border-red-900/60">
            {errorMsg}
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Quick Suggestion Chips */}
      <div className="px-4 py-2 bg-slate-950/50 border-t border-slate-800/80 overflow-x-auto">
        <div className="flex items-center space-x-2 pb-1">
          <span className="text-[11px] text-slate-400 uppercase font-semibold shrink-0">Quick Triage:</span>
          {QUICK_CHIPS.map((chip, idx) => (
            <button
              key={idx}
              disabled={isLoading}
              onClick={() => handleSend(chip.text)}
              className="text-xs whitespace-nowrap bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 hover:text-white px-3 py-1 rounded-full border border-slate-700 transition-all cursor-pointer disabled:opacity-50"
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Input Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="p-3 bg-slate-950 border-t border-slate-800 flex items-center space-x-2"
      >
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Describe symptoms (e.g. fever, headache, chest tightness)..."
          disabled={isLoading}
          className="flex-1 bg-slate-900 text-white placeholder-slate-500 text-sm px-4 py-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={isLoading || !inputText.trim()}
          className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 disabled:from-slate-800 disabled:to-slate-800 text-white font-medium rounded-xl shadow-lg transition-all active:scale-95 disabled:cursor-not-allowed text-sm flex items-center justify-center"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </button>
      </form>

      {/* Disclaimer */}
      <div className="px-4 py-1.5 bg-slate-950 border-t border-slate-900 text-center">
        <p className="text-[10px] text-slate-400">
          ⚠️ AI Triage guidance only. For medical emergencies, call 108/112 immediately.
        </p>
      </div>
    </div>
  );
};
