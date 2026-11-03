const {app}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const sessions=new WeakSet();
let file;
const loginEvents=[];
function loginEndpoint(value){
 try{const u=new URL(value);if(!['x.com','api.x.com','twitter.com','api.twitter.com','accounts.google.com','accounts.youtube.com','appleid.apple.com','idmsa.apple.com'].includes(u.hostname)||u.protocol!=='https:')return null;const match=/^\/(?:i\/(?:flow|jf\/onboarding|oauth2)|oauth|account\/login|login|(?:i\/api\/)?1\.1\/onboarding|auth\/(?:authorize|signin)|appleauth\/auth)(?:\/|$)/.exec(u.pathname);const route=match?match[0].replace(/\/$/,''):'/[page]';return u.origin+route;}catch{return value==='about:blank'?'about:blank':null;}
}
function recordLogin(event,data){
 const url=loginEndpoint(data.url),target=loginEndpoint(data.target);
 if(!url&&!target)return;
 const entry={time:new Date().toISOString(),event,id:data.id};
 if(url)entry.url=url;if(target)entry.target=target;
 for(const key of ['method','type','status','code','category','action','policyMode','operation','coop','coopReportOnly','networkError','openerId','closed','hasOpener'])if(data[key]!==undefined)entry[key]=data[key];
 if(Array.isArray(data.errorCodes))entry.errorCodes=data.errorCodes.filter(value=>Number.isSafeInteger(value)).slice(0,20);
 loginEvents.push(entry);if(loginEvents.length>300)loginEvents.shift();
}

function endpoint(value){try{const u=new URL(value);return /^https?:$/.test(u.protocol)?u.origin+u.pathname.replace(/[A-Za-z0-9_-]{48,}/g,'[redacted]'):u.protocol;}catch{return '[invalid URL]';}}
function write(event,data){try{if(!file){const dir=path.join(app.getPath('userData'),'logs');fs.mkdirSync(dir,{recursive:true});file=path.join(dir,'browser-diagnostics.jsonl');if(fs.existsSync(file)&&fs.statSync(file).size>5*1024*1024)fs.renameSync(file,file+'.previous');}fs.appendFileSync(file,JSON.stringify({time:new Date().toISOString(),event,...data})+'\n',{mode:0o600});}catch(error){console.error('Diagnostic log write failed:',error.code);}}
function attach(wc,{persist=true}={}){
 const log=(event,data)=>{recordLogin(event,data);if(persist)write(event,data);};
 log('contents-created',{id:wc.id});
 for(const event of ['did-navigate','did-navigate-in-page','will-redirect'])wc.on(event,(_event,url)=>log(event,{id:wc.id,url:endpoint(url)}));
 wc.on('did-fail-load',(_event,code,_description,url)=>log('load-failed',{id:wc.id,code,url:endpoint(url)}));
 wc.on('did-create-window',(child,details)=>log('popup-created',{id:child.webContents.id,openerId:wc.id,url:details.url,target:wc.getURL()}));
 wc.on('render-process-gone',(_event,details)=>log('renderer-gone',{id:wc.id,reason:details.reason,exitCode:details.exitCode}));
 // Do not persist console text: websites may include account data or credentials.
 wc.on('console-message',event=>{
  const categories=[['Cross-Origin-Opener-Policy','opener-policy'],['postMessage','window-messaging'],['Blocked by strict fingerprint protection','fingerprint-protection'],['Content Security Policy','content-security-policy'],['identity-credentials-get','federated-identity'],['NotAllowedError','not-allowed']];
  const message=String(event.message),category=categories.find(([pattern])=>message.includes(pattern))?.[1];
  const policyMode=category==='opener-policy'?(/would block/i.test(message)?'report-warning':'enforcement-unknown'):undefined;
  const operation=category==='opener-policy'?['postMessage','closed','opener','close'].find(name=>message.includes('window.'+name)):undefined;
  log('console',{id:wc.id,level:event.level,url:endpoint(wc.getURL()),source:endpoint(event.sourceId),line:event.lineNumber,...(category?{category}:{}),...(policyMode?{policyMode}:{}),...(operation?{operation}:{})});
 });
 if(!sessions.has(wc.session)){
  sessions.add(wc.session);
  wc.session.webRequest.onHeadersReceived((details,callback)=>{
   // Observe policy headers without altering the site's isolation policy.
   const policy=name=>{const key=Object.keys(details.responseHeaders||{}).find(key=>key.toLowerCase()===name);const value=details.responseHeaders?.[key]?.[0]?.split(';')[0]?.trim();return ['same-origin','same-origin-allow-popups','unsafe-none','noopener-allow-popups','restrict-properties'].includes(value)?value:undefined;};
   const coop=policy('cross-origin-opener-policy'),coopReportOnly=policy('cross-origin-opener-policy-report-only');
   if(coop||coopReportOnly)log('opener-policy-headers',{id:details.webContentsId,url:endpoint(details.url),coop,coopReportOnly});
   callback({});
  });
  wc.session.webRequest.onCompleted(details=>log('request-completed',{id:details.webContentsId,method:details.method,type:details.resourceType,status:details.statusCode,url:endpoint(details.url)}));
  wc.session.webRequest.onErrorOccurred(details=>log('request-failed',{id:details.webContentsId,type:details.resourceType,error:details.error,networkError:/^net::ERR_[A-Z_]+$/.test(details.error)?details.error:undefined,url:endpoint(details.url)}));
 }
}
module.exports={attach,recordLogin,loginSnapshot:()=>loginEvents.slice()};
