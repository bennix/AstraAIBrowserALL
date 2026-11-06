const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const {adapter:defaultAdapter,KEYS,run}=require('./login-env-adapter.cjs');
const absent=()=>({present:false});
const equal=(a,b)=>a?.present===b?.present&&(!a?.present||(a.value===b.value&&(a.kind||1)===(b.kind||1)));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function identity(pid=process.pid){
 let start='';
 try{
  if(process.platform==='win32'){
   const code=`(Get-Process -Id ${Number(pid)} -ErrorAction Stop).StartTime.ToUniversalTime().Ticks.ToString()`;
   const exe=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
   start=(await run(exe,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(code,'utf16le').toString('base64')])).trim();
  }else start=(await run('/bin/ps',['-p',String(pid),'-o','lstart='],{env:{...process.env,LC_ALL:'C',TZ:'UTC'}})).trim();
 }catch{}
 return {pid,start};
}
async function alive(owner){
 if(!Number.isSafeInteger(owner?.pid)||owner.pid<1)return false;
 try{process.kill(owner.pid,0);}catch(error){return error.code==='EPERM';}
 if(!owner.start)return true;
 const current=await identity(owner.pid);return !current.start||current.start===owner.start;
}
function read(file){try{const raw=fs.readFileSync(file,'utf8');if(raw.length>131072)throw Error('Oversized environment journal');return JSON.parse(raw);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
function write(file,value){const temporary=file+'.'+process.pid+'.tmp';fs.writeFileSync(temporary,JSON.stringify(value),{mode:0o600});fs.renameSync(temporary,file);fs.chmodSync(file,0o600);}
function validate(record,platform){
 if(record?.version!==1||record.platform!==platform||typeof record.token!=='string'||!record.owner)throw Error('Invalid login environment recovery journal');
 for(const key of KEYS){const state=record.baseline?.[key];if(typeof state?.present!=='boolean'||state.present&&typeof state.value!=='string'||!Array.isArray(record.candidates?.[key]))throw Error('Invalid login environment snapshot');}
}
async function guarded(file,operation,isAlive=alive){
 fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const guard=file+'.lock',token=crypto.randomUUID(),owner=await identity();
 for(let n=0;;n++){
  try{const fd=fs.openSync(guard,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify({token,owner}));}finally{fs.closeSync(fd);}break;}
  catch(error){if(error.code!=='EEXIST')throw error;let stale=false;try{const prior=read(guard);stale=prior?.owner?!await isAlive(prior.owner):Date.now()-fs.statSync(guard).mtimeMs>5000;}catch{try{stale=Date.now()-fs.statSync(guard).mtimeMs>5000;}catch{}}if(stale){try{fs.unlinkSync(guard);}catch{}continue;}if(n>=100)throw Error('Another environment change is in progress');await sleep(100);}
 }
 try{return await operation();}finally{try{if(read(guard)?.token===token)fs.unlinkSync(guard);}catch{}}
}
async function restoreRecord(file,record,system){
 validate(record,system.platform);const current=await system.read(KEYS),changes={},skipped=[];
 for(const key of KEYS){if(record.candidates[key].some(value=>equal(current[key],value))){if(!equal(current[key],record.baseline[key]))changes[key]=record.baseline[key];}else if(!equal(current[key],record.baseline[key]))skipped.push(key);}
 if(Object.keys(changes).length)await system.write(changes);
 if(record.recoveryCommand)await system.recovery(record.recoveryCommand,true);
 if(read(file)?.token===record.token)fs.unlinkSync(file);
 return skipped;
}
async function recover({file,system=defaultAdapter(),token,isAlive=alive}){
 return guarded(file,async()=>{const record=read(file);if(!record||token&&record.token!==token)return {restored:false};validate(record,system.platform);if(await isAlive(record.owner))return {restored:false,owned:true};return {restored:true,skipped:await restoreRecord(file,record,system)};},isAlive);
}
function profileValues(profile,available,baseline,{disableToolTelemetry=false}={}){
 const timezone=new Intl.DateTimeFormat('en',{timeZone:profile.timezoneId}).resolvedOptions().timeZone;
 const tags=Intl.getCanonicalLocales(String(profile.acceptLanguage).split(','));if(!tags.length)throw Error('Website language is unavailable');
 const localeFor=tag=>{const l=new Intl.Locale(tag).maximize();return l.language+'_'+l.region+'.UTF-8';};
 const desired=tags.map(localeFor),normalize=value=>value.toLowerCase().replace(/[-.]/g,'');
 const selected=available===null?desired[0]:desired.map(value=>available.find(name=>normalize(name)===normalize(value))).find(Boolean)||available.find(value=>/^(c|en_us)[.-]utf-?8$/i.test(value));
 if(!selected)throw Error('No compatible UTF-8 system locale is installed');
 const languages=[...new Set(tags.flatMap(tag=>[tag.replaceAll('-','_'),new Intl.Locale(tag).language]))].join(':');
 const values={TZ:{present:true,value:timezone},LANG:{present:true,value:selected},LANGUAGE:{present:true,value:languages},LC_ALL:{present:true,value:selected},LC_MESSAGES:{present:true,value:selected}};
 for(const key of ['DISABLE_TELEMETRY','DISABLE_ERROR_REPORTING'])values[key]=disableToolTelemetry?{present:true,value:'1'}:baseline[key];
 return {values,profile:{timezoneId:timezone,requestedLanguage:tags[0],systemLocale:selected,localeFallback:normalize(selected)!==normalize(desired[0]),disableToolTelemetry}};
}
function quoteWindows(value){return '"'+String(value).replace(/(\\*)"/g,'$1$1\\"').replace(/(\\+)$/,'$1$1')+'"';}
async function watchdog({file,token,recoveryDir,nodeExecutable}){
 const directory=recoveryDir||path.join(path.dirname(file),'recovery');fs.mkdirSync(directory,{recursive:true,mode:0o700});
 for(const name of ['login-environment.cjs','login-env-adapter.cjs','login-env-watchdog.cjs'])fs.writeFileSync(path.join(directory,name),fs.readFileSync(path.join(__dirname,name)),{mode:0o600});
 const script=path.join(directory,'login-env-watchdog.cjs');
 let executable=process.execPath;
 if(process.platform==='win32'){
  executable=nodeExecutable;
  if(!executable||!fs.existsSync(executable))throw Error('A bundled Node runtime is required for Windows environment recovery');
  const localRuntime=path.join(directory,'node.exe'),digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const expected=digest(executable);
  if(!fs.existsSync(localRuntime)||digest(localRuntime)!==expected){
   const temporary=localRuntime+'.'+process.pid+'.tmp';fs.copyFileSync(executable,temporary);
   if(digest(temporary)!==expected)throw Error('Recovery runtime checksum mismatch');
   for(let attempt=0;;attempt++){try{fs.renameSync(temporary,localRuntime);break;}catch(error){if(attempt>=50)throw error;await sleep(100);}}
  }
  const license=path.join(path.dirname(executable),'Node-LICENSE.txt');if(fs.existsSync(license))fs.copyFileSync(license,path.join(directory,'Node-LICENSE.txt'));
  executable=localRuntime;
 }
 const child=cp.spawn(executable,[script,file,token],{detached:true,windowsHide:true,env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},stdio:['ignore','ignore','ignore','ipc']});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(Error('Environment recovery watchdog did not start'));},5000);child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('message',message=>{clearTimeout(timer);if(message?.ready)resolve();else reject(Error('Environment recovery watchdog failed'));});child.once('exit',()=>{clearTimeout(timer);reject(Error('Environment recovery watchdog exited'));});});
 child.disconnect();child.unref();
 return process.platform==='win32'?[executable,script,file,token,'--recover'].map(quoteWindows).join(' '):null;
}
module.exports=function createLoginEnvironment({file,system=defaultAdapter(),processEnv=process.env,startWatchdog=watchdog,notify=()=>{},nodeExecutable,isAlive=alive}){
 let token=null,memory=null,status={phase:'idle',active:false};
 const snapshotMemory=()=>Object.fromEntries(KEYS.map(key=>[key,Object.hasOwn(processEnv,key)?{present:true,value:processEnv[key]}:absent()]));
 const setMemory=values=>{for(const [key,value] of Object.entries(values)){if(value.present)processEnv[key]=value.value;else delete processEnv[key];}};
 async function restore(){
  status={...status,phase:'restoring'};notify();
  try{return await guarded(file,async()=>{const record=read(file);let skipped=[];if(record&&record.token===token)skipped=await restoreRecord(file,record,system);if(memory)setMemory(memory);memory=null;token=null;status={phase:'restored',active:false,skipped};notify();return status;},isAlive);}
  catch(error){status={phase:'error',active:Boolean(token),error:error.message};notify();throw error;}
 }
 async function apply(profile,options={}){
  if(!profile?.timezoneId){await restore();status={phase:'waiting',active:false};notify();return status;}
  status={...status,phase:'applying'};notify();
  try{return await guarded(file,async()=>{
   let record=read(file);
   if(record){validate(record,system.platform);if(record.token!==token){if(await isAlive(record.owner))throw Error('Another Astra session owns the login environment');await restoreRecord(file,record,system);record=null;}}
   const first=!record;
   if(first){token=crypto.randomUUID();memory=snapshotMemory();const baseline=await system.read(KEYS);record={version:1,platform:system.platform,owner:await identity(),token,baseline,candidates:Object.fromEntries(KEYS.map(key=>[key,[]])),last:structuredClone(baseline)};}
   const next=profileValues(profile,await system.locales(),record.baseline,options),current=await system.read(KEYS),changes={},skipped=[];
   for(const key of KEYS){if(!equal(current[key],record.last[key])){skipped.push(key);continue;}const target=next.values[key];if(!record.candidates[key].some(v=>equal(v,target)))record.candidates[key].push(target);if(!equal(current[key],target))changes[key]=target;record.last[key]=target;}
   write(file,record);
   if(first){try{record.recoveryCommand=await startWatchdog({file,token,nodeExecutable});write(file,record);if(record.recoveryCommand)await system.recovery(record.recoveryCommand);}catch(error){await restoreRecord(file,record,system).catch(()=>{});throw error;}}
   try{if(Object.keys(changes).length)await system.write(changes);const processValues={...next.values};if(!options.disableToolTelemetry)for(const key of ['DISABLE_TELEMETRY','DISABLE_ERROR_REPORTING'])processValues[key]=memory[key];setMemory(processValues);status={phase:skipped.length?'conflict':'active',active:true,...next.profile,skipped};notify();return status;}
   catch(error){await restoreRecord(file,record,system).catch(()=>{});if(memory)setMemory(memory);throw error;}
  },isAlive);}catch(error){let owned=false;try{owned=Boolean(token)&&read(file)?.token===token;}catch{}status={phase:'error',active:owned,error:error.message};notify();throw error;}
 }
 return {apply,restore,recover:async()=>{try{const result=await recover({file,system,isAlive});status={phase:result.owned?'owned-elsewhere':result.restored?'restored':'idle',active:false,...result};notify();return result;}catch(error){status={phase:'error',active:false,error:error.message};notify();throw error;}},status:()=>({...status,platform:system.platform})};
};
Object.assign(module.exports,{recover,alive,profileValues,watchdog,KEYS});
