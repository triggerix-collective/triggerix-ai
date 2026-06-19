import type { BuildConfig } from 'unbuild'
import { defu } from 'defu'

const commonBuildConfig: BuildConfig = {
  rollup: {
    emitCJS: true,
    esbuild: {
      minify: true
    },
    dts: {
      respectExternal: false
    }
  },
  clean: true,
  declaration: true
}

export function mergeDefaultBuildConfig(config: BuildConfig): BuildConfig {
  return defu(commonBuildConfig, config)
}
