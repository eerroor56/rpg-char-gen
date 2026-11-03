import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// base './' — сайт открывается и с корня (Firebase Hosting), и из папки
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173, strictPort: true },
})
