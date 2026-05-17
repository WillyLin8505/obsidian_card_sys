import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],

  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/react-router/')) {
            return 'vendor-react'
          }
          if (id.includes('/@radix-ui/') || id.includes('/lucide-react/') || id.includes('/sonner/')) {
            return 'vendor-ui'
          }
          if (id.includes('/react-force-graph-2d/') || id.includes('/d3-')) {
            return 'vendor-graph'
          }
          if (id.includes('/react-markdown/') || id.includes('/remark-gfm/') || id.includes('/micromark') || id.includes('/mdast') || id.includes('/unified/')) {
            return 'vendor-markdown'
          }
          if (id.includes('/recharts/')) {
            return 'vendor-charts'
          }
        },
      },
    },
  },

  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
})
