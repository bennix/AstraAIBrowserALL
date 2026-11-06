const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/privacy-preload.cjs'), 'utf8');

function page(hostname, pathname, { frame = false, strict = true, protocol = 'https:' } = {}) {
  const context = vm.createContext({
    DOMException,
    location: { hostname, pathname, protocol },
    process: { argv: strict ? ['--astra-strict-privacy'] : [] },
    require: () => ({ contextBridge: { executeInMainWorld: ({ func }) => func() } })
  });
  vm.runInContext(`
    window = globalThis;
    top = ${frame ? '{}' : 'window'};
    navigator = {};
    (() => {
    class HTMLCanvasElement {
      getContext(kind) { return kind; }
      toDataURL(type) { return this instanceof HTMLCanvasElement ? type : null; }
      toBlob(callback) { callback('native-blob'); }
    }
    class CanvasRenderingContext2D {
      getImageData() { return 'native-pixels'; }
      measureText() { return 'native-metrics'; }
    }
    class OffscreenCanvas { getContext(kind) { return kind; } convertToBlob() { return 'native-blob'; } }
    class OffscreenCanvasRenderingContext2D extends CanvasRenderingContext2D {}
    class AudioContext {}
    class OfflineAudioContext {}
    class FontFaceSet { check() { return true; } }
    Object.assign(globalThis, { HTMLCanvasElement, CanvasRenderingContext2D, OffscreenCanvas,
      OffscreenCanvasRenderingContext2D, AudioContext, OfflineAudioContext, FontFaceSet });
    })();
  `, context);
  vm.runInContext(source, context);
  return {
    context,
    read: code => vm.runInContext(code, context),
    navigate: pathname => { context.location.pathname = pathname; }
  };
}

test('X and Grok use native APIs while other sites remain protected', () => {
  for (const host of ['x.com', 'twitter.com', 'grok.com', 'www.grok.com']) {
    const p = page(host, '/');
    assert.equal(p.read("new HTMLCanvasElement().toDataURL('image/png')"), 'image/png');
    assert.equal(p.read("new HTMLCanvasElement().getContext('webgl2')"), 'webgl2');
    assert.equal(p.read('new FontFaceSet().check()'), true);
  }
  for (const host of ['example.org', 'x.com.example.org', 'media.x.com', 'grok.com.example.org']) {
    const p = page(host, '/');
    assert.throws(() => p.read('new HTMLCanvasElement().toDataURL()'), { name: 'NotAllowedError' });
    assert.equal(p.read("new HTMLCanvasElement().getContext('webgl2')"), null);
  }
});

test('disabled strict protection and existing Google compatibility remain unchanged', () => {
  for (const p of [page('example.org', '/', { strict: false }), page('accounts.google.com', '/')]) {
    assert.equal(p.read("new HTMLCanvasElement().toDataURL('image/png')"), 'image/png');
    assert.equal(p.read("new HTMLCanvasElement().getContext('webgl')"), 'webgl');
  }
});

test('Apple compatibility is limited to exact HTTPS authentication hosts and paths',()=>{
 for(const [host,route] of [['appleid.apple.com','/auth/authorize'],['idmsa.apple.com','/appleauth/auth/signin']]){const p=page(host,route);assert.equal(p.read('new HTMLCanvasElement().toDataURL("native")'),'native');assert.equal(p.read('new HTMLCanvasElement().getContext("webgl")'),'webgl');}
 for(const [host,route] of [['appleid.apple.com','/account'],['appleid.apple.com.example.org','/auth/authorize'],['appleid.apple.com','/auth/authorize-extra']]){const p=page(host,route);assert.throws(()=>p.read('new HTMLCanvasElement().toDataURL("native")'));}
});

test('WeduLab HTTPS labs can render with WebGL while fingerprint reads stay restricted',()=>{
 for(const host of ['wedulab.com','www.wedulab.com']){
  const p=page(host,'/labs/contour');
  assert.equal(p.read('new HTMLCanvasElement().getContext("webgl2")'),'webgl2');
  assert.equal(p.read('new OffscreenCanvas().getContext("webgl")'),'webgl');
  assert.throws(()=>p.read('new HTMLCanvasElement().toDataURL("native")'),{name:'NotAllowedError'});
  assert.throws(()=>p.read('new CanvasRenderingContext2D().getImageData()'),{name:'NotAllowedError'});
  assert.throws(()=>p.read('OfflineAudioContext()'),{name:'NotAllowedError'});
  assert.equal(p.read('new FontFaceSet().check()'),false);
  p.navigate('/account');
  assert.equal(p.read('new HTMLCanvasElement().getContext("webgl2")'),null);
 }
 for(const [host,route] of [['wedulab.com.example.org','/labs/contour'],['example.org','/labs/contour'],['wedulab.com','/labs-extra/contour']]){
  assert.equal(page(host,route).read('new HTMLCanvasElement().getContext("webgl2")'),null);
 }
 const insecure=page('wedulab.com','/labs/contour');insecure.context.location.protocol='http:';
 assert.equal(insecure.read('new HTMLCanvasElement().getContext("webgl2")'),null);
});

test('Notebook compatibility requires exact HTTPS application hosts', () => {
  for (const host of ['notebook.google.com', 'notebooklm.google.com']) {
    const p = page(host, '/');
    assert.equal(p.read('new CanvasRenderingContext2D().measureText()'), 'native-metrics');
    assert.equal(p.read('new HTMLCanvasElement().getContext("webgl")'), 'webgl');
  }
  for (const p of [page('notebook.google.com.example.org', '/'), page('other.google.com', '/'),
    page('notebook.google.com', '/', { protocol: 'http:' })]) {
    assert.throws(() => p.read('new CanvasRenderingContext2D().measureText()'), { name: 'NotAllowedError' });
  }
});
