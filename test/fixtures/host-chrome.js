/* The desktop chrome (Windows titlebar band + sidebar) as the shipped host builds it,
 * for the browser tests that have to see the chrome the theme's surfaces live in.
 *
 * WHY A SHARED FIXTURE. glass.test.js asserts the frost on the surfaces the THEME
 * paints (the composer card, the sidebar column, the docked pane). The two defects
 * these consumers guard live one level below those surfaces:
 *
 *   * the sidebar's OWN surface ('.<hash>_root') paints --dsw-specific-sidebar-fill —
 *     the same colour this theme gives --dsw-alias-bg-base — so an opaque fill there
 *     composites back to the page colour and erases the column's frost, its contour
 *     and its boundary line;
 *   * the collapse control is position:fixed at (12,6) while the logo row lays the
 *     brand mark out from its own inset, so the mark paints over the control.
 *
 * Neither is visible in a fixture that mocks the sidebar as a single div, which is why
 * the markup here is the real tree: frame > sidebarCol > root > logoRow > (brand,
 * toggle), and why the CSS is the shipped modules themselves:
 *
 *   test/fixtures/host-bundles/SidebarRoot.module.css  <- ui-sidebar insertCss string
 *   test/fixtures/host-bundles/Layout.module.css       <- ui-layout  insertCss string
 *
 * They are the exact `const css = "…"` payloads the installed app.asar hands to
 * insertCss, extracted with tools/extract-host-css.mjs. Keeping the real sheets here
 * means an app rebuild that moves either hook fails these tests loudly instead of
 * silently dropping the fix.
 */
const fs = require('node:fs')
const path = require('node:path')

const HOST_CSS = ['SidebarRoot.module.css', 'Layout.module.css']
  .map(file => fs.readFileSync(path.join(__dirname, 'host-bundles', file), 'utf8'))
  .join('\n')

/* The token sheet the host paints below the theme, plus the harness stand-ins: a
   patterned backdrop (a stand-in for the contour sheet, so "frost over the sheet" and
   "a flat slab the colour of the page" are different pixels) and the centre column. */
const BASE_CSS = `
html, body { height: 100%; margin: 0 }html { --dsh-windows-titlebar-height: 40px; --dsh-sidebar-width: 240px;
  --dsw-radius-sm: 4px; --dsw-radius-md: 6px; --dsw-radius-lg: 8px; --dsw-focus-ring-width: 2px;
  --ds-ease-in-out: cubic-bezier(.4,0,.2,1); --ds-transition-duration-slow: .2s }
body { --dsw-font-family: 'Segoe UI', Arial, sans-serif; font-family: var(--dsw-font-family);
  --dsw-alias-bg-base: #e8e8e2; --dsw-alias-bg-layer-1: #f2f2ec; --dsw-alias-bg-layer-2: #dcddd6;
  --dsw-alias-label-primary: #101110; --dsw-alias-label-secondary: #4a4c48;
  --dsw-alias-border-l1: #d8d9d5; --dsw-alias-border-l2: #b6b8b3; --dsw-alias-border-l3: #c9cac4;
  --dsw-alias-interactive-bg-hover: #dcddd6; --dsw-alias-button-elevated-fill: #f7f7f1;
  --dsw-specific-sidebar-fill: #e8e8e2; --dsw-alias-scrollbar-bg-l2: #ccc;
  background: var(--dsw-alias-bg-base) }
body[data-ds-dark-theme] { --dsw-alias-bg-base: #101110; --dsw-alias-bg-layer-1: #181a18;
  --dsw-alias-bg-layer-2: #202220; --dsw-alias-label-primary: #f5f5f0;
  --dsw-alias-label-secondary: #898d89; --dsw-alias-border-l1: #343633;
  --dsw-alias-border-l2: #3d3f3b; --dsw-alias-border-l3: #3d3f3b;
  --dsw-alias-interactive-bg-hover: #242624; --dsw-alias-button-elevated-fill: #202220;
  --dsw-specific-sidebar-fill: #101110; --dsw-alias-scrollbar-bg-l2: #333 }
#root { height: 100% }
/* The host sets the frame's columns INLINE (the component passes the live sidebar
   width), so the fixture has to state them: without a definite first column the grid
   gives the sidebar column the whole row and every geometry assertion below becomes
   meaningless. 240px is the shipped default width. */
.BynINW_frame { grid-template-columns: var(--dsh-sidebar-width) minmax(0, 1fr) }
/* The real Windows tree omits the macOS-only top strip. The logo row is followed by the
   expanded new-session action in normal flex flow; tests verify both remain visible. */

.Probe_sheet { position: absolute; inset: 0; z-index: 0; pointer-events: none;
  background: repeating-linear-gradient(45deg, rgba(217,199,0,.55) 0 2px, transparent 2px 22px),
    repeating-linear-gradient(-45deg, rgba(217,199,0,.35) 0 2px, transparent 2px 30px), #0d0e0d }
.Probe_center { background: var(--dsw-alias-bg-base); flex: 1; min-height: 0 }
`

const CHROME_HTML = `<!doctype html><html lang="zh-CN" data-windows-titlebar><head><meta charset="utf-8">
<style>${BASE_CSS}${HOST_CSS}</style></head>
<body__DARK__>
<div id="root">
  <div class="BynINW_frame" id="frame">
    <div class="Probe_sheet" aria-hidden="true"></div>
    <div class="BynINW_sidebarCol" id="sideCol">
      <div class="_2H3hWW_root__COLLAPSED__" id="sideRoot">
        <div class="_2H3hWW_logoRow" id="logoRow">
          __BRAND__
          <button type="button" class="_2H3hWW_iconButton _2H3hWW_toggle" id="toggle" aria-label="收起侧边栏">
            <svg class="_2H3hWW_panelIcon" width="16" height="16" viewBox="0 0 16 16"><path d="M2 3h12v10H2z" fill="none" stroke="currentColor" stroke-width="2"></path><path d="M3 4h4v8H3z" fill="currentColor"></path></svg>
          </button>
        </div>
        <button type="button" class="_2H3hWW_newSession" id="newSession"><span class="_2H3hWW_newSessionLabelMask"><span class="_2H3hWW_newSessionContent"><svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="2" fill="none"></path></svg>__NEW_SESSION_LABEL__</span></span></button>
        <div class="_2H3hWW_panelList"><button type="button" class="_2H3hWW_panelRow"><span>会话</span></button></div>
        <div class="_2H3hWW_regionArea" id="regionArea">
          <div style="padding:8px 4px;font-size:13px">ENDFIELD / 终末地主题</div>
          <div style="padding:6px 4px;font-size:13px">会话记录一</div>
        </div>
        <div class="_2H3hWW_footArea"><button type="button" class="_2H3hWW_iconButton">gear</button></div>
      </div>
    </div>
    <div class="BynINW_centerCol" id="centerCol"><div class="Probe_center" id="centerRoot"></div></div>
  </div>
</div>
<script>window.__ModuleLoader__ = { load: m => { window.__MOD__ = m } }</script>
</body></html>`

/* Two knobs, both of which the theme's chrome rules key on:
 *   __DARK__      -> data-ds-dark-theme on body
 *   __COLLAPSED__ -> the root's '_collapsed' modifier, which is what makes the host
 *                    declare the new-session control as a SECOND viewport-fixed control
 *                    (rail mode is not the same layout as the wide sidebar). */
function chromeHtml({ dark = true, collapsed = false } = {}) {
  return CHROME_HTML
    .replace('__DARK__', dark ? ' data-ds-dark-theme' : '')
    .replace('__COLLAPSED__', collapsed ? ' _2H3hWW_collapsed' : '')
    .replace('__BRAND__', collapsed ? '' : '<button type="button" class="_2H3hWW_brand _2H3hWW_wide" id="brand"><span class="_2H3hWW_brandIdentity"><span class="_2H3hWW_brandMark" id="brandMark"><svg width="24" height="24"><rect width="24" height="24" fill="#d9c700"></rect></svg></span><span class="_2H3hWW_brandName">HARNESS</span></span></button>')
    .replace('__NEW_SESSION_LABEL__', collapsed ? '' : '<span class="_2H3hWW_newSessionLabel _2H3hWW_wide" id="newSessionLabel">新建会话</span>')
}

module.exports = { HOST_CSS, BASE_CSS, CHROME_HTML, chromeHtml }
