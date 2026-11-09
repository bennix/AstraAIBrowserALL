const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const prepare=require('../src/tab-locale.cjs'),ready=require('../src/watchdog-ready.cjs');
const never=()=>new Promise(()=>{});
test('cached profile applies without waiting for a slow lookup',async()=>{let applied=false;await prepare({hasProfile:()=>true,refresh:never,apply:()=>{applied=true;}});assert.equal(applied,true);});
test('missing profile bounds tab startup even when lookup never responds',async()=>{let applied=false;await prepare({hasProfile:()=>false,refresh:never,waitMs:10,apply:()=>{applied=true;}});assert.equal(applied,true);});
test('lookup rejection still applies available locale without an unhandled rejection',async()=>{await prepare({hasProfile:()=>false,refresh:()=>{throw Error('offline');},apply:()=>true});});
function child(){const value=new EventEmitter();value.stderr=new PassThrough();value.kill=()=>{value.killed=true;};return value;}
test('watchdog waits for explicit ready and removes startup listeners',async()=>{const c=child(),promise=ready(c);c.emit('message',{unrelated:true});c.emit('message',{ready:true});await promise;assert.equal(c.killed,undefined);assert.equal(c.listenerCount('exit'),0);assert.equal(c.listenerCount('message'),0);});
test('watchdog startup timeout terminates child and includes bounded diagnostics',async()=>{const c=child(),promise=ready(c,{timeoutMs:10});c.stderr.write('runtime startup diagnostic');await assert.rejects(promise,/did not start within.*runtime startup diagnostic/);assert.equal(c.killed,true);});
test('watchdog early exit reports runtime failure',async()=>{const c=child(),promise=ready(c);c.stderr.write('missing runtime');c.emit('exit',1,null);await assert.rejects(promise,/exited \(1\): missing runtime/);});
