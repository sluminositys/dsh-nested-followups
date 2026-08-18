import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const hostSource = await readFile(new URL('../lib/index.js', import.meta.url), 'utf8')
assert.equal(hostSource.includes('@Remote('), false, 'Host output must be directly executable by supported Node.js versions')

const host = await import('../lib/index.js')
const typert = await import('../lib/typert.host.js')
const remote = await import('../lib/typert.remote-client.js')

assert.equal(host.name, 'dsh-nested-followups')
assert.equal(typert.TYPERT.package, 'dsh-nested-followups')
assert.equal(typert.TYPERT.face, 'host')
assert.equal(typert.TYPERT.invocations.length, 5)
assert.equal(remote.TYPERT_REMOTE.package, 'dsh-nested-followups')
assert.equal(remote.TYPERT_REMOTE.descriptors.length, 5)
