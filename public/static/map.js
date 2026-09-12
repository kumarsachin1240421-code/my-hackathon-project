/* ═══════════════════════════════════════════════
   CarePill — Nearby Pharmacy Map
   Leaflet + OpenStreetMap + Overpass API
   ═══════════════════════════════════════════════ */

const PharmacyMap = (() => {
  let map = null;
  let userLat = null;
  let userLng = null;
  let pharmacies = [];

  /* ── Haversine distance (km) ── */
  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /* ── Determine open/closed from opening_hours tag ── */
  function isOpenNow(ohString) {
    if (!ohString) return 'unknown';
    // Simplified check — full opening_hours parsing is complex
    const lc = ohString.toLowerCase();
    if (lc.includes('24/7') || lc.includes('24 hours')) return 'open';
    try {
      const now = new Date();
      const day = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'][now.getDay()];
      if (lc.includes(day)) return 'open'; // rough heuristic
    } catch {}
    return 'unknown';
  }

  function escapeHtml(text) {
    const el = document.createElement('span');
    el.textContent = text || '';
    return el.innerHTML;
  }

  /* ── Load pharmacies ── */
  async function loadPharmacies() {
    const dataView = document.getElementById('dataView');
    dataView.innerHTML = `
      <div class="pharmacy-view">
        <div class="pharmacy-map-container"><div id="pharmacyMap"></div></div>
        <div class="pharmacy-list" id="pharmacyList">
          <div class="pharmacy-loading"><div class="spinner"></div><span>Finding nearby pharmacies…</span></div>
        </div>
      </div>
    `;

    // Get user location
    try {
      const pos = await new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error('Geolocation not supported'));
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 });
      });
      userLat = pos.coords.latitude;
      userLng = pos.coords.longitude;
    } catch {
      // Default to a central location (New Delhi) if geolocation fails
      userLat = 28.6139;
      userLng = 77.2090;
    }

    // Initialize Leaflet map
    initMap();

    // Query Overpass API for nearby pharmacies
    try {
      const radius = 3000; // 3km
      const query = `[out:json][timeout:15];(node["amenity"="pharmacy"](around:${radius},${userLat},${userLng}););out body;`;
      const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
      const data = await res.json();

      pharmacies = (data.elements || []).map(el => ({
        name: el.tags?.name || el.tags?.['name:en'] || 'Pharmacy',
        lat: el.lat,
        lng: el.lon,
        distance: haversine(userLat, userLng, el.lat, el.lon),
        openStatus: isOpenNow(el.tags?.opening_hours),
        phone: el.tags?.phone || el.tags?.['contact:phone'] || '',
        address: el.tags?.['addr:street'] || el.tags?.['addr:full'] || '',
      }));

      // Sort by distance
      pharmacies.sort((a, b) => a.distance - b.distance);

      // Limit to 20 closest
      pharmacies = pharmacies.slice(0, 20);

      renderMarkers();
      renderList();
    } catch {
      document.getElementById('pharmacyList').innerHTML = `
        <article class="data-card">
          <h2>Could not load pharmacies</h2>
          <p>Please check your internet connection and try again.</p>
        </article>
      `;
    }
  }

  function initMap() {
    if (map) { map.remove(); map = null; }
    map = L.map('pharmacyMap', { zoomControl: true }).setView([userLat, userLng], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    // User marker
    const userIcon = L.divIcon({
      html: '<div style="width:16px;height:16px;background:#0870b7;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
      className: '',
    });
    L.marker([userLat, userLng], { icon: userIcon }).addTo(map).bindPopup('<b>Your location</b>');

    // Fix map rendering after DOM update
    setTimeout(() => map.invalidateSize(), 200);
  }

  function renderMarkers() {
    if (!map) return;
    const pharmaIcon = L.divIcon({
      html: '<div style="width:28px;height:28px;background:linear-gradient(135deg,#0d9e71,#14b884);border:2px solid #fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.25);display:grid;place-items:center;color:#fff;font-size:16px">💊</div>',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      className: '',
    });

    pharmacies.forEach(p => {
      const marker = L.marker([p.lat, p.lng], { icon: pharmaIcon }).addTo(map);
      marker.bindPopup(`
        <div style="min-width:160px">
          <strong style="font-size:14px">${escapeHtml(p.name)}</strong><br>
          <span style="font-size:12px;color:#666">${p.distance.toFixed(1)} km away</span><br>
          <a href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}" target="_blank" rel="noopener"
             style="display:inline-block;margin-top:6px;padding:4px 10px;background:#0870b7;color:#fff;border-radius:6px;text-decoration:none;font-size:12px;font-weight:600">
            Navigate →
          </a>
        </div>
      `);
    });
  }

  function renderList() {
    const list = document.getElementById('pharmacyList');
    if (pharmacies.length === 0) {
      list.innerHTML = '<article class="data-card"><h2>No pharmacies found nearby</h2><p>Try expanding your search area or check your location settings.</p></article>';
      return;
    }

    list.innerHTML = pharmacies.map(p => `
      <div class="pharmacy-card">
        <div class="pharmacy-icon"><span class="material-symbols-outlined">local_pharmacy</span></div>
        <div class="pharmacy-info">
          <h3>${escapeHtml(p.name)}</h3>
          <div class="pharmacy-meta">
            <span class="pharmacy-distance">
              <span class="material-symbols-outlined" style="font-size:14px">location_on</span>
              ${p.distance.toFixed(1)} km
            </span>
            <span class="pharmacy-status ${p.openStatus}">${p.openStatus === 'open' ? 'Open' : p.openStatus === 'closed' ? 'Closed' : 'Hours N/A'}</span>
          </div>
        </div>
        <a href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}" target="_blank" rel="noopener" class="pharmacy-navigate">
          <span class="material-symbols-outlined">directions</span> Navigate
        </a>
      </div>
    `).join('');
  }

  return { loadPharmacies };
})();
