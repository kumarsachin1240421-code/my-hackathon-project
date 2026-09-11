/**
 * CarePill Intelligent Triage & Hospital Routing Engine Types
 * Strictly typed definitions for AI triage and Bayesian spatial ranking.
 */

export type TriageSeverity = 'low' | 'medium' | 'high' | 'critical_emergency';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface UserLocation {
  lat: number;
  lng: number;
  address?: string;
}

export interface TriageRequest {
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  userLocation?: UserLocation;
}

export interface TriageResponse {
  ai_message: string;             // Empathetic, clear patient guidance
  summary: string;                // 1-sentence symptom summary
  severity: TriageSeverity;
  is_emergency: boolean;          // True if life-threatening
  recommended_specialty: string;  // e.g. "Cardiology", "Emergency Medicine", "Pediatrics"
  search_keywords: string[];      // e.g. ["cardiology hospital", "cardiac clinic", "emergency trauma"]
  emergency_instructions?: string; // Direct first-aid/survival tip if is_emergency is true
}

export interface HospitalQueryRequest {
  lat: number;
  lng: number;
  radius?: number;                 // Search radius in meters (default: 5000 - 10000)
  specialty?: string;              // Target medical specialty
  keywords?: string[];             // Clinical search keywords from triage
  isEmergency?: boolean;
}

export interface HospitalFacility {
  id: string;
  name: string;
  lat: number;
  lng: number;
  distanceKm: number;              // Calculated via Haversine Formula
  rating: number;                  // 1.0 to 5.0
  userRatingsTotal: number;
  bayesianScore: number;           // Bayesian weighted ranking (0.0 to 1.0)
  rawScore?: number;
  address: string;
  phoneNumber?: string;
  website?: string;
  openNow: boolean;
  isOpen24Hours: boolean;
  specialtyMatch: boolean;
  isEmergencyCenter: boolean;
  source: 'google_places' | 'openstreetmap_overpass' | 'fallback_directory';
  directionsUrl: string;
}

export interface HospitalQueryResponse {
  facilities: HospitalFacility[];
  totalFound: number;
  searchRadiusKm: number;
  center: {
    lat: number;
    lng: number;
  };
  isEmergency: boolean;
  specialty?: string;
  source: 'google_places' | 'openstreetmap_overpass' | 'fallback_directory';
}
