import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { DEFAULT_DESIGN, designBootScript } from "@/themes";

export const metadata: Metadata = {
  title: "ClementIQ — Financial Resilience Engine",
  description: "AI-powered financial resilience and global intelligence. Smart Guidance. A More Resilient You.",
  icons: { icon: "/icon.svg" },
  // Browser auto-translate rewrites text nodes React owns, which crashes navigation with
  // "Failed to execute 'removeChild' on 'Node'". The UI is English by design, so opt out.
  other: { google: "notranslate" },
};

export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1, viewportFit: "cover" }; // cover → env(safe-area-inset-*) works for the tab bar

// Demo build is light-only: clear any saved dark choice from the original theme.
const themeScript = `try{localStorage.removeItem("clementiq-theme")}catch(e){}`;
// Visual design (src/themes): sets <html data-design> before first paint from ?design= / localStorage / default.
const designScript = designBootScript();

/**
 * Guard for DOM edits made outside React (browser translate, Immersive Translate and similar extensions
 * replace text nodes React owns). Without it, the next React update throws
 * "Failed to execute 'removeChild' / 'insertBefore' on 'Node'" and the whole page fails.
 * Workaround from facebook/react#11538: skip the stale operation and warn instead of crashing.
 */
const domGuardScript = `(function(){if(typeof Node!=='function'||!Node.prototype)return;
var rc=Node.prototype.removeChild;Node.prototype.removeChild=function(c){if(c.parentNode!==this){console.warn('[ClementIQ] removeChild skipped: node was moved by translation or an extension');return c;}return rc.apply(this,arguments);};
var ib=Node.prototype.insertBefore;Node.prototype.insertBefore=function(n,r){if(r&&r.parentNode!==this){console.warn('[ClementIQ] insertBefore fell back to append: reference node was moved by translation or an extension');return ib.call(this,n,null);}return ib.apply(this,arguments);};})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA" translate="no" className="notranslate" data-design={DEFAULT_DESIGN} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" />
        <script dangerouslySetInnerHTML={{ __html: domGuardScript }} />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: designScript }} />
      </head>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
