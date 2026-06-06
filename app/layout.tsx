import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FinePrint — NYC Local Law 97 compliance copilot',
  description:
    'Type a NYC building → its real carbon fine, the 2030 cliff, and an AI-ranked, rebate-funded fix-it plan. Code computes every number; AI only explains.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
