/* Crop + upscale a PNG region for inspection. Node has no image libs here, so the
 * crop is done inside headless Chrome (canvas) through the CDP fixture.
 *
 *   node tools/crop-png.mjs <src.png> <x> <y> <w> <h> [out.png] [scale]
 *
 * Used for reading a live desktop capture (PrintWindow) or a harness screenshot at
 * 4-8x: a 24px glyph is not diagnosable at 1:1, and "which icon is painted on top of
 * which" is the question this tool answers. Output defaults to .kagent/shots/crop.png
 * (gitignored) so inspection artefacts never land in the working tree.
 */
import fs from 'node:fs'
import path from 'node:path'
const [, , src, x, y, w, h, outArg, scaleArg] = process.argv
if (!src || x === undefined || y === undefined || w === undefined || h === undefined) {
  console.error('usage: node tools/crop-png.mjs <src.png> <x> <y> <w> <h> [out.png] [scale]')
  process.exit(2)
}
const out = outArg || path.resolve(import.meta.dirname, '../.kagent/shots/crop.png')
const s = Number(scaleArg || 6)
const b64 = fs.readFileSync(src).toString('base64')
const html = `<!doctype html><body style="margin:0;background:#222"><img id="i" src="data:image/png;base64,${b64}"></body>`
const { createRequire } = await import('node:module')
const require = createRequire(import.meta.url)
const { launch } = require(path.resolve(import.meta.dirname, '../test/fixtures/chrome-cdp.js'))
const browser = await launch()
try {
  await browser.send('Page.navigate', { url: 'data:text/html,' + encodeURIComponent(html) })
  await browser.until('document.querySelector("#i") && document.querySelector("#i").complete')
  const data = await browser.evaluate(`(() => {
    const i = document.querySelector('#i')
    const c = document.createElement('canvas')
    c.width = ${Number(w)} * ${s}; c.height = ${Number(h)} * ${s}
    const x = c.getContext('2d')
    x.imageSmoothingEnabled = false
    x.drawImage(i, ${Number(x)}, ${Number(y)}, ${Number(w)}, ${Number(h)}, 0, 0, c.width, c.height)
    return c.toDataURL('image/png').split(',')[1]
  })()`)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, Buffer.from(data, 'base64'))
  console.log('wrote ' + out)
} finally { await browser.close() }
