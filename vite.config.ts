import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/ch8ter/',
  plugins: [preact(), tailwindcss()],
})
