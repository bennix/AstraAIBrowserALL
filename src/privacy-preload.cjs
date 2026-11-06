const {contextBridge}=require('electron');
// A fresh browser-session seed is shared by tabs; page code receives only origin-scoped readout noise.
const noiseSeed=process.argv.find(value=>value.startsWith('--astra-fingerprint-seed='))?.split('=')[1]||`${Date.now()}-${Math.random()}`;
if(process.argv.includes('--astra-strict-privacy'))contextBridge.executeInMainWorld({args:[noiseSeed],func:(sessionSeed)=>{
 const host=location.hostname;
 // Existing verification compatibility exceptions remain narrow.
 if(host==='claude.ai'||host.endsWith('.claude.ai')||host==='anthropic.com'||host.endsWith('.anthropic.com')||host==='challenges.cloudflare.com'||host==='gemini.google.com'||host==='accounts.google.com')return;
 if(location.protocol==='https:'&&['notebook.google.com','notebooklm.google.com'].includes(host))return;
 if(location.protocol==='https:'&&['appleid.apple.com','idmsa.apple.com'].includes(host)&&/^\/(?:auth\/(?:authorize|signin)|appleauth\/auth)(?:\/|$)/.test(location.pathname))return;
 if(location.protocol==='https:'&&['x.com','twitter.com','grok.com','www.grok.com'].includes(host))return;
 const mix=value=>{value=Math.imul(value^(value>>>16),0x7feb352d);value=Math.imul(value^(value>>>15),0x846ca68b);return (value^(value>>>16))>>>0;};
 let seed=2166136261;
 for(const c of sessionSeed+'|'+(location.origin||host))seed=Math.imul(seed^c.charCodeAt(0),16777619)>>>0;
 seed=mix(seed);
 // Keep descriptors writable/configurable like the native methods. No API constructors or layout metrics are removed.
 const replace=(target,name,wrap)=>{if(!target||typeof target[name]!=='function')return;const native=target[name],descriptor=Object.getOwnPropertyDescriptor(target,name);try{const implementation=wrap(native);const method=new Proxy(native,{apply:(_method,receiver,args)=>Reflect.apply(implementation,receiver,args)});Object.defineProperty(target,name,{...descriptor,value:method});}catch{}};
 const perturb=(data,width,height,x=0,y=0,offset=0,channels=4)=>{
  if(!data||!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0)return;
  const bytes=data instanceof Uint8Array||data instanceof Uint8ClampedArray;
  const floats=data instanceof Float32Array||typeof Float16Array!=='undefined'&&data instanceof Float16Array;
  if(!bytes&&!floats)return;
  const stride=16,phaseX=seed%stride,phaseY=(seed>>>8)%stride;
  const startX=((phaseX-x)%stride+stride)%stride,startY=((phaseY-y)%stride+stride)%stride;
  for(let row=startY;row<height;row+=stride)for(let col=startX;col<width;col+=stride){
   const bits=mix(seed^Math.imul(x+col,73856093)^Math.imul(y+row,19349663));
   const index=offset+(row*width+col)*channels+bits%Math.min(channels,3);
   if(index>=data.length||channels===4&&data[offset+(row*width+col)*channels+3]===0)continue;
   if(bytes)data[index]^=1;
   else if(Number.isFinite(data[index]))data[index]+=(bits&8?1:-1)*1e-7;
  }
 };
 // Read pixels only after the native implementation validates arguments and cross-origin restrictions.
 for(const type of [globalThis.CanvasRenderingContext2D,globalThis.OffscreenCanvasRenderingContext2D]){
  // Some test/platform implementations share a prototype; avoid wrapping inherited methods twice.
  if(type&&Object.hasOwn(type.prototype,'getImageData'))replace(type.prototype,'getImageData',native=>function(...args){
   const image=native.apply(this,args);
   perturb(image.data,image.width,image.height,Math.trunc(Number(args[0]))+Math.min(0,Math.trunc(Number(args[2]))),Math.trunc(Number(args[1]))+Math.min(0,Math.trunc(Number(args[3]))));return image;
  });
 }
 const createCanvas=globalThis.document?.createElement?.bind(document);
 // Exports use a temporary bitmap. Displayed canvas contents and repeated exports remain unchanged/stable.
 const exportCopy=(canvas,offscreen)=>{
  const width=canvas.width,height=canvas.height;
  if(!width||!height||width*height>1048576)return canvas;
  try{
   const copy=offscreen?new OffscreenCanvas(width,height):createCanvas('canvas');copy.width=width;copy.height=height;
   const ctx=copy.getContext('2d');ctx.drawImage(canvas,0,0);
   // getImageData above applies noise once, then native putImageData stores that readout on the temporary bitmap.
   const image=ctx.getImageData(0,0,width,height);ctx.putImageData(image,0,0);return copy;
  }catch{return canvas;} // Native export still enforces SecurityError on tainted originals.
 };
 for(const name of ['toDataURL','toBlob'])replace(globalThis.HTMLCanvasElement?.prototype,name,native=>function(...args){return native.apply(exportCopy(this,false),args);});
 replace(globalThis.OffscreenCanvas?.prototype,'convertToBlob',native=>function(...args){return native.apply(exportCopy(this,true),args);});
 // WebGL contexts, capability enums and GPU readback remain native for rendering compatibility.
 // AudioBuffer remains a live native buffer. Perturb a few samples once per channel, not on every repeated read.
 const audioChannels=new WeakSet();
 const audioProto=globalThis.AudioBuffer?.prototype,nativeChannel=audioProto?.getChannelData;
 const noiseAudio=(buffer,channel)=>{
  const samples=nativeChannel.call(buffer,channel);
  if(audioChannels.has(samples.buffer))return samples;audioChannels.add(samples.buffer);
  const step=Math.max(1,Math.ceil(samples.length/500));
  for(let index=seed%step;index<samples.length;index+=step){
   const bits=mix(seed^Math.imul(index+1,2246822519));
   if(Number.isFinite(samples[index]))samples[index]+=(bits&1?1:-1)*1e-7;
  }return samples;
 };
 replace(audioProto,'getChannelData',native=>function(channel){return noiseAudio(this,channel);});
 for(const [name,scale] of [['getFloatFrequencyData',1e-4],['getFloatTimeDomainData',1e-7]])replace(globalThis.AnalyserNode?.prototype,name,native=>function(array){
  const result=native.call(this,array);for(let index=seed%8;index<array.length;index+=8)if(Number.isFinite(array[index]))array[index]+=(mix(seed^index)&1?1:-1)*scale;return result;
 });
 replace(audioProto,'copyToChannel',native=>function(source,channel,...args){const result=native.call(this,source,channel,...args);audioChannels.delete(nativeChannel.call(this,channel).buffer);return result;});
}});
if(process.argv.includes('--astra-do-not-track'))contextBridge.executeInMainWorld({func:()=>{
 try{
  const descriptor=Object.getOwnPropertyDescriptor(Navigator.prototype,'doNotTrack');
  const native=descriptor?.get;
  const get=native?new Proxy(native,{apply:(method,receiver,args)=>{Reflect.apply(method,receiver,args);return '1';}}):function(){return '1';};
  Object.defineProperty(Navigator.prototype,'doNotTrack',{configurable:true,enumerable:true,...descriptor,get});
  Object.defineProperty(Navigator.prototype,'globalPrivacyControl',{configurable:true,enumerable:true,get:()=>true});
 }catch{}
}});
