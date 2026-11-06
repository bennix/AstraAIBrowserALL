const assert=require('node:assert/strict');const fs=require('node:fs');const test=require('node:test');const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../src/privacy-preload.cjs'),'utf8');
function page(host,{strict=true,seed='session-a',protocol='https:',pathname='/'}={}){
 const context=vm.createContext({DOMException,location:{hostname:host,origin:protocol+'//'+host,pathname,protocol},process:{argv:[...(strict?['--astra-strict-privacy']:[]),'--astra-fingerprint-seed='+seed]},require:()=>({contextBridge:{executeInMainWorld:({func,args=[]})=>func(...args)}})});
 vm.runInContext(`
 navigator={};
 class HTMLCanvasElement {getContext(kind){return kind;} toDataURL(type){return type;}}
 class CanvasRenderingContext2D {measureText(){return 'native-metrics';} getImageData(x,y,w,h){if(w===0||h===0)throw new DOMException('size','IndexSizeError');const data=new Uint8ClampedArray(Math.abs(w*h)*4).fill(100);for(let i=3;i<data.length;i+=4)data[i]=255;return {width:Math.abs(w),height:Math.abs(h),data};}}
 class OffscreenCanvas {getContext(kind){return kind;}}
 class AudioContext {} class OfflineAudioContext {}
 class FontFaceSet {check(){return true;} load(){return Promise.resolve([]);}}
 class AudioBuffer {constructor(){this.samples=[new Float32Array(128),new Float32Array(128)];}getChannelData(channel){if(!this.samples[channel])throw new RangeError('channel');return this.samples[channel];}copyFromChannel(destination,channel,start=0){destination.set(this.getChannelData(channel).subarray(start,start+destination.length));}copyToChannel(source,channel,start=0){this.samples[channel].set(source,start);}}
 class AnalyserNode {getFloatFrequencyData(array){array.fill(-50);}getFloatTimeDomainData(array){array.fill(0);}}
 Object.assign(globalThis,{HTMLCanvasElement,CanvasRenderingContext2D,OffscreenCanvas,AudioContext,OfflineAudioContext,FontFaceSet,AudioBuffer,AnalyserNode});
 `,context);
 vm.runInContext(source,context);return code=>vm.runInContext(code,context);
}
const pixels="Array.from(new CanvasRenderingContext2D().getImageData(0,0,64,64).data).join(',')";
test('readout perturbation is stable per origin/session and differs across origins and sessions',()=>{
 const a=page('one.example'),refresh=page('one.example'),b=page('two.example'),restart=page('one.example',{seed:'session-b'}),native=page('one.example',{strict:false});
 assert.equal(a(pixels),a(pixels));assert.equal(a(pixels),refresh(pixels));assert.notEqual(a(pixels),b(pixels));assert.notEqual(a(pixels),restart(pixels));assert.notEqual(a(pixels),native(pixels));
 assert.equal(a('new CanvasRenderingContext2D().measureText()'),'native-metrics');assert.equal(a('new HTMLCanvasElement().getContext("webgl2")'),'webgl2');assert.equal(a('new FontFaceSet().check()'),true);
 assert.throws(()=>a('new CanvasRenderingContext2D().getImageData(0,0,0,1)'),{name:'IndexSizeError'});
});
test('existing compatibility exceptions retain native readouts and lookalikes do not',()=>{
 const native=page('example.org',{strict:false})(pixels);
 for(const host of ['x.com','twitter.com','grok.com','www.grok.com','accounts.google.com','gemini.google.com','notebook.google.com','notebooklm.google.com'])assert.equal(page(host)(pixels),native,host);
 for(const host of ['example.org','x.com.example.org','notebook.google.com.example.org','other.google.com'])assert.notEqual(page(host)(pixels),native,host);
 assert.notEqual(page('notebook.google.com',{protocol:'http:'})(pixels),native);
});
test('audio constructors stay native and repeated reads do not accumulate noise',()=>{
 const read=page('one.example');
 assert.equal(read('typeof OfflineAudioContext'),'function');
 assert.equal(read(`(()=>{const b=new AudioBuffer();const a=Array.from(b.getChannelData(0));const c=Array.from(b.getChannelData(0));return JSON.stringify(a)===JSON.stringify(c)&&a.some(x=>x!==0)&&a.every(x=>Math.abs(x)<1e-6);})()`),true);
 assert.equal(read(`(()=>{const a=new AnalyserNode(),x=new Float32Array(32),y=new Float32Array(32);a.getFloatFrequencyData(x);a.getFloatFrequencyData(y);return x.every((v,i)=>v===y[i])&&x.some(v=>v!==-50);})()`),true);
});

test('native method metadata and scoped Apple/WeduLab behavior remain compatible',()=>{
 const read=page('example.org');assert.equal(read('CanvasRenderingContext2D.prototype.getImageData.name'),'getImageData');assert.equal(read('CanvasRenderingContext2D.prototype.getImageData.length'),4);assert.equal(read('Object.hasOwn(CanvasRenderingContext2D.prototype.getImageData,"prototype")'),false);
 const native=page('example.org',{strict:false})(pixels);
 assert.equal(page('appleid.apple.com',{pathname:'/auth/authorize'})(pixels),native);
 assert.notEqual(page('appleid.apple.com',{pathname:'/account'})(pixels),native);
 const lab=page('wedulab.com',{pathname:'/labs/contour'});assert.equal(lab('new HTMLCanvasElement().getContext("webgl2")'),'webgl2');assert.notEqual(lab(pixels),native);
});
