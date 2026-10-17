import type { Viewport } from "next";

/** theme-color per route (Mosaic spec §8), so an in-app browser's chrome matches the page and never flashes white. */
export const WALL_THEME_COLOR = "#17161A"; // --board-wall, pinned by tokens.test.ts
export const PAPER_THEME_COLOR = "#F6F5F1"; // --paper, pinned by tokens.test.ts

/** The wall routes (/b/{id}, /b/{id}/result, /breaks, /, /h/{handle}) export this as `viewport`; Next merges it over the root layout's. */
export const wallViewport: Viewport = { themeColor: WALL_THEME_COLOR };
