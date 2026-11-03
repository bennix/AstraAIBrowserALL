const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/privacy-preload.cjs'), 'utf8');

function page(hostname, pathname, { frame = false, strict = true } = {}) {
  const context = vm.createContext({
    DOMException,
    location: { hostname, pathname, protocol: 'https:' },
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

test('X login routes permit native canvas reads without relaxing audio, WebGL or fonts', () => {
  for (const host of ['x.com', 'twitter.com']) {
    for (const route of ['/i/flow/login', '/i/jf/onboarding/web', '/login', '/account/login']) {
      const p = page(host, route);
      assert.equal(p.read("new HTMLCanvasElement().toDataURL('image/png')"), 'image/png');
      assert.equal(p.read('new CanvasRenderingContext2D().getImageData()'), 'native-pixels');
      assert.equal(p.read('new CanvasRenderingContext2D().measureText()'), 'native-metrics');
      assert.equal(p.read("new HTMLCanvasElement().getContext('webgl2')"), null);
      assert.equal(p.read('new FontFaceSet().check()'), false);
      assert.throws(() => p.read('OfflineAudioContext()'), { name: 'NotAllowedError' });
    }
  }
});

test('canvas protection follows SPA route changes and resumes immediately after login', () => {
  const p = page('x.com', '/home');
  assert.throws(() => p.read('new HTMLCanvasElement().toDataURL()'), { name: 'NotAllowedError' });
  p.navigate('/i/jf/onboarding/web');
  assert.equal(p.read("new HTMLCanvasElement().toDataURL('image/png')"), 'image/png');
  p.navigate('/home');
  assert.throws(() => p.read('new CanvasRenderingContext2D().getImageData()'), { name: 'NotAllowedError' });
  assert.throws(() => p.read('new OffscreenCanvas().convertToBlob()'), { name: 'NotAllowedError' });
  p.navigate('/i/flow/login');
  p.context.location.protocol = 'http:';
  assert.throws(() => p.read('new HTMLCanvasElement().toDataURL()'), { name: 'NotAllowedError' });
});

test('unrelated routes, lookalike hosts, subdomains and embedded frames stay protected', () => {
  for (const [host, route, options] of [
    ['x.com', '/home'], ['x.com', '/i/flowing/login'], ['x.com', '/login-extra'],
    ['x.com.example.org', '/i/flow/login'], ['example.org', '/login'],
    ['media.x.com', '/i/flow/login'], ['x.com', '/i/flow/login', { frame: true }]
  ]) {
    const p = page(host, route, options);
    assert.throws(() => p.read('new HTMLCanvasElement().toDataURL()'), { name: 'NotAllowedError' });
    assert.throws(() => p.read('new CanvasRenderingContext2D().measureText()'), { name: 'NotAllowedError' });
  }
});

test('disabled strict protection and existing Google compatibility remain unchanged', () => {
  for (const p of [page('example.org', '/', { strict: false }), page('accounts.google.com', '/')]) {
    assert.equal(p.read("new HTMLCanvasElement().toDataURL('image/png')"), 'image/png');
    assert.equal(p.read("new HTMLCanvasElement().getContext('webgl')"), 'webgl');
  }
});
