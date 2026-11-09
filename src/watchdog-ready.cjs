// Native runtime cold starts (including macOS translation/security checks) can
// exceed five seconds. Bound the wait and retain a small diagnostic on failure.
module.exports=function waitForWatchdog(child,{timeoutMs=20000}={}){
 return new Promise((resolve,reject)=>{
  let stderr='',settled=false;
  const data=chunk=>{stderr=(stderr+chunk.toString()).slice(-2000);};
  child.stderr?.on('data',data);
  const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);child.removeListener('message',message);child.removeListener('error',failed);child.removeListener('exit',exited);child.stderr?.removeListener('data',data);if(error){child.kill();reject(error);}else{child.stderr?.resume();child.stderr?.unref?.();resolve();}};
  const detail=()=>stderr.trim().slice(-500);
  const failed=error=>finish(error);
  const exited=(code,signal)=>finish(Error('Environment recovery watchdog exited ('+(signal||code)+')'+(detail()?': '+detail():'')));
  const message=value=>{if(value?.ready===true)finish();};
  const timer=setTimeout(()=>finish(Error('Environment recovery watchdog did not start within '+timeoutMs/1000+' seconds'+(detail()?': '+detail():''))),timeoutMs);
  child.once('error',failed);child.once('exit',exited);child.on('message',message);
 });
};
