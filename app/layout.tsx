import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, DM_Sans } from 'next/font/google';
import './globals.css';
import { Analytics } from '@vercel/analytics/react';

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-heading',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-body',
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
  themeColor: '#0B1020',
};

const themeScript = `
  (function() {
    try {
      var saved = localStorage.getItem('banange_theme');
      var theme = saved === 'light' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', theme);
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) {
        meta.setAttribute('content', theme === 'light' ? '#F7F4EE' : '#0B1020');
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
    <html lang="en" suppressHydrationWarning className={`${bricolage.variable} ${dmSans.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased min-h-screen selection:bg-[#FF4D4D]/20 selection:text-white">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
