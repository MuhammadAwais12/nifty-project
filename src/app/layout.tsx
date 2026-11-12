import type { Metadata } from 'next';
import './globals.css';

export const viewport = { themeColor: [{ media: '(prefers-color-scheme: light)', color: '#f6f5f1' }, { media: '(prefers-color-scheme: dark)', color: '#0f101a' }] };

export const metadata: Metadata = {
  title: 'Teqnite Tasks',
  description: 'Projects, tasks, milestones, discussions, docs and time tracking for the Teqnite team.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Teqnite Tasks', statusBarStyle: 'black-translucent' },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the saved theme before paint, so there is no flash of the wrong one. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('tt-theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
