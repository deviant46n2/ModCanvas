import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Tauri's devUrl is http://localhost:5173 and WebKitGTK resolves
    // `localhost` to IPv4 (127.0.0.1). Vite's default bind is IPv6 [::1]
    // only, which makes the webview load a blank window in `tauri dev`.
    // Pin host + port and refuse to drift so a stale Vite on 5173 can't push
    // the dev server to 5174 where the app will never look.
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
})
