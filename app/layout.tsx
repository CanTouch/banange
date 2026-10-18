import type { Metadata, Viewport } from 'next';
import { Instrument_Serif, Hanken_Grotesk, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { Analytics } from '@vercel/analytics/react';

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
});

const hankenGrotesk = Hanken_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Banange — Uganda Power Outages Map',
  description: "UEDCL, eehh?? Where's the power? Community map of power outages across Uganda.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://banange.kuppelabs.com'),
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/favicon.svg',
    apple: '/icon-192.png',
  },
  openGraph: {
    title: 'Banange — Uganda Power Outages Map',
    description: "UEDCL, eehh?? Where's the power? Community map of power outages across Uganda.",
    url: 'https://banange.kuppelabs.com',
    siteName: 'Banange',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'Banange - Uganda Power Outages Map',
      },
    ],
    locale: 'en_UG',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Banange — Uganda Power Outages Map',
    description: "UEDCL, eehh?? Where's the power? Community map of power outages across Uganda.",
    images: ['/og.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#05070D',
};

const themeScript = `
  (function() {
    try {
      var saved = localStorage.getItem('banange_theme');
      var theme = saved === 'light' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', theme);
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) {
        meta.setAttribute('content', theme === 'light' ? '#F3EDE0' : '#05070D');
      }
    } catch(e) {}
  })();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${instrumentSerif.variable} ${hankenGrotesk.variable} ${ibmPlexMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased min-h-screen font-sans selection:bg-[#FF4B4B]/30 selection:text-white">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
