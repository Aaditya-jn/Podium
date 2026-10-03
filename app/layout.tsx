import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Podium — Find your voice",
  description: "A little practice can make a big difference. Build confidence in speaking and writing, one prompt at a time.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
