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

Four surfaces carry it, all with one shared fill so none can drift away from the
others:

| surface | element | edge it gets |
| --- | --- | --- |
| composer card | `[data-composer-card]` | — (it has its own border) |
| left sidebar | `[class*='_frame'] > [class*='_sidebarCol']` | 1 px along its **right** edge |
| app titlebar band (Windows) | `[class*='_frame']::before` | 1 px along its **bottom** edge |
| docked right panel | `[data-dockkit-host='dock'] > [class*='_tabHost']` | — |

The sidebar and the titlebar band are the same panel material (`--dsw-specific-sidebar-fill`
in both), and their two edges meet at the corner, so together they read as one panel
wrapping the interface. Both edges are needed: on Windows the host sets the sidebar's
`border-right` to `none`, and the titlebar band has no border at all, so without
these the frosted area would have no boundary where it meets the conversation
column.

Fullscreen panel shells, dialogs, code blocks and menus are excluded.

## One glow, not one per surface

The specular sheen and the accent bloom are a **single** overlay —
`[class*='_frame']::after`, spanning `--dsh-sidebar-width` ×
`--dsh-frame-top-clearance` — rather than a `background-image` on each surface.

That is deliberate: two elements can only ever paint two separate gradients, so a
corner would show two hard seams and the "glow" would read as two stacked copies.
One overlay spanning the whole L lets the 135° sheen run unbroken from the sidebar
up and around into the titlebar band. The overlay is gated on the contour layer
being mounted, so with 等高线 off the frosted look is pure tint with no glow.

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
teardown. It also pins the contracts above: every surface must carry the **same**
fill, the sidebar and titlebar band must each keep their boundary line, the shell
must stay transparent with no backdrop filter, and the glow must be one generated
layer whose box spans the sidebar width and the titlebar height. The browser
fixture uses isolated temporary profiles and no account or model requests.
