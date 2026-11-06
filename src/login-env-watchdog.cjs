// Detached, network-free recovery helper. Also used by Windows RunOnce after an interrupted login.
const fs=require('node:fs'),path=require('node:path');const environment=require('./login-environment.cjs');
const [file,token,mode]=process.argv.slice(2);
if(!file||!token)process.exit(1);
process.send?.({ready:true});
process.on('disconnect',()=>{});
try{fs.watch(path.dirname(file),(_event,name)=>{if(String(name)===path.basename(file)&&!fs.existsSync(file))process.exit(0);});}catch{}
(async()=>{
 let tick=0,retries=0;
 for(;;){
  let record;try{record=JSON.parse(fs.readFileSync(file,'utf8'));}catch(error){if(error.code==='ENOENT')return;throw error;}
  if(record.token!==token)return;
  if(!await environment.alive(tick++%10===0?record.owner:{pid:record.owner.pid})){try{await environment.recover({file,token});return;}catch{await new Promise(r=>setTimeout(r,Math.min(60000,1000*2**Math.min(retries++,6))));continue;}}
  if(mode==='--recover')return;
  await new Promise(r=>setTimeout(r,1000));
 }
})().then(()=>process.exit(0)).catch(()=>process.exit(1));
