import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "ClementIQ — Your Daily Dose of Financial Intelligence",
  description: "AI-powered financial resilience and global intelligence. Smart Guidance. A More Resilient You.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = { themeColor: "#FF6B00", width: "device-width", initialScale: 1 };

// Applies a saved light/dark choice before paint (falls back to the OS preference).
const themeScript = `try{var t=localStorage.getItem("clementiq-theme");if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
