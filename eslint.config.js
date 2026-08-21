import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // These files export non-components by design (the route tree object, the
    // theme provider's useTheme hook). Splitting them for HMR granularity
    // isn't worth the churn — the rule is off here, on everywhere else.
    files: ['src/router.tsx', 'src/lib/theme.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
])
