import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        strictPort: true,
        host: 'localhost',
        // Proxy /api requests to the ASP.NET backend during development so the
        // browser can call relative URLs without CORS preflights getting in the
        // way. The backend listens on http://localhost:5080 by default.
        proxy: {
            '/api': {
                target: 'http://localhost:5080',
                changeOrigin: true,
            },
        },
    },
});
