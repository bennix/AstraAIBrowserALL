const {app,dialog,Menu,shell}=require('electron');const pick=require('./media-picker.cjs');
const {spawn}=require('node:child_process');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
module.exports=function({owner,notify}){
 const jobs=new Map();
 const completedFiles=new Map();
 const completedGroups=new Map();
 const partOwners=new Map();
 const deleting=new Set();
 const timeRetries=new Map();
 const timeCleanups=new Map();
 const catalog=typeof app?.getPath==='function'?path.join(app.getPath('userData'),'completed-downloads.json'):null;
 let restored=false;
 function saveCompleted(){
  if(!catalog)return;
  try{
   const temporary=catalog+'.tmp';
   fs.writeFileSync(temporary,JSON.stringify({files:[...completedFiles].filter(([id])=>!partOwners.has(id)||completedGroups.has(partOwners.get(id))),groups:[...completedGroups]}),{mode:0o600});
   fs.renameSync(temporary,catalog);
  }catch{console.warn('Could not save completed downloads');}
 }
 if(catalog){
  try{
   const data=JSON.parse(fs.readFileSync(catalog,'utf8'));
   for(const [id,file] of data.files||[])if(typeof id==='string'&&typeof file==='string'&&path.isAbsolute(file))completedFiles.set(id,file);
   for(const [id,group] of data.groups||[]){
    if(typeof id==='string'&&typeof group.directory==='string'&&path.isAbsolute(group.directory)&&Array.isArray(group.ids)&&group.ids.every(child=>typeof child==='string')){
     completedGroups.set(id,group);
     for(const child of group.ids)partOwners.set(child,id);
    }
   }
  }catch{}
 }
 function restoreCompleted(){
  if(restored)return;
  restored=true;
  // Recover finished segmented downloads made before the completion catalog existed.
  if(typeof app?.getPath==='function'){
   try{
    const directory=app.getPath('downloads');
    for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
     const match=/\[分段合并-([a-f0-9]{20})\](?:-\d+)?\.mkv$/.exec(entry.name);
     if(!entry.isFile()||!match)continue;
     const file=path.join(directory,entry.name),cache=path.join(directory,'.astra-parts',match[1]);
     if([...completedFiles.values()].includes(file)||!fs.existsSync(path.join(cache,'completed.json'))||!fs.lstatSync(cache).isDirectory())continue;
     const id='restored-'+require('node:crypto').createHash('sha256').update(file).digest('hex').slice(0,20);
     const ids=[];
     for(const part of fs.readdirSync(cache,{withFileTypes:true})){
      if(!part.isFile()||!/^part-\d+\.mkv$/.test(part.name))continue;
      const child=id+'-'+part.name;ids.push(child);completedFiles.set(child,path.join(cache,part.name));partOwners.set(child,id);
     }
     completedFiles.set(id,file);completedGroups.set(id,{directory:cache,ids});
    }
   }catch{}
  }
  saveCompleted();
  for(const [id,file] of completedFiles){
   if(partOwners.has(id))continue;
   const group=completedGroups.get(id);
   if(!fs.existsSync(file)&&!group?.directory)continue;
   notify({id,kind:group?'media':'file',status:'started',title:path.basename(file)});
   for(const child of group?.ids||[]){const partFile=completedFiles.get(child);if(partFile&&fs.existsSync(partFile))notify({id:child,kind:'part',status:'completed',title:path.basename(partFile),percent:100});}
   notify({id,kind:group?'media':'file',status:'completed',title:path.basename(file),percent:100,message:'已保存的下载'});
  }
 }
 const browserDownloads=new Map(), sessions=new WeakSet();
 function bindSession(session){
  if(sessions.has(session))return;
  sessions.add(session);
  session.on('will-download',(_event,item)=>{
   const id='file-'+require('node:crypto').randomUUID();
   let previousBytes=item.getReceivedBytes(),previousTime=Date.now(),speed=0,retryTimer=null,attempts=0,terminal=false,cancelled=false;
   const record={resume,cancel};browserDownloads.set(id,record);
   function clearRetry(){if(retryTimer){clearTimeout(retryTimer);retryTimer=null;}}
   const update=(status)=>{
    const now=Date.now(),receivedBytes=item.getReceivedBytes(),totalBytes=item.getTotalBytes();
    const elapsed=(now-previousTime)/1000;
    if(elapsed>=0.25){speed=Math.max(0,(receivedBytes-previousBytes)/elapsed);previousBytes=receivedBytes;previousTime=now;}
    const paused=item.isPaused(),canResume=!terminal&&item.canResume();
    notify({id,kind:'file',title:item.getFilename(),status:status==='downloading'&&paused?'paused':status,receivedBytes,totalBytes:totalBytes>0?totalBytes:null,percent:totalBytes>0?Math.min(100,receivedBytes/totalBytes*100):undefined,bytesPerSecond:status==='downloading'&&!paused?speed:0,etaSeconds:status==='downloading'&&!paused&&totalBytes>receivedBytes&&speed>0?Math.ceil((totalBytes-receivedBytes)/speed):null,canResume,canRetry:terminal&&status==='interrupted',retryAttempt:attempts,retrying:retryTimer!==null});
   };
   function resume(){
    if(cancelled)throw Error('Download was cancelled');
    clearRetry();
    if(terminal){session.downloadURL(item.getURL());browserDownloads.delete(id);notify({id,status:'cancelled'});return;}
    if(!item.canResume())throw Error('Download cannot resume yet');
    previousBytes=item.getReceivedBytes();previousTime=Date.now();speed=0;
    item.resume();update('downloading');
   }
   function cancel(){cancelled=true;clearRetry();if(terminal){browserDownloads.delete(id);notify({id,status:'cancelled'});}else item.cancel();}
   function scheduleRetry(){
    if(terminal||cancelled||retryTimer||attempts>=3||!item.canResume())return;
    const delay=[2000,5000,10000][attempts++];
    retryTimer=setTimeout(()=>{retryTimer=null;if(terminal||cancelled)return;try{resume();}catch{scheduleRetry();update('interrupted');}},delay);
   }
   update('started');
   const timer=setInterval(()=>{const interrupted=item.getState()==='interrupted';if(interrupted)scheduleRetry();update(interrupted?'interrupted':'downloading');},1000);
   item.on('updated',(_event,state)=>{if(state==='interrupted')scheduleRetry();else clearRetry();update(state==='interrupted'?'interrupted':'downloading');});
   item.once('done',(_event,state)=>{if(state==='completed'){completedFiles.set(id,item.getSavePath());saveCompleted();}terminal=true;clearInterval(timer);clearRetry();update(state);if(state!=='interrupted')browserDownloads.delete(id);});
  });
 }

 let choosing = false;
 async function start(wc,kind='video',height=1080){
  if(choosing)return;
  choosing=true;
  try{return await chooseMedia(wc,kind,height);}
  finally{choosing=false;}
 }
 async function chooseMedia(wc,kind='video',height=1080){
  let url=wc.getURL();if(!/^https?:/.test(url))throw Error('Open a media website first');
  const candidates=await wc.executeJavaScript(fs.readFileSync(path.join(__dirname,'media-candidates.js'),'utf8'));
  let selected=candidates[0];
  if(candidates.length>1){const index=await pick(owner(),'Choose media','Select a video from the current page.',candidates.map(c=>(c.playing?'Playing · ':'')+c.title+(c.mediaCount>1?' · 视频 '+(c.mediaIndex+1)+'/'+c.mediaCount:'')+(c.duration?' · '+Math.round(c.duration)+'s':'')+(c.height?' · '+c.width+'×'+c.height:'')));if(index<0)return;selected=candidates[index];}
  if(selected)url=selected.url;
  if(['x.com','twitter.com'].includes(new URL(url).hostname)&&!new URL(url).pathname.includes('/status/'))throw Error('Open or play an X video post before downloading');
  const choice=await dialog.showOpenDialog(owner(),{title:'Save media to',properties:['openDirectory','createDirectory']});if(choice.canceled)return;
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'astra-media-'));fs.chmodSync(temp,0o700);
  try{
   let cookies=await wc.session.cookies.get({url});const cookieFile=path.join(temp,'cookies.txt');
   fs.writeFileSync(cookieFile,'# Netscape HTTP Cookie File\n'+cookies.map(c=>[c.domain,c.domain.startsWith('.')?'TRUE':'FALSE',c.path,c.secure?'TRUE':'FALSE',Math.floor(c.expirationDate||0),c.name,c.value].join('\t')).join('\n'),{mode:0o600});
   const proxy=await wc.session.resolveProxy(url);const first=proxy.split(';')[0].trim();let proxyURL='';
   if(first!=='DIRECT'){const m=/^(PROXY|HTTPS|SOCKS5?|SOCKS) (.+)$/.exec(first);if(!m)throw Error('Unsupported proxy configuration');proxyURL=(m[1].startsWith('SOCKS')?'socks5://':m[1]==='HTTPS'?'https://':'http://')+m[2];}
   const executable=app.isPackaged?path.join(process.resourcesPath,'tools',process.platform==='win32'?'yt-dlp.exe':'yt-dlp'):path.join(__dirname,'../tools',process.platform==='win32'?'yt-dlp.exe':'yt-dlp');
   const requestHeaders=['--referer',url];
   if(typeof wc.getUserAgent==='function')requestHeaders.push('--user-agent',wc.getUserAgent());
   const detect=async source=>{
    const route=(await wc.session.resolveProxy(source)).split(';')[0].trim();
    let detectionProxy='';
    if(route!=='DIRECT'){
     const match=/^(PROXY|HTTPS|SOCKS5?|SOCKS) (.+)$/.exec(route);
     if(!match)throw Error('Unsupported media proxy configuration');
     detectionProxy=(match[1].startsWith('SOCKS')?'socks5://':match[1]==='HTTPS'?'https://':'http://')+match[2];
    }
    return await new Promise((resolve,reject)=>{const probe=spawn(executable,['--js-runtimes','node:'+path.join(path.dirname(executable),process.platform==='win32'?'node.exe':'node'),'--socket-timeout','20','--retries','1','--ignore-config','--no-playlist','--skip-download','--dump-single-json','--cookies',cookieFile,'--proxy',detectionProxy,...requestHeaders,'--',source],{shell:false,stdio:['ignore','pipe','pipe']});let output='',diagnostic='';probe.stderr.on('data',c=>{diagnostic=(diagnostic+c.toString()).slice(-5000);});const timer=setTimeout(()=>{probe.kill();reject(Error('Media detection timed out'));},60000);probe.stdout.on('data',c=>{output+=c.toString();if(output.length>20000000){probe.kill();reject(Error('Media metadata is too large'));}});probe.on('error',e=>{clearTimeout(timer);reject(e);});probe.on('close',code=>{clearTimeout(timer);try{if(code!==0)throw Error('Media detection failed: '+diagnostic.replace(/https?:\/\/\S+/g,'[URL]').slice(-1500));resolve(JSON.parse(output));}catch(e){reject(e);}});});
   };
   let metadata;
   try{metadata=await detect(url);}
   catch(pageError){
    if(!/HTTP Error 403|Unsupported URL|No video|no video|no media/i.test(pageError.message))throw pageError;
    const sources=await wc.executeJavaScript(fs.readFileSync(path.join(__dirname,'media-loaded-sources.js'),'utf8'));
    if(!sources.length)throw Error(pageError.message+'\n请先在页面里播放视频几秒，再重新下载；尚未获取到可下载的媒体地址。');
    const sourceIndex=await pick(owner(),'选择已加载的媒体','网页解析失败，请选择浏览器已加载的媒体流。',sources.map(source=>{
     const parsed=new URL(source.url);
     return (source.kind==='player'?'播放器 · ':'网络媒体 · ')+parsed.hostname+parsed.pathname;
    }));
    if(sourceIndex<0){fs.rmSync(temp,{recursive:true,force:true});return;}
    const source=sources[sourceIndex].url;
    const mediaCookies=await wc.session.cookies.get({url:source});
    cookies=[...cookies,...mediaCookies].filter((cookie,i,all)=>all.findIndex(other=>other.domain===cookie.domain&&other.path===cookie.path&&other.name===cookie.name)===i);
    fs.writeFileSync(cookieFile,'# Netscape HTTP Cookie File\n'+cookies.map(c=>[c.domain,c.domain.startsWith('.')?'TRUE':'FALSE',c.path,c.secure?'TRUE':'FALSE',Math.floor(c.expirationDate||0),c.name,c.value].join('\t')).join('\n'),{mode:0o600});
    metadata=await detect(source);
   }

   if(Array.isArray(metadata.entries)){
    const entries=metadata.entries.filter(entry=>entry&&Array.isArray(entry.formats)&&entry.formats.length);
    if(!entries.length)throw Error('No downloadable videos found in this post');
    let entryIndex=selected?.mediaId?entries.findIndex(entry=>String(entry.id)===selected.mediaId):-1;
    if(entryIndex<0&&selected?.mediaCount===entries.length)entryIndex=selected.mediaIndex;
    if(entryIndex<0){
     entryIndex=await pick(owner(),'选择帖子中的视频','这条帖子包含多个视频，请选择要下载的一个。',entries.map((entry,i)=>
      '视频 '+(i+1)+' · '+(entry.title||metadata.title||'Video')+(entry.duration?' · '+Math.round(entry.duration)+'s':'')));
    }
    if(entryIndex<0){fs.rmSync(temp,{recursive:true,force:true});return;}
    metadata=entries[entryIndex];
   }
   if(metadata.is_live)throw Error('Live stream downloads are not supported yet');
   const formats=(metadata.formats||[]).filter(f=>f.format_id&&!f.has_drm&&f.url&&['http','https','m3u8_native','m3u8'].includes(f.protocol)&&f.vcodec!=='none').sort((a,b)=>(b.height||0)-(a.height||0)||(b.tbr||0)-(a.tbr||0));
   const unique=formats.filter((f,i)=>formats.findIndex(x=>x.height===f.height&&x.ext===f.ext&&(x.acodec!=='none')===(f.acodec!=='none'))===i).slice(0,16);
   const audio=(metadata.formats||[]).filter(f=>f.format_id&&!f.has_drm&&f.url&&f.vcodec==='none'&&f.acodec!=='none').sort((a,b)=>(b.abr||0)-(a.abr||0))[0];
   const choices=unique.map(f=>({id:f.acodec==='none'&&audio?f.format_id+'+'+audio.format_id:f.format_id,label:(f.height?f.height+'p':f.format_note||'Video')+' · '+(f.acodec==='none'&&audio?'MKV':f.ext)+(f.acodec==='none'?(audio?' · video + audio (merged)':' · video only — no audio available'):' · video + audio')}));if(audio)choices.push({id:audio.format_id,label:'Audio only · '+audio.ext});
   if(!choices.length)throw Error('No downloadable clear media formats detected');
   const index=await pick(owner(),'Choose resolution',metadata.title||selected?.title||'Available media formats',choices.map(c=>c.label));if(index<0){fs.rmSync(temp,{recursive:true,force:true});return;}
   const formatID=choices[index].id;const toolDirectory=app.isPackaged?path.join(process.resourcesPath,'tools'):path.join(__dirname,'../tools');if(formatID.includes('+')&&!fs.existsSync(path.join(toolDirectory,process.platform==='win32'?'ffmpeg.exe':'ffmpeg')))throw Error('Audio/video merger is missing from this build');
   if(!Number.isFinite(metadata.duration)&&Number.isFinite(selected?.duration))metadata.duration=selected.duration;
   let partSeconds=0;
   if(Number.isFinite(metadata.duration)&&metadata.duration>300){
    const defaultLength=metadata.duration>1800?1800:metadata.duration>600?600:300;
    const lengths=[defaultLength,...[1800,600,300].filter(seconds=>seconds!==defaultLength),0];
    const partIndex=await pick(owner(),'按时间分段下载','最多两个时间段同时处理，分别保存；失败可重试，全部完成后合并。精确切分需要重新编码。',lengths.map(seconds=>
     seconds?'每 '+seconds/60+' 分钟 · 共 '+Math.ceil(metadata.duration/seconds)+' 段':'一次下载完整视频'));
    if(partIndex<0){fs.rmSync(temp,{recursive:true,force:true});return;}
    partSeconds=lengths[partIndex];
    if(partSeconds&&!fs.existsSync(path.join(toolDirectory,process.platform==='win32'?'ffmpeg.exe':'ffmpeg')))throw Error('Time segment downloads require FFmpeg');
   }
   const infoFile=path.join(temp,'media-info.json');fs.writeFileSync(infoFile,JSON.stringify(metadata),{mode:0o600});
   const chosenFormat=(metadata.formats||[]).find(f=>f.format_id===formatID);
   if(chosenFormat?.url){const resolved=(await wc.session.resolveProxy(chosenFormat.url)).split(';')[0].trim();if(resolved==='DIRECT')proxyURL='';else{const match=/^(PROXY|HTTPS|SOCKS5?|SOCKS) (.+)$/.exec(resolved);if(!match)throw Error('Unsupported media proxy configuration');proxyURL=(match[1].startsWith('SOCKS')?'socks5://':match[1]==='HTTPS'?'https://':'http://')+match[2];}}


   const id='media-'+require('node:crypto').randomUUID();const args=['--js-runtimes','node:'+path.join(path.dirname(executable),process.platform==='win32'?'node.exe':'node'),'--socket-timeout','20','--retries','2','--ignore-config','--no-playlist','--newline','--progress','--progress-delta','0.5','--fragment-retries','10','--concurrent-fragments','4','--abort-on-unavailable-fragments','--continue','--print','after_move:ASTRA_FILE %(filepath)j','--progress-template','download:ASTRA_PROGRESS %(progress)j','--no-warnings','--cookies',cookieFile,'--proxy',proxyURL,...requestHeaders,'--no-overwrites','--restrict-filenames','-P',choice.filePaths[0],'-o','%(title).160B [%(id)s].%(ext)s','--ffmpeg-location',toolDirectory,'--merge-output-format','mkv','-f',formatID,'--load-info-json',infoFile];
   if(partSeconds){
    const clock=seconds=>{const value=Math.floor(seconds);return String(Math.floor(value/3600)).padStart(2,'0')+':'+String(Math.floor(value/60)%60).padStart(2,'0')+':'+String(value%60).padStart(2,'0');};
    const partProgress=new Map(),partStatuses=new Map();
    const runner=require('./media-time-parts.cjs').createTimeDownload({
     executable,args,ffmpeg:path.join(toolDirectory,process.platform==='win32'?'ffmpeg.exe':'ffmpeg'),
     directory:choice.filePaths[0],metadata,seconds:partSeconds,
     notify:update=>{
      if(update.status==='merging'){notify({id,kind:'media',status:'merging',message:'所有时间段已完成，正在合并',canRetry:false});return;}
      const childId=id+'-part-'+update.index;
      if(update.file)completedFiles.set(childId,update.file);
      notify({id:childId,kind:'part',status:update.status,
       title:'时间段 '+(update.index+1)+'/'+update.count+' · '+clock(update.start)+'–'+clock(update.end),
       percent:update.percent,speed:update.processingSpeed?'处理速度 '+update.processingSpeed:update.speed?(update.speed/1048576).toFixed(2)+' MiB/s':'',
       message:update.message||(Number.isFinite(update.processedSeconds)?
        '已处理 '+clock(update.processedSeconds)+' / '+clock(update.end-update.start)+' · 尝试 '+(update.attempt||1)+'/3':
        '尝试 '+(update.attempt||1)+'/3'),canRetry:false});
      partProgress.set(update.index,update.status==='completed'?100:update.percent||0);
      partStatuses.set(update.index,update.status);
      const totalProgress=runner.parts.reduce((sum,part)=>sum+(part.end-part.start)*(partProgress.get(part.index)||0)/100,0)/metadata.duration*100;
      const activeParts=[...partStatuses].filter(([,status])=>status==='downloading').map(([index])=>index+1).sort((a,b)=>a-b);
      const finished=[...partStatuses.values()].filter(status=>status==='completed').length;
      notify({id,kind:'media',status:'downloading',title:metadata.title||wc.getTitle(),
       percent:Math.min(100,totalProgress),
       message:(activeParts.length?'处理中 '+activeParts.join('、')+' / '+update.count+' 段 · ':'')+'已完成 '+finished+' 段',canRetry:false});
     }
    });
    const dispose=()=>{timeCleanups.delete(id);fs.rmSync(temp,{recursive:true,force:true});};
    timeCleanups.set(id,dispose);
    const run=()=>{
     timeRetries.delete(id);jobs.set(id,{kill:()=>runner.cancel()});
     notify({id,kind:'media',status:'started',title:metadata.title||wc.getTitle(),percent:0,canRetry:false});
     return runner.run().then(file=>{
      completedFiles.set(id,file);
      completedGroups.set(id,{directory:runner.partDirectory,ids:runner.parts.map(part=>id+'-part-'+part.index)});
      saveCompleted();
      notify({id,kind:'media',status:'completed',percent:100,speed:'',eta:'',message:'所有时间段已合并',canRetry:false});
      dispose();
     }).catch(error=>{
      if(!error.cancelled)timeRetries.set(id,run);
      notify({id,kind:'media',status:error.cancelled?'cancelled':'interrupted',speed:'',eta:'',
       message:error.message.replace(/https?:\/\/\S+/g,'[URL]'),canRetry:!error.cancelled});
      if(error.cancelled)dispose();
     }).finally(()=>jobs.delete(id));
    };
    notify({id,kind:'media',status:'started',title:metadata.title||wc.getTitle(),percent:0,canRetry:false});
    for(const part of runner.parts)partOwners.set(id+'-part-'+part.index,id);
    for(const part of runner.parts)notify({id:id+'-part-'+part.index,kind:'part',status:'pending',
     title:'时间段 '+(part.index+1)+'/'+runner.parts.length+' · '+clock(part.start)+'–'+clock(part.end),message:'等待下载',percent:0});
    void run();
    return id;
   }
   const job=spawn(app.isPackaged?path.join(process.resourcesPath,'tools',process.platform==='win32'?'yt-dlp.exe':'yt-dlp'):path.join(__dirname,'../tools',process.platform==='win32'?'yt-dlp.exe':'yt-dlp'),args,{shell:false,stdio:['ignore','pipe','pipe']});jobs.set(id,job);notify({id,status:'started',title:wc.getTitle()});let error='',outputPath='';
   const buffers={stdout:'',stderr:''};let lastActivity=Date.now();
   function consume(stream,chunk){lastActivity=Date.now();buffers[stream]+=chunk.toString();const lines=buffers[stream].split(/[\r\n]/);buffers[stream]=lines.pop();for(const line of lines){
    if(line.startsWith('ASTRA_FILE ')){
     try{
      const candidate=JSON.parse(line.slice(11));
      if(typeof candidate==='string'){
       const relative=path.relative(choice.filePaths[0],candidate);
       if(relative&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative))outputPath=candidate;
      }
     }catch{}
     continue;
    }
    const marker=line.indexOf('ASTRA_PROGRESS ');if(marker>=0){try{const progress=JSON.parse(line.slice(marker+15));const total=progress.total_bytes||progress.total_bytes_estimate;const percent=total?Math.min(100,progress.downloaded_bytes/total*100):undefined;const speed=progress.speed?((progress.speed/1048576).toFixed(2)+' MiB/s'):'Waiting';notify({id,status:'downloading',percent,speed,eta:progress.eta!=null?Math.ceil(progress.eta)+'s':'',message:progress.fragment_count?'分段 '+(progress.fragment_index||0)+' / '+progress.fragment_count:''});}catch{}continue;}if(/\[Merger\]/.test(line))notify({id,status:'merging',speed:'',eta:'',message:'Combining video and audio'});if(/ERROR:|WARNING:|Retrying|HTTP Error/i.test(line)){const message=line.replace(/https?:\/\/\S+/g,'[URL]').slice(-500);error=(error+'\n'+message).slice(-2000);notify({id,status:'downloading',message});}}}
   job.stdout.on('data',chunk=>consume('stdout',chunk));job.stderr.on('data',chunk=>consume('stderr',chunk));
   const waiting=setInterval(()=>{if(Date.now()-lastActivity>10000)notify({id,status:'downloading',speed:'Waiting',message:'Waiting for media server or retry; cancel is available.'});},5000);
   const cleanup=()=>{clearInterval(waiting);jobs.delete(id);fs.rmSync(temp,{recursive:true,force:true});};
   job.on('error',()=>{cleanup();notify({id,status:'failed',message:'Media helper could not start'});});
   job.on('close',code=>{
    for(const stream of ['stdout','stderr'])if(buffers[stream])consume(stream,'\n');
    if(code===0&&outputPath&&fs.existsSync(outputPath)){completedFiles.set(id,outputPath);saveCompleted();}
    cleanup();notify({id,status:code===0?'completed':'failed',speed:'',eta:'',message:code===0?'Saved to selected directory':(error||'下载进程退出，错误码 '+code).replace(/https?:\/\/\S+/g,'[URL]')});
   });
   return id;
  }catch(e){fs.rmSync(temp,{recursive:true,force:true});throw e;}
 }
 function menu(wc){start(wc).catch(e=>dialog.showErrorBox('Media download',e.message));}

 async function deleteDownload(value){
  const id=String(value),file=completedFiles.get(id),group=completedGroups.get(id);
  if(partOwners.has(id))throw Error('请通过完整下载任务删除视频和中间分段');
  if(!file&&!group)throw Error('Completed download not found');
  if(jobs.has(id)||timeRetries.has(id))throw Error('Stop this download before deleting its files');
  if(deleting.has(id))return false;
  deleting.add(id);
  let release;
  try{
   const decision=await dialog.showMessageBox(owner(),{
    type:'warning',message:group?'删除下载文件和全部中间分段？':'删除下载文件？',
    detail:[file,group?.directory].filter(Boolean).join('\n')+'\n这些文件将移到系统废纸篓。',
    buttons:['取消','移到废纸篓'],defaultId:0,cancelId:0
   });
   if(decision.response!==1)return false;
   if(group?.directory)release=require('./media-time-parts.cjs').reservePartsDirectory(group.directory);
   // Clean intermediates first so a failed cleanup keeps the final video available.
   if(group?.directory&&fs.existsSync(group.directory))await shell.trashItem(group.directory);
   if(group){
    for(const childId of group.ids){completedFiles.delete(childId);notify({id:childId,status:'cancelled'});}
   }
   if(file&&fs.existsSync(file))await shell.trashItem(file);
   if(group)for(const childId of group.ids)partOwners.delete(childId);
   completedFiles.delete(id);completedGroups.delete(id);notify({id,status:'cancelled'});
   return true;
  }finally{saveCompleted();release?.();deleting.delete(id);}
 }

 async function openDownload(id,reveal=false){
  const file=completedFiles.get(String(id));
  if(!file)throw Error('Completed download not found');
  if(!fs.existsSync(file))throw Error('The downloaded file was moved or deleted');
  if(reveal){shell.showItemInFolder(file);return;}
  const error=await shell.openPath(file);
  if(error)throw Error(error);
 }
 return {start,menu,bindSession,openDownload,deleteDownload,restoreCompleted,resume(id){const retry=timeRetries.get(String(id));if(retry){void retry();return;}const record=browserDownloads.get(String(id));if(!record)throw Error('Download not found');record.resume();},cancel(id){if(timeRetries.has(String(id))){timeRetries.delete(String(id));timeCleanups.get(String(id))?.();notify({id:String(id),status:'cancelled'});}browserDownloads.get(String(id))?.cancel();jobs.get(String(id))?.kill('SIGTERM');},shutdown(){for(const dispose of timeCleanups.values())dispose();timeRetries.clear();for(const item of browserDownloads.values())item.cancel();for(const job of jobs.values())job.kill('SIGTERM');}};
};
