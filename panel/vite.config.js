import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev proxy: the panel dev server forwards API paths to the local API,
// so everything is same-origin in dev too (no CORS, cookies work).
const proxy = {};
for (const p of ['/auth', '/panel', '/data', '/submit', '/health']) {
    proxy[p] = { target: 'http://localhost:3000', changeOrigin: true };
}

export default defineConfig({
    plugins: [react()],
    server: { proxy }
});
