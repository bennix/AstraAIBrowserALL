// Isolated lifecycle check of the current user's environment API. Always restores the seven scoped keys.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {isDeepStrictEqual}=require('node:util');
const create=require('../src/login-environment.cjs');const {adapter,KEYS}=require('../src/login-env-adapter.cjs');
const profile={timezoneId:'Asia/Kuala_Lumpur',acceptLanguage:'ms-MY,en,zh,ta'};
async function owner(file){
 const manager=create({file,nodeExecutable:process.execPath});
 await manager.apply(profile);process.send?.({ready:true,status:manager.status(),processTimezone:process.env.TZ,processLanguage:process.env.LANG});
 process.on('message',async message=>{if(message==='restore'){try{await manager.restore();process.exit(0);}catch(error){console.error(error.message);process.exit(1);}}});
}
if(process.argv[2]==='--owner')owner(process.argv[3]).catch(error=>{process.send?.({error:error.message});process.exit(1);});
else(async()=>{
 const system=adapter();let baseline;
 try{baseline=await system.read(KEYS);}catch(error){if(process.env.ASTRA_REQUIRE_LOGIN_ENV==='1')throw error;console.log('SKIP: user-session environment API unavailable on '+process.platform);return;}
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'astra-native-env-'));let child,file;
 const waitExit=child=>new Promise(r=>child.exitCode!==null||child.signalCode!==null?r():child.once('exit',r));
 try{
  for(const crash of [false,true]){
   file=path.join(directory,crash?'crash.json':'normal.json');
   child=cp.spawn(process.execPath,[__filename,'--owner',file],{env:process.env,stdio:['ignore','pipe','pipe','ipc']});
   let diagnostic='';child.stderr.on('data',c=>diagnostic+=c);
   await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Environment owner startup timed out')),30000);child.once('message',message=>{clearTimeout(timeout);try{if(!message.ready)throw Error(message.error||'Owner failed');assert.equal(message.processTimezone,profile.timezoneId);assert.equal(message.processLanguage,message.status.systemLocale);resolve();}catch(error){reject(error);}});child.once('exit',code=>{clearTimeout(timeout);if(code!==null&&code!==0)reject(Error(diagnostic||'Owner exited'));});});
   assert.equal((await system.read(['TZ'])).TZ.value,profile.timezoneId);
   const exited=waitExit(child);if(crash)child.kill('SIGKILL');else child.send('restore');await exited;
   const deadline=Date.now()+25000;
   while(Date.now()<deadline){const current=await system.read(KEYS);if(isDeepStrictEqual(current,baseline)&&!fs.existsSync(file))break;await new Promise(r=>setTimeout(r,250));}
   assert.deepEqual(await system.read(KEYS),baseline);assert.equal(fs.existsSync(file),false);
   console.log('PASS '+process.platform+': '+(crash?'forced process termination watchdog':'normal exit')+' restored exact login environment');
  }
 }finally{
  if(child&&child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await waitExit(child);}
  if(file&&fs.existsSync(file))await create.recover({file,system});
  assert.deepEqual(await system.read(KEYS),baseline,'Final cleanup must restore the original values');
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
