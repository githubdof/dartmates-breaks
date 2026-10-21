import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

// Flat config, run by the ESLint CLI (`pnpm lint`); Next 16 removed `next lint`.
const eslintConfig = [
  ...coreWebVitals,
  ...typescript,
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
