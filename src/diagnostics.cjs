const {app}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const sessions=new WeakSet();
let file;
function endpoint(value){try{const u=new URL(value);return /^https?:$/.test(u.protocol)?u.origin+u.pathname.replace(/[A-Za-z0-9_-]{48,}/g,'[redacted]'):u.protocol;}catch{return '[invalid URL]';}}
function write(event,data){try{if(!file){const dir=path.join(app.getPath('userData'),'logs');fs.mkdirSync(dir,{recursive:true});file=path.join(dir,'browser-diagnostics.jsonl');if(fs.existsSync(file)&&fs.statSync(file).size>5*1024*1024)fs.renameSync(file,file+'.previous');}fs.appendFileSync(file,JSON.stringify({time:new Date().toISOString(),event,...data})+'\n',{mode:0o600});}catch(error){console.error('Diagnostic log write failed:',error.code);}}
function attach(wc){
 write('contents-created',{id:wc.id});
 for(const event of ['did-navigate','did-navigate-in-page','will-redirect'])wc.on(event,(_event,url)=>write(event,{id:wc.id,url:endpoint(url)}));
 wc.on('did-fail-load',(_event,code,_description,url)=>write('load-failed',{id:wc.id,code,url:endpoint(url)}));
 wc.on('render-process-gone',(_event,details)=>write('renderer-gone',{id:wc.id,reason:details.reason,exitCode:details.exitCode}));
 // Do not persist console text: websites may include account data or credentials.
 wc.on('console-message',event=>{
  const categories=[['Cross-Origin-Opener-Policy','opener-policy'],['postMessage','window-messaging'],['Blocked by strict fingerprint protection','fingerprint-protection'],['Content Security Policy','content-security-policy'],['identity-credentials-get','federated-identity'],['NotAllowedError','not-allowed']];
  const category=categories.find(([pattern])=>String(event.message).includes(pattern))?.[1];
  write('console',{id:wc.id,level:event.level,source:endpoint(event.sourceId),line:event.lineNumber,...(category?{category}:{})});
 });
 if(!sessions.has(wc.session)){
  sessions.add(wc.session);
  wc.session.webRequest.onCompleted(details=>write('request-completed',{id:details.webContentsId,method:details.method,type:details.resourceType,status:details.statusCode,url:endpoint(details.url)}));
  wc.session.webRequest.onErrorOccurred(details=>write('request-failed',{id:details.webContentsId,type:details.resourceType,error:details.error,url:endpoint(details.url)}));
 }
}
module.exports={attach};
