/**
 * settings-scrollbar.test.js — switching chapters must not change the panel's WIDTH.
 *
 * The reported defect: "some chapters have little content and no scrollbar, others
 * do — and the chapter strip at the top changes length and flickers."
 *
 * Mechanism: the settings page scrolls in a fixed-height container, and a classic
 * scrollbar takes LAYOUT width (the theme styles one: ::-webkit-scrollbar
 * { width: 10px }). Only the long chapters overflow, so the scrollbar appears and
 * disappears as you switch, and the content box — hence the panel and the strip
 * across its top — changes width with it. The fix reserves the gutter
 * (`scrollbar-gutter: stable`) on the app's scroll container, which is found
 * structurally (nearest ancestor that scrolls vertically) rather than by class name.
 *
 * This file measures the real thing: it renders the REAL client.js panel inside a
 * mock of that scroll area, switches between the shortest chapter (主题, 4 rows) and
 * the longest (音频, 11 rows), and compares the strip's measured width. A control
 * run then removes the reserved gutter and asserts the widths DO differ — without
 * it, a "passing" assertion would only prove the mock never reproduced the bug.
 *
 * Usage: node test/settings-scrollbar.test.js
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')
const { BROWSER_SETTINGS_SCOPE_SNIPPET } = require(path.join(__dirname, 'fixtures', 'settings-scope.browser.js'))

const ROOT = path.resolve(__dirname, '..')
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'endfield-scroll-'))
fs.copyFileSync(path.join(ROOT, 'client.js'), path.join(OUT, 'client.js'))
const page = path.join(OUT, 'mock.html')

function findChrome() {
  const c = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean)
  for (const p of c) if (fs.existsSync(p)) return p
  return null
}
const chrome = findChrome()
if (!chrome) { console.error('FAIL  no Chrome/Edge found (set CHROME_PATH)'); process.exit(1) }

/* The scroll area: tall enough for the SHORT chapter to fit (so no scrollbar is
   shown) and short enough that the LONG one overflows. Both numbers matter — a
   scroller that always overflows would hide the defect entirely. */
const SCROLLER_HEIGHT = 560

fs.writeFileSync(page, `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%}
  body{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:Arial,sans-serif}
  #scroller{height:${SCROLLER_HEIGHT}px;overflow-y:auto;overflow-x:hidden;width:560px;
            padding:0 20px;box-sizing:border-box;background:var(--dsw-alias-bg-layer-1)}
</style></head><body>
<div id="scroller"><div id="panel"></div></div>
<script>
/* The app's own token values, as body inline styles (the theme service does the
   same). The theme's accent pair is included so the panel renders themed. */
var TOKENS = {
  '--dsw-alias-bg-base': '#f4f5f7', '--dsw-alias-bg-layer-1': '#ffffff',
  '--dsw-alias-bg-layer-2': '#f1f3f5', '--dsw-alias-label-primary': '#0f1115',
  '--dsw-alias-label-secondary': '#4a4c48', '--dsw-alias-label-tertiary': '#81858c',
  '--dsw-alias-border-l1': '#e1e5ee', '--dsw-alias-border-l2': '#cfd3d6',
  '--dsw-alias-interactive-bg-hover-solid': '#f1f3f5',
  '--edge-accent': '#fff500', '--edge-btn-muted': '#dcddd6', '--edge-status-light': '#6b5d00'
}
for (var k in TOKENS) document.body.style.setProperty(k, TOKENS[k])
</script>
<script>window.__ModuleLoader__={load:(m)=>{window.__MOD__=m}}</script>
<script src="./client.js"></script>
<script>
/* Recording React, WITH useEffect: the gutter is reserved from the panel's mount
   effect (post-commit), so a stub without the hook would skip the code under test.
   Effects are COLLECTED here and run after the tree is materialised, which is the
   order a real mount uses — running them during render would find no DOM and
   silently prove nothing. */
const __effects = []
const R = {
  useState(init) { const v = typeof init === 'function' ? init() : init; return [v, () => {}] },
  useEffect(fn) { __effects.push(fn) },
  createElement(type, props, ...children) {
    const kids = []
    for (const c of children) {
      if (Array.isArray(c)) kids.push(...c)
      else if (c !== null && c !== undefined && c !== false) kids.push(c)
    }
    return { type, props: props || {}, children: kids }
  },
}
window.React = R
</script>
<script>
${BROWSER_SETTINGS_SCOPE_SNIPPET}
var __prefs = __endfieldSettingsScope({ enabled: '1', loader: '0' })

let rendered = null
const slots = { inject(_n, fn) { fn() }, register(_o, r) { rendered = r; return () => {} } }
const mod = window.__MOD__.factory(() => null)
mod.apply({
  get: (n) => n === 'theme' ? { overrideTokens: () => () => {} }
    : (n === 'slots' ? slots : (n === 'settingsScope' ? __prefs.binder : undefined)),
  effect: () => {},
})

const textOf = (el) => (el === null || el === undefined || typeof el === 'boolean') ? ''
  : (typeof el === 'string' || typeof el === 'number') ? String(el)
    : (el.children || []).map(textOf).join('')
const walk = (el, out = []) => {
  if (el && typeof el === 'object' && el.type) { out.push(el); for (const c of el.children || []) walk(c, out) }
  return out
}
function mount(node, parent) {
  if (node == null || typeof node === 'boolean') return
  if (typeof node === 'string' || typeof node === 'number') { parent.appendChild(document.createTextNode(String(node))); return }
  const el = document.createElement(node.type)
  const p = node.props || {}
  if (p.style) for (const k in p.style) el.style[k] = p.style[k]
  if (p.className) el.className = p.className
  if (p.role) el.setAttribute('role', p.role)
  if (p['aria-selected']) el.setAttribute('aria-selected', p['aria-selected'])
  parent.appendChild(el)
  for (const c of node.children || []) mount(c, el)
}
const scroller = document.getElementById('scroller')
const host = document.getElementById('panel')
const draw = () => {
  host.innerHTML = ''
  mount(rendered(), host)
  /* Post-commit effects, exactly once per render, like React. */
  for (const fn of __effects.splice(0)) { const d = fn(); if (typeof d === 'function') window.__dispose__ = d }
}
const switchTo = (label) => {
  const tab = walk(rendered()).find((n) => n.type === 'button' && n.props && n.props.role === 'tab'
    && textOf(n) === label)
  if (tab) tab.props.onClick()
  draw()
}
const widthOf = (sel) => +document.querySelector(sel).getBoundingClientRect().width.toFixed(2)

window.__RESULTS__ = []
const R2 = (name, pass, detail) => window.__RESULTS__.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) })

draw()
const gutterAfterMount = scroller.style.scrollbarGutter || '(none)'
const themedStrip = widthOf('.endfield-settings-tabs')
const themedPanel = widthOf('.endfield-settings')
const themedScrollbar = scroller.offsetWidth - scroller.clientWidth

switchTo('音频')
const audioStrip = widthOf('.endfield-settings-tabs')
const audioPanel = widthOf('.endfield-settings')
const audioScrollbar = scroller.offsetWidth - scroller.clientWidth

switchTo('主题')
const backStrip = widthOf('.endfield-settings-tabs')

R2('mount reserves the scrollbar gutter (scrollbar-gutter: stable)', gutterAfterMount === 'stable', gutterAfterMount)
R2('strip width is identical across chapters (主题 -> 音频)',
  themedStrip === audioStrip, themedStrip + ' -> ' + audioStrip)
R2('panel width is identical across chapters',
  themedPanel === audioPanel, themedPanel + ' -> ' + audioPanel)
R2('switching back does not move the strip again',
  backStrip === audioStrip, backStrip + ' (was ' + audioStrip + ')')
/* The reservation has to be a real one: the gutter must occupy the scrollbar's
   width even on the chapter that would otherwise not scroll. */
R2('the gutter keeps the scrollbar box on both chapters',
  themedScrollbar > 0 && audioScrollbar > 0, themedScrollbar + 'px / ' + audioScrollbar + 'px')

/* CONTROL — remove the reservation and the defect must come back. Without this the
   assertions above could pass on a mock that never reproduced anything. */
scroller.style.scrollbarGutter = ''
const bareThemed = widthOf('.endfield-settings-tabs')
switchTo('音频')
const bareAudio = widthOf('.endfield-settings-tabs')
R2('control: without the fix the strip DOES change width',
  bareThemed !== bareAudio, bareThemed + ' -> ' + bareAudio)
R2('control: the change is the scrollbar width',
  Math.abs(bareThemed - bareAudio) >= 8, Math.abs(bareThemed - bareAudio).toFixed(2) + 'px')

document.title = 'DONE ' + JSON.stringify(window.__RESULTS__)
</script>
</body></html>`)

let dom = ''
try {
  dom = execFileSync(chrome, ['--headless', '--disable-gpu', '--no-sandbox',
    '--window-size=900,700', '--virtual-time-budget=5000',
    '--dump-dom', 'file:///' + page.replace(/\\/g, '/')],
  { encoding: 'utf8', maxBuffer: 1 << 26 })
} catch (e) {
  console.error('FAIL  browser run failed: ' + e.message)
  process.exit(1)
}
const m = dom.match(/<title>DONE ([\s\S]*?)<\/title>/)
if (!m) {
  console.error('FAIL  page produced no results')
  const t = dom.match(/<title>([\s\S]*?)<\/title>/)
  if (t) console.error('      title was: ' + t[1].slice(0, 300))
  process.exit(1)
}
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'")
const results = JSON.parse(decode(m[1]))

let failures = 0
for (const r of results) {
  if (r.pass) console.log('ok    ' + r.name + '  [' + r.detail + ']')
  else { console.error('FAIL  ' + r.name + '  [' + r.detail + ']'); failures++ }
}
console.log('')
if (failures) { console.error(failures + ' scrollbar check(s) failed'); process.exit(1) }
console.log('all ' + results.length + ' settings-scrollbar checks passed')
