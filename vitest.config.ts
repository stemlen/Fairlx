import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        exclude: [
            '**/node_modules/**',
            '**/dist/**',
            '**/e2e/**', // Playwright E2E tests run separately
        ],
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            '@fairlx/mcp-server/markdown': path.resolve(__dirname, './packages/fairlx-mcp/src/lib/project-doc-markdown.ts'),
            '@fairlx/mcp-server': path.resolve(__dirname, './packages/fairlx-mcp/src/index.ts'),
            '@fairlx/multi-agent': path.resolve(__dirname, './packages/fairlx-multi-agent/src/index.ts'),
        },
    },
})
