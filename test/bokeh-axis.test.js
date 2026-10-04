/**
 * bokeh-axis.test.js — ONE defocus shape, on every page.
 *
 * The new-conversation page used to get a shape of its own: first a point (a radial falloff
 * on the frame centre), then a horizontal band (an ellipse). Both were wrong in practice
 * and both cost a second geometry to reason about, so the special case is gone and the
 * hero page uses the same axis as a conversation.
 *
 * What that leaves to guard:
 *   1. the axis is the conversation COLUMN's centre line, not the frame centre, because the
 *      sidebar shifts the column right of it;
 *   2. the extent is measured against the column half-width, so the sidebar and the details
 *      panel stay sharp by construction;
 *   3. there is no branch on the page phase any more — asserted directly against the
 *      extracted source, so the special case cannot quietly come back;
 *   4. the mask is a mirrored LINEAR gradient across the axis: no transform, no radial
 *      gradient, nothing to keep in step with a second shape.
 *
 * Pure geometry, no browser: the functions are extracted from client.js and driven against
 * a stub document, like the other kernel harnesses.
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
${grabNum('BOKEH_STEPS')}
${grab('BOKEH_LEVELS')}
${grab('contourBokehAxis')}
${grabArrow('contourBokehExtent')}
${grab('paintBokehGradient')}
${grab('paintBokehMask')}
${grab('paintBokehCoverage')}
return {
  axis: contourBokehAxis, extent: contourBokehExtent,
  mask: paintBokehMask, coverage: paintBokehCoverage,
  LEVELS: BOKEH_LEVELS,
}
`)

const W = 1440, H = 900

/* A frame 1440 wide with a 240px sidebar: the column runs from x=240 to x=1040, so its
   centre line sits at 640 — deliberately NOT the frame centre (720), because that
   difference is the whole reason the axis is taken from the column. */
const COL = { getBoundingClientRect: () => ({ width: 800, height: 800, left: 240, top: 40 }) }
const HOST = { getBoundingClientRect: () => ({ width: 1440, height: 900, left: 0, top: 0 }) }

const docWith = (hasCol) => ({
  querySelector(sel) {
    if (sel.includes('_centerCol')) return hasCol ? COL : null
    return null
  },
})

const withCol = build(docWith(true), HOST)
const withoutCol = build(docWith(false), HOST)

let failures = 0
const pass = (m) => console.log('ok    ' + m)
const fail = (m) => { failures++; console.log('FAIL  ' + m) }

/* 1. The axis. */
const spec = withCol.axis(W, H)
if (spec.x === 240 + 800 * 0.5 && spec.half === 800 * 0.5) pass('the axis is the column centre line (x=' + spec.x + ', half=' + spec.half + ')')
else fail('axis is not the column centre: ' + JSON.stringify(spec))
if (spec.x !== W * 0.5) pass('it is NOT the frame centre (' + W * 0.5 + ') — the sidebar shifts the column left of it in this fixture')
else fail('the axis fell back to the frame centre even though a column is on screen')

const fallback = withoutCol.axis(W, H)
if (fallback.x === W * 0.5 && fallback.half === null) pass('with no column on screen it falls back to the frame centre and the short-side scale')
else fail('no-column fallback is wrong: ' + JSON.stringify(fallback))

/* 2. The extent is measured against the column half-width. */
console.log('')
console.log('  level     sigma   extent(px)   column half-width   margin to the column edge')
const extents = []
for (const name of Object.keys(withCol.LEVELS)) {
  const cfg = withCol.LEVELS[name]
  const e = withCol.extent(cfg, spec, W, H)
  extents.push(e)
  console.log('  ' + name.padEnd(9) + String(cfg.blur).padEnd(8) + String(Math.round(e)).padEnd(13) + String(spec.half).padEnd(20) + String(Math.round(spec.half - e)))
}
console.log('')
if (extents.every((v, i) => i === 0 || v > extents[i - 1])) pass('extent grows with the level: ' + extents.map((v) => Math.round(v)).join(' < '))
else fail('extent is not monotonic: ' + extents.map((v) => Math.round(v)).join(', '))
if (withCol.extent(withCol.LEVELS.standard, spec, W, H) === withCol.LEVELS.standard.soft * spec.half) pass('extent = soft * column half-width')
else fail('extent is not soft * half: ' + withCol.extent(withCol.LEVELS.standard, spec, W, H))
if (withCol.extent(withCol.LEVELS.standard, fallback, W, H) === withCol.LEVELS.standard.soft * Math.min(W, H) * 0.5) pass('without a column it scales against the short side instead')
else fail('no-column extent is wrong')

/* 3. THE SPECIAL CASE MUST NOT COME BACK. Asserted on the extracted source, not on
      behaviour, because a phase branch that happens to agree on this frame would pass a
      behavioural check while still being the thing that was removed. */
const axisSrc = grab('contourBokehAxis')
if (!/data-phase/.test(axisSrc)) pass('the axis no longer branches on the page phase (no data-phase lookup)')
else fail('contourBokehAxis reads data-phase again — the page special case is back')
if (!/hero/.test(axisSrc)) pass('no hero flag is carried out of contourBokehAxis')
else fail('contourBokehAxis mentions a hero flag again')
if (!/radial|createRadialGradient|\.scale\(/.test(grab('paintBokehGradient'))) pass('the painter has one shape: no radial gradient and no transform')
else fail('paintBokehGradient has grown a second shape again')
if (!/BOKEH_BAND|BOKEH_RADIAL/.test(src)) pass('no per-page geometry constants are left in client.js')
else fail('a per-page geometry constant survives: ' + (src.match(/BOKEH_(?:BAND|RADIAL)\w*/g) || []).join(', '))

/* 4. The mask is a mirrored linear gradient across the axis. */
function recordingContext() {
  const calls = []
  const gradient = () => ({ addColorStop() {} })
  return {
    calls,
    ctx: {
      createLinearGradient: (...a) => { calls.push(['linear', ...a]); return gradient() },
      createRadialGradient: (...a) => { calls.push(['radial', ...a]); return gradient() },
      fillRect: (...a) => calls.push(['fillRect', ...a]),
      scale: (...a) => calls.push(['scale', ...a]),
      set fillStyle(_v) { calls.push(['fillStyle']) },
    },
  }
}
const strong = withCol.LEVELS.strong
const extent = withCol.extent(strong, spec, W, H)
const rec = recordingContext()
withCol.mask(rec.ctx, spec, W, H, extent, 0)
const order = rec.calls.map((c) => c[0])
const linear = rec.calls.find((c) => c[0] === 'linear')
const fill = rec.calls.find((c) => c[0] === 'fillRect')
if (linear && linear[1] === spec.x - extent && linear[3] === spec.x + extent) pass('the mask spans the axis +/- the extent (' + Math.round(linear[1]) + ' .. ' + Math.round(linear[3]) + ')')
else fail('mask gradient endpoints are wrong: ' + JSON.stringify(linear))
if (!order.includes('radial')) pass('the mask paints a linear gradient')
else fail('the mask painted a radial gradient: ' + JSON.stringify(order))
if (!order.includes('scale')) pass('the mask never transforms the context')
else fail('the mask transformed the context: ' + JSON.stringify(order))
if (fill && fill[1] === 0 && fill[2] === 0 && fill[3] === W && fill[4] === H) pass('the fill covers the whole canvas unscaled')
else fail('mask fill is wrong: ' + JSON.stringify(fill))

const cov = recordingContext()
withCol.coverage(cov.ctx, spec, W, H, extent)
const covOrder = cov.calls.map((c) => c[0])
if (!covOrder.includes('radial') && !covOrder.includes('scale') && covOrder.includes('linear')) pass('the carve uses the same single linear shape')
else fail('the carve changed shape: ' + JSON.stringify(covOrder))

console.log('')
if (failures) { console.error(failures + ' bokeh axis check(s) failed'); process.exit(1) }
console.log('all bokeh axis checks passed')
