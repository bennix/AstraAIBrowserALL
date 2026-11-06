const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../src/privacy-legacy-preload.cjs'),'utf8');
function page(host,strict=true){const context=vm.createContext({DOMException,location:{hostname:host,protocol:'https:',pathname:'/'},process:{argv:strict?['--astra-strict-privacy']:[]},require:()=>({contextBridge:{executeInMainWorld:({func})=>func()}})});vm.runInContext("class HTMLCanvasElement {getContext(){return 'native';} toDataURL(){return 'native';}} class AudioContext {} Object.assign(globalThis,{HTMLCanvasElement,AudioContext}); navigator={};",context);vm.runInContext(source,context);return expression=>vm.runInContext(expression,context);}
test('legacy mode blocks fingerprint interfaces, preserves exceptions and obeys strict master switch',()=>{
 const strict=page('example.com');assert.equal(strict("new HTMLCanvasElement().getContext('webgl')"),null);assert.equal(strict("new HTMLCanvasElement().getContext('2d')"),'native');assert.throws(()=>strict('globalThis.AudioContext()'),{name:'NotAllowedError'});
 for(const read of [page('x.com'),page('example.com',false)]){assert.equal(read("new HTMLCanvasElement().getContext('webgl')"),'native');assert.equal(read("new HTMLCanvasElement().toDataURL()"),'native');}
});
