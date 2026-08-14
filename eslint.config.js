import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

// Config volontairement ciblée (pas de CI dans ce projet) : on veut surtout
// attraper les vrais bugs — promesses non attendues, hooks React mal utilisés —
// sans noyer la sortie sous du style pré-existant. Les règles de style/`any`
// héritées sont laissées en `off` pour rester actionnable.
export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "convex/_generated/**",
      "bot/**",
      "**/*.config.{js,ts}",
    ],
  },
  js.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}", "convex/**/*.ts"],
    extends: [tseslint.configs.recommended],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Cœur de l'objectif : promesses avalées / mal utilisées.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
      // Bruit hérité désactivé pour garder la sortie exploitable.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "react-refresh/only-export-components": "off",
    },
  },
);
