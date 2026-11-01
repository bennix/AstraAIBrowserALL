const {app,dialog,Menu}=require('electron');const pick=require('./media-picker.cjs');
const {spawn}=require('node:child_process');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
module.exports=function({owner,notify}){
 const jobs=new Map();
 async function start(wc,kind='video',height=1080){
  let url=wc.getURL();if(!/^https?:/.test(url))throw Error('Open a media website first');
  const candidates=await wc.executeJavaScript(fs.readFileSync(path.join(__dirname,'media-candidates.js'),'utf8'));
  let selected=candidates[0];
  if(candidates.length>1){const index=await pick(owner(),'Choose media','Select a video from the current page.',candidates.map(c=>(c.playing?'Playing · ':'')+c.title+(c.height?' · '+c.width+'×'+c.height:'')));if(index<0)return;selected=candidates[index];}
  if(selected)url=selected.url;
  if(['x.com','twitter.com'].includes(new URL(url).hostname)&&!new URL(url).pathname.includes('/status/'))throw Error('Open or play an X video post before downloading');
  const choice=await dialog.showOpenDialog(owner(),{title:'Save media to',properties:['openDirectory','createDirectory']});if(choice.canceled)return;
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'astra-media-'));fs.chmodSync(temp,0o700);
  try{
   const cookies=await wc.session.cookies.get({url});const cookieFile=path.join(temp,'cookies.txt');
   fs.writeFileSync(cookieFile,'# Netscape HTTP Cookie File\n'+cookies.map(c=>[c.domain,c.domain.startsWith('.')?'TRUE':'FALSE',c.path,c.secure?'TRUE':'FALSE',Math.floor(c.expirationDate||0),c.name,c.value].join('\t')).join('\n'),{mode:0o600});
   const proxy=await wc.session.resolveProxy(url);const first=proxy.split(';')[0].trim();let proxyURL='';
   if(first!=='DIRECT'){const m=/^(PROXY|HTTPS|SOCKS5?|SOCKS) (.+)$/.exec(first);if(!m)throw Error('Unsupported proxy configuration');proxyURL=(m[1].startsWith('SOCKS')?'socks5://':m[1]==='HTTPS'?'https://':'http://')+m[2];}
   const executable=app.isPackaged?path.join(process.resourcesPath,'tools',process.platform==='win32'?'yt-dlp.exe':'yt-dlp'):path.join(__dirname,'../tools',process.platform==='win32'?'yt-dlp.exe':'yt-dlp');
   const metadata=await new Promise((resolve,reject)=>{const probe=spawn(executable,['--js-runtimes','node:'+path.join(path.dirname(executable),process.platform==='win32'?'node.exe':'node'),'--socket-timeout','20','--retries','1','--ignore-config','--no-playlist','--skip-download','--dump-single-json','--cookies',cookieFile,'--proxy',proxyURL,'--',url],{shell:false,stdio:['ignore','pipe','pipe']});let output='',diagnostic='';probe.stderr.on('data',c=>{diagnostic=(diagnostic+c.toString()).slice(-5000);});const timer=setTimeout(()=>{probe.kill();reject(Error('Media detection timed out'));},60000);probe.stdout.on('data',c=>{output+=c.toString();if(output.length>20000000){probe.kill();reject(Error('Media metadata is too large'));}});probe.on('error',e=>{clearTimeout(timer);reject(e);});probe.on('close',code=>{clearTimeout(timer);try{if(code!==0)throw Error('Media detection failed: '+diagnostic.replace(/https?:\/\/\S+/g,'[URL]').slice(-1500));resolve(JSON.parse(output));}catch(e){reject(e);}});});
   if(metadata.is_live)throw Error('Live stream downloads are not supported yet');
   const formats=(metadata.formats||[]).filter(f=>f.format_id&&!f.has_drm&&f.url&&['http','https','m3u8_native','m3u8'].includes(f.protocol)&&f.vcodec!=='none').sort((a,b)=>(b.height||0)-(a.height||0)||(b.tbr||0)-(a.tbr||0));
   const unique=formats.filter((f,i)=>formats.findIndex(x=>x.height===f.height&&x.ext===f.ext&&(x.acodec!=='none')===(f.acodec!=='none'))===i).slice(0,16);
   const audio=(metadata.formats||[]).filter(f=>f.format_id&&!f.has_drm&&f.url&&f.vcodec==='none'&&f.acodec!=='none').sort((a,b)=>(b.abr||0)-(a.abr||0))[0];
   const choices=unique.map(f=>({id:f.acodec==='none'&&audio?f.format_id+'+'+audio.format_id:f.format_id,label:(f.height?f.height+'p':f.format_note||'Video')+' · '+(f.acodec==='none'&&audio?'MKV':f.ext)+(f.acodec==='none'?(audio?' · video + audio (merged)':' · video only — no audio available'):' · video + audio')}));if(audio)choices.push({id:audio.format_id,label:'Audio only · '+audio.ext});
   if(!choices.length)throw Error('No downloadable clear media formats detected');
   const index=await pick(owner(),'Choose resolution',metadata.title||selected?.title||'Available media formats',choices.map(c=>c.label));if(index<0){fs.rmSync(temp,{recursive:true,force:true});return;}
   const formatID=choices[index].id;const toolDirectory=app.isPackaged?path.join(process.resourcesPath,'tools'):path.join(__dirname,'../tools');if(formatID.includes('+')&&!fs.existsSync(path.join(toolDirectory,process.platform==='win32'?'ffmpeg.exe':'ffmpeg')))throw Error('Audio/video merger is missing from this build');
   const infoFile=path.join(temp,'media-info.json');fs.writeFileSync(infoFile,JSON.stringify(metadata),{mode:0o600});
   const chosenFormat=(metadata.formats||[]).find(f=>f.format_id===formatID);
   if(chosenFormat?.url){const resolved=(await wc.session.resolveProxy(chosenFormat.url)).split(';')[0].trim();if(resolved==='DIRECT')proxyURL='';else{const match=/^(PROXY|HTTPS|SOCKS5?|SOCKS) (.+)$/.exec(resolved);if(!match)throw Error('Unsupported media proxy configuration');proxyURL=(match[1].startsWith('SOCKS')?'socks5://':match[1]==='HTTPS'?'https://':'http://')+match[2];}}


   const id=Date.now().toString();const args=['--js-runtimes','node:'+path.join(path.dirname(executable),process.platform==='win32'?'node.exe':'node'),'--socket-timeout','20','--retries','2','--ignore-config','--no-playlist','--newline','--progress','--progress-delta','0.5','--progress-template','download:ASTRA_PROGRESS %(progress)j','--no-warnings','--cookies',cookieFile,'--proxy',proxyURL,'--referer',url,'--no-overwrites','--restrict-filenames','-P',choice.filePaths[0],'-o','%(title).160B [%(id)s].%(ext)s','--ffmpeg-location',toolDirectory,'--merge-output-format','mkv','-f',formatID,'--load-info-json',infoFile];
   const job=spawn(app.isPackaged?path.join(process.resourcesPath,'tools',process.platform==='win32'?'yt-dlp.exe':'yt-dlp'):path.join(__dirname,'../tools',process.platform==='win32'?'yt-dlp.exe':'yt-dlp'),args,{shell:false,stdio:['ignore','pipe','pipe']});jobs.set(id,job);notify({id,status:'started',title:wc.getTitle()});let error='';
   const buffers={stdout:'',stderr:''};let lastActivity=Date.now();
   function consume(stream,chunk){lastActivity=Date.now();buffers[stream]+=chunk.toString();const lines=buffers[stream].split(/[\r\n]/);buffers[stream]=lines.pop();for(const line of lines){const marker=line.indexOf('ASTRA_PROGRESS ');if(marker>=0){try{const progress=JSON.parse(line.slice(marker+15));const total=progress.total_bytes||progress.total_bytes_estimate;const percent=total?Math.min(100,progress.downloaded_bytes/total*100):undefined;const speed=progress.speed?((progress.speed/1048576).toFixed(2)+' MiB/s'):'Waiting';notify({id,status:'downloading',percent,speed,eta:progress.eta!=null?Math.ceil(progress.eta)+'s':'',message:''});}catch{}continue;}if(/\[Merger\]/.test(line))notify({id,status:'merging',speed:'',eta:'',message:'Combining video and audio'});if(/ERROR:|WARNING:|Retrying|HTTP Error/i.test(line)){const message=line.replace(/https?:\/\/\S+/g,'[URL]').slice(-500);error=(error+'\n'+message).slice(-2000);notify({id,status:'downloading',message});}}}
   job.stdout.on('data',chunk=>consume('stdout',chunk));job.stderr.on('data',chunk=>consume('stderr',chunk));
   const waiting=setInterval(()=>{if(Date.now()-lastActivity>10000)notify({id,status:'downloading',speed:'Waiting',message:'Waiting for media server or retry; cancel is available.'});},5000);
   const cleanup=()=>{clearInterval(waiting);jobs.delete(id);fs.rmSync(temp,{recursive:true,force:true});};
   job.on('error',()=>{cleanup();notify({id,status:'failed',message:'Media helper could not start'});});
   job.on('close',code=>{cleanup();notify({id,status:code===0?'completed':'failed',message:code===0?'Saved to selected directory':error.replace(/https?:\/\/\S+/g,'[URL]')});});
   return id;
  }catch(e){fs.rmSync(temp,{recursive:true,force:true});throw e;}
 }
 function menu(wc){start(wc).catch(e=>dialog.showErrorBox('Media download',e.message));}

 return {start,menu,cancel(id){jobs.get(String(id))?.kill('SIGTERM');},shutdown(){for(const job of jobs.values())job.kill('SIGTERM');}};
};
