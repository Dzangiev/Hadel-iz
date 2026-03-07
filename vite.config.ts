import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/Hadel-iz/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'Монетки и Привычки',
        short_name: 'Монетки',
        theme_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: 'Coin.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'Coin.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ]
});
