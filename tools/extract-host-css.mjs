/* Extract the real CSS-module strings the shipped host bundles hand to insertCss().
 *
 * The endfield theme targets host class names by module suffix ('_sidebarCol',
 * '_frame', '_toggle', ...). A harness that hand-writes those rules can only ever
 * confirm the theme against itself; this script pulls the strings out of the
 * installed bundles so a fixture can be as faithful as an app rebuild allows.
 *
 * Usage:
 *   node tools/extract-host-css.mjs <asar-root> <outDir>
 * where <asar-root> is the extracted app.asar directory (the folder that holds
 * dsh/node_modules/@deepseek-ai):
 *
 *   npx @electron/asar extract \
 *     "C:\Users\<you>\AppData\Local\Programs\DeepSeek Harness\resources\app.asar" <tmp>
 *   node tools/extract-host-css.mjs <tmp> test/fixtures/host-bundles
 *
 * Re-run it after a DSH update and commit what changed: the fixture is supposed to
 * break when the host rehashes or renames one of the hooks the theme reads.
 */
import fs from 'node:fs'
import path from 'node:path'

const [, , root, outDir] = process.argv
if (!root || !outDir) {
  console.error('usage: node tools/extract-host-css.mjs <asar-root> <outDir>')
  process.exit(2)
}

const PKG = path.join(root, 'dsh/node_modules/@deepseek-ai')
/* Only the modules whose CSS the theme actually reads: Layout gives the frame and the
   three columns, SidebarRoot gives the rail/root/logoRow/brand/toggle. The output
   names are the module names the fixtures import, so this stays a drop-in refresh. */
const MODULES = [
  ['Layout.module.css', 'dsh-client-ui-layout'],
  ['SidebarRoot.module.css', 'dsh-client-ui-sidebar'],
  ['conversation.module.css', 'dsh-client-ui-conversation'],
]

const out = {}
for (const [key, pkg] of MODULES) {
  const file = path.join(PKG, pkg, 'lib/client.js')
  if (!fs.existsSync(file)) { out[key] = null; continue }
  const text = fs.readFileSync(file, 'utf8')
  /* The bundler emits `const css = "<escaped>"` once per module. A package can
     carry several; concatenating them in source order is what the browser sees. */
  const parts = []
  const re = /const\s+css\s*=\s*("(?:[^"\\]|\\.)*")/g
  let m
  while ((m = re.exec(text)) !== null) parts.push(JSON.parse(m[1]))
  out[key] = parts.join('\n')
}
fs.mkdirSync(outDir, { recursive: true })
for (const [key, css] of Object.entries(out)) {
  if (css === null) { console.log(key + ': missing'); continue }
  fs.writeFileSync(path.join(outDir, key), css)
  console.log(key + ': ' + css.length + ' bytes')
}
