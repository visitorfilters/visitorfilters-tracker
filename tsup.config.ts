import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'es2019',
    platform: 'browser',
  },
  {
    entry: { react: 'src/integrations/react.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    external: ['react', './index'],
    target: 'es2019',
  },
  {
    entry: { vue: 'src/integrations/vue.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    external: ['vue', './index'],
    target: 'es2019',
  },
  {
    entry: { next: 'src/integrations/next.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    external: ['react', 'next/script', './index'],
    target: 'es2019',
  },
])
