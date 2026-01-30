import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const gatewayUrl = env.GATEWAY_URL || 'http://localhost:8000'

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@components': path.resolve(__dirname, './src/components'),
        '@atoms': path.resolve(__dirname, './src/components/atoms'),
        '@molecules': path.resolve(__dirname, './src/components/molecules'),
        '@organisms': path.resolve(__dirname, './src/components/organisms'),
        '@templates': path.resolve(__dirname, './src/components/templates'),
        '@hooks': path.resolve(__dirname, './src/hooks'),
        '@store': path.resolve(__dirname, './src/store'),
        '@utils': path.resolve(__dirname, './src/utils'),
        '@constants': path.resolve(__dirname, './src/constants'),
      },
    },
    build: {
      outDir: path.resolve(__dirname, 'dist'),
      emptyOutDir: true,
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      proxy: {
        '/query': {
          target: gatewayUrl,
          changeOrigin: true,
        },
        '/__graph': {
          target: gatewayUrl,
          changeOrigin: true,
        },
        '/__graph.hcl': {
          target: gatewayUrl,
          changeOrigin: true,
        },
        '/entity': {
          target: gatewayUrl,
          changeOrigin: true,
        },
        '/internal': {
          target: gatewayUrl,
          changeOrigin: true,
        },
      }
    }
  }
})
