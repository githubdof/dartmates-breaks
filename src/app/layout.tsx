import type { Metadata, Viewport } from "next";
import { barlow, barlowCondensed, bigShoulders } from "./fonts";
import { PAPER_THEME_COLOR } from "./wall";
import { getSessionViewer } from "@/auth/viewer";
import { AppHeader } from "@/components/shell/app-header";
import { TabBar } from "@/components/shell/tab-bar";
import { Footer } from "@/components/shell/footer";
import { TzCookie } from "@/components/tz-cookie";
import { HydrationMark } from "@/components/hydration-mark";
import { FlightSprite } from "@/components/grid/flight-sprite";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Breaks", template: "%s | Breaks" },
  description: "Group buys for darts gear, with a draw you can check.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: PAPER_THEME_COLOR, // wall routes override it with wallViewport
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const viewer = await getSessionViewer();
  return (
    <html lang="en" suppressHydrationWarning className={`${barlow.variable} ${barlowCondensed.variable} ${bigShoulders.variable}`}>
      {/* No bg-paper here: globals.css paints paper, and the wall where a route sets data-wall (a utility would beat it). */}
      <body className="min-h-dvh font-sans text-body text-ink antialiased">
        <a href="#content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-input focus:bg-card focus:px-4 focus:py-3 focus:text-ink">
          Skip to content
        </a>
        <AppHeader viewer={viewer ? { handle: viewer.handle, displayName: viewer.displayName, role: viewer.role } : null} />
        <div id="content" tabIndex={-1} className="outline-none">{children}</div>
        <Footer />
        <TabBar role={viewer?.role ?? null} />
        <FlightSprite />
        <TzCookie />
        <HydrationMark />
      </body>
    </html>
  );
}
