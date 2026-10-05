/**
 * palette-contrast.test.js — the accent palette must be MEASURED, not picked.
 *
 * This theme has one rule about colour (see README): every accent role is checked
 * against the surfaces it actually lands on, because two of the three historical
 * colour bugs in this repo were "the text is the same colour as the thing behind
 * it" — invisible chips and a 1.02:1 turn-status label. Adding a second palette
 * (武陵青 / #14d0d0) doubles every one of those surfaces, so the check is
 * mechanical rather than a promise.
 *
 * It reads the REAL values out of client.js (the palette blocks and the JS contour
 * strokes) instead of restating them, so a future edit to the stylesheet is what
 * this test sees. Restating them would only test the copy.
 *
 * Usage: node test/palette-contrast.test.js
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const src = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')

let failures = 0
const fail = (m) => { console.error('FAIL  ' + m); failures++ }
const pass = (m) => console.log('ok    ' + m)

/* ---------- colour maths (sRGB, WCAG 2.x) ---------- */
const hex = (h) => {
  const s = h.trim().replace('#', '')
  const f = s.length === 3 ? s.split('').map((c) => c + c).join('') : s
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)]
}
const lin = (v) => {
  const c = v / 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}
const lum = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2])
const ratio = (a, b) => {
  const la = lum(a), lb = lum(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}
/** Composite `fg` at `alpha` over opaque `bg` (what a translucent wash really shows). */
const over = (fg, bg, alpha) => fg.map((c, i) => c * alpha + bg[i] * (1 - alpha))

/* ---------- surfaces this theme actually paints on ---------- */
const LIGHT_BGS = { 'bg-base': hex('#e8e8e2'), 'bg-layer-1': hex('#f2f2ec') }
const DARK_BGS = { 'bg-base': hex('#101110'), 'bg-layer-1': hex('#181a18') }
const INK = hex('#101110')

/* ---------- pull the palette definitions out of the real stylesheet ---------- */
/** Read one custom property from a specific CSS block in client.js. */
const blockOf = (selector) => {
  const i = src.indexOf(selector + ' {')
  if (i < 0) return null
  const j = src.indexOf('}', i)
  return j < 0 ? null : src.slice(i, j)
}
const varIn = (block, name) => {
  if (block === null) return null
  const m = block.match(new RegExp('\\n\\s*' + name + '\\s*:\\s*([^;]+);'))
  return m ? m[1].trim() : null
}

const YELLOW_SEL = 'body'          // the default palette lives on plain body
const CYAN_SEL = 'body.theme-endfield-wuling'

/* The default-palette block is the one that DEFINES --edge-accent (plain `body {`
   appears many times in this stylesheet, so find the right occurrence). */
const defaultBlock = (() => {
  let from = 0
  for (;;) {
    const i = src.indexOf('\n      body {', from)
    if (i < 0) return null
    const j = src.indexOf('}', i)
    const b = src.slice(i, j)
    if (/--edge-accent\s*:/.test(b)) return b
    from = i + 1
  }
})()
const cyanBlock = blockOf('      ' + CYAN_SEL)

if (defaultBlock === null) { fail('no body block defines --edge-accent (谷地黄 palette missing)'); }
if (cyanBlock === null) { fail('no ' + CYAN_SEL + ' block found (武陵青 palette missing)'); }
if (failures) { console.error('\n' + failures + ' palette check(s) failed'); process.exit(1) }

const palettes = {
  '谷地黄': defaultBlock,
  '武陵青': cyanBlock,
}

/* ---------- 1. accent used as a SOLID FILL under ink text ----------
   Rows, badges, the new-session button, approval chips and ::selection all paint
   the accent as a background with #101110 / #000 on top. That pairing is the most
   reused one in the theme, so it must clear AA on its own. */
for (const [name, block] of Object.entries(palettes)) {
  const accent = varIn(block, '--edge-accent')
  if (accent === null) { fail(name + ': --edge-accent is not defined'); continue }
  const r = ratio(INK, hex(accent))
  if (r >= 4.5) pass(name + ' 实心强调色底 + 墨色字：' + r.toFixed(2) + ':1 (AA)')
  else fail(name + ' ink-on-accent is only ' + r.toFixed(2) + ':1 — chips/rows become illegible')

  // The hover variant carries the same text, so it needs the same guarantee.
  const deep = varIn(block, '--edge-accent-deep')
  if (deep === null) { fail(name + ': --edge-accent-deep is not defined'); continue }
  const rd = ratio(INK, hex(deep))
  if (rd >= 4.5) pass(name + ' 悬停加深底 + 墨色字：' + rd.toFixed(2) + ':1 (AA)')
  else fail(name + ' ink-on-accent-deep is only ' + rd.toFixed(2) + ':1')
}

/* ---------- 2. turn-status gradient text ("Deep diving...") ----------
   Gradient text: EVERY stop paints glyphs, and under prefers-reduced-motion the
   mid stop is pinned inside the letters permanently, so both stops must clear AA
   against both backgrounds of their mode. This is the exact bug that made the
   label 1.02:1 with signal yellow. */
const gradientRoles = [
  ['--edge-status-light', LIGHT_BGS, '亮色主色'],
  ['--edge-status-light-mid', LIGHT_BGS, '亮色亮带'],
  ['--edge-status-dark', DARK_BGS, '暗色主色'],
  ['--edge-status-dark-mid', DARK_BGS, '暗色亮带'],
]
for (const [name, block] of Object.entries(palettes)) {
  for (const [v, bgs, label] of gradientRoles) {
    const val = varIn(block, v)
    if (val === null) { fail(name + ': ' + v + ' is not defined'); continue }
    let worst = Infinity
    let worstBg = ''
    for (const [bgName, bg] of Object.entries(bgs)) {
      const r = ratio(hex(val), bg)
      if (r < worst) { worst = r; worstBg = bgName }
    }
    if (worst >= 4.5) pass(name + ' 回合状态 ' + label + ' ' + val + '：最差 ' + worst.toFixed(2) + ':1 vs ' + worstBg + ' (AA)')
    else fail(name + ' turn-status ' + label + ' ' + val + ' is ' + worst.toFixed(2) + ':1 vs ' + worstBg + ' — fails AA (gradient text paints glyphs with every stop)')
  }
}

/* ---------- 3. accent as ICON/TEXT ink in dark mode ----------
   Dark mode paints the accent as foreground on icon buttons and links, so it is
   real text contrast, not decoration. 3:1 is the floor for large glyph/icon ink. */
for (const [name, block] of Object.entries(palettes)) {
  const accent = varIn(block, '--edge-accent')
  if (accent === null) continue
  let worst = Infinity
  for (const bg of Object.values(DARK_BGS)) worst = Math.min(worst, ratio(hex(accent), bg))
  if (worst >= 3) pass(name + ' 暗色图标/链接强调色：' + worst.toFixed(2) + ':1 (>=3 非文本/大字号下限)')
  else fail(name + ' accent-as-ink in dark mode is only ' + worst.toFixed(2) + ':1')
}

/* ---------- 4. contour stroke strength parity ----------
   The sheet is a whisper behind everything, so the test is not "readable" but
   "comparable between palettes": a stroke that is 1.7:1 in one palette and 1.05:1
   in the other would read as the feature breaking on switch. Both are compared
   against the yellow values that were tuned by eye on a real render.

   Strokes are 8-DIGIT HEX (#RRGGBBAA) in client.js, so the alpha is parsed from the
   last byte pair rather than a decimal. Canvas accepts that form and normalises it
   to the identical rgba() (verified in a browser), so reading the hex is reading
   exactly what gets painted. */
const strokeOf = (re) => {
  const m = src.match(re)
  if (!m) return null
  const h = m[1]
  return {
    rgb: [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)],
    a: parseInt(h.slice(6, 8), 16) / 255,
  }
}
const tagged = (tag) => new RegExp(tag + '[^\\n]*#([0-9a-fA-F]{8})')
const strokes = {
  '谷地黄 dark': [strokeOf(tagged('EDGE_STROKE_DARK_YELLOW')), DARK_BGS['bg-base']],
  '谷地黄 light': [strokeOf(tagged('EDGE_STROKE_LIGHT_YELLOW')), LIGHT_BGS['bg-base']],
  '武陵青 dark': [strokeOf(tagged('EDGE_STROKE_DARK_CYAN')), DARK_BGS['bg-base']],
  '武陵青 light': [strokeOf(tagged('EDGE_STROKE_LIGHT_CYAN')), LIGHT_BGS['bg-base']],
}
const strokeContrast = {}
let strokesFound = true
for (const [k, [s, bg]] of Object.entries(strokes)) {
  if (s === null) { fail('contour stroke not found for ' + k + ' (expected a tagged 8-digit hex in client.js)'); strokesFound = false; continue }
  strokeContrast[k] = ratio(over(s.rgb, bg, s.a), bg)
}
if (strokesFound) {
  for (const mode of ['dark', 'light']) {
    const y = strokeContrast['谷地黄 ' + mode]
    const c = strokeContrast['武陵青 ' + mode]
    const drift = Math.abs(c - y) / y
    const line = mode + ' 等高线描边强度：谷地黄 ' + y.toFixed(3) + ':1 / 武陵青 ' + c.toFixed(3) + ':1'
    // 20% of the yellow value: enough room for a hue that cannot hit the same
    // composite exactly, tight enough that neither palette reads as broken.
    if (drift <= 0.20) pass(line + '（相差 ' + (drift * 100).toFixed(1) + '%，两配色观感一致）')
    else fail(line + ' — ' + (drift * 100).toFixed(1) + '% apart; one palette will read much louder than the other')
    // A stroke below ~1.06:1 is not visible at all (README's perceptual floor).
    if (c >= 1.06) pass('武陵青 ' + mode + ' 等高线在感知下限之上')
    else fail('武陵青 ' + mode + ' contour stroke is below the 1.06:1 perceptual floor')
  }
}

/* ---------- 5. hero glow presence ----------
   The hero backdrop glow used to be the app's own #6187D8 ellipse at 8%, and this
   section used to assert the replacement was never LOUDER than that (a one-sided
   ceiling on the composited core's |ΔY|). That rule was right for a backdrop the
   theme merely re-coloured, and it is the wrong rule now: on the empty-conversation
   page the glow read as "too small and too faint", so the glow is a designed
   feature with a target strength rather than a quieter substitute for a colour the
   theme wants gone. Keeping the old one-sided budget would have made the shipped
   values fail while saying nothing about the actual defect — too little presence.

   So the gate is now TWO-SIDED, and it measures presence in the channel the hue
   actually moves on each surface. That distinction is not cosmetic:

     dark  — over near-black every unit of alpha adds real luminance, so |ΔY| is
             the presence metric and the ceiling is close (a halo becomes a
             coloured slab long before it becomes invisible).
     light — on cream, #fff500 is almost luminance-NEUTRAL (ΔY -2.1 per unit
             alpha, i.e. -0.32 at 0.15): measuring yellow by luminance would say
             "invisible" about a glow that is plainly there. It moves the BLUE
             channel instead (-33.9 at 0.15). Cyan is the mirror case: it barely
             touches blue (-2.7) and darkens instead (ΔY -9.5). So light mode
             scores max(|ΔY|, |ΔB|), which is the honest question — "did the core
             move at all against the paper" — and it covers both palettes with one
             expression.

   Floors are where the glow stops registering (the reported bug); ceilings are
   where it stops reading as light on the page. Both are the shipped values' own
   margins, checked per palette and per scheme. */
const GLOW_BAND = {
  light: { floor: 8, ceiling: 45 },
  dark: { floor: 12, ceiling: 30 },
}
const glowAlpha = (block, name) => {
  const v = varIn(block, name)
  return v === null ? null : Number(v)
}
const yShift = (fg, bg, a) => {
  const c = over(fg, bg, a)
  const Y = (p) => 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]
  return Y(c) - Y(bg)
}
const bShift = (fg, bg, a) => over(fg, bg, a)[2] - bg[2]
const glowPresence = (fg, bg, a, mode) => {
  const y = Math.abs(yShift(fg, bg, a))
  return mode === 'dark' ? y : Math.max(y, Math.abs(bShift(fg, bg, a)))
}
const BLUE = hex('#6187D8')
for (const [name, block] of Object.entries(palettes)) {
  const accent = varIn(block, '--edge-accent')
  if (accent === null) continue
  for (const [mode, bg] of [['light', LIGHT_BGS['bg-base']], ['dark', DARK_BGS['bg-base']]]) {
    const a = glowAlpha(block, '--edge-glow-' + mode)
    if (a === null) { fail(name + ': --edge-glow-' + mode + ' is not defined'); continue }
    // Anchor the numbers to the backdrop this glow replaced, so the report is
    // readable: |ΔY| of the stock #6187D8 at 8% is ~9.3 on the dark page.
    const stock = Math.abs(yShift(BLUE, bg, 0.08))
    const mine = glowPresence(hex(accent), bg, a, mode)
    const band = GLOW_BAND[mode]
    const detail = name + ' hero 光晕 ' + mode + ' α=' + a
      + '：presence ' + mine.toFixed(2)
      + (mode === 'light' ? ' (max|ΔY|,|ΔB|)' : ' (|ΔY|)')
      + '，band ' + band.floor + '–' + band.ceiling
      + '（替换前的 #6187D8 @8% |ΔY| ' + stock.toFixed(2) + '）'
    if (mine < band.floor) {
      fail(detail + '\n      -> below the floor: the halo reads as absent, which is '
        + 'the reported "the glow is too faint" regression')
    } else if (mine > band.ceiling) {
      fail(detail + '\n      -> above the ceiling: the backdrop stops reading as light '
        + 'on the page and starts reading as a coloured fill behind the composer')
    } else {
      pass(detail)
    }
  }
}

/* ---------- 6. the two palettes must actually differ ---------- */
const ay = varIn(palettes['谷地黄'], '--edge-accent')
const ac = varIn(palettes['武陵青'], '--edge-accent')
if (ay !== null && ac !== null) {
  if (ay.toLowerCase() !== ac.toLowerCase()) pass('两套配色的强调色不同：' + ay + ' / ' + ac)
  else fail('both palettes define the same --edge-accent — the switch would do nothing')
}
/* Every accent value in this package is written as HEX, so assert the notation as
   well as the colour. The first version carried the accent in two notations (hex in
   CSS, rgb() in the settings row and the canvas strokes), which is exactly how two
   spellings of one colour drift apart. */
if (ac !== null && /^#[0-9a-f]{6}$/i.test(ac)) pass('武陵青 强调色为 6 位十六进制：' + ac)
else fail('武陵青 --edge-accent should be a 6-digit hex value, got ' + ac)

/* ---------- 7. 武陵青 must be BRIGHT enough to partner the signal yellow ----------
   The reported defect was that the first cyan read as too dark beside the yellow it
   alternates with. That is measurable rather than a matter of taste: relative
   luminance was 31.7% against the yellow's 86.6%, so the chip carried about a third
   of the presence on a near-black page.
   The floor is set at 45% — comfortably above the 31.7% that was rejected, and
   below the ~56% where the light-mode chip stops separating from cream. */
const relLum = (h) => lum(hex(h)) * 100
if (ac !== null) {
  const yl = relLum(ay), cl = relLum(ac)
  if (cl >= 45) pass('武陵青 相对亮度 ' + cl.toFixed(1) + '%（下限 45%，谷地黄 ' + yl.toFixed(1) + '%）')
  else fail('武陵青 relative luminance is only ' + cl.toFixed(1) + '% — reads dark next to 谷地黄 ' + yl.toFixed(1) + '%')
  /* Upper guard: past ~56% the chip stops separating from cream in light mode, and
     the hue desaturates toward white — it stops looking like 武陵青 at all. */
  if (cl <= 56) pass('武陵青 未过亮（上限 56%，亮色模式仍与纸底可分辨）')
  else fail('武陵青 relative luminance ' + cl.toFixed(1) + '% is too pale — the light-mode chip vanishes into cream')
  // Hue integrity: this must remain a teal, not drift to grey-cyan or white.
  const [r, g, b] = hex(ac)
  if (g === b && r < g * 0.5) pass('武陵青 仍在青碧色轴上（R 低、G=B）：' + [r, g, b].join(', '))
  else fail('武陵青 ' + ac + ' has drifted off the teal axis (expect low R, G == B)')
}

console.log('')
if (failures) { console.error(failures + ' palette check(s) failed'); process.exit(1) }
console.log('all palette-contrast checks passed')
