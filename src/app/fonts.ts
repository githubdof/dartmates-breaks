import { Barlow, Barlow_Condensed } from "next/font/google";

// Barlow is not a variable font, so the weights are listed. A build that cannot reach Google Fonts is
// reported as BLOCKED: fonts (see Global Constraints); do not vendor the files here.
export const barlow = Barlow({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-barlow", display: "swap" });
export const barlowCondensed = Barlow_Condensed({ subsets: ["latin"], weight: ["600"], variable: "--font-barlow-condensed", display: "swap" });
