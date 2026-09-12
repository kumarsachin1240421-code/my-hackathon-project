<div align="center">
  <h1>💊 CareWell (CarePill)</h1>
  <p><strong>Next-Generation Healthcare & Smart Medication Management Platform</strong></p>
  <p>
    An intelligent clinical triage and medicine adherence web application built to ensure patients never miss a dose, empower caregivers with real-time health monitoring, and guide individuals to nearby emergency medical care.
  </p>
</div>

<hr />

<h2>📌 Overview</h2>
<p>
  <strong>CareWell</strong> is a full-stack digital health application engineered to solve medication non-adherence and streamline patient triage. By combining AI-assisted clinical symptom assessment, precise dose tracking, inventory management, and location-based medical facility mapping, CareWell provides an end-to-end companion for patients, elderly users, and medical caregivers.
</p>

<hr />

<h2>✨ Key Features</h2>

<ul>
  <li>
    <strong>🤖 AI Clinical Triage Assistant:</strong> Integrated Gemini-powered clinical assessment that evaluates symptoms (e.g., chest tightness, pediatric cough, acute abdominal pain, severe migraine) and provides instant emergency triage guidance.
  </li>
  <li>
    <strong>⏰ Smart Medicine Reminders & Dosage Tracking:</strong> Automated schedule tracking ensuring doses are taken on time, logging taken/missed statuses.
  </li>
  <li>
    <strong>👨‍⚕️ Real-Time Caregiver Dashboard:</strong> Remote monitoring portal that lets family members or healthcare providers track patient adherence live.
  </li>
  <li>
    <strong>📦 Pill Counter & Stock Alerts:</strong> Real-time tablet inventory tracking with automatic notifications when prescription refills are needed.
  </li>
  <li>
    <strong>🗺️ Spatial Medical Radar:</strong> OpenStreetMap-powered facility locator that detects and ranks nearby emergency rooms, 24/7 trauma centers, and general clinics using proximity algorithms.
  </li>
  <li>
    <strong>🚨 Emergency SOS Actions:</strong> Quick-trigger emergency hotlines and rapid alerts for critical health situations.
  </li>
  <li>
    <strong>📱 Progressive Web App (PWA):</strong> Fully installable directly to the mobile or desktop home screen for native, app-like performance.
  </li>
</ul>

<hr />

<h2>🛠️ Tech Stack</h2>

<table>
  <thead>
    <tr>
      <th>Layer</th>
      <th>Technologies Used</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Frontend & Framework</strong></td>
      <td>Next.js 14 (App Router), React, Tailwind CSS, Lucide Icons</td>
    </tr>
    <tr>
      <td><strong>Backend & Database</strong></td>
      <td>Next.js Server Actions / API Routes, Supabase (PostgreSQL, Auth, Real-time Sync)</td>
    </tr>
    <tr>
      <td><strong>AI Engine</strong></td>
      <td>Google Generative AI SDK (Gemini API)</td>
    </tr>
    <tr>
      <td><strong>Maps & Geolocation</strong></td>
      <td>OpenStreetMap Overpass API</td>
    </tr>
    <tr>
      <td><strong>Deployment & CI/CD</strong></td>
      <td>Vercel, Git / GitHub</td>
    </tr>
  </tbody>
</table>

<hr />

<h2>🚀 Getting Started</h2>

<h3>Prerequisites</h3>
<ul>
  <li>Node.js (v18.x or later)</li>
  <li>npm, pnpm, or yarn</li>
  <li>Supabase project credentials</li>
  <li>Google Gemini API key</li>
</ul>

<h3>Installation</h3>

<pre><code># 1. Clone the repository
git clone https://github.com/kumarsachin1240421-code/my-hackathon-project.git

# 2. Navigate to project directory
cd my-hackathon-project

# 3. Install dependencies
npm install

# 4. Configure environment variables (.env.local)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
GEMINI_API_KEY=your_google_gemini_api_key

# 5. Start the local development server
npm run dev
</code></pre>

<p>Open <a href="http://localhost:3000">http://localhost:3000</a> in your browser to view the application.</p>

<hr />

<h2>🛡️ Medical Disclaimer</h2>
<p>
  <em>
    CareWell is an informational assistive tool designed for medication tracking and preliminary symptom guidance. It is not a substitute for professional clinical judgment, medical diagnosis, or emergency hospital intervention. In life-threatening emergencies, always dial 108/112 or visit the nearest healthcare center immediately.
  </em>
</p>
