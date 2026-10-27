import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Salary Smart Budget', description: 'Your salary, spending and smarter monthly budgets in one place.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
