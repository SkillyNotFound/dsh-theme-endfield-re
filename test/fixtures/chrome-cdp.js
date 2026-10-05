// Browser tests only. Node 22+ supplies WebSocket/fetch; no runtime dependency.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { spawn } = require('node:child_process')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function launch() {
  const chrome = [process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome','/usr/bin/chromium'].filter(Boolean).find(p => fs.existsSync(p))
  if (!chrome) throw new Error('Set CHROME_PATH to a Chrome/Edge executable')
  if (typeof WebSocket !== 'function') throw new Error('Browser tests require Node 22+')
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'endfield-cdp-'))
  // stdio:'ignore' + a log fd instead of the default pipe: a piped child needs a named
  // pipe, which a confined sandbox denies (Chromium then dies with
  // "platform_channel.cc Check failed: Access denied"). The devtools endpoint does not
  // depend on the pipe, so the tests run either way; the log file keeps startup
  // failures diagnosable.
  const chromeLog=fs.openSync(path.join(profile,'chrome.log'),'a')
  const child=spawn(chrome,['--headless=new','--no-sandbox','--no-first-run','--no-default-browser-check',
    '--disable-crash-reporter','--disable-breakpad',
    '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore',chromeLog,chromeLog]})
  let startupError=null
  child.on('error',e=>{startupError=e})
  let ws,seq=0
  const pending=new Map(),errors=[]
  async function close(){
    if(ws?.readyState===WebSocket.OPEN) { try { await send('Browser.close') } catch {} }
    ws?.close();child.kill()
    for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Browser closed'))}
    pending.clear()
    // Chromium may still be releasing files on Windows; leave only this isolated
    // temp profile if removal is busy. It contains fixture data, never real login.
    try{fs.rmSync(profile,{recursive:true,force:true,maxRetries:4,retryDelay:100})}catch{}
  }
  function send(method,params={}) {
    const id=++seq
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'))},10000)
      pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}))
    })
  }
  try {
    const portFile=path.join(profile,'DevToolsActivePort')
    for(let i=0;!fs.existsSync(portFile)&&i<150;i++){if(startupError)throw startupError;await sleep(100)}
    if(!fs.existsSync(portFile))throw Error('Chrome startup timed out')
    const port=fs.readFileSync(portFile,'utf8').split('\n')[0]
    const targets=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json()
    ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl)
    await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})})
    ws.addEventListener('message',event=>{
      const m=JSON.parse(event.data)
      if(m.id){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}
      if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text+': '+(m.params.exceptionDetails.exception?.description||''))
    })
    await send('Runtime.enable');await send('Page.enable')
    await send('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1.5,mobile:false})
    const evaluate=async expression=>{
      const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true})
      if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
      return r.result.value
    }
    return {send,evaluate,errors,close,sleep,async until(expression){
      for(let i=0;i<100;i++){if(await evaluate(expression))return;await sleep(100)}
      throw Error('Condition timed out: '+expression)
    }}
  }catch(error){await close();throw error}
}
const HTML=`<!doctype html><html data-windows-titlebar><head><style>
html,body{height:100%;margin:0}body{--dsw-alias-bg-base:#e8e8e2;--dsw-alias-bg-layer-1:#f2f2ec;
--dsw-alias-label-primary:#101110;--dsw-alias-border-l1:#ccc;--dsw-alias-border-l2:#aaa;
--dsw-specific-sidebar-fill:#f0efe8;--dsh-windows-titlebar-height:40px;--dsh-sidebar-width:220px}
body[data-ds-dark-theme]{--dsw-alias-bg-base:#101110;--dsw-alias-bg-layer-1:#181a17;--dsw-alias-label-primary:#f5f5f0;
--dsw-specific-sidebar-fill:#191c19}
/* Class names follow the shipped layout module: '<hash>_frame' / '<hash>_sidebarCol', i.e.
   module_export with NO line suffix. That is the naming the theme's suffix selectors are
   written against, so the fixture has to carry it — otherwise the sidebar/titlebar rules
   look dead here for a reason that does not exist in the app. */
.BynINW_frame{position:relative;display:grid;grid-template-columns:220px 1fr;grid-template-rows:minmax(0,1fr);
  box-sizing:border-box;padding-top:var(--dsh-windows-titlebar-height);height:100%;background:var(--dsw-alias-bg-base);overflow:hidden}
.BynINW_frame::before{content:"";position:absolute;inset:0 0 auto;height:var(--dsh-windows-titlebar-height);
  background:var(--dsw-specific-sidebar-fill);-webkit-app-region:drag}
.BynINW_sidebarCol{position:relative;background:var(--dsw-specific-sidebar-fill);min-width:0;overflow:hidden}
.BynINW_centerCol{position:relative;min-width:0;display:flex;flex-direction:column;overflow:hidden}
.wSkVaW_root{height:100%}.test_tableScroll{margin:60px 30px}
td{padding:12px}[data-composer-card]{position:absolute;bottom:30px;left:260px;width:550px;height:90px;background:#eee}
/* The panel shell is transparent in the shipped SidebarRight.module.css (background:0 0)
   — it is the positioning overlay, not a surface. Kept faithful here, because the
   regression this fixture guards is the theme painting THAT box. */
[data-sidebar-right-panel]{position:absolute;right:0;top:0;width:120px;height:100%}
[data-dockkit-host]{display:block;width:100%;height:100%}
/* DockLayout's surface, named the way the host really names it: export_hash_line, so
   the theme has to substring-match rather than suffix-match here. */
._tabHost_6nhg2_162{flex:1 1 auto;width:100%;height:100%;background:rgb(238,238,238)}
/* The sidebar collapse control, exactly as the shipped ui-sidebar module declares it:
   position:fixed + z-index:30 + its own top offset. Its containing block is the VIEWPORT,
   so any theme rule that establishes one (a transform, filter or backdrop-filter on an
   ancestor) silently moves the button off the titlebar. Kept here so glass.test.js can
   assert it does not move. */
._2H3hWW_toggle{position:fixed;left:12px;top:calc((var(--dsh-windows-titlebar-height) - 28px) / 2);
  z-index:30;-webkit-app-region:no-drag;width:28px;height:28px}
</style></head><body><div class="BynINW_frame"><div class="BynINW_sidebarCol" data-slot="sidebar"><div>Sidebar</div></div>
<div class="_2H3hWW_toggle" data-endfield-collapse-toggle>collapse</div>
<div class="BynINW_centerCol"><div class="wSkVaW_root"><table class="test_tableScroll"><tbody><tr><td id="cell">Selected text inside a hovered row</td></tr></tbody></table></div></div>
<div data-composer-card>Composer</div>
<div data-sidebar-right-panel="push" data-sidebar-right-open>
  <div data-dockkit-host="dock" data-dockkit-column="0" data-dockkit-pane>
    <div class="_tabHost_6nhg2_162"><div>Docked panel</div></div>
  </div>
</div></div></body></html>`
async function boot(browser,root,values={},prefix='') {
  await browser.send('Page.navigate',{url:'data:text/html,'+encodeURIComponent(HTML)})
  await browser.until('document.querySelector("#cell") !== null')
  await browser.evaluate(prefix+'\nwindow.__ModuleLoader__={load:m=>{window.__MOD__=m}}')
  await browser.evaluate(fs.readFileSync(path.join(root,'client.js'),'utf8'))
  const {BROWSER_SETTINGS_SCOPE_SNIPPET}=require(path.join(root,'test/fixtures/settings-scope.browser.js'))
  await browser.evaluate(BROWSER_SETTINGS_SCOPE_SNIPPET+`\nwindow.__prefs=__endfieldSettingsScope(${JSON.stringify({enabled:'1',loader:'0',watermark:'0',...values})});
    window.__disposers=[];window.__MOD__.factory(()=>null).apply({
      get:n=>n==='settingsScope'?__prefs.binder:n==='theme'?{overrideTokens:()=>()=>{}}:undefined,
      effect:f=>{const d=f();if(typeof d==='function')__disposers.push(d);return d}
    })`)
}
module.exports={launch,boot}
