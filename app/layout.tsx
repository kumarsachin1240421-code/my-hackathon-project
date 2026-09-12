import type { Metadata, Viewport } from 'next';
import '@/style.css';

export const metadata: Metadata = {
  title: 'CareWell — Your Everyday Health & Wellbeing Companion',
  description: 'Smart medicine reminders, caregiver tracking, and emergency care',
  manifest: 'manifest.json',
  icons: {
    icon: [
      { url: 'favicon.ico' },
      { url: 'favicon.png', type: 'image/png' },
      { url: 'icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: 'icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: 'apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: '#2563eb',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      </head>
      <body className="bg-slate-950 text-slate-100 min-h-screen antialiased selection:bg-cyan-500 selection:text-white font-sans">
        {children}
      </body>
    </html>
  );
}
