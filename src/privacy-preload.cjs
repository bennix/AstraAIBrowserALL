const {contextBridge}=require('electron');
// Restrict common fingerprint reads before page scripts; official AI and sign-in sites use narrow compatibility exceptions.
if(process.argv.includes('--astra-strict-privacy'))contextBridge.executeInMainWorld({func:()=>{ const host=location.hostname;
 if(host==='claude.ai'||host.endsWith('.claude.ai')||host==='anthropic.com'||host.endsWith('.anthropic.com')||host==='challenges.cloudflare.com'||host==='gemini.google.com'||host==='accounts.google.com')return;
 // Notebook's application bootstrap requires native font/canvas APIs, like Gemini.
 if(location.protocol==='https:'&&['notebook.google.com','notebooklm.google.com'].includes(host))return;
 // Apple sign-in widgets require native rendering and font measurements. Scope compatibility to authentication routes.
 if(location.protocol==='https:'&&['appleid.apple.com','idmsa.apple.com'].includes(host)&&/^\/(?:auth\/(?:authorize|signin)|appleauth\/auth)(?:\/|$)/.test(location.pathname))return;
 if(location.protocol==='https:'&&['x.com','twitter.com','grok.com','www.grok.com'].includes(host))return;
 // These 3D lessons need a rendering context; canvas export/read restrictions still apply.
 const interactiveLab=()=>location.protocol==='https:'&&['wedulab.com','www.wedulab.com'].includes(location.hostname)&&/^\/labs(?:\/|$)/.test(location.pathname);
 const denied=()=>{throw new DOMException('Blocked by strict fingerprint protection','NotAllowedError');};
 const replace=(target,name,value)=>{if(!target)return;try{Object.defineProperty(target,name,{value,writable:false,configurable:false});}catch{}};

 for(const type of [globalThis.HTMLCanvasElement,globalThis.OffscreenCanvas]){const original=type?.prototype.getContext;if(original)replace(type.prototype,'getContext',function(kind,...args){if(/webgl|webgpu/i.test(String(kind))&&!interactiveLab())return null;return original.call(this,kind,...args);});}
 for(const name of ['AudioContext','webkitAudioContext','OfflineAudioContext','webkitOfflineAudioContext'])if(name in globalThis)replace(globalThis,name,denied);
 for(const name of ['toDataURL','toBlob'])replace(globalThis.HTMLCanvasElement?.prototype,name,denied);
 for(const name of ['getImageData','measureText'])replace(globalThis.CanvasRenderingContext2D?.prototype,name,denied);
 replace(globalThis.OffscreenCanvas?.prototype,'convertToBlob',denied);
 for(const name of ['getImageData','measureText'])replace(globalThis.OffscreenCanvasRenderingContext2D?.prototype,name,denied);
 replace(globalThis.FontFaceSet?.prototype,'check',()=>false);
 replace(globalThis.FontFaceSet?.prototype,'load',()=>Promise.reject(new DOMException('Font probing blocked','NotAllowedError')));
 if('queryLocalFonts' in globalThis)replace(globalThis,'queryLocalFonts',()=>Promise.reject(new DOMException('Local font enumeration blocked','NotAllowedError')));
 if(globalThis.navigator.mediaDevices)replace(Object.getPrototypeOf(navigator.mediaDevices),'enumerateDevices',async()=>[]);
}});

if(process.argv.includes('--astra-do-not-track'))contextBridge.executeInMainWorld({func:()=>{try{Object.defineProperty(Navigator.prototype,'globalPrivacyControl',{get:()=>true});}catch{}}});
