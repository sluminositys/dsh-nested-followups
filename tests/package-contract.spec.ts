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
