/**
 * bloom.test.js — 输入框泛光 must BE the input box's rectangle, and its four levels
 * must behave.
 *
 * This is the test for the two things a screenshot cannot hold still: that the light's
 * shape is DERIVED from the card (so it survives the composer growing a row, which the
 * retired ellipse did not), and that the level ladder multiplies a base the palette and
 * the colour scheme each own.
 *
 * It runs the real client.js in a real browser over a hand-built hero skeleton (real
 * module suffixes, because every theme rule matches on those), and drives the level
 * through the settings seam exactly as the settings row does — no simulated attribute.
 *
 * Usage: node test/bloom.test.js
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { launch } = require('./fixtures/chrome-cdp.js')
const { BROWSER_SETTINGS_SCOPE_SNIPPET } = require('./fixtures/settings-scope.browser.js')

const ROOT = path.resolve(__dirname, '..')
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'bloom-'))

/* The hero skeleton. `loneCard` is a second composer card OUTSIDE the hero wrapper:
   the bloom is hero-scoped on purpose, so it must stay dark there. */
const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body,#root{height:100%;margin:0}
[class*='_frame']{display:grid;grid-template-columns:200px minmax(0,1fr);height:100%;position:relative;overflow:hidden}
[class$='_sidebarCol']{background:#181a18}
[class$='_centerCol']{display:flex;flex-direction:column;overflow:hidden}
.Dc7zOa_root{display:flex;flex-direction:column;height:100%;position:relative;
  background:var(--dsw-alias-bg-base)}
.Dc7zOa_scrollBody{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;overflow-y:auto}
.Dc7zOa_composerHero{width:600px;align-self:center;z-index:1;position:relative;padding-bottom:32px}
.Hqq_root{display:flex;justify-content:center;padding:0 24px;font-size:26px;line-height:32px}
.card{flex:none;height:115px;position:relative;border:.5px solid #343633;background:#1e201d}
</style></head><body><div id="root"><div class="T_frame"><div class="T_sidebarCol"></div>
<div class="T_centerCol"><div class="Dc7zOa_root" data-phase="hero"><div class="Dc7zOa_scrollBody">
<div class="Dc7zOa_composerHero"><div class="Hqq_root">探索未至之境</div>
<div class="card" id="heroCard" data-composer-card></div></div>
<div class="card" id="loneCard" data-composer-card></div>
</div></div></div></div></div>
<script>window.__ModuleLoader__={load:(m)=>{window.__MOD__=m}}</script>
<script src="./client.js"></script>
<script>
  ${BROWSER_SETTINGS_SCOPE_SNIPPET}
  var __prefs = __endfieldSettingsScope({ enabled:'1', loader:'0', contour:'0', watermark:'0', glass:'off', composerGlow:'standard' })
  window.__MOD__.factory(()=>null).apply({
    get: (n) => n === 'theme' ? { overrideTokens: () => () => {} } : (n === 'settingsScope' ? __prefs.binder : undefined),
    effect: (f) => f(),
  })

  const card = (sel) => document.querySelector(sel)
  window.__bloom = () => {
    const hero = card('#heroCard'), lone = card('#loneCard')
    const cs = getComputedStyle(hero, '::before')
    const cr = hero.getBoundingClientRect()
    const alphas = []
    for (const m of String(cs.boxShadow).matchAll(/rgba?\\(([^)]+)\\)/g)) {
      const parts = m[1].split(',').map((v) => v.trim())
      alphas.push(parts.length > 3 ? Number(parts[3]) : 1)
    }
    const sb = document.querySelector('[class$="_scrollBody"]')
    return {
      attr: document.body.getAttribute('data-endfield-glow'),
      content: cs.content,
      inset: cs.inset,
      zIndex: cs.zIndex,
      radius: cs.borderRadius,
      pseudo: { w: Math.round(parseFloat(cs.width) || 0), h: Math.round(parseFloat(cs.height) || 0) },
      card: { w: Math.round(cr.width), h: Math.round(cr.height), radius: getComputedStyle(hero).borderRadius },
      alphas,
      loneContent: getComputedStyle(lone, '::before').content,
      overflow: { x: sb.scrollWidth - sb.clientWidth, y: sb.scrollHeight - sb.clientHeight },
    }
  }
  window.__setLevel = (v) => __prefs.setItem('dsh-theme-endfield-composer-glow', v)
  window.__setCardHeight = (h) => { document.getElementById('heroCard').style.height = h + 'px' }
  window.__setDark = (d) => d ? document.body.setAttribute('data-ds-dark-theme','') : document.body.removeAttribute('data-ds-dark-theme')
  window.__setPalette = (p) => __prefs.setItem('dsh-theme-endfield-palette', p)
<\/script></body></html>`

fs.writeFileSync(path.join(OUT, 'bloom.html'), HTML)
fs.copyFileSync(path.join(ROOT, 'client.js'), path.join(OUT, 'client.js'))

const BASE = { light: { valley: 0.15, wuling: 0.15 }, dark: { valley: 0.10, wuling: 0.09 } }
let checks = 0
const ok = (msg) => { checks++; console.log('ok    ' + msg) }

;(async () => {
  const browser = await launch()
  try {
    await browser.send('Page.navigate', { url: 'file:///' + path.join(OUT, 'bloom.html').replace(/\\/g, '/') })
    await browser.until('typeof window.__bloom === "function" && document.querySelector("#heroCard") !== null')
    const report = async () => JSON.parse(await browser.evaluate('JSON.stringify(window.__bloom())'))
    const setLevel = (v) => browser.evaluate(`window.__setLevel(${JSON.stringify(v)})`)

    /* --- 1. the shipped default --- */
    {
      const r = await report()
      assert.equal(r.attr, 'standard', 'the shipped default must be the standard level')
      assert.equal(r.content, '""', 'the bloom pseudo-element must exist at the default level')
      assert.equal(r.inset, '0px', 'the bloom must be inset:0 against the card')
      assert.equal(r.zIndex, '-1', 'the bloom must paint behind the card')
      /* `inset: 0` resolves against the card's PADDING box, so the 0.5px borders sit
         outside it: the pseudo is allowed to be up to the border width smaller than the
         card's rect. Anything larger than that is a pseudo that is not the card's box. */
      assert.ok(Math.abs(r.pseudo.h - r.card.h) <= 2,
        `pseudo height ${r.pseudo.h} is not the card's height ${r.card.h}`)
      assert.ok(Math.abs(r.pseudo.w - r.card.w) <= 2,
        `pseudo width ${r.pseudo.w} is not the card's width ${r.card.w}`)
      assert.equal(r.radius, r.card.radius, 'the bloom must inherit the card\'s corner')
      ok(`bloom is the card's own box (${r.card.w}x${r.card.h}, inset 0, z-index -1, radius ${r.radius})`)
    }

    /* --- 2. THE shape promise: it follows the card when the composer grows --- */
    {
      const before = await report()
      await browser.evaluate('window.__setCardHeight(300)')
      const r = await report()
      assert.equal(r.card.h, 302, 'the test set the card to 300px of content (plus its borders)')
      assert.ok(Math.abs(r.pseudo.h - 300) <= 2,
        `after growing the card the bloom is ${r.pseudo.h}px, not ~300px`)
      assert.equal(r.pseudo.h - before.pseudo.h, r.card.h - before.card.h,
        'the bloom must grow by exactly as much as the card did')
      assert.ok(Math.abs(r.pseudo.w - r.card.w) <= 2, 'width must still match after the card grew')
      ok('the bloom tracks the card (115px card -> 300px card, bloom follows exactly), which '
        + 'the retired ellipse could not: it was placed by hand-measured numbers')
      await browser.evaluate('window.__setCardHeight(115)')
    }

    /* --- 3. the ladder, in both schemes, for both palettes --- */
    /* Colour channels are 8-BIT, so the alpha read back from a computed colour is
       quantised to 1/255: 0.09 x 0.5 = 0.045 resolves to 11/255 and serialises as
       0.043. The assertion is therefore "the ladder multiplier is what got applied",
       within one 8-bit step — float equality would fail on a correct implementation,
       which is what this test did before the quantisation was understood. */
    const Q = 1 / 255
    for (const dark of [false, true]) {
      for (const palette of ['valley', 'wuling']) {
        await browser.evaluate(`window.__setDark(${dark});window.__setPalette(${JSON.stringify(palette)})`)
        const base = BASE[dark ? 'dark' : 'light'][palette]
        const seen = {}
        for (const level of ['soft', 'standard', 'strong']) {
          await setLevel(level)
          const r = await report()
          assert.equal(r.attr, level, 'the row must write the attribute for ' + level)
          assert.ok(r.alphas.length >= 3, 'the bloom must be a layered shadow (got ' + JSON.stringify(r.alphas) + ')')
          seen[level] = r.alphas[0]
          const target = base * { soft: 0.5, standard: 1, strong: 1.75 }[level]
          assert.ok(Math.abs(r.alphas[0] - target) <= Q + 1e-3,
            `alpha for ${level} is ${r.alphas[0]}, expected ${base} x ${target / base} = ${target}`)
        }
        assert.ok(seen.soft < seen.standard && seen.standard < seen.strong,
          'the ladder must increase: ' + JSON.stringify(seen))
        assert.ok(Math.abs(seen.standard - base) <= Q + 1e-3,
          `the standard level is ${seen.standard}, not the palette/scheme base ${base}`)
        ok(`${dark ? 'dark' : 'light'} · ${palette}: base ${base} -> ${seen.soft} / ${seen.standard} / ${seen.strong} (increasing)`)
      }
    }

    /* --- 4. off removes the pseudo, it does not paint a transparent one --- */
    {
      await browser.evaluate('window.__setDark(false);window.__setPalette("valley")')
      await setLevel('off')
      const r = await report()
      assert.equal(r.attr, null, 'off must remove the body attribute')
      assert.equal(r.content, 'none', 'off must leave no pseudo-element at all')
      assert.equal(r.alphas.length, 0, 'off must paint no shadow')
      ok('off removes the attribute and the pseudo-element (no transparent layer is painted)')
    }

    /* --- 5. hero-scoped: a composer outside the hero gets no bloom --- */
    {
      await setLevel('standard')
      const r = await report()
      assert.equal(r.loneContent, 'none', 'a composer card outside the hero must not bloom')
      ok('the bloom is hero-scoped: a card outside composerHero has no pseudo-element')
    }

    /* --- 6. the widest blur must not add scroll overflow --- */
    {
      await setLevel('strong')
      const r = await report()
      assert.deepEqual(r.overflow, { x: 0, y: 0 }, 'the bloom must not create scrollable overflow')
      ok('strong adds no scrollable overflow (box-shadow ink is not scrollable overflow)')
    }

    assert.deepEqual(browser.errors, [], 'no page errors: ' + JSON.stringify(browser.errors))
    console.log('\nall ' + checks + ' bloom checks passed')
  } finally {
    await browser.close()
  }
})().catch((e) => { console.error('FAIL  ' + e.message); process.exitCode = 1 })
