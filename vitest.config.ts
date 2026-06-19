import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts']
  },
  resolve: {
    alias: {
      '@triggerix-ai/registry': resolve(__dirname, 'packages/registry/src/index.ts'),
      '@triggerix-ai/component': resolve(__dirname, 'packages/component/src/index.ts'),
      '@triggerix-ai/schema': resolve(__dirname, 'packages/schema/src/index.ts'),
      '@triggerix-ai/prompt': resolve(__dirname, 'packages/prompt/src/index.ts'),
      '@triggerix-ai/fn': resolve(__dirname, 'packages/fn/src/index.ts'),
      'triggerix-ai': resolve(__dirname, 'packages/triggerix-ai/src/index.ts')
    }
  }
})
