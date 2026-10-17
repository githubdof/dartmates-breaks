// TypeScript 6 checks side-effect imports, and Next.js 15 declares no type for a global stylesheet (`import "./globals.css"`).
declare module "*.css";
