const assert=require('node:assert/strict'),path=require('node:path')
const {launch,boot}=require('./fixtures/chrome-cdp.js')
;(async()=>{
 const browser=await launch()
 try {
  await boot(browser,path.resolve(__dirname,'..'))
  assert.equal(await browser.evaluate('document.body.hasAttribute("data-endfield-glass")'),false)
  const original=await browser.evaluate('JSON.stringify(document.querySelector("[data-composer-card]").getBoundingClientRect().toJSON())')
  for(const dark of [false,true])for(const palette of ['valley','wuling']) {
    await browser.evaluate(`document.body.toggleAttribute('data-ds-dark-theme',${dark});__prefs.setItem('dsh-theme-endfield-palette',${JSON.stringify(palette)})`)
    /* The level moves OPACITY only; the radius is 磨砂模糊's job and so is constant here.
       Dark is its own row of the ladder, not a copy of light's. */
    const LADDER = dark ? [['subtle',.30],['standard',.40],['strong',.52]]
                        : [['subtle',.30],['standard',.42],['strong',.52]]
    for(const [level,alpha] of LADDER){
      await browser.evaluate(`__prefs.setItem('dsh-theme-endfield-glass',${JSON.stringify(level)})`)
      const material=await browser.evaluate(`(()=>{const e=document.querySelector('[data-composer-card]'),s=getComputedStyle(e);return {filter:s.backdropFilter,background:s.backgroundColor,box:JSON.stringify(e.getBoundingClientRect().toJSON())}})()`)
      assert.match(material.filter,/blur\(4px\)/,'the radius comes from 磨砂模糊, not from the level')
      assert.match(material.background,new RegExp(String(alpha).replace('.','\\.')),'level '+level+' must set its own opacity')
      assert.equal(material.box,original)
    }
    /* 磨砂模糊 owns the radius for every surface. The values are deliberately small: the
       frost is a tint, so the backdrop carries its texture, and a 2px contour stroke does
       not survive a large gaussian. 'off' must be a REAL 0, and the ladder monotone. */
    for(const [blur,radius] of [['off',0],['soft',2],['standard',4],['heavy',8]]){
      await browser.evaluate(`__prefs.setItem('dsh-theme-endfield-glass-blur',${JSON.stringify(blur)})`)
      const got=await browser.evaluate(`getComputedStyle(document.querySelector('[data-composer-card]')).backdropFilter`)
      assert.match(got,new RegExp('blur\\('+radius+'px\\)'),'磨砂模糊='+blur+' must set '+radius+'px on the composer')
      const side=await browser.evaluate(`getComputedStyle(document.querySelector('.BynINW_sidebarCol')).backdropFilter`)
      assert.match(side,new RegExp('blur\\('+radius+'px\\)'),'磨砂模糊='+blur+' must reach the sidebar too')
    }
    await browser.evaluate(`__prefs.setItem('dsh-theme-endfield-glass-blur','standard')`)
    /* The right panel: the frost must land on the PANE SURFACE and never on the panel's
       positioning shell. The shell is a position:absolute / top:0 / bottom:0 / right:0
       overlay at the panel's full width (push mode is ~45vw), so frosting it paints a
       half-window slab over the conversation column instead of a panel — the desktop
       report this contract exists to prevent. Both halves are asserted: moving the fill
       WITHOUT the surface would leave the panel unfrosted, which is the other failure. */
    await browser.evaluate(`__prefs.setItem('dsh-theme-endfield-glass','standard')`)
    const panel=await browser.evaluate(`(()=>{
      const pane=document.querySelector("[data-dockkit-host] > [class*='_tabHost']")
      const shell=document.querySelector("[data-sidebar-right-panel]")
      const read=e=>{const s=getComputedStyle(e);return{filter:s.backdropFilter,background:s.backgroundColor}}
      return {pane:pane?read(pane):null,shell:read(shell),paneFound:!!pane}
    })()`)
    assert.equal(panel.paneFound,true,'the pane surface must still be matched by the rule (a host rebuild may have moved it)')
    assert.match(panel.pane.filter,/blur\(4px\)/,'the docked pane surface must carry the frost')
    assert.notEqual(panel.pane.background,'rgba(0, 0, 0, 0)','the docked pane surface must carry the glass fill')
    assert.equal(panel.shell.filter,'none','the panel shell is a full-height overlay and must never be frosted')
    assert.equal(panel.shell.background,'rgba(0, 0, 0, 0)','the panel shell must stay transparent so the conversation column is not flattened')
    /* ONE treatment across the composer, the sidebar column and the Windows titlebar band.
       The sidebar/titlebar rule used to address [data-slot='sidebar'], which no shipped
       bundle emits, so the sidebar silently got nothing at all. Asserting all three carry
       the SAME fill and the SAME blur is what keeps them from drifting apart again. */
    const surfaces=await browser.evaluate(`(()=>{
      const read=(e,pe)=>{const s=getComputedStyle(e,pe||null);return{
        filter:s.backdropFilter||s.webkitBackdropFilter, background:s.backgroundColor, shadow:s.boxShadow}}
      return {composer:read(document.querySelector('[data-composer-card]')),
              sidebar:read(document.querySelector('.BynINW_sidebarCol')),
              titlebar:read(document.querySelector('.BynINW_frame'),'::before'),
              glow:read(document.querySelector('.BynINW_frame'),'::after')}
    })()`)
    assert.match(surfaces.sidebar.filter,/blur\(4px\)/,'the sidebar column must carry the frost (the old [data-slot=sidebar] rule matched nothing)')
    assert.match(surfaces.titlebar.filter,/blur\(4px\)/,'the Windows titlebar band must carry the frost')
    assert.equal(surfaces.sidebar.background,surfaces.composer.background,'sidebar and composer must share one fill')
    assert.equal(surfaces.titlebar.background,surfaces.composer.background,'titlebar band and composer must share one fill')
    assert.match(surfaces.sidebar.shadow,/inset/,'the sidebar needs its right-edge boundary line (the host sets border-right:none on Windows)')
    assert.match(surfaces.titlebar.shadow,/inset/,'the titlebar band needs its bottom boundary line')
    /* ...and the sheen/accent is ONE layer covering both, not a copy each: an ::after on
       the frame spanning the sidebar width and the titlebar height. */
    assert.notEqual(surfaces.glow.background,undefined)
    assert.match(await browser.evaluate(`getComputedStyle(document.querySelector('.BynINW_frame'),'::after').backgroundImage`),/gradient/,'the shared glow layer must paint the sheen')
    const glowBox=await browser.evaluate(`(()=>{const s=getComputedStyle(document.querySelector('.BynINW_frame'),'::after');
      const side=document.querySelector('.BynINW_sidebarCol').getBoundingClientRect();
      const band=document.querySelector('.BynINW_frame').getBoundingClientRect();
      return{w:s.width,h:s.height,content:s.content,sidebarW:side.width,bandTop:side.top,frameH:band.height}})()`)
    assert.notEqual(glowBox.content,'none','the shared glow layer must be generated')
    assert.equal(glowBox.w,Math.round(glowBox.sidebarW)+'px','the glow layer spans the sidebar width')
    assert.equal(glowBox.h,Math.round(glowBox.bandTop)+'px','the glow layer spans the titlebar band height (one L, not two copies)')
    const pos=await browser.evaluate('(()=>{const r=document.querySelector("#cell").getBoundingClientRect();return{x:r.x+20,y:r.y+10}})()')
    await browser.send('Input.dispatchMouseEvent',{type:'mouseMoved',...pos})
    const colors=await browser.evaluate(`(()=>{
      const td=document.querySelector('#cell'),range=document.createRange();range.selectNodeContents(td);getSelection().removeAllRanges();getSelection().addRange(range);
      const c=document.createElement('canvas').getContext('2d');
      const rgba=v=>{c.clearRect(0,0,1,1);c.fillStyle=v;c.fillRect(0,0,1,1);return Array.from(c.getImageData(0,0,1,1).data)};
      const normal=getComputedStyle(td),selected=getComputedStyle(td,'::selection');
      return{hover:rgba(normal.backgroundColor),ink:rgba(normal.color),selection:rgba(selected.backgroundColor),selectedInk:rgba(selected.color)}
    })()`)
    const luminance=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0)
    const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
    assert.notDeepEqual(colors.hover,colors.selection)
    assert.ok(contrast(colors.ink,colors.hover)>=4.5)
    assert.ok(contrast(colors.selectedInk,colors.selection)>=4.5)
    console.log('PASS:',dark?'dark':'light',palette,'glass tiers, stable geometry, readable hover and selection')
  }
  /* Fullscreen is excluded from the frost — but only the SHELL. The pane is the panel's
     only surface in either mode, so the scoping must not be keyed on the mode attribute.
     Ordered BEFORE the reduced-transparency emulation below, which switches the blur off
     for every surface and would make this assertion vacuous. */
  await browser.evaluate('document.querySelector("[data-sidebar-right-panel]").setAttribute("data-sidebar-right-panel","fullscreen")')
  assert.equal(await browser.evaluate('getComputedStyle(document.querySelector("[data-sidebar-right-panel]")).backdropFilter'),'none')
  assert.match(await browser.evaluate(`getComputedStyle(document.querySelector("[data-dockkit-host] > [class*='_tabHost']")).backdropFilter`),/blur\(/)
  await browser.evaluate('document.querySelector("[data-sidebar-right-panel]").setAttribute("data-sidebar-right-panel","push")')
  await browser.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]})
  assert.equal(await browser.evaluate('getComputedStyle(document.querySelector("[data-composer-card]")).backdropFilter'),'none')
  assert.equal(await browser.evaluate(`getComputedStyle(document.querySelector("[data-dockkit-host] > [class*='_tabHost']")).backdropFilter`),'none')
  await browser.evaluate('__prefs.setItem("dsh-theme-endfield-enabled","0")')
  assert.equal(await browser.evaluate('document.body.hasAttribute("data-endfield-glass")'),false)
  assert.deepEqual(browser.errors,[])
  console.log('PASS: reduced-transparency, fullscreen exclusion and theme teardown')
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
