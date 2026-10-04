/* Dedicated contour worker. Kernel is extracted from client.js by the build script.
 * MIT; original terrain Copyright (c) 2026 ymh0000123. */
const CONTOUR_STEP = 6, CONTOUR_LEVELS = 20, CONTOUR_SPAN = 1.45
const CONTOUR_MIN_LEN = 40, CONTOUR_MIN_RING_BOX = 21
const CONTOUR_KEEP_LEN = CONTOUR_MIN_LEN * 1.35, CONTOUR_KEEP_RING = CONTOUR_MIN_RING_BOX * 1.5
const CONTOUR_MIN_CROSSINGS = 3
let contourSeed = 1, contourField = null, contourGeom = null, contourPaths = []
let contourLineCv = null, canvas = null, painter = null, stroke = 'rgba(0,0,0,0)', rasterizer = null
const contourStroke = () => stroke
/* The centre-defocus pass (中央散景) is MAIN-THREAD ONLY, so it is a no-op here.
 *
 * contourDrawLines() is extracted verbatim from client.js by
 * scripts/build-contour-worker.js, and the fork's version calls
 * contourBokehPass(). This backend cannot run that pass in principle: the
 * rasteriser is either the WebGL2 shim (src/contour-webgl.js), which exposes no
 * filter, no globalCompositeOperation, no gradients and no drawImage, or an
 * OffscreenCanvas the page has no way to composite onto.
 *
 * Defining it as a no-op is what keeps the sheet SHARP on this backend — the
 * documented behaviour — instead of throwing a ReferenceError inside the worker.
 * The host also never starts the worker while a defocus level is selected (see
 * bokehNeedsMainThread in client.js), so this is a belt-and-braces definition
 * rather than a live path. */
const contourBokehPass = () => {}
/* CONTOUR_KERNEL */
/* CONTOUR_WEBGL */
self.onmessage = ({data}) => {
  try {
    if (data.type === 'init') {
      if (canvas !== null) throw new Error('duplicate worker init')
      canvas = data.canvas; contourSeed = data.seed
      painter = createWebGLContourContext(canvas, () => self.postMessage({type:'error',message:'WebGL context lost'}))
      rasterizer = painter ? 'worker-webgl2' : 'worker-canvas2d'
      if (!painter) painter = canvas.getContext('2d', {willReadFrequently:true})
      if (!painter) throw new Error('worker canvas unavailable')
      contourLineCv = {getContext:()=>painter, get width(){return canvas.width},get height(){return canvas.height}}
      self.postMessage({type:'initialized',rasterizer})
    } else if (data.type === 'frame') {
      if (!canvas || !painter) throw new Error('worker not initialized')
      const {w,h,dpr,phase,geometry,color,seq}=data
      if (![w,h,dpr,phase,seq].every(Number.isFinite) || w<1 || h<1 || dpr<=0 || dpr>2
        || Math.round(w*dpr)*Math.round(h*dpr)>8000000 || !/^#[0-9a-f]{8}$/i.test(color)) throw new Error('invalid frame')
      const resized = !contourGeom || contourGeom.w!==w || contourGeom.h!==h
      if (resized) contourBuild(w,h)
      const width=Math.round(w*dpr),height=Math.round(h*dpr)
      if(canvas.width!==width)canvas.width=width
      if(canvas.height!==height)canvas.height=height
      const c=color.slice(1)
      stroke=`rgba(${parseInt(c.slice(0,2),16)},${parseInt(c.slice(2,4),16)},${parseInt(c.slice(4,6),16)},${parseInt(c.slice(6,8),16)/255})`
      if(geometry || resized)contourExtract(phase)
      painter.setTransform(1,0,0,1,0,0)
      contourDrawLines()
      self.postMessage({type:'painted',seq,rasterizer})
    } else if (data.type === 'dispose') {
      if(painter && painter.dispose)painter.dispose()
      contourField=null;contourPaths=[];painter=null;canvas=null
      self.close()
    }
  } catch(error) { self.postMessage({type:'error',message:String(error.message || error)}) }
}
self.postMessage({type:'ready'})
