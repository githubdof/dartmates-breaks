import type { Metadata, Viewport } from "next";
import { barlow, barlowCondensed } from "./fonts";
import { TzCookie } from "@/components/tz-cookie";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Breaks", template: "%s | Breaks" },
  description: "Group buys for darts gear, with a draw you can check.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F6F5F1",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${barlow.variable} ${barlowCondensed.variable}`}>
      <body className="min-h-dvh bg-paper font-sans text-body text-ink antialiased">
        <a href="#content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-input focus:bg-card focus:px-4 focus:py-3 focus:text-ink">
          Skip to content
        </a>
        <div id="content" tabIndex={-1} className="outline-none">{children}</div>
        <TzCookie />
      </body>
    </html>
  );
}
