const {test}=require('node:test');const assert=require('node:assert/strict');const {EventEmitter}=require('node:events');
const watch=require('../src/google-auth-handoff.cjs');
function popup(){const p=new EventEmitter(),wc=new EventEmitter();let url='https://accounts.google.com/AddSession';Object.assign(wc,{getURL:()=>url,isDestroyed:()=>false});Object.assign(p,{webContents:wc,isDestroyed:()=>false,close:()=>{p.closed=true;p.emit('closed');}});p.navigate=value=>{url=value;wc.emit('did-finish-load');};return p;}
const tick=()=>new Promise(r=>setImmediate(r));
test('Google account completion waits for a loaded tab and preserves account routing across applications',async()=>{
 for(const target of ['https://notebook.google.com/?authuser=1','https://mail.google.com/mail/u/2/#inbox','https://drive.google.com/drive/u/1/my-drive','https://gemini.google.com/app?authuser=1','https://www.youtube.com/?authuser=1']){
  const p=popup(),opened=[];let loaded;watch('https://notebook.google.com/','https://accounts.google.com/AddSession',p,url=>{opened.push(url);return new Promise(r=>loaded=r);});
  p.navigate('https://accounts.google.com/v3/signin');p.navigate('https://www.google.com/accounts/SetSID');assert.deepEqual(opened,[]);
  p.navigate(target);p.navigate(target);assert.deepEqual(opened,[target]);assert.equal(p.closed,undefined);
  loaded(true);await tick();assert.equal(p.closed,true);assert.equal(p.webContents.listenerCount('did-finish-load'),0);
 }
});
test('failed tab loads preserve the popup; third-party OAuth and lookalike sites never hand off',async()=>{
 const p=popup();watch('https://mail.google.com/','https://accounts.google.com/AddSession',p,async()=>false);p.navigate('https://mail.google.com/mail/u/1/');await tick();assert.equal(p.closed,undefined);
 for(const [source,initial,target] of [
  ['https://x.com/','https://accounts.google.com/o/oauth2/auth','https://notebook.google.com/'],
  ['https://notebook.google.com.evil.test/','https://accounts.google.com/AddSession','https://notebook.google.com/'],
  ['https://notebook.google.com/','https://accounts.google.com.evil.test/','https://notebook.google.com/'],
  ['https://notebook.google.com/','https://accounts.google.com/AddSession','https://google.com.evil.test/'],
  ['https://notebook.google.com/','https://accounts.google.com/AddSession','https://accounts.google.com/o/oauth2/callback'],
  ['https://notebook.google.com/','https://accounts.google.com/AddSession','http://mail.google.com/']]){
  const p=popup();watch(source,initial,p,()=>assert.fail('Unexpected handoff'));p.navigate(target);assert.equal(p.closed,undefined);
 }
});
