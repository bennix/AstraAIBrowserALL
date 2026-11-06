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

test('completed files open by download id and report missing files',async()=>{
 const path=require('node:path');
 const file=path.join(require('node:os').tmpdir(),'astra-open-'+require('node:crypto').randomUUID()+'.txt');
 fs.writeFileSync(file,'download test');
 const opened=[],revealed=[],updates=[],mod={exports:{}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/media.cjs'),'utf8'),{
  module:mod,__dirname:path.join(__dirname,'../src'),
  require:name=>name==='electron'?{shell:{
   openPath:async value=>{opened.push(value);return '';},
   showItemInFolder:value=>revealed.push(value)
  }}:name==='./media-picker.cjs'?()=>{}:require(name),
  Date,setInterval:()=>1,clearInterval:()=>{}
 });
 const media=mod.exports({owner:()=>null,notify:value=>updates.push(value)});
 const session=new EventEmitter();media.bindSession(session);
 const item=new EventEmitter();
 Object.assign(item,{
  getReceivedBytes:()=>13,getTotalBytes:()=>13,getFilename:()=>path.basename(file),
  getSavePath:()=>file,isPaused:()=>false,canResume:()=>false,getState:()=> 'completed'
 });
 try{
  session.emit('will-download',{},item);
  const id=updates[0].id;
  await assert.rejects(media.openDownload(id),/Completed download not found/);
  item.emit('done',{},'completed');
  await media.openDownload(id);
  await media.openDownload(id,true);
  assert.deepEqual(opened,[file]);assert.deepEqual(revealed,[file]);
  await assert.rejects(media.openDownload('/tmp/arbitrary'),/Completed download not found/);
  fs.unlinkSync(file);
  await assert.rejects(media.openDownload(id),/moved or deleted/);
 }finally{fs.rmSync(file,{force:true});}
});

test('X candidates retain separate videos and the playing video keeps its original index',()=>{
 const article={
  querySelectorAll:()=>[{href:'https://x.com/example/status/123',pathname:'/example/status/123',querySelector:()=>({})}],
  querySelector:()=>({innerText:'Two videos'})
 };
 function video(id,playing){
  return {poster:'https://pbs.twimg.com/ext_tw_video_thumb/'+id+'/pu/img/preview.jpg',
   closest:()=>article,getBoundingClientRect:()=>({width:100,height:100,top:10,bottom:110}),
   paused:!playing,ended:false,videoWidth:640,videoHeight:360,duration:13};
 }
 const videos=[video('100',false),video('200',true)];
 const candidates=vm.runInNewContext(fs.readFileSync(require.resolve('../src/media-candidates.js'),'utf8'),{
  location:{hostname:'x.com',pathname:'/home',href:'https://x.com/home'},
  document:{querySelectorAll:()=>videos,title:'X'},innerHeight:800
 });
 assert.equal(candidates.length,2);
 assert.equal(candidates[0].mediaId,'200');
 assert.equal(candidates[0].mediaIndex,1);
 assert.equal(candidates[1].mediaIndex,0);
});

for(const fallback of [false,true])test('selected second video completes'+(fallback?' after a 403 media-source fallback':''),async()=>{
 const path=require('node:path'),os=require('node:os');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'astra-multi-video-test-'));
 const output=path.join(directory,'second.mp4');
 const updates=[],opened=[],mod={exports:{}};
 let calls=0,selectedMetadata;
 const pickResults=fallback?[1,0,0]:[1,0];
 const entries=['100','200'].map(id=>({id,title:'Video '+id,formats:[
  {format_id:'mp4-'+id,url:'https://video.twimg.com/'+id+'.mp4',protocol:'https',height:360,ext:'mp4',vcodec:'h264',acodec:'aac'}
 ]}));
 const spawn=(_executable,args)=>{
  const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>{};
  const call=calls++;
  const blocked=fallback&&call===0;
  const probe=call===(fallback?1:0);
  if(probe&&fallback){
   assert.equal(args.at(-1),'https://cdn.example.org/master.m3u8');
   assert.equal(args[args.indexOf('--referer')+1],'https://x.com/example/status/123');
  }
  if(!probe&&!blocked){
   selectedMetadata=JSON.parse(fs.readFileSync(args[args.indexOf('--load-info-json')+1],'utf8'));
   assert.equal(args[args.indexOf('-f')+1],'mp4-200');
  }
  queueMicrotask(()=>{
   if(blocked){child.stderr.emit('data','ERROR: HTTP Error 403');child.emit('close',1);return;}
   if(probe)child.stdout.emit('data',JSON.stringify({_type:'playlist',entries}));
   else{
    fs.writeFileSync(output,'video');
    child.stdout.emit('data','ASTRA_FILE '+JSON.stringify(output));
   }
   child.emit('close',0);
  });
  return child;
 };
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/media.cjs'),'utf8'),{
  module:mod,__dirname:path.join(__dirname,'../src'),Date,URL,process,setTimeout,clearTimeout,setInterval:()=>1,clearInterval:()=>{},
  require:name=>name==='electron'?{
   app:{isPackaged:false},
   dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[directory]})},
   shell:{openPath:async file=>{opened.push(file);return '';}}
  }:name==='./media-picker.cjs'?async()=>pickResults.shift():name==='node:child_process'?{spawn}:require(name)
 });
 const media=mod.exports({owner:()=>null,notify:value=>updates.push(value)});
 try{
  const id=await media.start({
   getURL:()=> 'https://x.com/example/status/123',getTitle:()=> 'Two videos',
   executeJavaScript:async script=>script.includes('getEntriesByType')?[{url:'https://cdn.example.org/master.m3u8',kind:'request'}]:[{url:'https://x.com/example/status/123',mediaId:'100',mediaIndex:0,mediaCount:2,title:'First'},
    {url:'https://x.com/example/status/123',mediaId:'200',mediaIndex:1,mediaCount:2,title:'Second'}],
   session:{cookies:{get:async()=>[]},resolveProxy:async()=> 'DIRECT'}
  });
  assert.equal(selectedMetadata.id,'200');
  assert.equal(updates.at(-1).status,'completed');
  await media.openDownload(id);
  assert.deepEqual(opened,[output]);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('loaded media discovery excludes blob placeholders and unrelated requests',()=>{
 const sources=vm.runInNewContext(fs.readFileSync(require.resolve('../src/media-loaded-sources.js'),'utf8'),{
  URL,location:{href:'https://example.org/watch'},
  document:{querySelectorAll:()=>[
   {currentSrc:'blob:https://example.org/123',src:'',querySelectorAll:()=>[]},
   {currentSrc:'https://cdn.example.org/direct.mp4',src:undefined,querySelectorAll:()=>[]}
  ]},
  performance:{getEntriesByType:()=>[
   {name:'https://cdn.example.org/master.m3u8?token=example'},
   {name:'https://example.org/analytics.js'},
   {name:'https://cdn.example.org/direct.mp4'}
  ]}
 });
 assert.equal(sources.length,2);
 assert.equal(sources[0].url,'https://cdn.example.org/direct.mp4');
 assert.equal(sources[1].url,'https://cdn.example.org/master.m3u8?token=example');
});

test('time download entry point lists ranges, exposes retry and cleans private files after success',async()=>{
 const path=require('node:path'),os=require('node:os');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'astra-time-entry-'));
 const output=path.join(directory,'merged.mkv');
 const cache=path.join(directory,'.astra-parts','fixture');
 const metadata={id:'long',title:'Long video',duration:601,formats:[
  {format_id:'720',url:'https://cdn.example.org/master.m3u8',protocol:'m3u8_native',height:720,ext:'mp4',vcodec:'h264',acodec:'aac'}
 ]};
 const updates=[],mod={exports:{}};
 let cookieFile,runs=0;
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/media.cjs'),'utf8'),{
  module:mod,__dirname:path.join(__dirname,'../src'),Date,URL,process,setTimeout,clearTimeout,
  setInterval:()=>1,clearInterval:()=>{},
  require:name=>{
   if(name==='node:fs')return {...fs,existsSync:file=>file===path.join(__dirname,'../tools',process.platform==='win32'?'ffmpeg.exe':'ffmpeg')||fs.existsSync(file)};
   if(name==='electron')return {app:{isPackaged:false},dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[directory]}),showMessageBox:async()=>({response:1})},
    shell:{trashItem:async file=>fs.renameSync(file,file+'.trashed')}};
   if(name==='./media-picker.cjs')return async()=>0;
   if(name==='./media-time-parts.cjs')return {reservePartsDirectory:require('../src/media-time-parts.cjs').reservePartsDirectory,createTimeDownload:options=>{
    assert.equal(options.seconds,600);
    const parts=require('../src/media-time-parts.cjs').planParts(601,600);
    return {parts,partDirectory:cache,cancel(){},async run(){
     if(++runs===1)throw Error('Segment 2: HTTP Error 503');
     fs.mkdirSync(cache,{recursive:true});
     fs.writeFileSync(path.join(cache,'part-0001.mkv'),'part');
     fs.writeFileSync(output,'complete');
     for(const part of parts)options.notify({...part,count:2,status:'completed',percent:100,file:output});
     return output;
    }};
   }};
   if(name==='node:child_process')return {spawn(_binary,args){
    cookieFile=args[args.indexOf('--cookies')+1];
    const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>{};
    queueMicrotask(()=>{child.stdout.emit('data',JSON.stringify(metadata));child.emit('close',0);});
    return child;
   }};
   return require(name);
  }
 });
 const media=mod.exports({owner:()=>null,notify:update=>updates.push(update)});
 try{
  const id=await media.start({
   getURL:()=> 'https://example.org/video',getTitle:()=> 'Long video',executeJavaScript:async()=>[],
   session:{cookies:{get:async()=>[]},resolveProxy:async()=> 'DIRECT'}
  });
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(updates.filter(update=>update.status==='pending').length,2);
  assert(updates.some(update=>update.id===id&&update.canRetry===true&&/503/.test(update.message)));
  assert(fs.existsSync(cookieFile));
  media.resume(id);
  await new Promise(resolve=>setImmediate(resolve));
  assert(updates.some(update=>update.id===id&&update.status==='completed'));
  assert.equal(fs.existsSync(cookieFile),false);
  await assert.rejects(media.deleteDownload(id+'-part-0'),/完整下载任务/);
  const release=require('../src/media-time-parts.cjs').reservePartsDirectory(cache);
  try{await assert.rejects(media.deleteDownload(id),/already being downloaded/);}
  finally{release();}
  assert(fs.existsSync(output));assert(fs.existsSync(cache));
  const unrelated=path.join(directory,'other-video.mkv');fs.writeFileSync(unrelated,'keep');
  assert.equal(await media.deleteDownload(id),true);
  assert.equal(fs.existsSync(output),false);
  assert.equal(fs.existsSync(cache),false);
  assert(fs.existsSync(unrelated));
 }finally{media.shutdown();fs.rmSync(directory,{recursive:true,force:true});}
});

test('delete prompts before trashing and accepts only registered completed download ids',async()=>{
 const path=require('node:path'),os=require('node:os');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'astra-delete-test-'));
 const file=path.join(directory,'download.txt');fs.writeFileSync(file,'complete');
 const trashed=[],updates=[],mod={exports:{}};
 let response=0;
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/media.cjs'),'utf8'),{
  module:mod,__dirname:path.join(__dirname,'../src'),Date,setInterval:()=>1,clearInterval:()=>{},
  require:name=>name==='electron'?{
   dialog:{showMessageBox:async()=>({response})},
   shell:{trashItem:async value=>{trashed.push(value);fs.renameSync(value,value+'.trashed');}}
  }:name==='./media-picker.cjs'?()=>{}:require(name)
 });
 const media=mod.exports({owner:()=>null,notify:value=>updates.push(value)});
 const session=new EventEmitter();media.bindSession(session);
 const item=new EventEmitter();
 Object.assign(item,{getReceivedBytes:()=>8,getTotalBytes:()=>8,getFilename:()=> 'download.txt',getSavePath:()=>file,
  isPaused:()=>false,canResume:()=>false,getState:()=> 'completed'});
 try{
  session.emit('will-download',{},item);
  const id=updates[0].id;item.emit('done',{},'completed');
  assert.equal(await media.deleteDownload(id),false);
  assert.equal(trashed.length,0);assert(fs.existsSync(file));
  await assert.rejects(media.deleteDownload('/tmp/arbitrary'),/not found/);
  response=1;
  assert.equal(await media.deleteDownload(id),true);
  assert.deepEqual(trashed,[file]);
  assert.equal(updates.at(-1).status,'cancelled');
  await assert.rejects(media.openDownload(id),/not found/);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('completed segmented downloads restore after restart and partial deletion can be retried',async()=>{
 const path=require('node:path'),os=require('node:os');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'astra-restore-delete-'));
 const key='0123456789abcdef0123',cache=path.join(directory,'.astra-parts',key);
 const file=path.join(directory,'video [分段合并-'+key+'].mkv');
 fs.mkdirSync(cache,{recursive:true});
 fs.writeFileSync(path.join(cache,'completed.json'),'{}');
 fs.writeFileSync(path.join(cache,'part-0001.mkv'),'part');
 fs.writeFileSync(file,'merged');
 const unrelated=path.join(directory,'other.txt');fs.writeFileSync(unrelated,'keep');
 let refuseFile=true;
 function load(){
  const mod={exports:{}},updates=[];
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/media.cjs'),'utf8'),{
   module:mod,__dirname:path.join(__dirname,'../src'),Date,console,
   require:name=>name==='electron'?{
    app:{getPath:()=>directory},
    dialog:{showMessageBox:async()=>({response:1})},
    shell:{trashItem:async target=>{
     if(target===file&&refuseFile)throw Error('File is busy');
     fs.renameSync(target,target+'.trashed');
    }}
   }:name==='./media-picker.cjs'?()=>{}:name==='./media-time-parts.cjs'?require('../src/media-time-parts.cjs'):require(name)
  });
  return {media:mod.exports({owner:()=>null,notify:update=>updates.push(update)}),updates};
 }
 try{
  const first=load();first.media.restoreCompleted();
  const root=first.updates.find(update=>update.kind==='media'&&update.status==='completed');
  assert(root);assert.equal(first.updates.filter(update=>update.kind==='part').length,1);
  await assert.rejects(first.media.deleteDownload(root.id),/busy/);
  assert(fs.existsSync(file));assert.equal(fs.existsSync(cache),false);
  const second=load();second.media.restoreCompleted();
  assert(second.updates.some(update=>update.id===root.id&&update.status==='completed'));
  assert.equal(second.updates.filter(update=>update.kind==='part').length,0);
  refuseFile=false;
  assert.equal(await second.media.deleteDownload(root.id),true);
  assert.equal(fs.existsSync(file),false);
  assert(fs.existsSync(unrelated));
  const third=load();third.media.restoreCompleted();
  assert.equal(third.updates.length,0);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
