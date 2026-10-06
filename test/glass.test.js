const assert=require('node:assert/strict'),path=require('node:path')
const {launch,boot}=require('./fixtures/chrome-cdp.js')
;(async()=>{
 const browser=await launch()
 try {
  await boot(browser,path.resolve(__dirname,'..'))
  assert.equal(await browser.evaluate('document.body.hasAttribute("data-endfield-glass")'),false)
  const original=await browser.evaluate('JSON.stringify(document.querySelector("[data-composer-card]").getBoundingClientRect().toJSON())')
  /* Captured with the frost OFF: the collapse control must not move once it is on. */
  const collapseBefore=await browser.evaluate('JSON.stringify(document.querySelector("[data-endfield-collapse-toggle]").getBoundingClientRect().toJSON())')
  for(const dark of [false,true])for(const palette of ['valley','wuling']) {
    await browser.evaluate(`document.body.toggleAttribute('data-ds-dark-theme',${dark});__prefs.setItem('dsh-theme-endfield-palette',${JSON.stringify(palette)})`)
    /* The level moves OPACITY only; the radius is 磨砂模糊's job and so is constant here.
       What makes the tint visible at all is the FILL being well off --dsw-alias-bg-base:
       a fill near the base composites straight back to the base (that was the bug, and it
       was invisible to every alpha value). The alpha ladder is what separates the levels. */
    const LADDER = [['subtle',.22],['standard',.34],['strong',.46]]
    for(const [level,alpha] of LADDER){
      await browser.evaluate(`__prefs.setItem('dsh-theme-endfield-glass',${JSON.stringify(level)})`)
      const material=await browser.evaluate(`(()=>{const e=document.querySelector('[data-composer-card]'),s=getComputedStyle(e);return {filter:s.backdropFilter,background:s.backgroundColor,box:JSON.stringify(e.getBoundingClientRect().toJSON())}})()`)
      assert.match(material.filter,/blur\(4px\)/,'the radius comes from 磨砂模糊, not from the level')
      assert.match(material.background,new RegExp(String(alpha).replace('.','\\.')),'level '+level+' must set its own opacity')
      assert.equal(material.box,original)
    }
    /* THE LITMUS TEST for this whole feature, and the one that was missing. A fill whose
       luminance sits near --dsw-alias-bg-base composites back to the page colour, so the
       frost is present, wins the cascade, and is still invisible. Assert the OUTCOME: the
       sidebar's painted colour (fill over the page base) must be clearly off the base. */
    const fog=await browser.evaluate(`(function(){
      const body=getComputedStyle(document.body)
      /* --dsw-alias-bg-base may come back as #101110 (hex, from this theme's own token
         override) while computed backgrounds come back as rgb(). Handle both, or the
         numbers silently become #101110 -> [1,0,1,1,1,0] and the check is nonsense. */
      const rgb=s=>{
        s=String(s).trim()
        if(s.charAt(0)==='#'){
          let h=s.slice(1)
          if(h.length===3) h=h.split('').map(function(c){return c+c}).join('')
          return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]
        }
        const m=s.match(/[\\d.]+/g)||[]
        return m.map(Number).slice(0,3)
      }
      const base=rgb(body.getPropertyValue('--dsw-alias-bg-base'))
      const fill=rgb(body.getPropertyValue('--edge-glass-fill'))
      const alpha=Number(body.getPropertyValue('--edge-glass-alpha'))
      const side=rgb(getComputedStyle(document.querySelector('.BynINW_sidebarCol')).backgroundColor)
      const L=c=>0.2126*c[0]+0.7152*c[1]+0.0722*c[2]
      const comp=fill.map((v,i)=>Math.round(base[i]*(1-alpha)+v*alpha))
      return {base,fill,alpha,comp,side,
              dComp:Math.abs(L(comp)-L(base)), dSide:Math.abs(L(side)-L(base))}
    })()`)
    assert.ok(fog.dComp>=4,'the glass fill must composite clearly off the page colour (fill '+JSON.stringify(fog.fill)+' over base '+JSON.stringify(fog.base)+' at '+fog.alpha+' gives '+JSON.stringify(fog.comp)+'; a fill near the base makes the frost invisible)')
    assert.ok(fog.dSide>=1,'the sidebar must actually paint that composite (page '+JSON.stringify(fog.base)+' -> sidebar '+JSON.stringify(fog.side)+')')
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
    /* The sidebar column carries the frost and a local specular sheen, but NOT an
       independent yellow radial bloom. The single yellow glow belongs to the full-frame
       contour sheet so it remains one continuous light source across both glass faces. */
    const surfaces=await browser.evaluate(`(()=>{
      const read=(e,pe)=>{const s=getComputedStyle(e,pe||null);return{
        filter:s.backdropFilter||s.webkitBackdropFilter, background:s.backgroundColor,
        image:s.backgroundImage, shadow:s.boxShadow, position:s.position, z:s.zIndex}}
      const side=document.querySelector('.BynINW_sidebarCol')
      const frame=document.querySelector('.BynINW_frame')
      return {composer:read(document.querySelector('[data-composer-card]')),
              sidebar:read(side), sidePosition:getComputedStyle(side).position,
              band:read(frame,'::before'), frameAfter:read(frame,'::after'),
               sharedGlow:read(frame.querySelector('[data-endfield-contour]'))}
    })()`)
    assert.match(surfaces.sidebar.filter,/blur\(4px\)/,'the sidebar column must carry the frost (the old [data-slot=sidebar] rule matched nothing)')
    assert.equal(surfaces.sidebar.background,surfaces.composer.background,'sidebar and composer must share one fill')
    assert.match(surfaces.sidebar.shadow,/inset/,'the sidebar needs its right-edge boundary line (the host sets border-right:none on Windows)')
    assert.match(surfaces.sidebar.image,/linear-gradient/,'the sidebar keeps its local specular sheen')
    assert.doesNotMatch(surfaces.sidebar.image,/radial-gradient/,'the sidebar must not restart a separate yellow bloom')
    assert.match(surfaces.sharedGlow.image,/radial-gradient/,'the contour sheet carries the one shared yellow bloom')
    assert.equal((surfaces.sharedGlow.image.match(/radial-gradient\(/g)||[]).length,1,'there is exactly one shared yellow bloom across the chrome')
    /* The titlebar band is the SAME MATERIAL as the sidebar: same fill and alpha, the
       same radius, the same edge. It used to be excluded here on the premise that
       tinting it desyncs the native caption buttons -- but their colour comes from
       lib/preload-app.cjs, which resolves the TOKEN on a probe span of its own
       (background-color: var(--dsw-specific-sidebar-fill)), not from this box. So the
       assertion is the outcome instead: band and sidebar composite to one colour. */
    const bandFill=await browser.evaluate(`(()=>{const p=document.createElement('span')
      p.style.cssText='position:fixed;visibility:hidden;background-color:var(--dsw-specific-sidebar-fill)'
      document.body.append(p);const c=getComputedStyle(p).backgroundColor;p.remove();return c})()`)
    assert.match(surfaces.band.filter,/blur\(4px\)/,'the Windows titlebar band carries the same frost as the sidebar')
    assert.equal(surfaces.band.background,surfaces.sidebar.background,'band and sidebar must share one fill (the frost row promises one material across the chrome)')
    assert.equal(surfaces.band.background,surfaces.composer.background,'the band takes the same fill as the composer, like the sidebar does')
    assert.notEqual(surfaces.band.background,bandFill,'the band is tinted: the caption probe resolves the TOKEN on its own span, not this box')
    assert.match(surfaces.band.image,/linear-gradient/,'the band keeps its local specular sheen on top of the frost fill')
    assert.doesNotMatch(surfaces.band.image,/radial-gradient/,'the band must not restart a separate yellow bloom')
    assert.equal(surfaces.band.z,'1','the band must paint above the z-index:0 contour sheet so backdrop blur is visible')
    assert.match(surfaces.band.shadow,/inset/,'the titlebar band keeps its bottom boundary line')
    /* The band's tint must track the level, not sit at one fixed alpha. */
    for(const [level,alpha] of [['subtle',.22],['standard',.34],['strong',.46]]){
      await browser.evaluate(`__prefs.setItem('dsh-theme-endfield-glass',${JSON.stringify(level)})`)
      const band=await browser.evaluate(`getComputedStyle(document.querySelector('.BynINW_frame'),'::before').backgroundColor`)
      assert.match(band,new RegExp(String(alpha).replace('.','\\.')),'强度='+level+' must reach the titlebar band too')
    }
    await browser.evaluate(`__prefs.setItem('dsh-theme-endfield-glass','standard')`)
    /* No overlay pseudo at all: that shape is what covered the collapse button. */
    assert.equal(surfaces.frameAfter.image,'none','the frame must not paint a glow overlay (it would cover in-flow chrome)')
    /* The sidebar collapse control is position:fixed against the VIEWPORT. A theme rule
       that establishes a containing block (transform / filter / backdrop-filter on any
       ancestor of it) moves that button off the titlebar — the reported "the collapse
       button disappeared". Its box must be identical with the frost on and off. */
    const collapse=await browser.evaluate(`(()=>{
      const e=document.querySelector('[data-endfield-collapse-toggle]')
      const s=getComputedStyle(e), r=e.getBoundingClientRect()
      return {position:s.position,z:s.zIndex,x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}}
    )()`)
    assert.equal(collapse.position,'fixed','the collapse control must stay fixed-positioned')
    assert.equal(collapse.z,'30','the collapse control keeps its own stacking level')
    assert.equal(JSON.stringify(await browser.evaluate('document.querySelector("[data-endfield-collapse-toggle]").getBoundingClientRect().toJSON()')),collapseBefore,'the collapse control must not move when the frost is on (a backdrop-filter ancestor would break its fixed containing block)')
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
