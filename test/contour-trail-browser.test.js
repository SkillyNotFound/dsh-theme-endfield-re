const assert = require('node:assert/strict'), path = require('node:path')
const { launch, boot } = require('./fixtures/chrome-cdp.js')
const root = path.resolve(__dirname, '..')
// A real browser/canvas with a controlled animation clock gives a pixel-for-pixel
// comparison at the same terrain phase; this is not an FPS benchmark.
const prefix = `
  window.__now=1000;window.__raf=new Map();window.__nextRaf=0;
  Object.defineProperty(performance,'now',{value:()=>__now});
  Object.defineProperty(crypto,'getRandomValues',{value:a=>{a.fill(1592607298);return a}});
  window.requestAnimationFrame=fn=>{const id=++__nextRaf;__raf.set(id,fn);return id};
  window.cancelAnimationFrame=id=>__raf.delete(id);
  window.__step=()=>{__now+=50;const callbacks=[...__raf.values()];__raf.clear();callbacks.forEach(fn=>fn(__now))};
  window.__owned=[];window.__pointerReads=0;window.__dispatching=false;
  const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
  const owned=fn=>['onContourPointerMove','onContourPointerLeave','onContourEnvironmentChange'].includes(fn?.name);
  EventTarget.prototype.addEventListener=function(type,fn,options){
    if(owned(fn)&&!__owned.some(x=>x.target===this&&x.type===type&&x.fn===fn))__owned.push({target:this,type,fn});
    return add.call(this,type,fn,options)
  };
  EventTarget.prototype.removeEventListener=function(type,fn,options){
    __owned=__owned.filter(x=>!(x.target===this&&x.type===type&&x.fn===fn));
    return remove.call(this,type,fn,options)
  };
  const rect=Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect=function(){if(__dispatching)__pointerReads++;return rect.call(this)};
  window.__mouse=(x,y,type='mouse')=>{
    const event=new PointerEvent('pointermove',{clientX:x,clientY:y,pointerType:type,isPrimary:true,bubbles:true});
    Object.defineProperty(event,'timeStamp',{value:__now});
    __dispatching=true;document.querySelector('.app_frame').dispatchEvent(event);__dispatching=false;
  };
  window.__hash=()=>{
    const c=document.querySelector('[data-endfield-contour-lines]');
    const a=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    let h=2166136261;for(let i=3;i<a.length;i+=4)h=Math.imul(h^a[i],16777619);return h>>>0;
  };
  window.__pointerCount=()=>__owned.filter(x=>x.type==='pointermove').length;
`
;(async () => {
  const browser = await launch()
  try {
    await browser.send('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: false })
    const sample = async enabled => {
      /* contourAnim is stated ON because the trail only exists on the animated
         path (the hint says so: 仅动态模式生效), while the shipped default is a
         STATIC sheet. The static branch has its own assertions below. */
      await boot(browser, root, { contour: '1', contourAnim: '1', contourTrail: enabled ? '1' : '0' }, prefix)
      await browser.until('document.querySelector("[data-endfield-contour-lines]") !== null')
      await browser.sleep(100)
      return browser.evaluate(`(() => {
        __step();const before=__hash();
        __mouse(480,270,'touch');__step();const touch=__hash();
        __mouse(480,270,'pen');__step();const pen=__hash();
        __mouse(480,270);__step();const moved=__hash();
        for(let i=0;i<60;i++)__step();
        return {before,touch,pen,moved,expired:__hash(),reads:__pointerReads,listeners:__pointerCount()}
      })()`)
    }
    const control = await sample(false), trail = await sample(true)
    assert.equal(trail.before, control.before, 'idle trail does not change the ambient field')
    assert.equal(trail.touch, control.touch, 'touch input does not deform the field')
    assert.equal(trail.pen, control.pen, 'pen input does not deform the field')
    assert.notEqual(trail.moved, control.moved, 'mouse visibly deforms contours')
    assert.equal(trail.expired, control.expired, 'expired trail leaves exactly the ambient image')
    assert.equal(control.listeners, 0); assert.equal(trail.listeners, 1)
    assert.equal(trail.reads, 0, 'pointer handler does not synchronously read layout')
    console.log('PASS: local deformation, exact ambient recovery, default-off and no pointer layout reads')

    // Static mode removes input and the animation callback, while preserving preference.
    await browser.evaluate('__prefs.setItem("dsh-theme-endfield-contour-anim","0")')
    assert.equal(await browser.evaluate('__pointerCount()'), 0)
    const still = await browser.evaluate('__hash()')
    await browser.evaluate('__mouse(600,300);for(let i=0;i<10;i++)__step()')
    assert.equal(await browser.evaluate('__hash()'), still)
    await browser.evaluate('__prefs.setItem("dsh-theme-endfield-contour-anim","1")')
    assert.equal(await browser.evaluate('__pointerCount()'), 1)

    // OS preference changes use the actual MediaQueryList change event.
    await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
    await browser.until('__pointerCount()===0')
    await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })
    await browser.until('__pointerCount()===1')
    await browser.evaluate('Object.defineProperty(document,"hidden",{configurable:true,value:true});document.dispatchEvent(new Event("visibilitychange"))')
    assert.equal(await browser.evaluate('__pointerCount()'), 0)
    await browser.evaluate('delete document.hidden;document.dispatchEvent(new Event("visibilitychange"))')
    assert.equal(await browser.evaluate('__pointerCount()'), 1)
    await browser.evaluate('window.dispatchEvent(new Event("scroll"))')
    assert.equal(await browser.evaluate('__pointerCount()'), 0)
    await browser.evaluate('window.dispatchEvent(new Event("scrollend"))')
    await browser.until('__pointerCount()===1')
    console.log('PASS: static, live reduced-motion, hidden-page and scroll pause policies')

    for (let i = 0; i < 5; i++) {
      await browser.evaluate('__mouse(480,270);__step();__prefs.setItem("dsh-theme-endfield-contour","0")')
      assert.equal(await browser.evaluate('__owned.length'), 0)
      await browser.evaluate('__prefs.setItem("dsh-theme-endfield-contour","1")')
      assert.equal(await browser.evaluate('__pointerCount()'), 1)
      assert.equal(await browser.evaluate('document.querySelectorAll("[data-endfield-contour-lines]").length'), 1)
    }
    await browser.evaluate('__disposers.forEach(fn=>fn())')
    assert.equal(await browser.evaluate('__owned.length'), 0)
    assert.equal(await browser.evaluate('document.querySelectorAll("[data-endfield-contour-lines]").length'), 0)
    assert.deepEqual(browser.errors, [])
    console.log('PASS: repeated enable/disable and full listener/canvas cleanup')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
