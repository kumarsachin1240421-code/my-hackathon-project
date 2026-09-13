<div align="center">
  <h1>💊 Carewell</h1>
  <p><strong>Smart Healthcare, Dosage Tracking & Real-Time Emergency Monitoring Platform</strong></p>

  <p>
    <a href="https://www.netlify.com/">
      <img src="https://img.shields.io/badge/Deployed%20on-Netlify-00C7B7?style=for-the-badge&logo=netlify&logoColor=white" alt="Netlify Deployment" />
    </a>
    <img src="https://img.shields.io/badge/Next.js%2014-App%20Router-black?style=for-the-badge&logo=next.js&logoColor=white" alt="Next.js" />
    <img src="https://img.shields.io/badge/Database-Supabase%20(PostgreSQL)-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase" />
    <img src="https://img.shields.io/badge/AI%20Engine-Gemini%20API-4285F4?style=for-the-badge&logo=google&logoColor=white" alt="Google AI" />
  </p>
</div>

<hr />

<h2>📌 Overview</h2>
<p>
  <strong>Carewell</strong> is an accessible, modern healthcare management system designed to streamline patient adherence and caregiver coordination. Featuring smart medication reminders, real-time sync, and AI-driven insights, Carewell keeps patients, doctors, and family caregivers connected seamlessly.
</p>

<hr />

<h2>🛠️ Tech Stack</h2>

<table width="100%">
  <thead>
    <tr>
      <th align="left">Layer</th>
      <th align="left">Technologies Used</th>
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
      <td><strong>Hosting & Deployment</strong></td>
      <td>Netlify Edge Platform</td>
    </tr>
  </tbody>
</table>

<hr />

<h2>✨ Key Features</h2>
<ul>
  <li><strong>Smart Dosage & Medicine Tracker:</strong> Automated inventory tracking, decrement triggers, and schedule reminders.</li>
  <li><strong>Real-Time Caregiver Dashboard:</strong> Sub-second telemetry and instant alerts via WebSockets powered by Supabase Realtime.</li>
  <li><strong>AI Health Assistant:</strong> Personalized contextual insights and recommendations powered by Google Generative AI (Gemini SDK).</li>
  <li><strong>Nearby Care Finder:</strong> Real-time discovery of nearby medical facilities using OpenStreetMap Overpass API.</li>
  <li><strong>Security First:</strong> Row-Level Security (RLS) enforcement at the database layer ensuring HIPAA-grade data isolation.</li>
</ul>

<hr />

<h2>⚙️ Getting Started</h2>

<h3>1. Clone the repository</h3>
<pre><code>git clone https://github.com/YOUR_USERNAME/carewell.git
cd carewell</code></pre>

<h3>2. Install dependencies</h3>
<pre><code>npm install</code></pre>

<h3>3. Setup Environment Variables</h3>
<p>Create a <code>.env.local</code> file in the root directory and add:</p>
<pre><code>NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
GEMINI_API_KEY=your_gemini_api_key</code></pre>

<h3>4. Run locally</h3>
<pre><code>npm run dev</code></pre>

<hr />

<h2>🚀 Deployment on Netlify</h2>
<ol>
  <li>Link your GitHub repository to <strong>Netlify</strong>.</li>
  <li>Set Build Command to <code>npm run build</code> and Publish Directory to <code>.next</code>.</li>
  <li>Ensure the <strong>@netlify/plugin-nextjs</strong> is installed or enabled in build settings.</li>
  <li>Add your production variables (<code>NEXT_PUBLIC_SUPABASE_URL</code>, <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, <code>GEMINI_API_KEY</code>) under <strong>Site Settings &gt; Environment Variables</strong>.</li>
  <li>Trigger deploy!</li>
</ol>
