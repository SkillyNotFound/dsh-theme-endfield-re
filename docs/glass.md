# Optional frosted glass

Two rows, and the split is deliberate: **磨砂玻璃 owns opacity, 磨砂模糊 owns the
radius.** They used to be one control, and the consequence was that the only way to
get a tint light enough to read the contour through also gave you a radius that
erased it.

| row | key | field | options | default |
| --- | --- | --- | --- | --- |
| 磨砂玻璃 / Frosted glass | `dsh-theme-endfield-glass` | `glass` | `off` `subtle` `standard` `strong` | `off` |
| 磨砂模糊 / Frost blur | `dsh-theme-endfield-glass-blur` | `glassBlur` | `off` `soft` `standard` `heavy` | `standard` |

`off` on the first row removes the material entirely; `off` on the second is a real
`0px` — the frost stays, it just stops defocusing what is behind it. The second row
is a dependent control: with 磨砂玻璃 off there is no frost to defocus, so it
disables rather than editing a value nothing reads.

Three surfaces carry it, with one shared fill each so none can drift away from the
others:

| surface | element | notes |
| --- | --- | --- |
| composer card | `[data-composer-card]` | has its own border |
| left sidebar | `[class*='_frame'] > [class*='_sidebarCol']` | also carries the glow; 1 px along its **right** edge |
| docked right panel | `[data-dockkit-host='dock'] > [class*='_tabHost']` | — |

Fullscreen panel shells, dialogs, code blocks and menus are excluded.

## The Windows titlebar band is the same material (revised)

The native caption buttons and the web-rendered titlebar band are separate surfaces.
`lib/preload-app.cjs` reads a sidebar-fill token through its own probe span to report a
native appearance color; that fact alone does **not** prove how the OS caption controls
will composite beside a CSS-frosted band. Do not infer or promise native-caption parity
from the theme tests.

The user-facing request is that the **web titlebar band and sidebar read as one surface**.
The theme applies the same fill/alpha and blur tokens to the frame pseudo-element and the
sidebar column:

| surface | fill | blur |
| --- | --- | --- |
| sidebar column | `rgb(var(--edge-glass-fill) / var(--edge-glass-alpha))` | `blur(var(--edge-glass-blur)) saturate(1.05)` |
| titlebar band (`frame::before`) | same tokens | same blur token |

`test/chrome-glass.test.js` compares their computed fill and blur and checks that the
band shows the patterned backdrop. These are browser-fixture assertions; they do not test
the native caption controls.

### The collapse control belongs to the band

Same live round, second defect: `why is the collapse button inside the sidebar`. The
host declares it as a viewport-fixed control at (12, 6) — inside the band:

```css
[data-windows-titlebar] .<hash>_toggle { position: fixed; left: 12px;
  top: calc((var(--dsh-windows-titlebar-height) - 28px) / 2); z-index: 30 }
[data-windows-titlebar] .<hash>_collapsed .<hash>_newSession { position: fixed; left: 48px;
  top: calc((var(--dsh-windows-titlebar-height) - 28px) / 2); z-index: 30 }
```

But this theme puts a `backdrop-filter` on the sidebar column, and a backdrop-filter
**establishes a containing block for fixed descendants**. BOTH controls silently inherit
the column's origin instead of the viewport's, and the column's box starts at the band's
bottom edge — so both land 40px low. One cause, two reported faces:

* the collapse control drops into the sidebar and is gone as soon as the sidebar is
  collapsed (the rail does not render it);
* collapsed, the rail's **new-session** control sits under the band instead of in it —
  the "small button got stuck below" report.

The shift is the band's height, not a tuned number:

```css
html[data-windows-titlebar] body[data-endfield-glass] [class*='_frame']
  > [class$='_sidebarCol'] :is(
    button[class*='_toggle'],
    [class*='_collapsed'] button[class*='_newSession']
  ) {
  transform: translateY(calc(-1 * var(--dsh-windows-titlebar-height)));
}
```

The selector is deliberately narrow: the toggle is fixed in both states, while the new
session button is fixed **only under the collapsed root**. The expanded new-session button
is normal flex flow after the 40px logo row. It must not be translated; doing so paints it
at y=54 over the brand row (the regression that hid the logo and text). Nor should the
button's descendants be translated: the label mask, icon/content, and label are not fixed
controls. Ordinary CSS class selectors match an element carrying multiple classes; the
selectors do not need to match only a bare class name.

The shift is gated on `body[data-endfield-glass]`: the frosted column's backdrop filter is
what establishes the containing block. With frost off, the host positions controls at
its own y=6; a lingering shift would move them to y=-34. While frost is on, the controls
paint above the column's box, so the column must also use `overflow: visible`; otherwise
the host's overflow clip hides them. `transform` changes the rendered bounding rectangle
as well as paint position; browser tests assert the resulting coordinates and actual hit
targets, not a fictional unchanged geometry.

The Windows host computes `wide = !collapsed`: in rail state it does not render the brand
or wide-only new-session label at all. No label-hiding rule is needed. The logo row and
brand remain at their original host geometry in expanded state; the row begins at y=46,
while the collapse toggle is in the separate titlebar band at y=6, so no 40px inset is
needed.

The browser matrix verifies frost on/off × expanded/collapsed: the toggle stays at (12,6),
the collapsed new-session icon stays at (48,6), and the expanded action remains in flow
at y=94. It also checks the expanded brand mark, HARNESS wordmark, action label, and
hit-testing for all four controls. Native caption rendering is outside this fixture.

## One yellow glow shared by the band and sidebar

The yellow accent bloom is a **single radial gradient on the full-frame contour sheet**,
which spans both surfaces and owns their shared coordinate system. Its center is at the
chrome corner (the titlebar/sidebar join), so it fades continuously across the band and
down the sidebar. The two glass faces no longer each restart a separate radial gradient
at their own bottom-left. They keep only their subtle local white specular sheen; the
shared yellow bloom is not duplicated.

The contour sheet is the right layer for this because it already spans the frame at
`z-index:0` behind the frosted surfaces. Both the sidebar column and titlebar band take
the same translucent fill and `backdrop-filter`, so they sample the same underlying
light. The bloom is gated by the contour sheet being mounted: with 等高线 off, frost is
just tint, with no shared glow.

### Why the titlebar band needs `z-index:1`

The host's `frame::before` is an absolutely positioned drag region, but by default its
stacking order leaves the contour sheet above it. That produced a particularly subtle
failure: computed style reported `backdrop-filter: blur(4px)`, while the contour lines
were painted sharply over the titlebar, so the top bar looked unblurred. The theme now
raises only the band to `z-index:1`, above the `z-index:0` contour; its filter visibly
blurs the sheet. The filtered sidebar column is raised to `z-index:2` so its fixed
controls, which are inside the column's own stacking context, still paint above the
band. The controls retain their own `z-index:30` and remain hit-testable.

`test/chrome-glass.test.js` checks this with more than computed styles: a sharp stripe
pattern runs under the band, and the test compares actual screenshot pixels with blur on
and off. It also asserts one radial bloom on the shared contour sheet and no radial bloom
on either glass face. Thus a regression to separate, restarted yellow glows or to a
computed-but-visually-hidden band filter fails the browser test.

The earlier full-frame `::after` overlay is still not used: it painted over chrome and
risked masking controls. A background on the contour sheet gives us one shared glow
under both materials without adding a foreground overlay or a new fixed-containing
ancestor.

## Why the tint is light and the blur is small

| level | alpha (light / dark) |
| --- | --- |
| `subtle` | .30 / .30 |
| `standard` | .42 / .40 |
| `strong` | .52 / .52 |

| 磨砂模糊 | radius |
| --- | --- |
| `off` | 0 px |
| `soft` | 2 px |
| `standard` | 4 px |
| `heavy` | 8 px |

Both ranges are bounded by the same fact: **these surfaces are a tint, not a pane.**
The accent contour sheet is this theme's background and the frost sits on top of it,
so the backdrop is what carries the surface's texture. Filling at .8–.9 replaced that
texture with flat colour — the reported "the sidebar is just black now" — and a
radius of 10 px averaged a 2 px stroke out of existence even at low alpha.

Measured on a minimal page with one glass box over a 10 px/40 px stripe sheet, where
`backdrop-filter` provably works:

| blur | luminance inside the glass, across the stripes |
| --- | --- |
| 5 px | 26 → 71 (structure survives) |
| 10 px | 26 → 26 (flat) |

and on the sidebar with the theme's fill: at alpha .72 the band's mean luminance was
**identical** with the frost on and off (49.0 vs 49.0), i.e. the fill had completely
taken over from the artwork it was supposed to be frosting.

## Which box carries the frost

The right panel has two boxes and only one of them is a surface:

| box | what it is | gets the frost? |
| --- | --- | --- |
| `[data-sidebar-right-panel]` | the panel's positioning **shell** — `position:absolute`, `top:0/bottom:0/right:0`, transparent, slid with `transform` | **no** |
| `[data-dockkit-host='dock'] > [class*='_tabHost']` | the DockLayout **surface** the host actually paints (`background: var(--dsw-alias-bg-base)`) | **yes** |

The shell spans the frame's entire right edge at the panel's full width, so `push`
mode is roughly 45vw of full-height overlay. Putting the fill and the blur on it
painted a half-window, semi-transparent slab across the conversation column — the
reported "the whole right half goes flat" desktop breakage — and ran a
half-viewport-wide backdrop blur on every composited frame. The surface selector is
therefore anchored on the host's own `data-dockkit-host` attribute and matches the
surface by substring (`_tabHost`, `_emptyTabHost`), because DockLayout's class names
carry a position suffix (`_tabHost_<hash>_<n>`) while the layout module's do not
(`<hash>_centerCol`).

## The sidebar's own surface (fixed after the first live desktop round)

The sidebar column is **not** the sidebar's only box. The shipped `SidebarRoot` sheet
paints a second one inside it:

```css
.<hash>_sidebarCol { background: var(--dsw-specific-sidebar-fill) }   /* column  */
.<hash>_root       { background: var(--dsw-specific-sidebar-fill) }   /* surface */
```

Both use the same token — and this theme sets that token to the **same value** it gives
`--dsw-alias-bg-base` (`#101110` dark / `#e8e8e2` light). The duplication is therefore
invisible in the cascade: the column painted the frost, the surface painted the page
colour over it, and the two boxes read as one flat area. Clearing the *columns* (the
`_centerCol` / `_detailsCol` / `_sidebarCol` rules) cannot fix it, because a descendant
that paints its own fill is not covered by clearing its parent.

Read off the RUNNING desktop window (`PrintWindow`, dark mode, 磨砂玻璃 standard,
磨砂模糊 standard):

| region | painted colour | verdict |
| --- | --- | --- |
| sidebar band | `#101110` — 91.1% of sampled pixels, one flat colour | no frost, no contour, no boundary |
| composer card | `#3c4135` → `#3f4537` (mean lum 68.8, 346 distinct colours) | the material, working |

So the fix is one rule, scoped exactly like the rest of the sheet:

```css
body[data-endfield-glass] [class*='_frame'] > [class$='_sidebarCol'] [class*='_root'] {
  background: transparent !important;
}
```

It is colour-neutral by construction (the two boxes hold the same value in both
schemes), it is gated on 磨砂玻璃 so a reader who never asked for the frost keeps the
host's own painting, and it is scoped to the sidebar column so the other 26 shipped
`*_root` classes are untouched. With the frost on, the same band measures a **29.7
luminance spread over 725 distinct colours** — the same order as the composer card on
the same screen.

## Preserve the host's logo-row geometry

The Windows collapse toggle is fixed at (12,6) in the 40px titlebar band. The expanded
logo row starts below that band at y=46; its fish mark and HARNESS wordmark therefore do
not overlap the toggle. A prior 40px `padding-left` override was based on a mistaken
vertical-overlap diagnosis and shifted the complete brand identity unnecessarily. It has
been removed; the logo row retains the host's own zero horizontal padding plus the brand
button's 4px inset. The chrome regression test checks the fish mark, HARNESS wordmark,
new-session label, separate row positions, and hit targets directly.

## Three host traps this feature sits on

**Class-name schemes differ between modules.** Both Vite conventions ship in the
same app:

| module | real class name | the selector that works |
| --- | --- | --- |
| layout (`AppFrame`) | `BynINW_sidebarCol` | suffix — `[class$='_sidebarCol']` |
| DockLayout | `_tabHost_6nhg2_162` | **substring** — `[class*='_tabHost']` |

A suffix match is right for one and silently matches nothing for the other.

**`data-windows-titlebar` lives on `<html>`**, not `<body>`. The host reads it as
`document.documentElement.hasAttribute('data-windows-titlebar')` and writes its own
rules as `html[data-windows-titlebar] …`. A body-scoped copy of that attribute
never matches, which silently drops the titlebar band's boundary line.

**`[data-slot='sidebar']` does not exist.** No shipped bundle emits that slot id.
The theme's original sidebar rule matched nothing at all, so the sidebar had no
tint, no blur and no boundary while the settings row implied otherwise.

A host rebuild that renames any of these drops the frost silently, so
`test/glass.test.js` asserts each match is alive and fails loudly instead.

Unsupported backdrop filters use a .96 opaque fill; reduced-transparency uses
an opaque fill and removes blur. Disabling the theme removes the material
attribute and stylesheet. Raising 磨砂玻璃 increases opacity, so the surface
separates further from the page. Blur still has a GPU cost; this feature is not a
performance optimization and does not promise video FPS.

Table hover now uses a 15% accent tint over the base surface with normal text,
while text selection retains the full accent with black text. This addresses
issue #18 independently of whether glass is enabled.

Validation: `npm run test:glass` (Node 22+, Chrome/Edge; `CHROME_PATH` supported)
checks four light/dark × valley/Wuling combinations, opacity tiers, blur tiers, text
contrast, reduced-transparency, fullscreen exclusion and teardown. Its chrome-related
claims are limited to computed fill/blur equality and the tested sidebar surface/boundary;
it does not validate native caption rendering or assert that transformed controls keep
an unchanged rendered rectangle.

`npm run test:chrome` uses the shipped `SidebarRoot.module.css` and `Layout.module.css`
strings with the Windows host structure, and asserts:

* the sidebar's own surface paints no fill, the column carries the blur, and the boundary
  line is an inset hairline;
* the sidebar and titlebar band have equal computed fill/blur; screenshot pixels in the
  band vary over the patterned backdrop;
* the toggle paints inside the titlebar band and has a real hit target;
* across `frost on/off × expanded/collapsed`, the toggle stays at host y=6, the collapsed
  new-session icon stays in the band, and the expanded new-session button remains in flow;
* in expanded state, fish mark, HARNESS wordmark, and new-session text remain visible,
  separate, and hit-testable; in collapsed Windows state the host itself omits the brand
  and wide-only new-session label;
* with frost off, the host's own clipping and sidebar paint return.

Static `check.js`/`selftest.js` also reject two selector regressions: shifting the
expanded new-session button and matching its label/content descendants. The browser tests
assert the rendered rectangles after transforms, not an unchanged pre-transform geometry.
