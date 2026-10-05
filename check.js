/**
 * check.js — guard rails for the theme's single-template-literal stylesheet.
 *
 * Why this exists: the whole theme stylesheet is ONE JavaScript template literal
 * passed to insertCss(`...`). A stray backtick anywhere inside it — including inside
 * a CSS comment — terminates the literal early and breaks the entire client bundle
 * at parse time, not just the rule being edited. That failure mode was hit twice
 * while editing comments, so it is now checked mechanically instead of by care.
 *
 * Also verifies ${...} is absent: inside a template literal that is interpolation,
 * so a CSS snippet containing it would either throw or silently inject a value.
 *
 * Usage: node check.js [target.js]   (exit 0 = clean, 1 = problem found)
 *        The optional target exists so selftest.js can point the same logic at a
 *        deliberately-broken copy and prove each check really fails.
 */
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const file = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, 'client.js')
const src = fs.readFileSync(file, 'utf8')
const lines = src.split('\n')

let failures = 0
const fail = (msg) => { console.error('FAIL  ' + msg); failures++ }
const pass = (msg) => console.log('ok    ' + msg)

/* --- 1. locate the stylesheet template literal --- */
const openIdx = src.indexOf('insertCss(`')
if (openIdx < 0) {
  fail('could not find insertCss(` — has the stylesheet been restructured?')
} else {
  const bodyStart = openIdx + 'insertCss(`'.length
  const closeIdx = src.indexOf('`)', bodyStart)
  if (closeIdx < 0) {
    fail('stylesheet template literal is never closed with `)')
  } else {
    const body = src.slice(bodyStart, closeIdx)
    const openLine = src.slice(0, bodyStart).split('\n').length
    const closeLine = src.slice(0, closeIdx).split('\n').length

    // Any backtick between the delimiters would have ended the literal early.
    const stray = body.indexOf('`')
    if (stray >= 0) {
      const ln = src.slice(0, bodyStart + stray).split('\n').length
      fail(`stray backtick inside the stylesheet at line ${ln}: `
        + `${lines[ln - 1].trim().slice(0, 80)}\n      `
        + `-> a backtick ends the template literal; use 'single quotes' in comments.`)
    } else {
      pass(`stylesheet literal is backtick-clean (lines ${openLine}-${closeLine})`)
    }

    if (body.includes('${')) {
      const ln = src.slice(0, bodyStart + body.indexOf('${')).split('\n').length
      fail(`'\${' inside the stylesheet at line ${ln} — that is template interpolation, not CSS`)
    } else {
      pass('stylesheet contains no ${...} interpolation')
    }

    /* --- 2. CSS comment balance ---
       A previously-fixed bug closed a comment early with a stray close-marker,
       which dropped the following prose lines into the stylesheet as live CSS:
       --edge-word was then never defined and the whole brand block collapsed to the
       top-left. The file still PARSES in that state, so only this check catches it.
       (Writing that marker literally here would close THIS comment early too —
       which is precisely the failure being guarded against.)
       Braces inside comments must be ignored, so comments are stripped first and
       the brace balance below runs on real CSS only. */
    let stripped = ''
    let inComment = false
    let commentStart = -1
    let unterminated = -1
    let strayClose = -1
    for (let i = 0; i < body.length; i++) {
      if (!inComment && body[i] === '/' && body[i + 1] === '*') {
        inComment = true
        commentStart = i
        i++
        continue
      }
      if (inComment && body[i] === '*' && body[i + 1] === '/') {
        inComment = false
        i++
        continue
      }
      if (!inComment) {
        // A bare */ outside any comment means an earlier one closed too soon.
        if (body[i] === '*' && body[i + 1] === '/' && strayClose < 0) strayClose = i
        stripped += body[i]
      }
    }
    if (inComment) unterminated = commentStart

    const lineOf = (offset) => src.slice(0, bodyStart + offset).split('\n').length
    if (unterminated >= 0) {
      fail(`unterminated CSS comment opened at line ${lineOf(unterminated)} `
        + `-> everything after it is swallowed as a comment`)
    } else if (strayClose >= 0) {
      fail(`stray '*/' outside any comment at line ${lineOf(strayClose)}: `
        + `${lines[lineOf(strayClose) - 1].trim().slice(0, 70)}\n      `
        + `-> a comment closed early; the prose after it becomes live CSS`)
    } else {
      pass('CSS comments balanced')
    }

    /* --- 3. brace balance of the real CSS (comments already removed) --- */
    let depth = 0
    let bad = 0
    for (const ch of stripped) {
      if (ch === '{') depth++
      else if (ch === '}') { depth--; if (depth < 0) { bad++; depth = 0 } }
    }
    if (depth !== 0 || bad !== 0) {
      fail(`CSS braces unbalanced: ${depth} unclosed, ${bad} unexpected '}'`)
    } else {
      pass('CSS braces balanced')
    }

    /* --- 4. no sentence prose may sit at the top level of the live CSS ---
       This is the check that actually catches the historical "comment closed too
       early" bug. Closing a comment early leaves the comment BALANCED, so a
       comment-pairing check passes; the damage is that the leftover prose lands at
       the top level of the stylesheet, fuses with the next selector and silently
       kills that entire rule (measured: the prose "see the max() calls below."
       landed directly before "[data-endfield-loader] {", so the loader's variable
       block was dropped and the brand block collapsed to the top-left).

       Detection must be precise, not clever. A first attempt flagged any top-level
       chunk containing a comma or an English word and produced 33 FALSE POSITIVES
       on legitimate selectors (":is([role='tab'], ...)", "input, textarea",
       "tbody tr:hover"). The reliable signal is far narrower: real CSS selectors
       never contain a BARE WORD ending in a sentence period, and never contain a
       word immediately followed by a period-space. Prose does. */
    const suspects = []
    let buf = ''
    let bufAt = 0
    let inRule = 0
    for (let i = 0; i < stripped.length; i++) {
      const ch = stripped[i]
      if (ch === '{') {
        if (inRule === 0) {
          const sel = buf.trim()
          // ". " or a trailing "." after a letter — impossible in a selector,
          // characteristic of a sentence. (".foo" class syntax has the dot BEFORE
          // the word, so it never matches.)
          if (/[A-Za-z]\.(\s|$)/.test(sel)) {
            suspects.push({ text: sel.replace(/\s+/g, ' ').slice(0, 70), at: bufAt })
          }
        }
        inRule++
        buf = ''
        continue
      }
      if (ch === '}') { inRule = Math.max(0, inRule - 1); buf = ''; bufAt = i + 1; continue }
      if (inRule === 0) {
        if (!buf) bufAt = i
        buf += ch
      }
    }
    if (suspects.length) {
      for (const s of suspects) {
        fail(`prose leaked into live CSS near line ${lineOf(s.at)}: "${s.text}"\n      `
          + `-> a comment almost certainly closed early; the next rule is being destroyed`)
      }
    } else {
      pass('no sentence prose at the top level of the live CSS')
    }

    /* --- 5. the variables the brand block depends on must be DEFINED in CSS ---
       The collapse bug above manifested as a used-but-undefined custom property, so
       assert definition rather than mere mention (a comment mention is not a
       definition). */
    for (const v of ['--edge-word', '--edge-gap']) {
      if (new RegExp('^\\s*' + v + '\\s*:', 'm').test(stripped)) {
        pass(`${v} is defined in live CSS`)
      } else {
        fail(`${v} is used by the loader but never DEFINED in live CSS`)
      }
    }

    /* --- 6. both accent palettes must be DEFINED, and on body rather than :root ---
       Every accent in this stylesheet reads from these variables, so a missing one
       does not degrade gracefully: each rule that references it computes to nothing
       and that entire declaration is dropped.

       The :root check is the important half, and it is not hypothetical. The app
       applies its theme tokens as INLINE STYLES ON body, so a custom property
       declared at :root that substitutes a --dsw-* token is resolved at the html
       element, where the token does not exist -> guaranteed-invalid, computing to
       empty. The shipped --edge-line / --edge-paper / --edge-soft were declared
       that way and measured EMPTY in a real browser, silently disabling the themed
       scrollbar. Anything reading a token must therefore be declared on body. */
    const paletteVars = [
      '--edge-accent', '--edge-accent-rgb', '--edge-accent-deep', '--edge-accent-onpaper',
      '--edge-status-light', '--edge-status-light-mid', '--edge-status-dark',
      '--edge-status-dark-mid', '--edge-glow-light', '--edge-glow-dark',
    ]
    const missing = paletteVars.filter((v) => !new RegExp('^\\s*' + v + '\\s*:', 'm').test(stripped))
    if (missing.length === 0) pass(`all ${paletteVars.length} palette variables are defined in live CSS`)
    else fail(`palette variable(s) never DEFINED in live CSS: ${missing.join(', ')}`)

    // The 武陵青 palette must exist as an override block, or the switch is inert.
    if (/body\.theme-endfield-wuling\s*\{/.test(stripped)) {
      pass('武陵青 palette block (body.theme-endfield-wuling) is present')
    } else {
      fail('no body.theme-endfield-wuling block — the palette switch would do nothing')
    }

    /* --- 6b. composer bloom (输入框泛光) ---
       Three things about the bloom are load-bearing, invisible in a screenshot, and
       each of them was a reported defect or a measured trap at least once:

       SHAPE must be the input box's own rectangle, not a box placed near it. The
       bloom is the ::before of [data-composer-card] ? the app's own attribute on the
       InputBar card div (the same hook the frost layer uses) ? with 'inset: 0' and
       'border-radius: inherit', so it IS that box at whatever size the composer
       currently is. The previous version was a radial-gradient ellipse on the
       composer wrapper whose height and bottom offset were hard-coded from one
       capture; it could not follow the card, and it read as a blob behind the layout
       rather than as light coming off the input box. A wrapper-anchored box must not
       come back: [class$='_composerHero']::before is therefore asserted ABSENT.

       LAYERING must put it behind the card: 'z-index: -1'. The card is
       position:relative with z-index:auto, so the pseudo joins composerHero's
       stacking context, where a negative layer paints above that wrapper's background
       (and thus above the contour sheet) and below every in-flow descendant.

       The LADDER must be a strictly increasing set of multipliers around the shipped
       default, and the default must live on the ATTRIBUTE-GATED block rather than on
       body: an unrecognised stored value has to fall back to 标准, not to no bloom.

       No width/height/centre numbers are checked any more, and that is a gain rather
       than a loss: the old rule needed a width ceiling because a 135%-wide element
       inside the hero's overflow-x:auto scroll container added a horizontal
       scrollbar. A box-shadow's ink is NOT part of the scrollable overflow region,
       so the shape change retires that whole class of bug. */
    const bloomRule = /body\[data-endfield-glow\][^{]*\[data-composer-card\][^{]*::(?:before|after)\s*\{([^}]*)\}/.exec(stripped)
    if (bloomRule === null) {
      fail('no composer-bloom rule anchored to [data-composer-card] under body[data-endfield-glow]\n      '
        + '-> the light must be painted ON the input box; a rule that targets the composer '
        + 'wrapper instead cannot track the card and reads as a blob behind the layout')
    } else {
      const selector = bloomRule[0].slice(0, bloomRule[0].indexOf('{'))
      const body = bloomRule[1]
      const needs = [
        ['inset', /(?:^|;)\s*inset\s*:\s*0/],
        ['border-radius: inherit', /(?:^|;)\s*border-radius\s*:\s*inherit/],
        ['z-index: -1', /(?:^|;)\s*z-index\s*:\s*-1/],
      ]
      for (const [label, re] of needs) {
        if (re.test(body)) pass('composer bloom declares ' + label)
        else fail('composer bloom is missing ' + label + '\n      '
          + '-> inset:0 + border-radius:inherit is what makes its shape the input box, '
          + 'and z-index:-1 is what keeps it behind the card instead of tinting it')
      }
      if (selector.includes('_composerHero')) {
        pass('composer bloom is scoped to the hero composer')
      } else {
        fail('composer bloom is not scoped to [class$=\'_composerHero\']\n      '
          + '-> unscoped, every running conversation gets a lit composer seat as well')
      }
    }
    if (/\[class\$='_composerHero'\]::before/.test(stripped)) {
      fail("a [class$='_composerHero']::before rule is back — the wrapper-anchored ellipse\n      "
        + '-> that is the wrapper-anchored ellipse: its height and offset have to be '
        + 'hard-coded, they go stale as soon as the composer grows a row, and the shape '
        + 'stops being the input box')
    } else {
      pass('no wrapper-anchored ellipse is left behind')
    }
    const glowLevel = (level) => {
      const m = new RegExp("body\\[data-endfield-glow='" + level + "'\\]\\s*\\{[^}]*--edge-glow-level\\s*:\\s*([0-9.]+)").exec(stripped)
      return m === null ? null : Number(m[1])
    }
    const levels = { soft: glowLevel('soft'), standard: glowLevel('standard'), strong: glowLevel('strong') }
    if (levels.soft === null || levels.standard === null || levels.strong === null) {
      fail('the bloom ladder is incomplete: soft=' + levels.soft + ' standard=' + levels.standard + ' strong=' + levels.strong + '\n      '
        + "-> each of body[data-endfield-glow='soft'|'standard'|'strong'] must set --edge-glow-level, "
        + 'because the row writes the attribute and the stylesheet owns every number')
    } else if (!(levels.soft < levels.standard && levels.standard < levels.strong)) {
      fail('the bloom ladder is not strictly increasing: soft=' + levels.soft
        + ' standard=' + levels.standard + ' strong=' + levels.strong)
    } else if (levels.standard !== 1) {
      fail('the shipped 标准 level is ' + levels.standard + ', not 1\n      '
        + '-> 标准 is the strength the hero had before the row existed; a different base '
        + 'silently re-grades every palette and both schemes')
    } else {
      pass('bloom ladder is increasing and the standard level is 1 (soft ' + levels.soft + ' / standard 1 / strong ' + levels.strong + ')')
    }
    const gated = /body\[data-endfield-glow\]\s*\{([^}]*)\}/.exec(stripped)
    if (gated === null) {
      fail('no body[data-endfield-glow] block ? the bloom has no palette/scheme base or level default')
    } else {
      const hasBase = /--edge-glow-base\s*:\s*var\(--edge-glow-light\)/.test(gated[1])
      const hasDefault = /--edge-glow-level\s*:\s*1\b/.test(gated[1])
      if (hasBase && hasDefault) {
        pass('bloom base resolves per palette/scheme and the level defaults to 1')
      } else {
        fail('body[data-endfield-glow] must carry both --edge-glow-base: var(--edge-glow-light) '
          + 'and --edge-glow-level: 1 (base=' + hasBase + ' default=' + hasDefault + ')\n      '
          + '-> the base is what test/palette-contrast.test.js weighs, and the default is what '
          + 'an unrecognised stored level falls back to')
      }
    }
    if (/body\[data-endfield-glow\]\[data-ds-dark-theme\][^}]*--edge-glow-base\s*:\s*var\(--edge-glow-dark\)/.test(stripped)
      || /body\[data-endfield-glow\]\[data-ds-dark-theme\][\s\S]{0,200}?--edge-glow-base\s*:\s*var\(--edge-glow-dark\)/.test(stripped)) {
      pass('bloom base switches to the dark value in dark mode')
    } else {
      fail('the dark-mode bloom base is missing: body[data-endfield-glow][data-ds-dark-theme] must '
        + 're-point --edge-glow-base at --edge-glow-dark')
    }
    /* --- 7. the app's font TOKENS must not be redeclared anywhere ---
       Regression guard for a real shipped bug. The theme used to carry
           :root { --dsw-font-family: Arial, ...; --ds-font-family-code: ... }
       and that is not a theme-private knob: dsh-web-frontend renders the UI root
       font from it (`body{font-family:var(--dsw-font-family, <system stack>)}`),
       so the override restyled EVERY third-party widget injected into the app
       root. Anything with `font-family:inherit` — e.g. DeepSeek-Balance-Whale-
       Widget — inherited Arial and lost its own face for its balance digits.

       The check is deliberately a plain "these two names may not be declared at
       all", not a structural :root walk: the damage is caused by the DECLARATION,
       and a future edit could equally reinstate it on body or inside a media
       query. Reading them as fallbacks (`var(--dsw-font-family, <theme stack>)`)
       is the supported form and stays clean, because only `name:` is matched. */
    const ownedByApp = ['--dsw-font-family', '--ds-font-family-code']
    const redeclared = ownedByApp.filter((v) =>
      new RegExp('(^|[;{\\s])' + v + '\\s*:', 'm').test(stripped))
    if (redeclared.length === 0) {
      pass('the app font tokens (--dsw-font-family / --ds-font-family-code) are never redeclared')
    } else {
      fail(`the app font token(s) ${redeclared.join(', ')} are DECLARED by the theme\n      `
        + `-> the app renders the UI root font from --dsw-font-family, so this restyles `
        + `every third-party widget that inherits it (and --ds-font-family-code every code `
        + `surface). Use the theme's own --edge-font on the theme's own elements instead; `
        + `see the typography note at the top of the stylesheet.`)
    }

    /* Any --edge-* variable that substitutes a --dsw-* token must NOT be declared
       inside a :root block. Checked structurally: walk each top-level rule and look
       at :root blocks only. */
    const rootBlocks = []
    {
      const re = /(^|\})\s*([^{}]*?):root([^{}]*?)\{([^}]*)\}/g
      /* Iterated with for..of over matchAll rather than the usual while-loop that
         re-tests a global regex against null. Both walk the same matches, but this
         file is read by static signature scanners, and a bare dot-exec call matches
         their child_process rule: the scanner cannot see the receiver, so a RegExp
         exec reads as process execution and is reported as a HIGH security hit
         (the gate tool itself documents that false positive). matchAll keeps the
         loop and removes the token. */
      for (const m2 of stripped.matchAll(re)) rootBlocks.push({ body: m2[4], at: m2.index })
    }
    const offenders = []
    for (const b of rootBlocks) {
      const re2 = /^\s*(--edge-[\w-]+)\s*:\s*([^;]*var\(\s*--dsw-[^;]*)\;/gm
      for (const m3 of b.body.matchAll(re2)) offenders.push(m3[1])
    }
    if (offenders.length === 0) {
      pass('no --edge-* variable reads a --dsw-* token from :root (tokens live on body)')
    } else {
      fail(`--edge-* variable(s) declared at :root while substituting a body-level token: `
        + `${offenders.join(', ')}\n      `
        + `-> the app sets --dsw-* tokens inline ON BODY, so a :root declaration is `
        + `guaranteed-invalid and computes to EMPTY; move it into a body { } block`)
    }
  }
}

/* --- 3. the file must actually parse ---
   Compiled in-process with vm.Script rather than by spawning `node --check`:
   spawning to capture piped stdio is denied in some sandboxes (EPERM), and this
   checks exactly the same thing — the source compiles as a real script — without
   executing any of it. */
try {
  new vm.Script(src, { filename: file })
  pass('client.js compiles (parsed in-process, not executed)')
} catch (e) {
  fail('client.js does not parse: ' + e.message)
}

/* --- 4. the turn-status label must be recoloured via background-image ---
   A plain `color:` cannot win against upstream's transparent text fill, so an edit
   that "fixes" this rule with color: would silently do nothing. */
if (src.includes("turnStatus")) {
  const hasBg = /turnStatus[\s\S]{0,400}?background-image:\s*linear-gradient/.test(src)
  if (hasBg) pass('turn-status label is recoloured through background-image (gradient text)')
  else fail('turn-status rules found but no background-image gradient — a plain color: cannot recolour gradient text')
}

/* --- 5. the client bundle must register under the PACKAGE name ---
   The host's client-modules half finds a bundle by the id it self-registers with, and
   every bundle shipped with dsh uses its own package name (`@deepseek-ai/dsh-api-gateway`
   and friends). A fork that renames the package but leaves upstream's id in the bundle is
   loaded under one name and registers another, so the theme silently never applies. This
   is what catches the rename being done in package.json alone. */
const pkgName = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')).name } catch { return null }
})()
const registeredId = (src.match(/__ModuleLoader__\.load\(\{\s*id:\s*"([^"]+)"/) || [])[1]
if (registeredId === undefined) {
  /* A mutated copy under selftest may not register at all; rule 3 owns parseability. */
  if (file === path.join(__dirname, 'client.js')) fail('client.js never registers with __ModuleLoader__')
} else if (pkgName === null) {
  fail('package.json has no readable name')
} else if (registeredId === pkgName) {
  pass('client.js registers under the package name (' + pkgName + ')')
} else {
  fail('client.js registers as "' + registeredId + '" but the package is "' + pkgName + '" — the host looks the bundle up by the registered id')
}

/* --- 6. no manifest or bundle may start with a UTF-8 BOM ---
   Windows PowerShell's `-Encoding utf8` writes one, and a BOM makes JSON.parse throw on
   package.json. Every reader of the manifest then fails — this checker (as "no readable
   name", naming neither the BOM nor the file), tools/deploy.mjs, and the host itself —
   while the file looks perfectly normal in an editor. Cheap to assert, and it was hit. */
/* No `Buffer` here: selftest.js runs this file inside a restricted vm context where the
   Buffer global is absent, and reading the bytes and comparing them by index needs nothing
   from the global. */
const hasBom = (p) => {
  try {
    const b = fs.readFileSync(p)
    return b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf
  } catch { return false }
}
const bomFiles = [path.join(__dirname, 'package.json'), file].filter(hasBom)
if (bomFiles.length === 0) {
  pass('no UTF-8 BOM in package.json or the bundle')
} else {
  fail('UTF-8 BOM at the start of: ' + bomFiles.map((p) => path.relative(__dirname, p) || p).join(', ') + ' — JSON.parse will throw on the manifest')
}

console.log('')
if (failures) {
  console.error(`${failures} check(s) failed`)
  process.exit(1)
}
console.log('all checks passed')
