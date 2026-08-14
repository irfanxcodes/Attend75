import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      devOptions: {
        enabled: false,
      },
      includeAssets: ['favicon.svg', 'icons/*.png', '*.svg', '*.png'],
      manifest: false, // Use public/manifest.json directly
      injectManifest: {
        globPatterns: ['**/*.{js,css,ico,png,svg,woff2}'],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    // Use the same JSX transform as the app (React 17+ automatic runtime)
    // so component files don't need `import React from 'react'`
  },
})
