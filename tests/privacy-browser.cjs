// Run with `npm run check:privacy-browser`; uses only isolated local fixtures.
const {app,BrowserWindow,session}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'astra-privacy-test-')));
app.on('window-all-closed',()=>{});
const windows=[];
app.userAgentFallback=require('../src/user-agent.cjs')(app.userAgentFallback);
const deadline=setTimeout(()=>{console.error('Privacy browser test timed out');app.exit(1);},30000);deadline.unref();
app.whenReady().then(async()=>{
 const ses=session.fromPartition('privacy-fixtures');
 const png=fs.readFileSync(path.join(__dirname,'../assets/icons/astra.png'));
 const headers=[],agents=[];
 ses.protocol.handle('https',request=>{
  headers.push(request.headers.get('accept-language'));agents.push(request.headers.get('user-agent'));
  return request.url.endsWith('/image.png')?new Response(png,{headers:{'Content-Type':'image/png'}}):new Response('<!doctype html><body>Local fixture</body>',{headers:{'Content-Type':'text/html'}});
 });
 async function page(host,seed,strict=true){
  const win=new BrowserWindow({show:false,webPreferences:{session:ses,sandbox:true,contextIsolation:true,preload:path.join(__dirname,'../src/privacy-preload.cjs'),additionalArguments:['--astra-do-not-track',...(strict?['--astra-strict-privacy']:[]),'--astra-fingerprint-seed='+seed]}});
  windows.push(win);win.webContents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
  await win.loadURL('https://'+host+'/');return win.webContents;
 }
 const readout=`(async()=>{
  const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value))).map(x=>x.toString(16).padStart(2,'0')).join('');
  const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
  const ctx=canvas.getContext('2d');ctx.fillStyle='rgb(100,100,100)';ctx.fillRect(0,0,64,64);
  const read=()=>ctx.getImageData(0,0,64,64).data;
  const before=await hash(read()),again=await hash(read()),url=canvas.toDataURL(),urlAgain=canvas.toDataURL();
  const blob=await new Promise(r=>canvas.toBlob(r));const blobAgain=await new Promise(r=>canvas.toBlob(r));
  const after=await hash(read());
  const offscreen=new OffscreenCanvas(64,64),oc=offscreen.getContext('2d');oc.fillStyle='rgb(100,100,100)';oc.fillRect(0,0,64,64);
  const offA=await hash(await(await offscreen.convertToBlob()).arrayBuffer()),offB=await hash(await(await offscreen.convertToBlob()).arrayBuffer());
  const audio=new AudioBuffer({numberOfChannels:1,length:512,sampleRate:44100});
  const audioA=await hash(audio.getChannelData(0)),audioB=await hash(audio.getChannelData('0'));
  const gl=document.createElement('canvas').getContext('webgl');
  const image=new Image();image.src='https://cross-origin.test/image.png';await image.decode();
  const tainted=document.createElement('canvas');tainted.getContext('2d').drawImage(image,0,0);let security;
  try{tainted.toDataURL();security='missing';}catch(e){security=e.name;}
  return {before,again,after,url,urlAgain,blob:await hash(await blob.arrayBuffer()),blobAgain:await hash(await blobAgain.arrayBuffer()),offA,offB,audioA,audioB,webgl:gl&&gl.getParameter(gl.MAX_TEXTURE_SIZE)>0,audioConstructor:typeof OfflineAudioContext,security};
 })()`;
 const first=await page('one.test','session-a');const a=await first.executeJavaScript(readout);
 for(const [left,right] of [['before','again'],['before','after'],['url','urlAgain'],['blob','blobAgain'],['offA','offB'],['audioA','audioB']])assert.equal(a[left],a[right],left+' is stable');
 const privacy=await first.executeJavaScript('({dnt:navigator.doNotTrack,gpc:navigator.globalPrivacyControl,ua:navigator.userAgent})');assert.equal(privacy.dnt,'1');assert.equal(privacy.gpc,true);assert.doesNotMatch(privacy.ua,/Electron\/|astra-browser-electron\//);
 assert.equal(a.security,'SecurityError');assert.equal(a.webgl,true);assert.equal(a.audioConstructor,'function');
 await first.reload();await new Promise(r=>first.once('did-finish-load',r));
 const refreshed=await first.executeJavaScript(readout);assert.equal(a.before,refreshed.before);assert.equal(a.audioA,refreshed.audioA);
 const b=await(await page('two.test','session-a')).executeJavaScript(readout);
 const c=await(await page('one.test','session-b')).executeJavaScript(readout);
 const native=await(await page('one.test','session-a',false)).executeJavaScript(readout);
 for(const other of [b,c,native]){assert.notEqual(a.before,other.before);assert.notEqual(a.audioA,other.audioA);}
 await require('../src/browser-frames.cjs').applyLocale(first,{timezoneId:'Asia/Kuala_Lumpur',locale:'ms_MY',acceptLanguage:'ms-MY,en,zh,ta'});
 await first.loadURL('https://one.test/locale');
 const locale=await first.executeJavaScript(`(async()=>{const read=async()=>({ua:navigator.userAgent,hints:await navigator.userAgentData.getHighEntropyValues(['architecture','platformVersion','fullVersionList']),languages:[...navigator.languages],timezone:Intl.DateTimeFormat().resolvedOptions().timeZone});const worker=new Worker(URL.createObjectURL(new Blob(['('+read.toString()+')().then(postMessage)'],{type:'text/javascript'})));const value=await new Promise(r=>worker.onmessage=e=>r(e.data));worker.terminate();return {page:await read(),worker:value};})()`);
 assert.deepEqual(locale.page,locale.worker);assert.equal(locale.page.timezone,'Asia/Kuala_Lumpur');assert.deepEqual(locale.page.languages,['ms-MY','en','zh','ta']);assert.ok(locale.page.hints.brands.length);assert.match(headers.at(-1),/^ms-MY/);assert.equal(agents.at(-1),locale.page.ua);assert.doesNotMatch(agents.at(-1),/Electron\/|astra-browser-electron\//);
 assert.equal(locale.page.hints.platformVersion,'');assert.equal(locale.page.hints.architecture,'');
 assert.equal(first.getWebRTCIPHandlingPolicy(),'disable_non_proxied_udp');
 console.log('PASS: stable Canvas/PNG/Blob/Offscreen/Audio reads; origin/session isolation; native WebGL/audio constructors; taint security; page/Worker/HTTP locale and Client Hints; native WebRTC policy; normalized HTTP/page/Worker UA and DNT/GPC consistency.');
 for(const win of windows)win.destroy();app.exit(0);
}).catch(error=>{console.error(error);app.exit(1);});
