import { readFile } from 'node:fs/promises'
import { basename, dirname, resolve as resolvePath } from 'node:path'
import { transform } from 'lightningcss'
import type { UserConfig } from 'tsdown'

const PLUGIN_ID = 'dsh-nested-followups'
const CSS_VIRTUAL_PREFIX = '\0dsh-nested-followups-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-runtime/client',
  '@deepseek-ai/dsh-api-remotes/client',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-conversation',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-locale',
] as const

const inlineCssPlugin = {
  name: 'dsh-nested-followups-css-inline',
  resolveId(source: string, importer: string | undefined) {
    if (!source.endsWith('.css')) return null
    if (importer === undefined || source.startsWith('\0')) {
      return `${CSS_VIRTUAL_PREFIX}${source}${CSS_VIRTUAL_SUFFIX}`
    }
    if (!source.startsWith('.')) {
      throw new Error(`bare stylesheet imports are not supported: ${source}`)
    }
    return `${CSS_VIRTUAL_PREFIX}${resolvePath(dirname(importer), source)}${CSS_VIRTUAL_SUFFIX}`
  },
  async load(virtualId: string) {
    if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
    const fileId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
    const source = await readFile(fileId)
    const isModule = fileId.endsWith('.module.css')
    const { code, exports: cssExports } = transform({
      filename: fileId,
      code: source,
      ...(isModule ? { cssModules: { pattern: '[hash]_[local]' } } : {}),
      minify: true,
    })
    const classMap: Record<string, string> = {}
    for (const [local, exported] of Object.entries(cssExports ?? {})) {
      classMap[local] = exported.name
    }
    const tagId = `${PLUGIN_ID}/${basename(fileId)}`
    return [
      `const css = ${JSON.stringify(code.toString())};`,
      `const tagId = ${JSON.stringify(tagId)};`,
      `if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {`,
      "  const tag = document.createElement('style');",
      `  tag.dataset.plugin = ${JSON.stringify(PLUGIN_ID)};`,
      '  tag.dataset.pluginCss = tagId;',
      '  tag.textContent = css;',
      '  document.head.appendChild(tag);',
      '}',
      `export default ${JSON.stringify(classMap)};`,
    ].join('\n')
  },
}

export default [
  {
    entry: {
      index: 'src/index.ts',
      'typert.host': 'src/typert.host.ts',
      'typert.remote-client': 'src/client/remote.ts',
    },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: true,
    clean: true,
    deps: {
      neverBundle: [
        '@deepseek-ai/cordis',
        '@deepseek-ai/dsh-storage-domain',
        '@deepseek-ai/dsh-session-persistence',
        '@deepseek-ai/dsh-typert-protocol',
        'zod',
      ],
    },
  },
  {
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2024',
    dts: false,
    clean: false,
    deps: {
      alwaysBundle: ['zod'],
      neverBundle: [...CLIENT_EXTERNALS],
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    },
    plugins: [inlineCssPlugin],
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
] satisfies UserConfig[]
