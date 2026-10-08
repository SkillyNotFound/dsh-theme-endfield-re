/**
 * thunder-edges.test.js — prove 雷霆大字 announces on real TURN EDGES.
 *
 * The settings test only proves the switch renders. The feature itself is the
 * subscription logic, and every way it can be wrong is silent:
 *   - reading a LEVEL instead of an EDGE would re-announce on every streamed
 *     token (the snapshot store publishes constantly during a turn);
 *   - announcing the FIRST value read would fire 「任务开始」 merely because the
 *     user opened a session that was already running;
 *   - subscribing while switched OFF would keep the cost of a disabled feature;
 *   - forgetting to unsubscribe on teardown leaves callbacks on a dead run.
 * None of that is visible to check.js, to the canvas tests, or in a screenshot,
 * so it is driven directly here.
 *
 * No browser and no React: the real client.js runs in-process against a fake
 * `sessions` service shaped like the runtime contract it actually consumes
 * (@deepseek-ai/dsh-client-runtime — `sessions.list` is an observable snapshot
 * store carrying `current`, `sessions.binding(id).session` is an observable
 * snapshot carrying `running`), plus a controllable clock so the 3s hold can be
 * asserted rather than waited out.
 *
 * Usage: node test/thunder-edges.test.js
 */
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const { settingsScopeStub, fieldName } = require(path.join(__dirname, 'fixtures', 'settings-scope.js'))

const ROOT = path.resolve(__dirname, '..')
const src = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')

let failures = 0
const fail = (m) => { console.error('FAIL  ' + m); failures++ }
const pass = (m) => console.log('ok    ' + m)

/* ---------- minimal DOM that records the plate ---------- */
const makeEl = (tag) => {
  const el = {
    tagName: String(tag).toUpperCase(),
    children: [],
    attrs: {},
    style: {
      values: {},
      setProperty(k, v) { this.values[k] = String(v) },
      getPropertyValue(k) { return this.values[k] || '' },
    },
    className: '',
    textContent: '',
    parentNode: null,
    isConnected: true,
    classList: { add() {}, remove() {}, contains: () => false },
    setAttribute(k, v) { this.attrs[k] = String(v) },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null },
    hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) },
    removeAttribute(k) { delete this.attrs[k] },
    appendChild(c) { c.parentNode = this; this.children.push(c); return c },
    insertBefore(c) { c.parentNode = this; this.children.unshift(c); return c },
    removeChild(c) {
      const i = this.children.indexOf(c)
      if (i >= 0) this.children.splice(i, 1)
      c.parentNode = null
      return c
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ width: 0, height: 0, top: 0, left: 0 }),
    getContext: () => null,
    get firstChild() { return this.children.length ? this.children[0] : null },
  }
  return el
}
const body = makeEl('body')
let activeConversationRoot = null
const windowListeners = new Map()
const addWindowListener = (name, fn) => {
  if (!windowListeners.has(name)) windowListeners.set(name, new Set())
  windowListeners.get(name).add(fn)
}
const removeWindowListener = (name, fn) => { if (windowListeners.has(name)) windowListeners.get(name).delete(fn) }
const dispatchWindowEvent = (name, event) => { for (const fn of windowListeners.get(name) || []) fn(event) }
const document = {
  body,
  head: makeEl('head'),
  createElement: (t) => makeEl(t),
  createTextNode: (t) => ({ nodeValue: String(t) }),
  querySelector: (selector) => selector === '[class$="_root"][data-phase="active"]' ? activeConversationRoot : null,
  querySelectorAll: () => [],
  getElementById: () => null,
  addEventListener() {},
}

/** Every 雷霆大字 plate currently attached to <body>. */
const plates = () => body.children.filter((c) => c.hasAttribute('data-endfield-thunder'))
/** The word the visible plate shows, or null when no plate is up. */
const shownWord = () => {
  const p = plates()
  if (p.length === 0) return null
  const w = p[p.length - 1].children.find((c) => c.hasAttribute('data-endfield-thunder-word'))
  return w ? w.textContent : null
}

/* ---------- controllable clock ---------- */
let now = 0
let seq = 0
const timers = new Map()
const setTimeoutFake = (fn, ms) => {
  const id = ++seq
  timers.set(id, { fn, at: now + (typeof ms === 'number' ? ms : 0) })
  return id
}
const clearTimeoutFake = (id) => { timers.delete(id) }
/** Advance the clock, firing due timers in time order. */
const advance = (ms) => {
  const target = now + ms
  for (;;) {
    let next = null
    for (const [id, t] of timers) {
      if (t.at <= target && (next === null || t.at < next.t.at)) next = { id, t }
    }
    if (next === null) break
    timers.delete(next.id)
    now = next.t.at
    next.t.fn()
  }
  now = target
}

/* ---------- fake sessions service (runtime contract shape) ---------- */
const makeObservable = (initial) => {
  let state = initial
  const subs = new Set()
  return {
    getSnapshot: () => state,
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn) } },
    set(next) { state = next; for (const fn of [...subs]) fn() },
    /** Publish without changing anything — what a streamed token looks like. */
    ping() { for (const fn of [...subs]) fn() },
    get subscriberCount() { return subs.size },
  }
}

const sessionA = makeObservable({ running: false })
const sessionB = makeObservable({ running: false })
const list = makeObservable({ current: 'session-a' })
const sessions = {
  list,
  binding: (id) => {
    if (id === 'session-a') return { sessionId: id, session: sessionA }
    if (id === 'session-b') return { sessionId: id, session: sessionB }
    return undefined
  },
}

/* ---------- load the real client bundle ----------
   The theme reads/writes its preferences through the dsh settingsScope seam, so
   this test drives it with a fake binder seeded like the old localStorage store:
   theme on, anim-heavy layers off (thunder itself starts OFF so the edge probes
   below begin from a pristine state). Changes the sections make write back here;
   scenarios 11/11b mount fresh sandboxes and seed their own binder. */
const makePrefStore = (extra = {}) => settingsScopeStub(Object.assign({
  enabled: '1',
  loader: '0',
  contour: '0',
  watermark: '0',
  bottomGlow: 'off',
}, extra))

const prefStore = makePrefStore()

const sandbox = {
  window: {
    __ModuleLoader__: null,
    addEventListener: addWindowListener, removeEventListener: removeWindowListener,
    matchMedia: () => ({ matches: false }),
    innerWidth: 1440,
    setTimeout: setTimeoutFake, clearTimeout: clearTimeoutFake,
  },
  document,
  MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {} },
  ResizeObserver: function () { this.observe = () => {}; this.disconnect = () => {} },
  requestAnimationFrame: () => 0,
  cancelAnimationFrame() {},
  performance: { now: () => now },
  setTimeout: setTimeoutFake, clearTimeout: clearTimeoutFake,
  setInterval: () => 0, clearInterval() {},
  console,
}
sandbox.globalThis = sandbox
sandbox.window.document = document

let loaded = null
sandbox.window.__ModuleLoader__ = { load: (m) => { loaded = m } }
vm.createContext(sandbox)
try {
  new vm.Script(src, { filename: 'client.js' }).runInContext(sandbox)
} catch (e) {
  fail('client.js threw while loading: ' + e.message)
  process.exit(1)
}
if (loaded === null) { fail('module never registered'); process.exit(1) }

/* Capture the settings render (to drive the switch the way a user does) and the
   fiber teardown (to assert it releases the subscriptions). */
let rendered = null
const slots = {
  inject(_n, fn) { fn() },
  register(_o, render) { rendered = render; return () => {} },
}
let teardown = null
const ctx = {
  get: (n) => {
    if (n === 'theme') return { overrideTokens: () => () => {} }
    if (n === 'slots') return slots
    if (n === 'sessions') return sessions
    if (n === 'settingsScope') return prefStore.binder
    return undefined
  },
  effect: (fn) => { const d = fn(); if (typeof d === 'function') teardown = d },
}

const mod = loaded.factory(() => null)
try { mod.apply(ctx) } catch (e) { fail('apply() threw: ' + e.message); process.exit(1) }
pass('apply() completed with a sessions service present')

/* --- 1. DEFAULT OFF: a real turn edge must announce NOTHING and, critically,
       the feature must not even be subscribed (an off switch that still listens
       is the cost this design explicitly refuses). --- */
if (sessionA.subscriberCount === 0) pass('默认关闭时不订阅会话（关闭即零开销）')
else fail('switched off, but the session already has ' + sessionA.subscriberCount + ' subscriber(s)')
sessionA.set({ running: true })
if (shownWord() === null) pass('默认关闭时任务开始不显示任何内容')
else fail('switched off but announced: ' + shownWord())
sessionA.set({ running: false })

/* --- 2. switch it ON through the real settings row --- */
if (typeof rendered !== 'function') { fail('settings.section never registered'); process.exit(1) }
const walk = (el, out = []) => {
  if (el && typeof el === 'object' && el.type) { out.push(el); for (const c of el.children || []) walk(c, out) }
  return out
}
const textOf = (el) => {
  if (el === null || el === undefined || typeof el === 'boolean') return ''
  if (typeof el === 'string' || typeof el === 'number') return String(el)
  return (el.children || []).map(textOf).join('')
}
const R = {
  useState(init) { const v = typeof init === 'function' ? init() : init; return [v, () => {}] },
  createElement(type, props, ...children) {
    const kids = []
    for (const c of children) {
      if (Array.isArray(c)) kids.push(...c)
      else if (c !== null && c !== undefined && c !== false) kids.push(c)
    }
    return { type, props: props || {}, children: kids }
  },
}
sandbox.React = R
let tree
try { tree = rendered() } catch (e) { fail('settings render threw: ' + e.message); process.exit(1) }
/* The same authoritative running snapshot also controls the conversation bloom:
   verify it attaches only to the active conversation root and changes presentation
   without depending on DOM class hashes or the announcement feature. */
activeConversationRoot = makeEl('div')
let conversationRect = { width: 800, height: 700, top: 0, left: 320 }
activeConversationRoot.getBoundingClientRect = () => conversationRect
const composerAnchor = { getBoundingClientRect: () => ({ width: 360, height: 70, top: 580, left: 380 }) }
activeConversationRoot.querySelector = (selector) => selector === '[data-composer-card]' ? composerAnchor : null
activeConversationRoot.className = 'Conversation_root'
activeConversationRoot.setAttribute('data-phase', 'active')
const glowSelect = walk(tree).find((n) => n.type === 'select' && n.props['aria-label'] === '对话底侧泛光')
if (!glowSelect) fail('底侧泛光强度 select 未渲染')
else {
  glowSelect.props.onChange({ target: { value: 'standard' } })
  const glow = activeConversationRoot.children.find((child) => child.hasAttribute('data-endfield-bottom-glow-layer'))
  if (glow && glow.getAttribute('data-running') === 'false') pass('空闲对话挂载光束层并使用空闲状态')
  else fail('底侧泛光没有挂载到活动对话或缺少空闲状态')
  if (glow && glow.children.length === 30) pass('泛光使用 30 个低成本中心光源')
  else fail('中心光源数量错误：' + (glow && glow.children.length))
  const sources = glow ? glow.children : []
  const sourceStyles = sources.map((source) => source.style && source.style.values ? source.style.values : {})
  const firstSource = sourceStyles[0] || {}
  if (['--glow-source-x', '--glow-source-width-idle', '--glow-source-width-running', '--glow-source-height-idle', '--glow-source-height-running', '--glow-source-tint', '--glow-source-opacity-high', '--glow-source-duration-idle', '--glow-source-duration-running'].every((key) => firstSource[key])) pass('每个中心光源有随机位置、范围、色阶、强度与呼吸节奏')
  else fail('中心光源随机参数缺失：' + JSON.stringify(firstSource))
  if (new Set(sourceStyles.map((style) => style['--glow-source-width-idle'])).size > 20) pass('中心光覆盖尺寸错落随机')
  else fail('中心光的覆盖尺寸缺少变化')
  const xValues = () => sourceStyles.map((style) => Number.parseFloat(style['--glow-source-x'] || '0'))
  const centerOf = (values) => values.reduce((sum, value) => sum + value, 0) / (values.length || 1)
  const spreadOf = (values) => Math.max(...values) - Math.min(...values)
  const idleXs = xValues()
  const dialogCenter = (conversationRect.left + conversationRect.width / 2) / 1440 * 100
  const dialogLeft = conversationRect.left / 1440 * 100
  const dialogRight = (conversationRect.left + conversationRect.width) / 1440 * 100
  if (Math.abs(centerOf(idleXs) - dialogCenter) < 0.1 && spreadOf(idleXs) > 20 && spreadOf(idleXs) < 30
      && Math.min(...idleXs) >= dialogLeft && Math.max(...idleXs) <= dialogRight
      && Math.abs(dialogCenter - (560 / 1440 * 100)) > 8) pass('闲置光点适度聚拢在对话框中轴附近，仍在对话框范围内')
  else fail('闲置光点未铺在对话框范围或误锚到输入框：' + JSON.stringify({ mean: centerOf(idleXs), spread: spreadOf(idleXs), dialogCenter }))
  conversationRect = { width: 700, height: 700, top: 0, left: 500 }
  dispatchWindowEvent('transitionend', { propertyName: 'transform' })
  const shiftedXs = xValues()
  if (Math.abs(centerOf(shiftedXs) - (850 / 1440 * 100)) < 0.1) pass('侧栏开合时闲置光域跟随对话框中轴移动')
  else fail('对话框移动后闲置光域未跟随中轴：' + centerOf(shiftedXs))
  conversationRect = { width: 800, height: 700, top: 0, left: 320 }
  dispatchWindowEvent('transitionend', { propertyName: 'transform' })
  sessionA.set({ running: true })
  if (glow && glow.getAttribute('data-running') === 'true') pass('任务 running 快照切换为扩散状态')
  else fail('任务运行状态没有传递给泛光层')
  const runningXs = xValues()
  if (spreadOf(runningXs) >= 89 && Math.abs(centerOf(runningXs) - dialogCenter) < 0.1) pass('运行光点向两侧大幅扩散且保持对话框中轴')
  else fail('running 光点扩散不足或中心偏离对话框：' + JSON.stringify({ mean: centerOf(runningXs), spread: spreadOf(runningXs) }))
  conversationRect = { width: 700, height: 700, top: 0, left: 500 }
  dispatchWindowEvent('transitionend', { propertyName: 'transform' })
  const shiftedRunningXs = xValues()
  if (Math.abs(centerOf(shiftedRunningXs) - (850 / 1440 * 100)) < 0.1 && spreadOf(shiftedRunningXs) > 85) pass('运行中侧栏移动后扩散仍以新对话框中轴为中心')
  else fail('运行中光域未随对话框轴线移动')
  conversationRect = { width: 800, height: 700, top: 0, left: 320 }
  dispatchWindowEvent('transitionend', { propertyName: 'transform' })
  sessionA.set({ running: false })
  const settledXs = xValues()
  if (spreadOf(settledXs) > 20 && spreadOf(settledXs) < 30 && Math.abs(centerOf(settledXs) - dialogCenter) < 0.1) pass('任务结束后恢复对话框范围分布与中轴')
  else fail('任务结束后光点未收回对话框范围')
  glowSelect.props.onChange({ target: { value: 'off' } })
  if (!activeConversationRoot.children.some((child) => child.hasAttribute('data-endfield-bottom-glow-layer'))) pass('关闭泛光后移除 DOM 层')
  else fail('关闭泛光后仍残留泛光元素')
}
const onBtn = walk(tree).filter((n) => n.type === 'button').find((b) => /开启大字/.test(textOf(b)))
if (!onBtn) { fail('no 开启大字 button to click'); process.exit(1) }
try { onBtn.props.onClick() } catch (e) { fail('开启大字 click threw: ' + e.message); process.exit(1) }
pass('通过设置行开启雷霆大字')

/* Turning it on previews the word once, by design. Clear that before measuring
   edges, so a preview can never be mistaken for an announcement. */
advance(3000)
if (shownWord() === null) pass('预览在 3 秒后自动消失')
else fail('the enable-preview never went away: ' + shownWord())

if (sessionA.subscriberCount === 1) pass('开启后订阅当前会话一次')
else fail('expected exactly 1 subscriber after enabling, got ' + sessionA.subscriberCount)

/* --- 3. THE EDGE: false -> true announces 任务开始 --- */
sessionA.set({ running: true })
if (shownWord() === '任务开始') pass('任务开始时显示「任务开始」')
else fail('expected 任务开始, got ' + JSON.stringify(shownWord()))
if (plates().length === 1) pass('屏幕上只有一块大字')
else fail('expected exactly 1 plate, found ' + plates().length)

/* The plate sits ON TOP of text the user may be mid-sentence in, for 3 seconds,
   and it is pure decoration. So it must be hidden from assistive technology (the
   word is not information a screen-reader user needs read aloud over the
   conversation) — the CSS half of that contract, pointer-events, is asserted in
   the stylesheet check below. */
if (plates()[0].getAttribute('aria-hidden') === 'true') pass('大字对辅助技术隐藏（纯装饰）')
else fail('the plate is not aria-hidden — a decorative overlay would be announced')

/* --- 3b. 入场动画默认关闭 ---
   The animation is its own opt-in switch. With it unset the plate must carry the
   still marker, which is what the stylesheet keys `animation: none; opacity: 1` off
   — i.e. the word appears instantly instead of slamming in. Asserted on the DOM
   because a stylesheet-only check could not tell the two states apart. */
if (plates()[0].hasAttribute('data-endfield-thunder-still')) pass('入场动画默认关闭：大字带静态标记（直接显示）')
else fail('the animation switch is unset, so the plate must carry data-endfield-thunder-still')

/* --- 4. LEVEL vs EDGE: a stream of publishes at the same running value (what a
       turn actually produces, dozens of times a second) must not re-announce.
       Measured by replacing the plate: if the code re-announced, the plate would
       be rebuilt and the 3s clock would restart. --- */
const plateBefore = plates()[0]
for (let i = 0; i < 25; i++) { sessionA.ping(); sessionA.set({ running: true }) }
if (plates()[0] === plateBefore && plates().length === 1) pass('同一状态的连续推送不重复播报（读的是边沿不是电平）')
else fail('a same-value publish re-announced — the code is reading a level, not an edge')

/* An unrelated LIST publish (a title change, a job row, a sidebar refresh) also
   arrives mid-turn. It must not disturb the plate or lose the pending edge.
   Honest scope: the rebind fast-path this exercises is a COST guard, not an
   edge-correctness one (a reseed would be synchronous and land on the same
   value), so this asserts the observable outcome rather than claiming the
   fast-path is what saves the edge. */
for (let i = 0; i < 5; i++) list.ping()
if (plates()[0] === plateBefore) pass('无关的列表推送不会重建大字')
else fail('a list publish rebuilt the plate')
sessionA.set({ running: false })
if (shownWord() === '任务完成') pass('列表推送后仍能捕获进行中的任务完成边沿')
else fail('a list publish swallowed the in-flight edge, got ' + JSON.stringify(shownWord()))
sessionA.set({ running: true })
advance(3000)

/* --- 5. the 3s hold, asserted on the clock rather than waited out.
       Announces a fresh edge first, so the window is measured from a known t=0
       instead of from whatever the previous section left on screen. --- */
sessionA.set({ running: false })
if (shownWord() === '任务完成') pass('新的边沿开始一次干净的计时')
else fail('failed to set up the hold measurement, got ' + JSON.stringify(shownWord()))
advance(2999)
if (shownWord() === '任务完成') pass('2999ms 时大字仍在')
else fail('the plate vanished before 3s: ' + JSON.stringify(shownWord()))
advance(1)
if (shownWord() === null) pass('3000ms 时大字已隐藏')
else fail('the plate outlived its 3s hold: ' + JSON.stringify(shownWord()))

/* --- 5b. 入场动画开启后：静态标记消失，且 3 秒时长不变 ---
   The animation switch must change ONLY the entry treatment. The hold is owned by a
   JS timer, not by the keyframes, so turning the animation on must not shorten or
   lengthen the 3s — a regression that would be easy to introduce by tying the
   removal to an animation end event. */
prefStore.setField('thunderAnim', '1')
sessionA.set({ running: true })
if (shownWord() === '任务开始') pass('开启入场动画后仍正常播报')
else fail('expected 任务开始 with the animation on, got ' + JSON.stringify(shownWord()))
if (!plates()[0].hasAttribute('data-endfield-thunder-still')) pass('入场动画开启：不带静态标记（走动画分支）')
else fail('with the animation on the plate must NOT carry data-endfield-thunder-still')
advance(2999)
if (shownWord() === '任务开始') pass('动画开启时 2999ms 仍在（时长不受动画影响）')
else fail('the animated plate vanished early: ' + JSON.stringify(shownWord()))
advance(1)
if (shownWord() === null) pass('动画开启时 3000ms 已隐藏')
else fail('the animated plate outlived its 3s hold')

/* The OS preference must still win over an enabled switch, exactly as the contour
   animation does — otherwise the switch would silently override an accessibility
   setting. matchMedia is swapped to report the preference for this one check. */
const realMatchMedia = sandbox.window.matchMedia
sandbox.window.matchMedia = () => ({ matches: true })
sessionA.set({ running: false })
if (shownWord() === '任务完成') pass('减少动态效果下仍然播报')
else fail('expected 任务完成 under reduced motion, got ' + JSON.stringify(shownWord()))
if (plates()[0].hasAttribute('data-endfield-thunder-still')) pass('系统「减少动态效果」覆盖已开启的动画开关')
else fail('reduced motion must force the still path even with the animation switch on')
sandbox.window.matchMedia = realMatchMedia
advance(3000)
prefStore.setField('thunderAnim', '0')

/* --- 6. the other edge: false -> true announces 任务开始 --- */
sessionA.set({ running: true })
if (shownWord() === '任务开始') pass('任务重新开始时显示「任务开始」')
else fail('expected 任务开始, got ' + JSON.stringify(shownWord()))
/* It must be WHITE and BOLD and LARGE — the three adjectives the request is
   made of. The glyph colour cannot come from a token here: label-primary is ink
   in light mode, so a token would print the word near-black on cream. The style
   itself is asserted against the stylesheet in section 12. */
const word = plates()[0].children.find((c) => c.hasAttribute('data-endfield-thunder-word'))
if (word) pass('大字有独立的 word 节点（样式钩子存在）')
else fail('no [data-endfield-thunder-word] node inside the plate')
advance(3000)
// Leave the session idle so the next section's switch is a clean baseline case.
sessionA.set({ running: false })
advance(3000)

/* --- 7. a turn already running when the user ARRIVES is not a new turn ---
       Switching to a session whose turn is in flight must stay silent: the
       first value read from any session is a baseline, not an edge. --- */
sessionB.set({ running: true })
list.set({ current: 'session-b' })
if (shownWord() === null) pass('切换到「已在运行」的会话不误报任务开始')
else fail('switching into a running session announced: ' + shownWord())
// ...but its completion IS a real edge the user should see.
sessionB.set({ running: false })
if (shownWord() === '任务完成') pass('该会话结束时仍正常播报「任务完成」')
else fail('expected 任务完成 after the switched-to session finished, got ' + JSON.stringify(shownWord()))
advance(3000)

/* The session we navigated away from must have been released, or an edge in a
   background session would announce over the one the user is looking at. */
if (sessionA.subscriberCount === 0) pass('离开的会话已退订')
else fail('the previous session still has ' + sessionA.subscriberCount + ' subscriber(s)')
sessionA.set({ running: true })
if (shownWord() === null) pass('后台会话的状态变化不会播报')
else fail('a background session announced: ' + shownWord())

/* --- 8. switching the THEME off (not the feature) must also stop announcing ---
       Distinct from the fiber teardown below: the run stays alive here, only the
       master switch flips. The announcement plate is styled entirely by the
       stylesheet unmount() removes, so a word left on screen would become an
       unstyled block in the document flow.

       Each click needs a FRESH render: the recording React stub returns the state
       it read at render time with a no-op setter, so reusing one button element
       would re-run the same stale branch and toggle the theme off twice. */
const clickByLabel = (re, what) => {
  let t
  try { t = rendered() } catch (e) { fail(what + ' re-render threw: ' + e.message); return false }
  const btn = walk(t).filter((n) => n.type === 'button').find((b) => re.test(textOf(b)))
  if (!btn || typeof btn.props.onClick !== 'function') { fail('no ' + what + ' button rendered'); return false }
  try { btn.props.onClick() } catch (e) { fail(what + ' click threw: ' + e.message); return false }
  return true
}

sessionB.set({ running: true })
advance(10)
if (clickByLabel(/关闭主题/, '关闭主题')) {
  if (plates().length === 0) pass('关闭主题时移除在显示的大字')
  else fail('switching the theme off left ' + plates().length + ' plate(s) on screen')
  if (sessionB.subscriberCount === 0) pass('关闭主题时退订会话（主开关也是总闸）')
  else fail('theme off, but the session still has ' + sessionB.subscriberCount + ' subscriber(s)')
  sessionB.set({ running: false })
  if (shownWord() === null) pass('关闭主题后任务边沿不再播报')
  else fail('an edge announced while the theme was off: ' + shownWord())
}
// Back on: the feature must resume rather than stay dead until a reload.
if (clickByLabel(/开启主题/, '开启主题')) {
  if (sessionB.subscriberCount === 1) pass('重新开启主题后恢复订阅')
  else fail('re-enabling the theme did not resubscribe (got ' + sessionB.subscriberCount + ')')
  sessionB.set({ running: true })
  if (shownWord() === '任务开始') pass('重新开启主题后正常播报')
  else fail('expected 任务开始 after re-enabling, got ' + JSON.stringify(shownWord()))
  advance(3000)
}

/* --- 9. a session that is not readable at bind time must not announce on its
       first readable value. This is the baseline guard's real job: the seed read
       can fail (a face staged before its window opens) while subscribe still
       succeeds, so `prev === null` is a live state, not a theoretical one. --- */
const flaky = (() => {
  let state = null
  const subs = new Set()
  return {
    getSnapshot: () => { if (state === null) throw new Error('window not open yet'); return state },
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn) } },
    set(next) { state = next; for (const fn of [...subs]) fn() },
    get subscriberCount() { return subs.size },
  }
})()
sessions.binding = (id) => {
  if (id === 'session-a') return { sessionId: id, session: sessionA }
  if (id === 'session-b') return { sessionId: id, session: sessionB }
  if (id === 'session-flaky') return { sessionId: id, session: flaky }
  return undefined
}
list.set({ current: 'session-flaky' })
if (flaky.subscriberCount === 1) pass('快照暂不可读的会话仍会被订阅')
else fail('expected the unreadable session to be subscribed, got ' + flaky.subscriberCount)
flaky.set({ running: true })
if (shownWord() === null) pass('首个可读值为基线，不误报任务开始')
else fail('the first readable value announced: ' + shownWord())
flaky.set({ running: false })
if (shownWord() === '任务完成') pass('其后的真实边沿正常播报')
else fail('expected 任务完成 after a real edge, got ' + JSON.stringify(shownWord()))
advance(3000)

/* --- 10. fiber teardown must release everything --- */
if (typeof teardown !== 'function') fail('apply() registered no ctx.effect teardown')
else {
  flaky.set({ running: true })
  advance(3000)
  teardown()
  if (flaky.subscriberCount === 0 && list.subscriberCount === 0) pass('销毁时释放全部订阅')
  else fail('teardown left subscriptions: session=' + flaky.subscriberCount + ' list=' + list.subscriberCount)
  if (plates().length === 0) pass('销毁时移除残留大字')
  else fail('teardown left ' + plates().length + ' plate(s) in the document')
  flaky.set({ running: false })
  if (shownWord() === null) pass('销毁后不再播报')
  else fail('an edge after teardown still announced: ' + shownWord())
}

/* --- 11. a missing sessions service must not break the theme ---
   NOTE on `__dshThemeEndfieldApplied`: client.js returns immediately from apply()
   when that flag is already on the window, so a fresh sandbox MUST NOT inherit it.
   `{ ...sandbox }` copies the window reference's own properties, so the flag has to
   be cleared explicitly — without this both this case and 11b passed while apply()
   was in fact returning at its first line (measured: silently vacuous). */
let loaded2 = null
const sandbox2 = { ...sandbox }
sandbox2.globalThis = sandbox2
sandbox2.window = { ...sandbox.window, __ModuleLoader__: { load: (m) => { loaded2 = m } } }
delete sandbox2.window.__dshThemeEndfieldApplied
sandbox2.window.document = document
vm.createContext(sandbox2)
new vm.Script(src, { filename: 'client.js' }).runInContext(sandbox2)
const mod2 = loaded2.factory(() => null)
const pref2 = makePrefStore({ thunder: '1' })
try {
  mod2.apply({
    get: (n) => {
      if (n === 'theme') return { overrideTokens: () => () => {} }
      if (n === 'settingsScope') return pref2.binder
      return undefined
    },
    effect: () => {},
  })
  pass('无 sessions 服务时主题仍正常挂载（开关在但不播报）')
} catch (e) {
  fail('apply() threw without a sessions service: ' + e.message)
}

/* --- 11b. the sessions service arriving LATE must still be picked up ---
   This is a real race, not a hypothetical: the web boot mounts every plugin row
   concurrently (Promise.all over the manifest in dsh-web-frontend) and this theme
   declares no `inject`, so apply() can run before dsh-client-runtime has provided
   `sessions`. Caching the lookup once at apply() time left the feature permanently
   dead on those loads — the bug this asserts against. */
let loaded3 = null
const lateSessionA = makeObservable({ running: false })
const lateList = makeObservable({ current: 'session-a' })
let lateService // deliberately undefined at apply() time
const sandbox3 = { ...sandbox }
sandbox3.globalThis = sandbox3
sandbox3.window = { ...sandbox.window, __ModuleLoader__: { load: (m) => { loaded3 = m } } }
// See the note in 11: without this, apply() returns at its first line and the
// whole case is vacuous.
delete sandbox3.window.__dshThemeEndfieldApplied
sandbox3.window.document = document
vm.createContext(sandbox3)
new vm.Script(src, { filename: 'client.js' }).runInContext(sandbox3)
const mod3 = loaded3.factory(() => null)
// Thunder must be ON for the late-session announce below; enabled is the default.
const pref3 = makePrefStore({ thunder: '1' })
try {
  mod3.apply({
    get: (n) => {
      if (n === 'theme') return { overrideTokens: () => () => {} }
      if (n === 'sessions') return lateService
      if (n === 'settingsScope') return pref3.binder
      return undefined
    },
    effect: () => {},
  })
  pass('sessions 尚未就绪时 apply() 不抛错')
} catch (e) {
  fail('apply() threw while sessions was still pending: ' + e.message)
}
// The service appears a moment later, exactly as a concurrent plugin mount would.
lateService = {
  list: lateList,
  binding: (id) => (id === 'session-a' ? { sessionId: id, session: lateSessionA } : undefined),
}
advance(500)
if (lateSessionA.subscriberCount === 1) pass('服务迟到后仍会自动接上（重试生效）')
else fail('a late-arriving sessions service was never picked up (subscribers=' + lateSessionA.subscriberCount + ')')
lateSessionA.set({ running: true })
if (shownWord() === '任务开始') pass('服务迟到后仍能正常播报')
else fail('expected 任务开始 after the service arrived late, got ' + JSON.stringify(shownWord()))
advance(3000)

/* --- 12. the stylesheet contract behind the three adjectives in the request ---
   「大字」是粗体、醒目的大号的白色文字. Those are visual facts a DOM assertion
   cannot see (no layout in this harness), and they are exactly the kind of thing a
   later refactor drops silently, so they are asserted against the stylesheet
   source. The 12 rules below are the minimum that makes the plate a centred,
   non-blocking, white, heavy, viewport-scaled overlay. */
/* Slice from the plate's first rule to the end of the stylesheet literal, rather
   than a fixed byte count: a hardcoded window silently stopped reaching the
   reduced-motion block the moment the section's comments grew, which reported a
   MISSING rule that was in fact present two lines further down. */
const sheetAt = src.indexOf('[data-endfield-thunder] {')
const sheetEnd = sheetAt < 0 ? -1 : src.indexOf('`)', sheetAt)
const sheet = (sheetAt < 0 || sheetEnd < 0) ? '' : src.slice(sheetAt, sheetEnd)
if (sheet === '') fail('could not locate the 雷霆大字 stylesheet block')
const need = [
  [/position:\s*fixed/, '固定定位（不随滚动移动）'],
  [/inset:\s*0/, '铺满视口（用于居中）'],
  [/align-items:\s*center/, '垂直居中'],
  [/justify-content:\s*center/, '水平居中'],
  [/pointer-events:\s*none/, '不拦截点击/选择（叠在正文之上必须可穿透）'],
  [/font-weight:\s*900/, '粗体（900）'],
  [/font-size:\s*clamp\(/, '大号且随视口缩放（clamp）'],
  [/color:\s*#fff\b/, '白色文字（字面值，不用会在亮色模式变墨黑的令牌）'],
  [/text-shadow:/, '墨色描边/阴影（白字在奶油纸底上的可读性）'],
  [/z-index:\s*21474/, '高层级（盖住应用界面）'],
  [/@keyframes\s+endfield-thunder-word/, '入场/退场动画'],
  [/prefers-reduced-motion/, '尊重「减少动态效果」'],
  /* The still path is the DEFAULT state, so its rule matters more than the animated
     one. `opacity: 1` inside it is the load-bearing half: the animated rules start
     at opacity 0, so cancelling only `animation` would leave an invisible plate. */
  [/\[data-endfield-thunder-still\][\s\S]{0,200}?animation:\s*none/, '静态分支取消动画（默认状态）'],
  [/\[data-endfield-thunder-still\][\s\S]{0,240}?opacity:\s*1/, '静态分支强制 opacity:1（否则默认状态全透明）'],
]
for (const [re, what] of need) {
  if (re.test(sheet)) pass('样式契约：' + what)
  else fail('样式契约缺失：' + what + ' (' + re + ')')
}
/* The boot plate must still win the screen it owns: it is the one surface that
   legitimately covers everything, so the announcement has to sit BELOW it. */
const zThunder = (sheet.match(/z-index:\s*(\d+)/) || [])[1]
const zLoader = (src.match(/\[data-endfield-loader\]\s*\{[\s\S]{0,400}?z-index:\s*(\d+)/) || [])[1]
if (zThunder && zLoader && Number(zThunder) < Number(zLoader)) {
  pass('层级低于启动加载屏（' + zThunder + ' < ' + zLoader + '）')
} else {
  fail('the announcement must sit below the boot plate (thunder=' + zThunder + ' loader=' + zLoader + ')')
}

/* The ambient layer's stylesheet is part of the task-state contract: it must mix
   by brightening, live between the contour sheet and content, and move faster when
   the runtime running bit is true. */
const glowCssAt = src.indexOf('[class$=\'_root\']:has(> [data-endfield-bottom-glow-layer])')
const glowCssEnd = glowCssAt < 0 ? -1 : src.indexOf('/* Brand wordmark HARNESS chip', glowCssAt)
const glowCss = (glowCssAt < 0 || glowCssEnd < 0) ? '' : src.slice(glowCssAt, glowCssEnd)
if (glowCss.includes('position: relative; z-index: 0') && glowCss.includes('z-index: -1')
    && !glowCss.includes('isolation: isolate')
    && src.includes('backdrop-filter: blur(var(--edge-glass-blur))')) pass('泛光负层不创建 isolation，保留输入框磨砂取样')
else fail('泛光堆叠规则可能隔断输入框 backdrop-filter')
if (src.includes('glowRandomBetween(65, 115)') && src.includes('glowRandomBetween(150, 230)')
    && glowCss.includes('height: clamp(150px, 22vh, 250px)')
    && glowCss.includes('height: clamp(260px, 40vh, 420px)')) pass('闲置光效矮小，运行态高度约为两倍')
else fail('空闲/运行高度差异没有达到约两倍')
if (src.includes('glowRandomBetween(220, 580)') && src.includes('source.__endfieldAxisOffset')
    && src.includes('(rect.width / viewportWidth) * 45') && src.includes('Math.max(90, idleSpan * 2)')
    && src.includes('const getBottomGlowAnchor = () => bottomGlowHost')) pass('闲置光域聚拢于对话框中轴，运行态沿同一轴线向两侧至少扩散 90%')
else fail('闲置光域或运行扩散未以对话框中轴为共同中心')
if (!/mix-blend-mode:\s*lighten/.test(glowCss) && glowCss.includes('color-mix(in srgb, var(--endfield-glow-source-color)')
    && glowCss.includes('opacity: var(--endfield-bottom-glow-opacity')) pass('光源以普通透明合成避免建立 backdrop root，输入框模糊可采样其后层')
else fail('泛光混合可能再次隔断 backdrop-filter 的背景取样')
if (glowCss.includes('[data-endfield-glow-source]') && glowCss.includes('position: fixed')
    && glowCss.includes('left: 0; right: 0; bottom: 0')
    && !glowCss.includes('mask-image:') && !glowCss.includes('overflow: hidden')) pass('无裁切边界的透明视口层，running 可覆盖全屏底部')
else fail('泛光容器仍有限宽裁切或缺少全视口定位')
if (glowCss.includes('transform-origin: center bottom') && glowCss.includes('left: var(--glow-source-x); bottom: 0;')
    && glowCss.includes('transform: translateX(-50%) scale') && !glowCss.includes('translateY(')) pass('中心光点固定于视口底线，动画不做垂直上漂')
else fail('中心光点可能离开视口底线')
if (glowCss.includes('animation: endfield-center-glow-breathe') && glowCss.includes('--glow-source-opacity-high')
    && glowCss.includes('--glow-source-scale-high') && !glowCss.includes('filter:') && !glowCss.includes('will-change')) pass('中心光只动画 opacity/scale，避免重滤镜和多余合成层')
else fail('中心光动画没有采用低成本渲染路径')
if (glowCss.includes('radial-gradient(ellipse 44% 95% at 50% 100%') && glowCss.includes('transparent 100%')) pass('每个中心光按椭圆范围渐隐，不留下矩形色块')
else fail('中心光缺少椭圆渐隐，可能露出矩形边界')
if (src.includes('glowRandomBetween(3.5, 7)') && src.includes('glowRandomBetween(1.8, 3.4)')
    && src.includes('glowRandomBetween(0.65, 0.82, 2)') && src.includes('glowRandomBetween(1.18, 1.35, 2)')) pass('呼吸周期缩短并扩大缩放幅度，运动可辨')
else fail('中心光呼吸周期仍慢或缩放幅度过小')
if (glowCss.includes("data-dispersion='true'") && glowCss.includes('background-image: radial-gradient')) pass('可选色散仍使用柔和的中心扩散')
else fail('中心光色散开关缺失')
if (src.includes('BOTTOM_GLOW_SOURCE_COUNT = 30') && src.includes('getBoundingClientRect()')
    && src.includes('dialogCenter') && src.includes('__endfieldAxisOffset')
    && src.includes('const getBottomGlowAnchor = () => bottomGlowHost')) pass('默认 30 个光源两态均依据活动对话框几何聚中')
else fail('未使用活动对话框边界定位中心光，或默认数量不是 30')
if (src.includes('glowRandomBetween(5, 86) + \'%\'') && src.includes('ease-in-out infinite')
    && !src.includes('setInterval(rerollBottomGlowColor')) pass('每个中心光颜色固定取主题色至白色范围，不再定时跳色')
else fail('中心光颜色抽样范围错误，或仍有定时跳色')
if (glowCss.includes('calc(100% - var(--glow-source-tint))')
    && src.includes('body.theme-endfield-wuling[data-endfield-bottom-glow]')) pass('中心光颜色绑定对应主题色到白色渐变')
else fail('颜色范围未绑定主题强调色与白色')

console.log('')
if (failures) { console.error(failures + ' 雷霆大字 check(s) failed'); process.exit(1) }
console.log('all 雷霆大字 edge checks passed')
