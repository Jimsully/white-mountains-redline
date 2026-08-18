import { globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  globalIgnores([".next/**", "out/**", "node_modules/**", "public/vendor/maplibre/**"]),
];

export default eslintConfig;
