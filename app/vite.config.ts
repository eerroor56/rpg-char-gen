import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// метка сборки: файлы прежнего сайта (legacy/, data/) подключаются с ?v=метка — после выкладки браузер берёт свежие,
// а не держит старые из кэша (хостинг отдаёт их с max-age=3600)
const LEGACY_V = Date.now().toString(36)
const legacyVersion = (): Plugin => ({
  name: 'legacy-version',
  transformIndexHtml: html => html.replace(/src="((?:legacy\/js|data)\/[\w.-]+\.js)"/g, `src="$1?v=${LEGACY_V}"`),
})

// base './' — сайт открывается и с корня (Firebase Hosting), и из папки
export default defineConfig({
  base: './',
  plugins: [react(), legacyVersion()],
  define: { __LEGACY_V__: JSON.stringify(LEGACY_V) },
  server: { port: 5173, strictPort: true },
})
