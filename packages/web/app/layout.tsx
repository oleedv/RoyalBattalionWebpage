import type { Metadata } from "next";
import { Providers } from "./providers";
import { CookieConsentBanner } from "@/components/cookie-consent";
import { fontVariables } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Royal Battalion",
  description:
    "Royal Battalion - A dedicated Squad gaming clan running competitive servers and building a tactical community.",
};

// Inline script to apply theme before first paint (prevents flash)
const themeScript = `(function(){try{var t=localStorage.getItem('rb-theme');if(t==='light')document.documentElement.classList.replace('dark','light');else if(t==='system'){if(window.matchMedia('(prefers-color-scheme:light)').matches)document.documentElement.classList.replace('dark','light')}}catch(e){}})()`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${fontVariables}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-bg-primary text-text-primary antialiased font-body">
        <Providers>{children}</Providers>
        <CookieConsentBanner />
      </body>
    </html>
  );
}
