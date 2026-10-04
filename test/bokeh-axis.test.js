/**
 * bokeh-axis.test.js — the hero page must defocus around a POINT, not a line.
 *
 * Bug it guards: on the new-conversation page the defocus read as the axial
 * (mid-line) look instead of the centre look. The PHASE detection was correct —
 * ConversationRoot really does render class "<hash>_root" with data-phase="hero"
 * (see the shipped client bundle: `className: ConversationRoot_module_css_default.root,
 * "data-phase": phase`) — the RADIUS was not.
 *
 * `soft * 0.5 * min(w, h)` is the largest circle that fits in the frame. At `strong`
 * soft is 1.10, so the radius came out at 0.55 * min(w, h): the circle was clipped
 * top and bottom, the falloff survived only left and right, and the result was a
 * vertical band — visually the same as the axial mode it is meant to be the
 * alternative to. BOKEH_RADIAL_FILL pulls every level back inside the frame.
 *
 * Pure geometry, no browser: the two functions are extracted from client.js and
 * driven against a stub document, like the other kernel harnesses. A missing name
 * throws here instead of failing mysteriously.
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const src = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')

function grab(name) {
  const at = src.indexOf('const ' + name + ' = ')
  if (at < 0) throw new Error('not found in client.js: ' + name)
  const i = src.indexOf('{', at)
  let d = 0
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') d++
    else if (src[j] === '}') { d--; if (d === 0) return src.slice(at, j + 1) }
  }
  throw new Error('unbalanced: ' + name)
}
/* contourBokehExtent is an arrow returning a PARENTHESISED expression, not a block,
   so brace matching would run off into the next function. Balance the parens. */
function grabArrow(name) {
  const at = src.indexOf('const ' + name + ' = ')
  if (at < 0) throw new Error('not found in client.js: ' + name)
  const arrow = src.indexOf('=>', at)
  const open = src.indexOf('(', arrow)
  let d = 0
  for (let j = open; j < src.length; j++) {
    if (src[j] === '(') d++
    else if (src[j] === ')') { d--; if (d === 0) return src.slice(at, j + 1) }
  }
  throw new Error('unbalanced: ' + name)
}
function grabNum(name) {
  const m = src.match(new RegExp('const ' + name + ' = ([0-9.]+)'))
  if (!m) throw new Error('not found in client.js: ' + name)
  return 'const ' + name + ' = ' + m[1]
}

const build = new Function('document', 'contourHost', `
${grabNum('BOKEH_RADIAL_FILL')}
${grab('BOKEH_LEVELS')}
${grab('contourBokehAxis')}
${grabArrow('contourBokehExtent')}
return { axis: contourBokehAxis, extent: contourBokehExtent, LEVELS: BOKEH_LEVELS, FILL: BOKEH_RADIAL_FILL }
`)

const HERO_EL = { getBoundingClientRect: () => ({ width: 900, height: 700, left: 0, top: 0 }) }
const HOST = { getBoundingClientRect: () => ({ width: 1440, height: 900, left: 0, top: 0 }) }

/* Only the two selectors contourBokehAxis asks for matter: the conversation column
   (absent here) and the hero root. */
const docWith = (hasHero) => ({
  querySelector(sel) {
    if (sel.includes('data-phase="hero"')) return hasHero ? HERO_EL : null
    return null
  },
})

const api = build(docWith(true), HOST)
const plain = build(docWith(false), HOST)

let failures = 0
const pass = (m) => console.log('ok    ' + m)
const fail = (m) => { failures++; console.log('FAIL  ' + m) }

const W = 1440, H = 900
const halfShort = 0.5 * Math.min(W, H)

/* 1. Phase -> mode. */
const heroSpec = api.axis(W, H)
if (heroSpec.radial === true) pass('a visible [class$="_root"][data-phase="hero"] selects the radial mode')
else fail('hero page did not select the radial mode: radial=' + heroSpec.radial)
if (heroSpec.x === W * 0.5 && heroSpec.y === H * 0.5) pass('the radial centre is the FRAME centre (' + heroSpec.x + ', ' + heroSpec.y + ')')
else fail('radial centre is not the frame centre: ' + JSON.stringify({ x: heroSpec.x, y: heroSpec.y }))

const activeSpec = plain.axis(W, H)
if (activeSpec.radial === false) pass('without the hero root the axial mode is used')
else fail('axial mode not selected when no hero root is present')

/* 2. THE REGRESSION: the circle has to fit, with a margin, or the falloff is clipped
      on the short axis and the hero reads as a band. */
const names = Object.keys(api.LEVELS)
console.log('')
console.log('  level     sigma   extent(px)   half short side   margin   fits')
for (const name of names) {
  const cfg = api.LEVELS[name]
  const extent = api.extent(cfg, heroSpec, W, H)
  const margin = halfShort - extent
  console.log('  ' + name.padEnd(9) + String(cfg.blur).padEnd(8) + String(Math.round(extent)).padEnd(13) + String(Math.round(halfShort)).padEnd(18) + String(Math.round(margin)).padEnd(9) + (extent < halfShort ? 'yes' : 'NO'))
  if (extent < halfShort) pass(name + ': radial extent ' + Math.round(extent) + 'px stays inside the ' + Math.round(halfShort) + 'px half short side')
  else fail(name + ': radial extent ' + Math.round(extent) + 'px is clipped by the frame — the hero page will read as a band, not a centre')
}
console.log('')

/* 3. The levels have to stay ordered, or `strong` is not stronger than `subtle`. */
const extents = names.map((n) => api.extent(api.LEVELS[n], heroSpec, W, H))
const ordered = extents.every((v, i) => i === 0 || v > extents[i - 1])
if (ordered) pass('radial extent grows with the level: ' + extents.map((v) => Math.round(v)).join(' < '))
else fail('radial extent is not monotonic across levels: ' + extents.map((v) => Math.round(v)).join(', '))

/* 4. The axial path is untouched by the radial fill. */
const axial = api.extent(api.LEVELS.strong, { radial: false, x: 700, y: 450, half: 450 }, W, H)
if (Math.abs(axial - 1.10 * 450) < 1e-9) pass('axial extent still uses the column half-width (not the radial fill)')
else fail('axial extent changed: ' + axial)

console.log('')
if (failures) { console.error(failures + ' bokeh axis check(s) failed'); process.exit(1) }
console.log('all bokeh axis checks passed')
