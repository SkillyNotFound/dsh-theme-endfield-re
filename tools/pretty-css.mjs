/* One declaration per line, so a minified module sheet can be read and diffed.
 *
 *   node tools/pretty-css.mjs test/fixtures/host-bundles/SidebarRoot.module.css /tmp/sidebar.pretty.css
 *
 * The host ships every module as a single minified line; "which rule is hiding the
 * control" is not answerable at that width. This is a read-only inspection aid.
 */
import fs from 'node:fs'
const t = fs.readFileSync(process.argv[2], 'utf8')
const pretty = t.replace(/\}/g, '}\n')
fs.writeFileSync(process.argv[3], pretty)
console.log(pretty.split('\n').length + ' lines')
