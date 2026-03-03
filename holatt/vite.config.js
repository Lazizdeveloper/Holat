import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const ROOT_DIR = fileURLToPath(new URL('.', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(ROOT_DIR, 'index.html'),
        citizen: resolve(ROOT_DIR, 'citizen.html'),
        gov: resolve(ROOT_DIR, 'gov.html'),
      },
    },
  },
})
