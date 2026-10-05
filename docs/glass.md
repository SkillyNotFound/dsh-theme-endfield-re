# Optional frosted glass

The `glass` setting is `off` by default. `subtle`, `standard` and `strong` add
bounded local blur (8/14/22 px) to the composer and to the docked right panel's
**surface**. The sidebar receives a static tint/sheen only. Text, native geometry
and the selected palette remain under the theme's existing control. Dark surfaces
use their own opacity levels. Fullscreen panel shells, dialogs, code blocks and
menus are excluded.

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
(`<hash>_centerCol`). A host rebuild that renames the surface drops the frost, so
`test/glass.test.js` asserts the match is alive and fails loudly instead.

Unsupported backdrop filters use a .96 opaque fill; reduced-transparency uses
an opaque fill and removes blur. Disabling the theme removes the material
attribute and stylesheet. Stronger tiers increase opacity as well as blur, so
background motion competes less with foreground text. Blur still has a GPU cost;
this feature is not a performance optimization and does not promise video FPS.

Table hover now uses a 15% accent tint over the base surface with normal text,
while text selection retains the full accent with black text. This addresses
issue #18 independently of whether glass is enabled.

Validation: `npm run test:glass` (Node 22+, Chrome/Edge; `CHROME_PATH` supported)
checks four light/dark × valley/Wuling combinations, all opacity/blur tiers,
stable geometry, AA text contrast on hovered/selected cells, reduced-transparency,
fullscreen exclusion and teardown. It also pins the surface/shell split above: the
pane must carry the blur and the fill, and the shell must stay transparent with no
backdrop filter, in both `push` and `fullscreen`. The browser fixture uses isolated
temporary profiles and no account or model requests.
