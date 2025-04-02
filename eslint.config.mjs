import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // 允许 catch 子句参数不被使用
      "@typescript-eslint/no-unused-vars": ["error", { 
        "argsIgnorePattern": "^_",  
        "varsIgnorePattern": "^_", 
        "caughtErrorsIgnorePattern": "^_?error$|^_?err$|^_?e$|^_?ex$"
      }]
    }
  }
];

export default eslintConfig;
