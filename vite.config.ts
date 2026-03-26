import { defineConfig } from 'vitest/config'
import preact from '@preact/preset-vite'
import tailwindcss from '@tailwindcss/vite'
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/ch8ter/' : '/',
  plugins: [preact(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    setupFiles: ['src/testSetup.ts'],
  },
})
