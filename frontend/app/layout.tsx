import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const dmSans = localFont({
  src: "./fonts/dm-sans-latin-wght-normal.woff2",
  weight: "100 1000",
  style: "normal",
  display: "swap",
  variable: "--font-dm-sans",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  title: "Rural MedTech AI — Chest X-Ray Screening",
  description:
    "AI-powered chest X-ray analysis for pneumonia screening in rural healthcare settings. Runs locally. No data leaves your device.",
  keywords: ["chest x-ray", "pneumonia", "AI screening", "rural healthcare", "offline AI"],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MedTech AI",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#050505",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={dmSans.variable}>
      <body>
        <div className="app-window">{children}</div>
      </body>
    </html>
  );
}
