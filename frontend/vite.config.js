import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Default: http://localhost:5173
// If 5173 is busy, Vite picks the next free port (typically 5174).
// Use `npm run dev:5173` / `npm run dev:5174` to pin a port.
export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: false,
  },
})
