#!/usr/bin/env node
/**
 * tools/deploy.mjs — put THIS working copy into an installed profile, for the dev loop.
 *
 * Why this exists. The desktop profile is managed exclusively by the Electron app
 * (`dsh plugin --profile desktop …` is refused with "profile desktop is managed exclusively
 * by the Electron application"), and the app installs a COPY of the repository rather than a
 * link. On top of that the host snapshots each plugin's `client.js` and serves it from the
 * profile's `node_modules` with an immutable cache. So editing this checkout reaches the
 * running app by exactly one route: copy the files into the profile, then restart DSH.
 *
 * What it copies is the package's own `files` list — the same set a real install ships — so
 * the deployed tree stays a faithful mirror of a published install instead of drifting into
 * "whatever happened to be in the working directory".
 *
 * Usage:
 *   node tools/deploy.mjs                  # deploy into profiles/desktop
 *   node tools/deploy.mjs --check          # report whether it is already in sync; no writes
 *   node tools/deploy.mjs --profile web    # another profile
 *   node tools/deploy.mjs --target <dir>   # an explicit package directory
 *
 * This is a DEV shortcut, not a distribution path: it leaves the profile manifest pointing at
 * the pinned commit while the files on disk are newer, so the next app-driven update will
 * overwrite them. That is the intended trade — you get a one-command loop, and the release
 * path stays `git push` plus an update in the plugin manager.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

const argv = process.argv.slice(2)
const flag = (name) => argv.includes('--' + name)
const value = (name) => {
  const at = argv.indexOf('--' + name)
  return at >= 0 && argv[at + 1] !== undefined ? argv[at + 1] : null
}

const checkOnly = flag('check')
const profile = value('profile') ?? 'desktop'
const dshHome = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh')
const target = path.resolve(value('target') ?? path.join(dshHome, 'profiles', profile, 'node_modules', pkg.name))

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

/* Only files, never the working tree's dev-only additions. `files` is the manifest's own
   answer to "what ships", so it is also the answer to "what does the app need". */
const entries = (pkg.files ?? []).filter((entry) => fs.existsSync(path.join(root, entry)))
if (entries.length === 0) {
  console.error('ERROR: package.json has no usable `files` entries; nothing to deploy.')
  process.exit(1)
}

if (!fs.existsSync(target)) {
  console.error(`ERROR: no installed package at\n  ${target}`)
  console.error('Install it first (desktop: 插件 → 添加插件, from github:' + pkg.name + ').')
  process.exit(1)
}
const installed = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'))
if (installed.name !== pkg.name) {
  console.error(`ERROR: refusing to write into "${installed.name}" — this checkout is "${pkg.name}".`)
  process.exit(1)
}

function walk(entry) {
  const abs = path.join(root, entry)
  if (!fs.statSync(abs).isDirectory()) return [entry]
  const out = []
  for (const child of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.posix.join(entry, child.name)
    out.push(...(child.isDirectory() ? walk(rel) : [rel]))
  }
  return out
}
const files = entries.flatMap(walk).sort()

const differing = []
for (const rel of files) {
  const from = path.join(root, rel)
  const to = path.join(target, rel)
  if (!fs.existsSync(to) || sha256(from) !== sha256(to)) differing.push(rel)
}

console.log(`source : ${root}`)
console.log(`target : ${target}`)
console.log(`files  : ${files.length} from the package's own \`files\` list`)
console.log('')

if (checkOnly) {
  if (differing.length === 0) {
    console.log('IN SYNC — the installed copy already matches this checkout.')
    process.exit(0)
  }
  console.log(`OUT OF SYNC — ${differing.length} file(s) differ:`)
  for (const rel of differing.slice(0, 20)) console.log('  ' + rel)
  if (differing.length > 20) console.log(`  … and ${differing.length - 20} more`)
  console.log('\nRun `npm run deploy` to copy them across.')
  process.exit(1)
}

for (const rel of files) {
  const to = path.join(target, rel)
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.copyFileSync(path.join(root, rel), to)
}

/* Verify what actually landed, not what was asked for. */
const mismatched = files.filter((rel) => sha256(path.join(root, rel)) !== sha256(path.join(target, rel)))
if (mismatched.length > 0) {
  console.error(`\nERROR: ${mismatched.length} file(s) did not land intact: ${mismatched.slice(0, 5).join(', ')}`)
  process.exit(1)
}

console.log(`deployed ${files.length} file(s)${differing.length ? `, ${differing.length} changed` : ' (already identical)'}`)
console.log(`client.js sha256 ${sha256(path.join(target, 'client.js')).slice(0, 16)}…`)
console.log('')
console.log('*** RESTART DSH COMPLETELY (quit and relaunch) ***')
console.log('A page refresh is not enough: the host snapshots each plugin\'s client.js and')
console.log('serves it with an immutable cache, and index.js is imported once at profile boot.')
