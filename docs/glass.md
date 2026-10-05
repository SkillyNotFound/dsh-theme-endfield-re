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

## The Windows titlebar band is deliberately NOT frosted

This is a hard constraint, not an omission. The caption buttons (minimise /
maximise / close) are an Electron `titleBarOverlay`: **native**, and their fill is
not painted by CSS. The desktop preload measures a hidden probe whose
`background-color` is `var(--dsw-specific-sidebar-fill)` and sends the result to
the main process over `dsh-desktop:windows-appearance`; the shell then fills the
caption area with it. The host paints the band with that same token, so band and
caption agree **by construction**.

Any tint this stylesheet puts on the band breaks that agreement, leaving the native
buttons sitting on a colour nothing else in the window uses — which is exactly the
reported "the minimise/maximise/close buttons have a dead dark background". A theme
cannot recolour them, because the colour is captured from a token the main process
never re-reads from CSS in the frosted state. So the band keeps the host's own fill
and the frost stops at the sidebar; the band still gets its hairline, as a static
box-shadow.

Measured on the real DOM, the probe's reading and the band's computed colour must be
identical:

| scheme | probe reports | band computes to |
| --- | --- | --- |
| dark | `rgb(16, 17, 16)` | `rgb(16, 17, 16)` |
| light | `rgb(232, 232, 226)` | `rgb(232, 232, 226)` |

`test/glass.test.js` asserts the band carries neither a fill nor a blur nor the glow,
so this cannot silently regress.

## The glow lives on the sidebar, not on an overlay

The specular sheen and the accent bloom are part of the **sidebar column's own
`background-image`** (two gradient layers), gated on the contour layer being
mounted — so with 等高线 off the frosted look is pure tint with no glow.

An earlier revision put them on a single L-shaped overlay (`[class*='_frame']::after`
spanning `--dsh-sidebar-width` × `--dsh-frame-top-clearance`, covering sidebar and
band together). That shape is gone, for two concrete reasons:

- **A positioned pseudo with a non-auto `z-index` paints over every in-flow
  descendant.** The sidebar column is `position: static`, so the overlay covered it
  and the chrome inside it. `.BynINW_toggle` — the sidebar collapse control — is
  `position: fixed; z-index: 30`, and it is a direct child of `body`, so an overlay
  inside the frame happened not to move it; but the shape was one edit away from
  being an ancestor of it, and the reported "the collapse button disappeared" is what
  that class of mistake looks like.
- **`backdrop-filter` establishes a containing block for fixed descendants.** Any
  ancestor of the toggle that gains a blur, filter or transform moves a `fixed`
  button that expects the viewport. The sidebar column is such an ancestor, so the
  toggle's box is asserted unchanged with the frost on and off.

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
checks four light/dark × valley/Wuling combinations, each level's own opacity,
every 磨砂模糊 tier on both the composer and the sidebar, stable geometry, AA text
contrast on hovered/selected cells, reduced-transparency, fullscreen exclusion and
teardown. It also pins the contracts above: composer and sidebar carry the **same**
fill, the sidebar keeps its boundary line and the glow, the Windows titlebar band
takes **no** fill, blur or glow (its colour is reported to the native caption
buttons), no glow overlay exists on the frame, the sidebar collapse control stays
`position: fixed` at `z-index: 30` **and does not move** when the frost turns on, the
panel shell stays transparent with no backdrop filter, and the fixture uses isolated
temporary profiles and no account or model requests.
