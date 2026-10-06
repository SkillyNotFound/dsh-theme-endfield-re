/* Chrome (sidebar + Windows titlebar) regression guard, run in the real browser.
 *
 * The reported defects live one level below the surfaces glass.test.js asserts: the
 * sidebar column carried the frost correctly, but the sidebar's OWN surface painted an
 * opaque --dsw-specific-sidebar-fill on top of it, and the collapse control shared its
 * box with the logo row's brand mark. Both are invisible to a fixture that omits the
 * sidebar's inner markup, which is why this file builds the chrome from the host's own
 * shipped stylesheet instead of hand-written lookalikes.
 *
 * Run: node test/chrome-glass.test.js
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { launch } = require('./fixtures/chrome-cdp.js')
const { chromeHtml } = require('./fixtures/host-chrome.js')

const ROOT = path.resolve(__dirname, '..')
const alphas = { subtle: 0.22, standard: 0.34, strong: 0.46 }

/* Boot one page with the real host chrome + the theme's client bundle. */
async function bootChrome(browser, { dark = true, glass = 'standard', blur = 'standard', collapsed = false } = {}) {
  await browser.send('Page.navigate', { url: 'data:text/html,' + encodeURIComponent(chromeHtml({ dark, collapsed })) })
  await browser.until('document.querySelector("#toggle") !== null')
  await browser.evaluate(fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8'))
  const { BROWSER_SETTINGS_SCOPE_SNIPPET } = require('./fixtures/settings-scope.browser.js')
  await browser.evaluate(BROWSER_SETTINGS_SCOPE_SNIPPET + `
    window.__prefs = __endfieldSettingsScope({ enabled: '1', loader: '0', watermark: '0', contour: '1',
      glass: ${JSON.stringify(glass)}, 'glass-blur': ${JSON.stringify(blur)} });
    window.__disposers = [];
    window.__MOD__.factory(() => null).apply({
      get: n => n === 'settingsScope' ? __prefs.binder : n === 'theme' ? { overrideTokens: () => () => {} } : undefined,
      effect: f => { const d = f(); if (typeof d === 'function') __disposers.push(d); return d }
    })`)
  await browser.sleep(300)
}

;(async () => {
  const browser = await launch()
  try {
    for (const dark of [true, false]) {
      await bootChrome(browser, { dark })
      const attrs = await browser.evaluate(`JSON.stringify({
        glass: document.body.getAttribute('data-endfield-glass'),
        blur: document.body.getAttribute('data-endfield-glass-blur'),
        contour: document.querySelectorAll('[data-endfield-contour]').length })`)
      assert.match(attrs, /"glass":"standard"/, 'the frost attribute must be live (chrome fixture)')
      assert.match(attrs, /"contour":1/, 'the contour layer must be mounted: the frost is graded against it')

      /* THE DEFECT. The sidebar's own surface sits between the frosted column and the
         reader. Any opaque fill there and the column's work is invisible -- the whole
         band composites back to the page colour, which is exactly what the running
         desktop window showed (a single flat #101110 across 91% of the band). */
      const paint = await browser.evaluate(`(() => {
        const rgb = s => { s = String(s).trim()
          if (s.charAt(0) === '#') { let h = s.slice(1); if (h.length === 3) h = h.split('').map(c => c + c).join('')
            return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)] }
          return (s.match(/[\\d.]+/g) || []).map(Number).slice(0, 3) }
        const body = getComputedStyle(document.body)
        const base = rgb(body.getPropertyValue('--dsw-alias-bg-base'))
        const fill = rgb(body.getPropertyValue('--edge-glass-fill'))
        const alpha = Number(body.getPropertyValue('--edge-glass-alpha'))
        const root = document.querySelector('#sideRoot')
        const col = document.querySelector('#sideCol')
        const s = getComputedStyle(root)
        const L = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
        const comp = fill.map((v, i) => Math.round(base[i] * (1 - alpha) + v * alpha))
        return { rootBg: s.backgroundColor, rootAlpha: s.backgroundColor === 'rgba(0, 0, 0, 0)' ? 0 : 1,
                 colFilter: getComputedStyle(col).backdropFilter, colShadow: getComputedStyle(col).boxShadow,
                 dComp: Math.abs(L(comp) - L(base)), base, comp }
      })()`)
      assert.equal(paint.rootAlpha, 0,
        'the sidebar surface must not paint its own fill while the frost is on: ' + paint.rootBg +
        ' would composite straight back to the page colour and hide the frost, the contour and the boundary line')
      assert.match(paint.colFilter, /blur\(4px\)/, 'the sidebar column still carries the frost')
      assert.match(paint.colShadow, /inset/, 'the sidebar keeps its right-edge boundary line')
      assert.ok(paint.dComp >= 4,
        'the glass fill must composite clearly off the page colour (' + JSON.stringify(paint.comp) + ' vs ' + JSON.stringify(paint.base) + ')')

      /* The boundary line: painted, and separated from both neighbours. Without it the
         sidebar bleeds into the conversation column (the reported "no border"). */
      const edge = await browser.evaluate(`(() => {
        const col = document.querySelector('#sideCol')
        const r = col.getBoundingClientRect()
        const at = (x, y) => { const e = document.elementFromPoint(x, y); return e ? (e.id || e.className) : null }
        return { w: Math.round(r.width), right: Math.round(r.right),
                 inside: at(r.right - 2, r.height / 2), outside: at(r.right + 2, r.height / 2),
                 shadow: getComputedStyle(col).boxShadow }
      })()`)
      assert.ok(edge.w > 0 && edge.w < 400, 'the sidebar column keeps a sidebar-sized width (' + edge.w + ')')
      assert.notEqual(edge.inside, edge.outside, 'the sidebar must have a boundary: the column and the centre column are two regions')
      assert.match(edge.shadow, /-1px 0px 0px 0px inset/, 'the boundary is the column\'s own inset hairline')

      /* THE SECOND DEFECT. The collapse control is position:fixed at (12,6) in the
         viewport while the logo row lays the brand mark out from its own inset, so the
         two overlap and the 24px mark paints over the 28px control. Assert the control
         OWNS its box: no part of the brand mark may fall inside it, and the control must
         stay in place (the host's own geometry contract). */
      const corner = await browser.evaluate(`(() => {
        const t = document.querySelector('#toggle').getBoundingClientRect()
        const m = document.querySelector('#brandMark').getBoundingClientRect()
        const frame = document.querySelector('#frame').getBoundingClientRect()
        const cs0 = getComputedStyle(document.documentElement)
        const bandH = Number.parseFloat(cs0.getPropertyValue('--dsh-windows-titlebar-height'))
        const ox = Math.max(0, Math.min(t.right, m.right) - Math.max(t.left, m.left))
        const oy = Math.max(0, Math.min(t.bottom, m.bottom) - Math.max(t.top, m.top))
        const cs = getComputedStyle(document.querySelector('#toggle'))
        return { toggle: [Math.round(t.x), Math.round(t.y), Math.round(t.width), Math.round(t.height)],
                 mark: [Math.round(m.x), Math.round(m.y), Math.round(m.width), Math.round(m.height)],
                 overlap: ox * oy, position: cs.position, z: cs.zIndex, display: cs.display,
                 visibility: cs.visibility, opacity: cs.opacity,
                 band: [Math.round(frame.top), Math.round(frame.top + bandH)], bandH }
      })()`)
      assert.equal(corner.overlap, 0,
        'the collapse control must own its corner: the brand mark at ' + JSON.stringify(corner.mark) +
        ' still overlaps the control at ' + JSON.stringify(corner.toggle))
      /* THE CONTROL BELONGS TO THE TITLEBAR, not to the sidebar. The host declares it
         as a viewport-fixed control at (12,6) -- inside the band -- but this theme puts
         a backdrop-filter on the sidebar column, and a backdrop-filter ESTABLISHES A
         CONTAINING BLOCK for fixed descendants. The control silently inherits the
         column's origin instead of the viewport's, lands 40px lower (inside the
         sidebar, under the tab bar) and reads as "moved into the sidebar". Assert the
         RENDERED box, because the static box is what lies. */
      assert.ok(corner.toggle[1] >= corner.band[0] && corner.toggle[1] + corner.toggle[3] <= corner.band[1],
        'the collapse control must be painted inside the titlebar band ' + JSON.stringify(corner.band) +
        ', not in the sidebar: got y=' + corner.toggle[1] + ' h=' + corner.toggle[3])
      assert.equal(corner.position, 'fixed', 'the control stays fixed (the host positions it against the viewport)')
      assert.equal(corner.z, '30', 'the control keeps its own stacking level')
      assert.notEqual(corner.display, 'none', 'the control must be rendered')
      assert.equal(corner.opacity, '1', 'the control must not be faded out')

      /* Paint evidence, not just computed style: hide the control and count the pixels
         its box loses. A control that is painted but covered contributes nothing. */
      const shot1 = (await browser.send('Page.captureScreenshot', { format: 'png' })).data
      await browser.evaluate(`(() => { const s = document.createElement('style')
        s.id = 'probe-hide'; s.textContent = '#toggle{visibility:hidden !important}'; document.head.append(s) })()`)
      const shot2 = (await browser.send('Page.captureScreenshot', { format: 'png' })).data
      await browser.evaluate(`document.querySelector('#probe-hide').remove()`)
      const ink = await browser.evaluate(`(() => {
        const load = b => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + b })
        return Promise.all([load(${JSON.stringify(shot1)}), load(${JSON.stringify(shot2)})]).then(([a, b]) => {
          const c = document.createElement('canvas'), x = c.getContext('2d')
          c.width = a.width; c.height = a.height
          x.drawImage(a, 0, 0); const da = x.getImageData(0, 0, c.width, c.height).data
          x.clearRect(0, 0, c.width, c.height); x.drawImage(b, 0, 0)
          const db = x.getImageData(0, 0, c.width, c.height).data
          const r = document.querySelector('#toggle').getBoundingClientRect()
          const dpr = a.width / window.innerWidth
          let changed = 0, total = 0
          for (let py = Math.round(r.top * dpr); py < Math.round(r.bottom * dpr); py++)
            for (let px = Math.round(r.left * dpr); px < Math.round(r.right * dpr); px++) {
              const i = (py * c.width + px) * 4; total++
              if (Math.abs(da[i] - db[i]) + Math.abs(da[i+1] - db[i+1]) + Math.abs(da[i+2] - db[i+2]) > 24) changed++
            }
          return { changed, total }
        })
      })()`)
      assert.ok(ink.changed / ink.total > 0.02,
        'the collapse control must paint ink inside its own box (changed ' + ink.changed + ' of ' + ink.total + ')')

      /* The band is the same material as the column: same fill, same blur, and the
         control has to be able to paint over it (the column must not clip it away). */
      const chrome = await browser.evaluate(`(() => {
        const frame = document.querySelector('#frame')
        const band = getComputedStyle(frame, '::before')
        const col = getComputedStyle(document.querySelector('#sideCol'))
        const sheet = getComputedStyle(document.querySelector('[data-endfield-contour]'))
        return { bandBg: band.backgroundColor, colBg: col.backgroundColor,
                 bandFilter: band.backdropFilter, colFilter: col.backdropFilter,
                 bandZ: band.zIndex, bandImage: band.backgroundImage, colImage: col.backgroundImage,
                 sharedGlow: sheet.backgroundImage, colOverflow: col.overflow,
                 toggleTransform: getComputedStyle(document.querySelector('#toggle')).transform }
      })()`)
      assert.equal(chrome.bandBg, chrome.colBg, 'band and sidebar must paint one fill')
      assert.equal(chrome.bandFilter, chrome.colFilter, 'band and sidebar must carry the same blur')
      assert.equal(chrome.bandZ, '1', 'the band must paint above the contour sheet so its blur is visible')
      assert.match(chrome.sharedGlow, /radial-gradient\(/, 'one yellow glow belongs to the full-frame contour sheet')
      assert.equal((chrome.sharedGlow.match(/radial-gradient\(/g) || []).length, 1,
        'the contour sheet carries exactly one shared accent glow')
      assert.doesNotMatch(chrome.bandImage, /radial-gradient\(/, 'the band must not restart its own yellow glow')
      assert.doesNotMatch(chrome.colImage, /radial-gradient\(/, 'the sidebar must not restart its own yellow glow')
      assert.notEqual(chrome.colOverflow, 'hidden',
        'the column must not clip: the control paints above its box (containing block = the column)')
      assert.notEqual(chrome.toggleTransform, 'none',
        'the control is shifted back up by the band height (its containing block starts at the band\'s bottom edge)')

      /* A computed backdrop-filter is not evidence of blur. Compare actual band pixels
         with the same band at blur=off; the fixture supplies sharp 2px stripes underneath
         both surfaces, so a working filter visibly changes those pixels. */
      await browser.evaluate(`__prefs.setItem('dsh-theme-endfield-glass-blur', 'off')`)
      await browser.sleep(120)
      const noBlurShot = (await browser.send('Page.captureScreenshot', { format: 'png' })).data
      await browser.evaluate(`__prefs.setItem('dsh-theme-endfield-glass-blur', 'standard')`)
      await browser.sleep(120)
      const bandBlurPixels = await browser.evaluate(`(() => {
        const load = b => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + b })
        return Promise.all([load(${JSON.stringify(shot1)}), load(${JSON.stringify(noBlurShot)})]).then(([a,b]) => {
          const c=document.createElement('canvas'),x=c.getContext('2d');c.width=a.width;c.height=a.height
          x.drawImage(a,0,0);const da=x.getImageData(0,0,c.width,c.height).data
          x.clearRect(0,0,c.width,c.height);x.drawImage(b,0,0);const db=x.getImageData(0,0,c.width,c.height).data
          const dpr=a.width/window.innerWidth;let changed=0,total=0
          for(let py=Math.round(4*dpr);py<Math.round(36*dpr);py++)
            for(let px=Math.round(60*dpr);px<Math.round(220*dpr);px++){
              const i=(py*c.width+px)*4;total++
              if(Math.abs(da[i]-db[i])+Math.abs(da[i+1]-db[i+1])+Math.abs(da[i+2]-db[i+2])>18)changed++
            }
          return {changed,total}
        })
      })()`)
      assert.ok(bandBlurPixels.changed > bandBlurPixels.total * 0.03,
        'titlebar blur must alter real pixels over the sharp contour sheet, not merely appear in computed CSS (' + JSON.stringify(bandBlurPixels) + ')')

      /* THE OBSERVABLE. The frost is a translucent sheet: what is behind it has to show
         through, blurred. So the painted sidebar band must VARY -- a band that is one
         flat colour is the defect, whatever the computed styles say. Measured on the
         running desktop window the broken band was 93% one colour (#101110); with the
         fix the same band spreads ~30 luminance levels over hundreds of colours, the
         same order as the composer card that renders correctly. Sampled low in the
         column, clear of the brand row, the buttons and the session list. */
      const band = await browser.evaluate(`(() => {
        const load = b => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + b })
        return load(${JSON.stringify(shot1)}).then(img => {
          const c = document.createElement('canvas'), x = c.getContext('2d')
          c.width = img.width; c.height = img.height; x.drawImage(img, 0, 0)
          const dpr = img.width / window.innerWidth
          const col = document.querySelector('#sideCol').getBoundingClientRect()
          const x0 = Math.round(4 * dpr), x1 = Math.round((col.width - 8) * dpr)
          const y0 = Math.round((window.innerHeight * 0.72) * dpr), y1 = Math.round((window.innerHeight * 0.95) * dpr)
          const d = x.getImageData(x0, y0, x1 - x0, y1 - y0).data
          let min = 255, max = 0
          const seen = new Set()
          for (let i = 0; i < d.length; i += 4) {
            const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
            if (lum < min) min = lum
            if (lum > max) max = lum
            seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2])
          }
          return { spread: +(max - min).toFixed(2), distinct: seen.size, top: +(min).toFixed(1) }
        })
      })()`)
      assert.ok(band.spread >= 8,
        'the frost must let the sheet show through: the sidebar band varies by only ' +
        band.spread + ' luminance levels, i.e. it is painting a flat fill over the contour')
      assert.ok(band.distinct >= 50,
        'the sidebar band must carry a real material (' + band.distinct + ' distinct colours)')

      /* 磨砂模糊 must reach the sidebar band, and 强度 must move its opacity. */
      for (const [level, radius] of [['off', 0], ['soft', 2], ['standard', 4], ['heavy', 8]]) {
        await browser.evaluate(`__prefs.setItem('dsh-theme-endfield-glass-blur', ${JSON.stringify(level)})`)
        const got = await browser.evaluate(`getComputedStyle(document.querySelector('#sideCol')).backdropFilter`)
        assert.match(got, new RegExp('blur\\(' + radius + 'px\\)'), '磨砂模糊=' + level + ' must reach the sidebar')
      }
      await browser.evaluate(`__prefs.setItem('dsh-theme-endfield-glass-blur', 'standard')`)
      for (const [level, alpha] of Object.entries(alphas)) {
        await browser.evaluate(`__prefs.setItem('dsh-theme-endfield-glass', ${JSON.stringify(level)})`)
        const got = await browser.evaluate(`getComputedStyle(document.querySelector('#sideCol')).backgroundColor`)
        assert.match(got, new RegExp(String(alpha).replace('.', '\\.')), '强度=' + level + ' must set the band opacity')
        assert.equal(await browser.evaluate(`getComputedStyle(document.querySelector('#sideRoot')).backgroundColor`),
          'rgba(0, 0, 0, 0)', 'the sidebar surface stays clear at 强度=' + level)
      }

      /* With 磨砂玻璃 off the host's own painting must come back untouched: this change
         may not restyle a sidebar that never asked for the frost. */
      await browser.evaluate(`__prefs.setItem('dsh-theme-endfield-glass', 'off')`)
      const off = await browser.evaluate(`(() => {
        const root = document.querySelector('#sideRoot'), col = document.querySelector('#sideCol')
        return { rootBg: getComputedStyle(root).backgroundColor, colFilter: getComputedStyle(col).backdropFilter,
                 colBg: getComputedStyle(col).backgroundColor }
      })()`)
      assert.notEqual(off.rootBg, 'rgba(0, 0, 0, 0)', 'with the frost off the sidebar surface keeps the host fill')
      assert.equal(off.colFilter, 'none', 'with the frost off the column is not blurred')
      console.log('PASS:', dark ? 'dark' : 'light', 'sidebar material, boundary line and collapse-control corner')
    }

    /* Expanded chrome must preserve every original host affordance: logo mark, wordmark,
       new-session label, and the two distinct click targets. This assertion would have
       caught the previous broad transform before it reached the app: the button was
       painted at y=54 over the brand row while its label was shifted above the button. */
    await bootChrome(browser, { dark: true })
    const expanded = await browser.evaluate(`(() => {
      const rect = sel => { const e = document.querySelector(sel); const r = e.getBoundingClientRect();
        return { x:r.x, y:r.y, right:r.right, bottom:r.bottom, width:r.width, height:r.height,
                 visible:getComputedStyle(e).visibility !== 'hidden', text:(e.textContent || '').trim() } }
      const hit = sel => { const e = document.querySelector(sel), r = e.getBoundingClientRect()
        const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        return !!at && (at === e || e.contains(at)) }
      const toggle = rect('#toggle'), brand = rect('#brand'), mark = rect('#brandMark')
      const wordmark = rect('[class*="_brandName"]'), action = rect('#newSession')
      const label = rect('#newSessionLabel')
      return { toggle, brand, mark, wordmark, action, label,
        overlap: Math.max(0, Math.min(toggle.right, mark.right) - Math.max(toggle.x, mark.x))
          * Math.max(0, Math.min(toggle.bottom, mark.bottom) - Math.max(toggle.y, mark.y)),
        markHit:hit('#brandMark'), wordHit:hit('[class*="_brandName"]'),
        actionHit:hit('#newSessionLabel'), toggleHit:hit('#toggle'),
        actionTransform:getComputedStyle(document.querySelector('#newSession')).transform,
        logoRowPadding:getComputedStyle(document.querySelector('#logoRow')).paddingLeft }
    })()`)
    assert.ok(expanded.brand.visible && expanded.mark.visible && expanded.mark.width >= 20,
      'expanded state must keep the logo mark visible: ' + JSON.stringify(expanded))
    assert.ok(expanded.wordmark.visible && expanded.wordmark.text === 'HARNESS' && expanded.wordmark.width > 0,
      'expanded state must keep the HARNESS wordmark visible: ' + JSON.stringify(expanded.wordmark))
    assert.ok(expanded.label.visible && expanded.label.text === '新建会话' && expanded.label.width > 0,
      'expanded state must keep the new-session text visible: ' + JSON.stringify(expanded.label))
    assert.ok(expanded.brand.bottom <= expanded.action.y,
      'the new-session action must follow, not overlap, the logo row: ' + JSON.stringify(expanded))
    assert.equal(expanded.actionTransform, 'none', 'the expanded action remains in host flex flow')
    assert.equal(expanded.logoRowPadding, '0px', 'the host logo-row inset is not overwritten')
    assert.equal(expanded.overlap, 0, 'the brand mark and titlebar toggle occupy separate vertical bands')
    assert.ok(expanded.markHit && expanded.wordHit && expanded.actionHit && expanded.toggleHit,
      'logo mark, wordmark, new-session label, and toggle must all have live hit targets')

    /* BOTH viewport-fixed controls, in BOTH frost states, in BOTH sidebar states, in both
       schemes. This is the matrix the reports came from: "the collapse button vanished
       with the frost off" (an un-gated shift pushes it off the top of the window) and
       "the small new-session button dropped below the band with the frost on" (the shift
       was only applied to the collapse control). One assertion per state, because each
       state has been wrong on its own at some point. */
    for (const dark of [true, false]) {
      for (const glass of dark ? ['standard', 'off'] : ['standard']) {
        for (const collapsed of [false, true]) {
          await bootChrome(browser, { dark, glass, collapsed })
          const state = await browser.evaluate(`(() => {
            const frame = document.querySelector('#frame').getBoundingClientRect()
            const cs = getComputedStyle(document.documentElement)
            const band = { top: frame.top, bottom: frame.top + Number.parseFloat(cs.getPropertyValue('--dsh-windows-titlebar-height')) }
            const box = (sel) => {
              const el = document.querySelector(sel)
              if (!el) return null
              const r = el.getBoundingClientRect()
              return { y: Math.round(r.y), bottom: Math.round(r.bottom), h: Math.round(r.height),
                       x: Math.round(r.x), w: Math.round(r.width),
                       inBand: r.y >= band.top - 0.5 && r.bottom <= band.bottom + 0.5,
                       visible: getComputedStyle(el).visibility !== 'hidden',
                       text:(el.textContent || '').trim() }
            }
            const hit = sel => { const e = document.querySelector(sel), r = e.getBoundingClientRect()
              const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
              return !!at && (at === e || e.contains(at)) }
            return { band: [Math.round(band.top), Math.round(band.bottom)],
                     collapse: box('#toggle'), newSession: box('#newSession'),
                     label: box('#newSessionLabel'), brand: box('#brand'),
                     mark: box('#brandMark'), wordmark: box('[class*="_brandName"]'),
                     collapseHit: hit('#toggle'), newSessionHit: hit('#newSession'),
                     colOverflow: getComputedStyle(document.querySelector('#sideCol')).overflow }
          })()`)
          const tag = 'dark=' + dark + ' glass=' + glass + ' collapsed=' + collapsed
          assert.ok(state.collapse.inBand && state.collapse.visible,
            'the collapse control must sit inside the titlebar band and be visible (' + tag + '): ' + JSON.stringify(state.collapse))
          if (collapsed) {
            /* In the rail the host turns this into a second fixed control at (48, 6) --
               the "small button dropped below the band" report. */
            assert.ok(state.newSession.inBand,
              'the rail new-session control must sit inside the band (' + tag + '): ' + JSON.stringify(state.newSession))
            assert.equal(state.label, null,
              'the Windows host omits the wide-only new-session label in collapsed state (' + tag + ')')
            assert.equal(state.brand, null,
              'the Windows host omits the brand identity in collapsed state (' + tag + ')')
          } else {
            assert.equal(state.newSession.inBand, false,
              'expanded, the new-session button is an in-flow row and must NOT be lifted into the band (' + tag + ')')
            assert.ok(state.label && state.label.visible && state.label.text === '新建会话',
              'expanded, the new-session label is the button text and must stay visible (' + tag + ')')
            assert.ok(state.brand && state.mark && state.wordmark && state.wordmark.text === 'HARNESS',
              'expanded, brand mark and wordmark must remain rendered (' + tag + ')')
            assert.ok(state.brand.bottom <= state.newSession.y,
              'expanded, brand and new-session action must not overlap (' + tag + ')')
          }
          /* The un-gated shift is what made the collapse control disappear with the frost
             off: it moves both controls 40px up, off the top of the window. */
          if (glass === 'off') {
            assert.equal(state.collapse.y, 6, 'with the frost off the collapse control must land at the host\'s own y=6 (' + tag + ')')
            assert.equal(state.colOverflow, 'hidden', 'with the frost off the host\'s own clipping must come back (' + tag + ')')
          } else {
            assert.notEqual(state.colOverflow, 'hidden',
              'with the frost on the column must not clip the controls it contains (' + tag + ')')
          }
        }
      }
    }

    assert.deepEqual(browser.errors, [], 'no page errors while applying the chrome fixes')
    console.log('PASS: expanded logo, wordmark, action label and all click targets remain visible')
    console.log('PASS: titlebar controls across dark/light x frost on/off x expanded/collapsed')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
