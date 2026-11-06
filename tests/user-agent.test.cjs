const {test}=require('node:test'),assert=require('node:assert/strict');const normalize=require('../src/user-agent.cjs');
test('UA drops application version tokens while preserving real OS, Chromium and other standard tokens',()=>{
 const ua='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) astra-browser-electron/0.1.16 Chrome/156.0.8078.75 Electron/45.2.1 Safari/537.36';
 assert.equal(normalize(ua),'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.8078.75 Safari/537.36');
 assert.equal(normalize('Chrome/156.0 Safari/537.36'),'Chrome/156.0 Safari/537.36');
});
