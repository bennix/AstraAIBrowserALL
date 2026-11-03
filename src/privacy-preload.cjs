const {contextBridge}=require('electron');
// Restrict common fingerprint reads before page scripts; official AI and sign-in sites use narrow compatibility exceptions.
if(process.argv.includes('--astra-strict-privacy'))contextBridge.executeInMainWorld({func:()=>{ const host=location.hostname;
 if(host==='claude.ai'||host.endsWith('.claude.ai')||host==='anthropic.com'||host.endsWith('.anthropic.com')||host==='challenges.cloudflare.com'||host==='gemini.google.com'||host==='accounts.google.com')return;
 const denied=()=>{throw new DOMException('Blocked by strict fingerprint protection','NotAllowedError');};
 const replace=(target,name,value)=>{if(!target)return;try{Object.defineProperty(target,name,{value,writable:false,configurable:false});}catch{}};
 // X's sign-in challenge needs real canvas results. Keep the exception local to its top-level login routes.
 const isXLogin=()=>location.protocol==='https:'&&window===window.top&&['x.com','twitter.com'].includes(location.hostname)&&/^\/(?:i\/(?:flow|jf\/onboarding)(?:\/|$)|login(?:\/|$)|account\/login(?:\/|$))/.test(location.pathname);
 const protectCanvasRead=(target,name)=>{const original=target?.[name];if(typeof original!=='function')return;replace(target,name,function(...args){if(isXLogin())return Reflect.apply(original,this,args);return denied();});};

 for(const type of [globalThis.HTMLCanvasElement,globalThis.OffscreenCanvas]){const original=type?.prototype.getContext;if(original)replace(type.prototype,'getContext',function(kind,...args){if(/webgl|webgpu/i.test(String(kind)))return null;return original.call(this,kind,...args);});}
 for(const name of ['AudioContext','webkitAudioContext','OfflineAudioContext','webkitOfflineAudioContext'])if(name in globalThis)replace(globalThis,name,denied);
 for(const name of ['toDataURL','toBlob'])protectCanvasRead(globalThis.HTMLCanvasElement?.prototype,name);
 for(const name of ['getImageData','measureText'])protectCanvasRead(globalThis.CanvasRenderingContext2D?.prototype,name);
 protectCanvasRead(globalThis.OffscreenCanvas?.prototype,'convertToBlob');
 for(const name of ['getImageData','measureText'])protectCanvasRead(globalThis.OffscreenCanvasRenderingContext2D?.prototype,name);
 replace(globalThis.FontFaceSet?.prototype,'check',()=>false);
 replace(globalThis.FontFaceSet?.prototype,'load',()=>Promise.reject(new DOMException('Font probing blocked','NotAllowedError')));
 if('queryLocalFonts' in globalThis)replace(globalThis,'queryLocalFonts',()=>Promise.reject(new DOMException('Local font enumeration blocked','NotAllowedError')));
 if(globalThis.navigator.mediaDevices)replace(Object.getPrototypeOf(navigator.mediaDevices),'enumerateDevices',async()=>[]);
}});

if(process.argv.includes('--astra-do-not-track'))contextBridge.executeInMainWorld({func:()=>{try{Object.defineProperty(Navigator.prototype,'globalPrivacyControl',{get:()=>true});}catch{}}});
