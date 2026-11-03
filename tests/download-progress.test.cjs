const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const {EventEmitter}=require('node:events');
test('ordinary downloads report byte progress, speed, unknown totals and cancellation',()=>{
 let now=0,tick,cleared=false;const updates=[];const mod={exports:{}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/media.cjs'),'utf8'),{module:mod,__dirname:require('node:path').join(__dirname,'../src'),require:name=>name==='electron'?{}:name==='./media-picker.cjs'?()=>{}:require(name),Date:{now:()=>now},setInterval:fn=>(tick=fn,1),clearInterval:()=>{cleared=true;}});
 const media=mod.exports({owner:()=>null,notify:value=>updates.push(value)});const session=new EventEmitter();media.bindSession(session);media.bindSession(session);assert.equal(session.listenerCount('will-download'),1);
 let received=0,total=10000,paused=false,state='progressing';const item=new EventEmitter();Object.assign(item,{getReceivedBytes:()=>received,getTotalBytes:()=>total,getFilename:()=> 'test.dmg',isPaused:()=>paused,canResume:()=>true,getState:()=>state,cancel:()=>item.emit('done',{},'cancelled')});session.emit('will-download',{},item);assert.equal(updates.at(-1).status,'started');
 received=2000;now=1000;tick();assert.equal(updates.at(-1).percent,20);assert.equal(updates.at(-1).bytesPerSecond,2000);assert.equal(updates.at(-1).etaSeconds,4);
 total=0;received=3000;now=2000;item.emit('updated',{},'progressing');assert.equal(updates.at(-1).percent,undefined);assert.equal(updates.at(-1).totalBytes,null);assert.equal(updates.at(-1).bytesPerSecond,1000);
 paused=true;now=3000;tick();assert.equal(updates.at(-1).status,'paused');assert.equal(updates.at(-1).bytesPerSecond,0);
 media.cancel(updates[0].id);assert.equal(updates.at(-1).status,'cancelled');assert.equal(cleared,true);
});
test('interruptions retry with backoff, allow manual resume and never revive cancelled items',()=>{
 const mod={exports:{}},updates=[],timeouts=new Map();let next=0,resumes=0,restarts=0;const delays=[];
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/media.cjs'),'utf8'),{module:mod,__dirname:require('node:path').join(__dirname,'../src'),require:name=>name==='electron'?{}:name==='./media-picker.cjs'?()=>{}:require(name),Date,setInterval:()=>1,clearInterval:()=>{},setTimeout:(fn,delay)=>{const id=++next;timeouts.set(id,fn);delays.push(delay);return id;},clearTimeout:id=>timeouts.delete(id)});
 const media=mod.exports({owner:()=>null,notify:value=>updates.push(value)});const session=new EventEmitter();session.downloadURL=()=>restarts++;media.bindSession(session);
 let state='progressing';const item=new EventEmitter();Object.assign(item,{getReceivedBytes:()=>1024,getTotalBytes:()=>10000,getFilename:()=> 'test.dmg',getURL:()=> 'https://example.com/test.dmg',isPaused:()=>false,getState:()=>state,canResume:()=>state==='interrupted',resume:()=>{resumes++;state='progressing';},cancel:()=>item.emit('done',{},'cancelled')});session.emit('will-download',{},item);const id=updates[0].id;
 for(let i=0;i<3;i++){state='interrupted';item.emit('updated',{},state);assert.equal(timeouts.size,1);const [key,fn]=[...timeouts][0];timeouts.delete(key);fn();}
 assert.deepEqual(delays,[2000,5000,10000]);assert.equal(resumes,3);
 state='interrupted';item.emit('updated',{},state);assert.equal(timeouts.size,0);assert.equal(updates.at(-1).canResume,true);media.resume(id);assert.equal(resumes,4);
 state='interrupted';item.emit('done',{},state);assert.equal(updates.at(-1).canRetry,true);media.resume(id);assert.equal(restarts,1);assert.equal(updates.at(-1).status,'cancelled');assert.throws(()=>media.resume(id));
 session.emit('will-download',{},item);const second=updates.at(-1).id;state='interrupted';item.emit('updated',{},state);assert.equal(timeouts.size,1);media.cancel(second);assert.equal(timeouts.size,0);assert.throws(()=>media.resume(second));
});
