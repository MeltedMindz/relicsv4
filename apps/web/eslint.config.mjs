// eslint-config-next v16 ships a native flat-config array as its default export.
import next from "eslint-config-next";

const config = [
  ...next,
  {
    ignores: [".next/**", "node_modules/**", "playwright-report/**", "test-results/**", "tests/**"],
  },
];

export default config;
