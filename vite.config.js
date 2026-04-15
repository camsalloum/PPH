import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

/**
 * Vite plugin: force every dev-server response to be a full 200 (never 304).
 *
 * Chrome's disk-cache can become corrupted (ERR_CACHE_READ_FAILURE).
 * When Vite responds with 304 "Not Modified", Chrome tries to read the
 * cached body — which is corrupt — and the request fails.
 *
 * This middleware strips the conditional-request headers (If-None-Match,
 * If-Modified-Since) from every incoming request so Vite's ETag logic
 * never triggers and always sends the full response body.
 * Only active in dev; has zero effect on production builds.
 */
function noCache304Plugin() {
  return {
    name: 'no-cache-304',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        // Remove conditional headers so Vite never replies with 304
        delete req.headers['if-none-match'];
        delete req.headers['if-modified-since'];
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [noCache304Plugin(), react()],
  
  // Development server configuration
  server: {
    port: 3000,
    open: true,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
      'Surrogate-Control': 'no-store',
    },
    // Proxy API requests to backend (replaces CRA's proxy in package.json)
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
        timeout: 120000,
        proxyTimeout: 120000,
      },
      '/uploads': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
        timeout: 120000,
        proxyTimeout: 120000,
      },
    },
  },
  
  // Build configuration
  build: {
    outDir: 'build', // Keep same output folder as CRA
    sourcemap: 'hidden', // Generate .map files for error tracking but don't expose via //# sourceMappingURL
    // Optimize large dependencies
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-charts': ['echarts', 'echarts-for-react', 'chart.js', 'react-chartjs-2'],
          'vendor-ui': ['antd', '@ant-design/icons', 'framer-motion'],
          'vendor-maps': ['leaflet', 'react-simple-maps'],
          'vendor-export': ['jspdf', 'xlsx', 'exceljs', 'html2canvas'],
        },
      },
    },
    // Increase chunk size warning limit for large libraries
    chunkSizeWarningLimit: 2000,
  },
  
  // Resolve aliases (optional, for cleaner imports)
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@contexts': path.resolve(__dirname, './src/contexts'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@services': path.resolve(__dirname, './src/services'),
      '@assets': path.resolve(__dirname, './src/assets'),
    },
  },
  
  // Dependency optimization — let Vite cache pre-bundled deps for fast restarts.
  // Run  npx vite --force  once if you add/upgrade a dependency.
  optimizeDeps: {
    // force: true,  // ← disabled: was causing 10-min cold starts
    // jspdf bundles canvg which uses old core-js CJS internals that Rolldown can't resolve
    exclude: ['jspdf', 'html2pdf.js', 'jspdf-autotable'],
  },

  // Define global constants
  define: {
    // Fix for some libraries that check for process.env
    'process.env': {},
  },
});
