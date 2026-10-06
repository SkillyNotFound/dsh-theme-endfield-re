/* Print every CSS rule in an extracted module sheet whose selector mentions a token.
 *
 *   node tools/grep-css.mjs test/fixtures/host-bundles/SidebarRoot.module.css _toggle _logoRow
 *
 * Answers "what does the host itself declare for this hook" without opening a
 * minified 9 kB single-line file. Rules are split at depth 0 so @media / @keyframes
 * bodies stay attached to their header.
 */
import fs from 'node:fs'
const [, , file, ...tokens] = process.argv
if (!file) { console.error('usage: node tools/grep-css.mjs <sheet.css> [token ...]'); process.exit(2) }
const text = fs.readFileSync(file, 'utf8')
const parts = text.split(/(?<=\})(?=[.@a-zA-Z\[])/g)
let n = 0
for (const part of parts) {
  const sel = part.split('{')[0]
  if (tokens.length === 0 || tokens.some(t => sel.includes(t))) { console.log(part.trim() + '\n'); n++ }
}
console.log('--- matches: ' + n)
