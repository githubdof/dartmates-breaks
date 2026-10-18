import { Barlow, Barlow_Condensed, Big_Shoulders } from "next/font/google";

// Barlow is not a variable font, so the weights are listed. A build that cannot reach Google Fonts is
// reported as BLOCKED: fonts (see Global Constraints); do not vendor the files here.
export const barlow = Barlow({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-barlow", display: "swap" });
export const barlowCondensed = Barlow_Condensed({ subsets: ["latin"], weight: ["600"], variable: "--font-barlow-condensed", display: "swap" });
// The fifth file (Mosaic §4). Google folded Big Shoulders Display into Big_Shoulders, one variable family with an opsz
// axis. next/font takes `axes` only with the variable weight, so this is one variable file; every use sets weight 800,
// and globals.css pins `font-variation-settings: "opsz" 72` on .font-shoulders and .caller-banner, so every size is
// drawn in the Display cut (recorded ruling 11). Not preloaded:
// the root layout imports this module, so a preload would reach every route; the file loads where Big Shoulders text
// first renders, which is the wall routes only.
export const bigShoulders = Big_Shoulders({ subsets: ["latin"], weight: "variable", axes: ["opsz"], variable: "--font-big-shoulders", display: "swap", preload: false });
