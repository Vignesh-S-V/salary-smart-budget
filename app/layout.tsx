import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

const manrope = localFont({
  src: '../public/fonts/Manrope-latin.woff2',
  variable: '--font-manrope',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Salary Smart Budget',
  description: 'A private salary and expense ledger for clearer monthly budgeting.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={manrope.variable}>
      <body>{children}</body>
    </html>
  );
}
