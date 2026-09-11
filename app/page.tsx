'use client';

import React, { useState } from 'react';
import { SymptomTriageChatbot } from '@/components/SymptomTriageChatbot';
import { CarePillMap } from '@/components/CarePillMap';
import { TriageResponse, UserLocation } from '@/types/triage';

export default function TriageDashboardPage() {
  const [userLocation, setUserLocation] = useState<UserLocation>({
    lat: 28.6139,
    lng: 77.209,
    address: 'New Delhi, India',
  });

  const [triageResult, setTriageResult] = useState<TriageResponse | null>(null);

  const handleTriageComplete = (triageData: TriageResponse) => {
    setTriageResult(triageData);
  };

  return (
    <main className="flex flex-col min-h-screen bg-slate-950 text-slate-100">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-lg border-b border-slate-800 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/25">
            <span className="text-xl">💊</span>
          </div>
          <div>
            <h1 className="text-base font-extrabold text-white tracking-tight flex items-center gap-2">
              CarePill <span className="text-xs bg-cyan-950 text-cyan-400 px-2 py-0.5 rounded-full border border-cyan-800">AI Triage & Radar</span>
            </h1>
            <p className="text-[11px] text-slate-400">Intelligent Symptom Triage & Bayesian Hospital Routing</p>
          </div>
        </div>

        {/* Emergency Quick Action Bar */}
        <div className="flex items-center space-x-3">
          <a
            href="tel:108"
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 active:scale-95 text-white font-bold text-xs rounded-xl shadow-lg shadow-red-600/30 transition-all cursor-pointer"
          >
            <span className="w-2 h-2 rounded-full bg-white animate-ping"></span>
            Ambulance (108 / 112)
          </a>
        </div>
      </header>

      {/* Main Dual-Column Interactive Workspace */}
      <div className="flex-1 p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-[1700px] mx-auto w-full">
        {/* Left Column: Symptom Triage Chatbot */}
        <div className="lg:col-span-5 flex flex-col h-[780px] lg:h-[calc(100vh-120px)] min-h-[600px]">
          <SymptomTriageChatbot
            userLocation={userLocation}
            onTriageComplete={handleTriageComplete}
            className="flex-1"
          />
        </div>

        {/* Right Column: Spatial Radar & Bayesian Ranked Map */}
        <div className="lg:col-span-7 flex flex-col h-[780px] lg:h-[calc(100vh-120px)] min-h-[600px]">
          <CarePillMap
            userLocation={userLocation}
            triageData={triageResult}
            onLocationChange={setUserLocation}
            className="flex-1"
          />
        </div>
      </div>
    </main>
  );
}
