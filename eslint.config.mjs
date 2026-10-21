import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

// Flat config, run by the ESLint CLI (`pnpm lint`); Next 16 removed `next lint`.
const eslintConfig = [
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      // eslint-plugin-react-hooks 7 (with eslint-config-next 16) adds the React Compiler's rules. The compiler is
      // not enabled here (`reactCompiler` is off), and the flagged patterns are deliberate (a Strict Mode gate read
      // from a ref, timers that count a landing down, drafts that follow a prop). Turning them on is its own pass:
      // see docs/superpowers/plans/2026-10-17-dependency-upgrades.md, "Follow-ups".
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
