import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

import { apply, name } from '../src/index.ts'

describe('package contract', () => {
  it('exports the Cordis plugin entry points', () => {
    expect(name).toBe('dsh-nested-followups')
    expect(apply).toBeTypeOf('function')
  })

  it('declares the DSH bundle and browser client', async () => {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
      exports?: Record<string, unknown>
      dsh?: {
        bundle?: { patch?: string }
        client?: { platform?: string; inject?: string[] }
      }
    }

    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    expect(manifest.dsh?.client?.platform).toBe('web')
    expect(manifest.dsh?.client?.inject).toContain('@deepseek-ai/dsh-api-remotes')
    expect(manifest.exports?.['./typert']).toEqual({
      types: './lib/typert.host.d.ts',
      default: './lib/typert.host.js',
    })
    expect(manifest.exports?.['./remote']).toEqual({
      types: './lib/typert.remote-client.d.ts',
      default: './lib/typert.remote-client.js',
    })
  })

  it('declares the verified rc.7 through rc.2 DSH compatibility window', async () => {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
      peerDependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const dshPeers = Object.entries(manifest.peerDependencies ?? {})
      .filter(([name]) => name.startsWith('@deepseek-ai/dsh-'))
      .map(([, range]) => range)
    const dshValidationTargets = Object.entries(manifest.devDependencies ?? {})
      .filter(([name]) => name.startsWith('@deepseek-ai/dsh-'))
      .map(([, version]) => version)

    expect(new Set(dshPeers)).toEqual(new Set([
      '>=0.1.0-rc.7 <0.1.1 || >=0.1.1-rc.1 <0.2.0',
    ]))
    expect(new Set(dshValidationTargets)).toEqual(new Set(['0.1.1-rc.2']))
  })

  it('inserts one removable Cordis bundle row', async () => {
    const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')

    expect(patch).toContain('id: dsh-nested-followups')
    expect(patch).toContain('name: dsh-nested-followups')
  })

  it('enters the mounted Typert namespace through an explicit rc.7 injection scope', async () => {
    const client = await readFile(new URL('../src/client/index.ts', import.meta.url), 'utf8')

    expect(client).toContain("ctx.inject(['remote.nestedFollowups']")
  })

  it('registers both the Tree View body and its native header utility', async () => {
    const client = await readFile(new URL('../src/client/index.ts', import.meta.url), 'utf8')

    expect(client).toContain("ctx.slots.inject('conversation.view'")
    expect(client).toContain("ctx.slots.inject('conversation.session.header.utilities'")
    expect(client).toContain("name: 'conversation.session.header.utilities'")
  })
})
