async function connection(wc){if(!wc.debugger.isAttached())wc.debugger.attach('1.3');return wc.debugger;}
async function list(wc){const debug=await connection(wc);const {frameTree}=await debug.sendCommand('Page.getFrameTree');const frames=[];function walk(node){frames.push({frameId:node.frame.id,parentId:node.frame.parentId||null,name:node.frame.name||'',url:node.frame.url});for(const child of node.childFrames||[])walk(child);}walk(frameTree);return {data:{frames}};}
async function evaluate(wc,frameId,code){const debug=await connection(wc);const frames=await list(wc);if(!frames.data.frames.some(f=>f.frameId===frameId))throw Error('Frame disappeared. List frames again.');const {executionContextId}=await debug.sendCommand('Page.createIsolatedWorld',{frameId,worldName:'astra-huashu',grantUniveralAccess:false});const result=await debug.sendCommand('Runtime.evaluate',{expression:code,contextId:executionContextId,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result?.value;}
const localeProfiles=new WeakMap();
async function applyLocale(wc,profile){const key=JSON.stringify(profile);const previous=localeProfiles.get(wc);if(previous?.key===key)return previous.promise;const promise=(async()=>{await previous?.promise.catch(()=>{});const debug=await connection(wc);await debug.sendCommand('Emulation.setTimezoneOverride',{timezoneId:profile.timezoneId||''});await debug.sendCommand('Emulation.setLocaleOverride',{locale:profile.locale||''});await debug.sendCommand('Emulation.setUserAgentOverride',{userAgent:wc.getUserAgent(),acceptLanguage:profile.acceptLanguage});})();localeProfiles.set(wc,{key,promise});try{await promise;}catch(error){localeProfiles.delete(wc);throw error;}}
module.exports={list,evaluate,applyLocale};

// Only numeric X onboarding error codes leave this boundary; response bodies stay transient.
async function observeLogin(wc,record){
 const debug=await connection(wc),requests=new Map();
 const relevant=(value,status)=>{try{const url=new URL(value);return url.protocol==='https:'&&['x.com','api.x.com','twitter.com','api.twitter.com'].includes(url.hostname)&&(/^\/(?:i\/api\/)?(?:1\.1|2)\/(?:onboarding\/[a-z_]+|guest\/activate)\.json$/.test(url.pathname)||(status>=400&&['api.x.com','api.twitter.com'].includes(url.hostname)));}catch{return false;}};
 async function message(_event,method,params){
  if(method==='Runtime.exceptionThrown'){const details=params.exceptionDetails||{};const description=String(details.exception?.description||details.text||'');const category=description.includes('Blocked by strict fingerprint protection')?'fingerprint-protection':description.includes('SecurityError')?'security-exception':description.includes('TypeError')?'type-error':'script-exception';record('script-exception',{id:wc.id,url:wc.getURL(),category});}
  else if(method==='Network.responseReceived'&&relevant(params.response?.url,params.response?.status)){
   requests.set(params.requestId,{url:params.response.url,status:params.response.status});if(requests.size>32)requests.delete(requests.keys().next().value);
  }else if(method==='Network.loadingFailed'){requests.delete(params.requestId);}
  else if(method==='Network.loadingFinished'&&requests.has(params.requestId)){
   const request=requests.get(params.requestId);requests.delete(params.requestId);
   try{if(params.encodedDataLength>1024*1024)return;const result=await debug.sendCommand('Network.getResponseBody',{requestId:params.requestId});if(result.base64Encoded||result.body.length>1024*1024)return;const body=JSON.parse(result.body);const errorCodes=Array.isArray(body.errors)?body.errors.map(error=>error.code).filter(Number.isSafeInteger).slice(0,20):[];record('onboarding-response',{id:wc.id,url:request.url,status:request.status,errorCodes,stage:({
 'task.json':'task','sso_init.json':'sso-init','sso_finalize.json':'sso-finalize','activate.json':'guest-activate'
 })[new URL(request.url).pathname.split('/').at(-1)]||'other',subtasks:Array.isArray(body.subtasks)?body.subtasks.map(item=>item.subtask_id).filter(value=>['LoginJsInstrumentationSubtask','LoginEnterUserIdentifierSSO','LoginEnterPassword','LoginTwoFactorAuthChallenge','LoginAcid','LoginSuccessSubtask','LoginOpenHomeTimeline','LoginDeny','LoginSSO','LoginEnterAlternateIdentifierSubtask','AccountDuplicationCheck'].includes(value)).slice(0,20):[]});}catch{}
  }
 }
 const listener=(...args)=>{void message(...args).catch(()=>{});};
 debug.on('message',listener);wc.once('destroyed',()=>{requests.clear();debug.removeListener('message',listener);});
 try{await debug.sendCommand('Network.enable',{maxResourceBufferSize:1024*1024,maxTotalBufferSize:2*1024*1024});await debug.sendCommand('Runtime.enable');}catch(error){debug.removeListener('message',listener);throw error;}
}
module.exports.observeLogin=observeLogin;
