'use client';

import React, { useState, useEffect, useRef } from 'react';
import { HospitalFacility, HospitalQueryResponse, TriageResponse, UserLocation } from '@/types/triage';

interface CarePillMapProps {
  userLocation: UserLocation;
  triageData?: TriageResponse | null;
  onLocationChange?: (newLoc: UserLocation) => void;
  className?: string;
}

// Popular fallback Indian and Global cities for manual location selector
const PRESET_CITIES = [
  { name: 'New Delhi (NCR)', lat: 28.6139, lng: 77.209 },
  { name: 'Mumbai, Maharashtra', lat: 19.076, lng: 72.8777 },
  { name: 'Bengaluru, Karnataka', lat: 12.9716, lng: 77.5946 },
  { name: 'Hyderabad, Telangana', lat: 17.385, lng: 78.4867 },
  { name: 'Kolkata, West Bengal', lat: 22.5726, lng: 88.3639 },
  { name: 'Chennai, Tamil Nadu', lat: 13.0827, lng: 80.2707 },
];

export const CarePillMap: React.FC<CarePillMapProps> = ({
  userLocation,
  triageData,
  onLocationChange,
  className = '',
}) => {
  const [facilities, setFacilities] = useState<HospitalFacility[]>([]);
  const [selectedFacility, setSelectedFacility] = useState<HospitalFacility | null>(null);
  const [loadingHospitals, setLoadingHospitals] = useState(false);
  const [searchRadius, setSearchRadius] = useState<number>(10000); // 10km default
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [manualCityInput, setManualCityInput] = useState('');
  const [mapSource, setMapSource] = useState<string>('openstreetmap_overpass');

  const mapContainerRef = useRef<HTMLDivElement>(null);
  // Leaflet map instance ref
  const mapInstanceRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);

  // Fetch Hospitals based on coordinates, specialty and search keywords
  const fetchNearbyHospitals = async (loc: UserLocation, radius: number, triage?: TriageResponse | null) => {
    setLoadingHospitals(true);
    try {
      const response = await fetch('/api/hospitals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: loc.lat,
          lng: loc.lng,
          radius,
          specialty: triage?.recommended_specialty,
          keywords: triage?.search_keywords,
          isEmergency: triage?.is_emergency,
        }),
      });

      if (!response.ok) throw new Error('Hospital query failed');

      const data: HospitalQueryResponse = await response.json();

      // Zero-result auto radius expansion to 25km
      if (data.facilities.length === 0 && radius < 25000) {
        console.info('0 facilities found, automatically expanding radius to 25km...');
        setSearchRadius(25000);
        await fetchNearbyHospitals(loc, 25000, triage);
        return;
      }

      setFacilities(data.facilities);
      setMapSource(data.source);
      if (data.facilities.length > 0) {
        setSelectedFacility(data.facilities[0]);
      }
    } catch (err) {
      console.error('Failed to fetch hospitals:', err);
    } finally {
      setLoadingHospitals(false);
    }
  };

  // Trigger hospital query whenever location or triage state changes
  useEffect(() => {
    fetchNearbyHospitals(userLocation, searchRadius, triageData);
  }, [userLocation.lat, userLocation.lng, triageData, searchRadius]);

  // Dynamic Leaflet Map Initializer
  useEffect(() => {
    if (typeof window === 'undefined' || !mapContainerRef.current) return;

    let isMounted = true;

    const initLeaflet = async () => {
      try {
        // Ensure Leaflet stylesheet is present
        if (!document.getElementById('leaflet-css-cdn')) {
          const link = document.createElement('link');
          link.id = 'leaflet-css-cdn';
          link.rel = 'stylesheet';
          link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
          document.head.appendChild(link);
        }

        // Dynamically load Leaflet script if not on window
        if (!(window as any).L) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
            script.onload = () => resolve();
            script.onerror = reject;
            document.head.appendChild(script);
          });
        }

        const L = (window as any).L;
        if (!L || !isMounted || !mapContainerRef.current) return;

        // Clean up previous map if exists
        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        }

        // Initialize Map
        const map = L.map(mapContainerRef.current, {
          center: [userLocation.lat, userLocation.lng],
          zoom: 13,
          zoomControl: false,
        });

        // Add sleek OpenStreetMap / Carto Dark tile layer
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
          attribution: '&copy; <a href="https://carto.com/">CARTO</a> & OpenStreetMap',
          maxZoom: 19,
        }).addTo(map);

        L.control.zoom({ position: 'topright' }).addTo(map);

        const markersGroup = L.featureGroup().addTo(map);
        markersLayerRef.current = markersGroup;
        mapInstanceRef.current = map;

        updateMapPins(L, map, markersGroup);
      } catch (err) {
        console.error('Leaflet initialization failed:', err);
      }
    };

    initLeaflet();

    return () => {
      isMounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update Markers whenever facilities or userLocation changes
  const updateMapPins = (L: any, map: any, markersGroup: any) => {
    if (!L || !map || !markersGroup) return;

    markersGroup.clearLayers();

    // 1. User Marker (Pulsing Gold / Cyan)
    const userIcon = L.divIcon({
      className: 'custom-user-marker',
      html: `
        <div class="relative flex items-center justify-center">
          <span class="animate-ping absolute inline-flex h-8 w-8 rounded-full bg-cyan-400 opacity-75"></span>
          <div class="relative inline-flex rounded-full h-5 w-5 bg-cyan-500 border-2 border-white shadow-xl items-center justify-center text-white text-[9px] font-black">
            📍
          </div>
        </div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    const userMarker = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon }).addTo(markersGroup);
    userMarker.bindPopup(`<b>Your Current Location</b><br/>${userLocation.address || 'GPS Coordinates Active'}`);

    // 2. Hospital Markers (Colored by Bayesian Ranking & Emergency status)
    facilities.forEach((facility) => {
      const isEmergency = facility.isEmergencyCenter;
      const isHighBayesian = facility.bayesianScore >= 0.7;

      let pinColor = 'bg-blue-600';
      let borderGlow = 'border-white';
      let pinEmoji = '🏥';

      if (isEmergency) {
        pinColor = 'bg-red-600 animate-pulse';
        borderGlow = 'border-red-200 shadow-red-500/50';
        pinEmoji = '🚨';
      } else if (isHighBayesian) {
        pinColor = 'bg-emerald-600';
        borderGlow = 'border-emerald-200 shadow-emerald-500/50';
        pinEmoji = '⭐';
      }

      const facilityIcon = L.divIcon({
        className: 'custom-facility-marker',
        html: `
          <div class="relative flex items-center justify-center cursor-pointer transform hover:scale-125 transition-transform">
            <div class="h-8 w-8 rounded-full ${pinColor} border-2 ${borderGlow} shadow-lg flex items-center justify-center text-white text-xs font-bold">
              ${pinEmoji}
            </div>
            <div class="absolute -bottom-4 bg-slate-950 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow whitespace-nowrap border border-slate-700">
              ${facility.distanceKm} km
            </div>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const marker = L.marker([facility.lat, facility.lng], { icon: facilityIcon }).addTo(markersGroup);

      marker.on('click', () => {
        setSelectedFacility(facility);
      });

      marker.bindPopup(`
        <div style="font-family: system-ui, sans-serif; min-width: 180px;">
          <h4 style="margin: 0 0 4px 0; font-size: 13px; font-weight: 700; color: #0f172a;">${facility.name}</h4>
          <p style="margin: 0 0 4px 0; font-size: 11px; color: #475569;">${facility.address}</p>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px;">
            <span style="font-size: 11px; font-weight: 700; color: #059669;">★ ${facility.rating} (${facility.userRatingsTotal})</span>
            <span style="font-size: 11px; font-weight: 700; color: #2563eb;">Score: ${(facility.bayesianScore * 100).toFixed(0)}%</span>
          </div>
          <a href="${facility.directionsUrl}" target="_blank" rel="noopener noreferrer" style="display: block; margin-top: 8px; text-align: center; background: #2563eb; color: white; padding: 4px 8px; border-radius: 6px; text-decoration: none; font-size: 11px; font-weight: 600;">
            Turn-by-Turn Navigation ↗
          </a>
        </div>
      `);
    });

    // Auto-pan and zoom bounding box containing user and top 3 facilities
    if (facilities.length > 0) {
      const bounds = L.latLngBounds([[userLocation.lat, userLocation.lng]]);
      facilities.slice(0, 3).forEach((f) => bounds.extend([f.lat, f.lng]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  };

  useEffect(() => {
    if (mapInstanceRef.current && (window as any).L && markersLayerRef.current) {
      updateMapPins((window as any).L, mapInstanceRef.current, markersLayerRef.current);
    }
  }, [facilities, userLocation]);

  const handleCitySelect = (city: { name: string; lat: number; lng: number }) => {
    if (onLocationChange) {
      onLocationChange({ lat: city.lat, lng: city.lng, address: city.name });
    }
    setShowLocationModal(false);
  };

  return (
    <div className={`relative flex flex-col h-full bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl ${className}`}>
      {/* Map Control Bar Header */}
      <div className="flex flex-wrap items-center justify-between px-4 py-3 bg-slate-900/90 border-b border-slate-800 backdrop-blur-md z-10 gap-2">
        <div className="flex items-center space-x-2">
          <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-xs font-bold text-white tracking-wide">
            Spatial Radar ({facilities.length} Providers Found)
          </span>
          {triageData?.recommended_specialty && (
            <span className="text-[11px] bg-cyan-950 text-cyan-300 font-semibold px-2 py-0.5 rounded-full border border-cyan-800">
              🎯 {triageData.recommended_specialty}
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {/* Change Location Button */}
          <button
            onClick={() => setShowLocationModal(true)}
            className="text-xs bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer font-medium"
          >
            📍 Change City / Pin
          </button>

          {/* Radius Selector */}
          <select
            value={searchRadius}
            onChange={(e) => setSearchRadius(Number(e.target.value))}
            className="text-xs bg-slate-800 text-slate-200 border border-slate-700 px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-cyan-500 font-medium"
          >
            <option value={5000}>5 km Radius</option>
            <option value={10000}>10 km Radius</option>
            <option value={20000}>20 km Radius</option>
            <option value={35000}>35 km Radius</option>
          </select>
        </div>
      </div>

      {/* Map Container View */}
      <div className="relative flex-1 w-full min-h-[380px] bg-slate-900">
        <div ref={mapContainerRef} className="absolute inset-0 w-full h-full z-0" />

        {loadingHospitals && (
          <div className="absolute top-4 left-4 z-10 bg-slate-900/90 text-white border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 shadow-xl backdrop-blur-md">
            <div className="w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
            Calculating Bayesian proximity rankings...
          </div>
        )}

        {/* Map Legend */}
        <div className="absolute bottom-3 left-3 z-10 bg-slate-950/90 border border-slate-800 px-3 py-2 rounded-xl text-[11px] space-y-1 backdrop-blur-md shadow-2xl text-slate-300 pointer-events-none hidden sm:block">
          <div className="font-bold text-white mb-1">Provider Legend:</div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-600"></span> Emergency / 24x7 Trauma
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Top Bayesian Match (Score &ge; 70%)
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> General Clinic / Hospital
          </div>
        </div>
      </div>

      {/* Bottom Sliding Drawer / Facility Ranking List */}
      <div className="bg-slate-950 border-t border-slate-800 p-4 max-h-64 overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Ranked Healthcare Facilities (Bayesian Score Weighted)
          </h3>
          <span className="text-[10px] text-slate-500">Source: {mapSource.replace('_', ' ')}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {facilities.map((facility) => {
            const isSelected = selectedFacility?.id === facility.id;
            const scorePercentage = Math.round(facility.bayesianScore * 100);

            return (
              <div
                key={facility.id}
                onClick={() => {
                  setSelectedFacility(facility);
                  if (mapInstanceRef.current) {
                    mapInstanceRef.current.setView([facility.lat, facility.lng], 15);
                  }
                }}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'bg-slate-900 border-cyan-500 ring-1 ring-cyan-500 shadow-xl'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-xs font-bold text-white line-clamp-1">{facility.name}</h4>
                    <span
                      className={`text-[10px] font-black px-1.5 py-0.5 rounded shrink-0 ${
                        scorePercentage >= 75
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : 'bg-blue-950 text-blue-300 border border-blue-800'
                      }`}
                    >
                      {scorePercentage}% Score
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">{facility.address}</p>

                  <div className="flex items-center gap-3 mt-2 text-[11px]">
                    <span className="text-amber-400 font-bold flex items-center gap-0.5">
                      ★ {facility.rating} <span className="text-slate-500 font-normal">({facility.userRatingsTotal})</span>
                    </span>
                    <span className="text-cyan-400 font-semibold">{facility.distanceKm} km away</span>
                    {facility.isOpen24Hours && (
                      <span className="text-red-400 font-bold text-[10px] bg-red-950/60 px-1.5 py-0.2 rounded border border-red-900">
                        24x7
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between">
                  <a
                    href={facility.directionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="w-full inline-flex items-center justify-center gap-1 text-xs font-semibold bg-blue-600 hover:bg-blue-500 active:scale-95 text-white py-1.5 rounded-lg shadow-md transition-all"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                    Navigate Route
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Manual Location Selection Modal */}
      {showLocationModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                📍 Choose Triage Location
              </h3>
              <button
                onClick={() => setShowLocationModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Select your region or enter city coordinates to find the nearest emergency healthcare facilities:
            </p>

            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-300">Quick Cities:</span>
              <div className="grid grid-cols-2 gap-2">
                {PRESET_CITIES.map((city) => (
                  <button
                    key={city.name}
                    onClick={() => handleCitySelect(city)}
                    className="text-xs text-left p-2.5 rounded-xl bg-slate-800 hover:bg-cyan-950 hover:border-cyan-700 border border-slate-700 text-slate-200 transition-all font-medium"
                  >
                    {city.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => {
                  if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                      (pos) => {
                        handleCitySelect({
                          name: 'GPS Precise Location',
                          lat: pos.coords.latitude,
                          lng: pos.coords.longitude,
                        });
                      },
                      (err) => {
                        alert('Browser Geolocation error: ' + err.message);
                      }
                    );
                  }
                }}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-bold rounded-xl shadow-lg transition-all"
              >
                🎯 Auto-Detect My Current GPS
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
