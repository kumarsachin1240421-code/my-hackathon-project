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
          <img src="/brand-banner.png" alt="CareWell" className="h-10 w-auto object-contain" />
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs bg-cyan-950 text-cyan-400 px-2.5 py-1 rounded-full border border-cyan-800 font-semibold tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
            AI Triage & Radar
          </span>
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
