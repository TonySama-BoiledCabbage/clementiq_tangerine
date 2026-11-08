// ESLint flat config (Next 16 removed `next lint`; run with `npm run lint:web`).
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  { ignores: [".next/**", "out/**", "next-env.d.ts"] },
  {
    // The original pages sync local state from props/queries inside effects (simulator, recovery, worldpulse,
    // map, digital twin). It costs an extra render, not correctness; kept visible as a warning until refactored.
    rules: { "react-hooks/set-state-in-effect": "warn" },
  },
];

export default config;
