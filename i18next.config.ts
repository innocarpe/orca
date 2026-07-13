import { defineConfig } from 'i18next-cli'

export default defineConfig({
  locales: ['en'],
  extract: {
    input: ['src/**/*.{js,jsx,ts,tsx,mts,cts}'],
    ignore: [
      '**/*.test.*',
      '**/*.spec.*',
      '**/__tests__/**',
      '**/__snapshots__/**',
      '**/assets/**'
    ],
    output: 'config/localization-extraction/{{language}}.json',
    defaultNS: false,
    functions: ['t', '*.t', 'translate', 'translateMain'],
    useTranslationNames: ['useTranslation'],
    sort: true,
    disablePlurals: true,
    removeUnusedKeys: true
  }
})
