/**
 * bokeh-axis.test.js — the hero page defocuses as a HORIZONTAL BAND, not a point and not
 * the axial (vertical) shape.
 *
 * Bug it guards, in two parts:
 *
 * 1. The hero page read as a vertical band. The phase detection was never at fault:
 *    ConversationRoot really does render class "<hash>_root" with data-phase="hero" (the
 *    shipped client bundle has `className: ConversationRoot_module_css_default.root,
 *    "data-phase": phase`, and the class map resolves to Dc7zOa_root). The shape was.
 *
 * 2. The shape was a CIRCLE, and a circle is the wrong answer twice over: it is a point
 *    rather than a line, and once its radius passes half the short side it is clipped top
 *    and bottom, so its falloff survives only left and right and it reads as the very
 *    axial band it was meant to replace. `soft * 0.5 * min(w, h)` hit exactly that at
 *    `strong` (1.10 -> 0.55 * min(w, h) > 0.5 * min(w, h)).
 *
 * The hero shape is now an ellipse: wide across the frame, thin vertically, stopping short
 * of both ends. This file pins the invariants that make it that, as pure geometry — the
 * functions are extracted from client.js and driven against a stub document, like the
 * other kernel harnesses.
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
/* contourBokehExtent is an arrow returning a PARENTHESISED expression, not a block, so
   brace matching would run off into the next function. Balance the parens. */
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
${grabNum('BOKEH_BAND_WIDTH')}
${grabNum('BOKEH_BAND_HEIGHT')}
${grabNum('BOKEH_STEPS')}
${grab('BOKEH_LEVELS')}
${grab('contourBokehAxis')}
${grabArrow('contourBokehExtent')}
${grab('contourBokehSquash')}
${grab('paintBokehGradient')}
${grab('paintBokehMask')}
return {
  axis: contourBokehAxis, extent: contourBokehExtent, squash: contourBokehSquash,
  paint: paintBokehGradient, mask: paintBokehMask,
  LEVELS: BOKEH_LEVELS, BAND_W: BOKEH_BAND_WIDTH, BAND_H: BOKEH_BAND_HEIGHT,
}
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

/* 1. Phase -> shape. */
const heroSpec = api.axis(W, H)
if (heroSpec.band === true) pass('a visible [class$="_root"][data-phase="hero"] selects the hero BAND')
else fail('hero page did not select the band shape: band=' + heroSpec.band)
if (heroSpec.x === W * 0.5 && heroSpec.y === H * 0.5) pass('the band is centred on the FRAME centre (' + heroSpec.x + ', ' + heroSpec.y + ')')
else fail('band centre is not the frame centre: ' + JSON.stringify({ x: heroSpec.x, y: heroSpec.y }))

const activeSpec = plain.axis(W, H)
if (activeSpec.band === false) pass('without the hero root the axial shape is used')
else fail('axial shape not selected when no hero root is present')

/* 2. The band is a LINE, not a point, and it stops short of both ends. */
console.log('')
console.log('  level     sigma   half-width   half-height   width margin   squash')
const halfWidths = []
for (const name of Object.keys(api.LEVELS)) {
  const cfg = api.LEVELS[name]
  const halfWidth = api.extent(cfg, heroSpec, W, H)
  const halfHeight = halfWidth * api.squash(heroSpec, W, H)
  const margin = W * 0.5 - halfWidth
  halfWidths.push(halfWidth)
  console.log('  ' + name.padEnd(9) + String(cfg.blur).padEnd(8) + String(Math.round(halfWidth)).padEnd(13) + String(Math.round(halfHeight)).padEnd(14) + String(Math.round(margin)).padEnd(15) + api.squash(heroSpec, W, H).toFixed(3))
  if (halfWidth < W * 0.5) pass(name + ': the band ends fade out ' + Math.round(margin) + 'px short of the frame edge')
  else fail(name + ': the band runs into the frame edge (half-width ' + Math.round(halfWidth) + ' >= ' + W * 0.5 + ')')
  if (halfHeight < halfWidth) pass(name + ': it is a line, not a point (' + Math.round(halfHeight) + 'px tall vs ' + Math.round(halfWidth) + 'px wide)')
  else fail(name + ': the band is as tall as it is wide — that is a blob, not a horizontal line')
  if (halfHeight < H * 0.5) pass(name + ': the band fits vertically with a margin')
  else fail(name + ': the band is clipped vertically')
}
console.log('')

/* 3. The levels stay ordered, or `strong` is not stronger than `subtle`. */
const ordered = halfWidths.every((v, i) => i === 0 || v > halfWidths[i - 1])
if (ordered) pass('band size grows with the level: ' + halfWidths.map((v) => Math.round(v)).join(' < '))
else fail('band size is not monotonic across levels: ' + halfWidths.map((v) => Math.round(v)).join(', '))

/* 4. The squash is a property of the frame, not of the level: every level must land on the
      same aspect, or the levels would differ in shape as well as in size. */
const squashes = Object.keys(api.LEVELS).map(() => api.squash(heroSpec, W, H))
if (squashes.every((s) => Math.abs(s - squashes[0]) < 1e-12)) pass('the ellipse aspect is level-independent (' + squashes[0].toFixed(3) + ')')
else fail('the ellipse aspect drifts across levels: ' + squashes.join(', '))
if (api.squash(activeSpec, W, H) === 1) pass('the axial shape is not squashed')
else fail('the axial shape was squashed: ' + api.squash(activeSpec, W, H))

/* 5. The axial path is untouched by the band. */
const axial = api.extent(api.LEVELS.strong, { band: false, x: 700, y: 450, half: 450 }, W, H)
if (Math.abs(axial - 1.10 * 450) < 1e-9) pass('axial extent still uses the column half-width')
else fail('axial extent changed: ' + axial)

/* 6. Degenerate frames must not divide by zero. */
const zero = api.squash(heroSpec, 0, H)
if (zero === 1) pass('a zero-width frame falls back to no squash instead of dividing by zero')
else fail('zero-width frame produced squash ' + zero)

/* 7. THE SUBTLE PART, pinned against a recording context. Canvas gradients are interpreted
      in the user space in effect when they are PAINTED, so an elliptical gradient only
      works if the scale is set BEFORE createRadialGradient and the fill covers the canvas
      in that same squashed space. Getting either order wrong silently paints a circle
      again, which is the original bug — so the call sequence is asserted, not assumed. */
function recordingContext() {
  const calls = []
  const gradient = () => ({ addColorStop() {} })
  return {
    calls,
    ctx: {
      save: () => calls.push(['save']),
      restore: () => calls.push(['restore']),
      scale: (x, y) => calls.push(['scale', x, y]),
      createRadialGradient: (...a) => { calls.push(['radial', ...a]); return gradient() },
      createLinearGradient: (...a) => { calls.push(['linear', ...a]); return gradient() },
      fillRect: (...a) => calls.push(['fillRect', ...a]),
      set fillStyle(_v) { calls.push(['fillStyle']) },
    },
  }
}

const bandCfg = api.LEVELS.strong
const bandExtent = api.extent(bandCfg, heroSpec, W, H)
const bandSquash = api.squash(heroSpec, W, H)
const band = recordingContext()
api.mask(band.ctx, heroSpec, W, H, bandExtent, bandSquash, 0)

const scaleCall = band.calls.find((c) => c[0] === 'scale')
const radialCall = band.calls.find((c) => c[0] === 'radial')
const fillCall = band.calls.find((c) => c[0] === 'fillRect')
const order = band.calls.map((c) => c[0])

if (scaleCall && Math.abs(scaleCall[2] - bandSquash) < 1e-12) pass('the band squashes the context by ' + bandSquash.toFixed(3) + ' before painting')
else fail('the band did not squash the context: ' + JSON.stringify(scaleCall))
if (radialCall) pass('the band paints a RADIAL gradient (which the squash turns into the ellipse)')
else fail('the band did not paint a radial gradient: ' + JSON.stringify(order))
if (radialCall && Math.abs(radialCall[2] - heroSpec.y / bandSquash) < 1e-9) pass('the gradient centre is pre-divided by the squash, so it lands on the frame centre after it')
else fail('gradient centre was not pre-divided: ' + JSON.stringify(radialCall))
if (order.indexOf('scale') < order.indexOf('radial')) pass('scale comes BEFORE the gradient is created (the gradient is read in paint space)')
else fail('the gradient was created before the squash — it would paint as a circle: ' + JSON.stringify(order))
if (fillCall && Math.abs(fillCall[4] - H / bandSquash) < 1e-9) pass('the fill covers the canvas in the squashed space (' + Math.round(fillCall[4]) + ' = ' + H + ' / ' + bandSquash.toFixed(3) + ')')
else fail('the fill does not cover the squashed canvas: ' + JSON.stringify(fillCall))

const axialCtx = recordingContext()
api.mask(axialCtx.ctx, activeSpec, W, H, 450, api.squash(activeSpec, W, H), 0)
const axialOrder = axialCtx.calls.map((c) => c[0])
if (!axialOrder.includes('scale')) pass('the axial mask never squashes the context')
else fail('the axial mask squashed the context: ' + JSON.stringify(axialOrder))
if (axialOrder.includes('linear') && !axialOrder.includes('radial')) pass('the axial mask still paints a linear gradient')
else fail('the axial mask changed its gradient kind: ' + JSON.stringify(axialOrder))
const axialFill = axialCtx.calls.find((c) => c[0] === 'fillRect')
if (axialFill && axialFill[4] === H) pass('the axial fill covers the canvas unscaled')
else fail('the axial fill changed: ' + JSON.stringify(axialFill))

console.log('')
if (failures) { console.error(failures + ' bokeh axis check(s) failed'); process.exit(1) }
console.log('all bokeh axis checks passed')
