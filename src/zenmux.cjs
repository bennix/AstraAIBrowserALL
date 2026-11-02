const {safeStorage,net}=require('electron');
const fs=require('node:fs');
// A live stream may run longer than the initial response deadline.
async function completionRequest(key, payload, consume, signal) {
 const controller = new AbortController();
 const cancel = () => controller.abort();
 if (signal?.aborted) controller.abort();
 signal?.addEventListener('abort', cancel, {once:true});
 let timer;
 const refresh = () => {
  clearTimeout(timer);
  timer = setTimeout(() => controller.abort(), 180000);
 };
 refresh();
 try {
  const response = await net.fetch('https://zenmux.ai/api/v1/chat/completions', {
   method: 'POST',
   headers: {Authorization: 'Bearer ' + key, 'Content-Type': 'application/json'},
   body: JSON.stringify(payload), signal: controller.signal
  });
  refresh();
  return await consume(response, refresh);
 } catch (error) {
  if (signal?.aborted) throw error;
  if (controller.signal.aborted || error.name === 'TimeoutError') {
   throw Error('ZenMux did not respond for 3 minutes. Existing output has been preserved. Check the network or proxy, then send again.');
  }
  throw error;
 } finally {
  clearTimeout(timer);
  signal?.removeEventListener('abort', cancel);
 }
}
module.exports={
 async test(file,key,model,testModel){key=String(key||'').trim()||(fs.existsSync(file)?safeStorage.decryptString(fs.readFileSync(file)):'');if(!key)throw Error('Enter a ZenMux API key');const headers={Authorization:'Bearer '+key,'Content-Type':'application/json'};const catalog=await net.fetch('https://zenmux.ai/api/v1/models',{headers,signal:AbortSignal.timeout(30000)});if(!catalog.ok)throw Error('Key test failed (HTTP '+catalog.status+')');const data=await catalog.json();if(!testModel)return 'API key accepted. '+data.data.length+' models available.';if(!data.data.some(m=>m.id===model))throw Error('Model is not available: '+model);const response=await net.fetch('https://zenmux.ai/api/v1/chat/completions',{method:'POST',headers,body:JSON.stringify({model,messages:[{role:'user',content:'Reply OK only.'}],max_tokens:100}),signal:AbortSignal.timeout(90000)});if(!response.ok)throw Error('Model test failed (HTTP '+response.status+')');const result=await response.json();if(!result.choices?.[0]?.message?.content?.trim())throw Error('Model returned no text');return 'Model test passed: '+model;},

 async complete(file,model,messages,tools,onDelta){
  if(!fs.existsSync(file))throw Error('Configure a ZenMux API key first');
  const key=safeStorage.decryptString(fs.readFileSync(file));
  return completionRequest(key,{model,messages,tools,tool_choice:tools.length===1&&['task_verdict','define_task'].includes(tools[0].function.name)?{type:'function',function:{name:tools[0].function.name}}:'auto',stream:!!onDelta},async(response,activity)=>{
   if(!response.ok)throw Error('Browser planner request failed (HTTP '+response.status+')');
   if(onDelta)return require('./stream.cjs')(response.body,onDelta,true,activity);
   const data=await response.json();const message=data.choices?.[0]?.message;
   if(!message)throw Error('Browser planner returned no message');return message;
  });
 },

 async validateModel(file,model){if(!fs.existsSync(file))throw Error('Configure a ZenMux API key first');const key=safeStorage.decryptString(fs.readFileSync(file));const response=await net.fetch('https://zenmux.ai/api/v1/models',{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('Could not validate model (HTTP '+response.status+')');const catalog=await response.json();if(!catalog.data?.some(entry=>entry.id===model))throw Error('Model ID is not in the ZenMux catalog: '+model+'. Copy the exact provider/model ID.');return true;},

 saveKey(file,key){if(!safeStorage.isEncryptionAvailable())throw Error('System credential encryption is unavailable');fs.writeFileSync(file,safeStorage.encryptString(key),{mode:0o600});},
 async chat(file,model,messages,onDelta,signal){
  if(!fs.existsSync(file))throw Error('Configure a ZenMux API key first');
  const key=safeStorage.decryptString(fs.readFileSync(file));
  return completionRequest(key,{model,messages,stream:!!onDelta},async(response,activity)=>{
   if(!response.ok){if(response.status===404)throw Error('ZenMux could not find model '+model+'. Check the exact model ID in the AI panel and save it again.');throw Error('ZenMux request failed (HTTP '+response.status+')');}
   if(onDelta)return require('./stream.cjs')(response.body,onDelta,false,activity);
   const data=await response.json();const text=data.choices?.[0]?.message?.content;
   if(typeof text!=='string'||!text.trim())throw Error('ZenMux returned no text response');return text;
  },signal);
 }
};
