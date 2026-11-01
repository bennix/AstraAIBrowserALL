const {session}=require('electron');
async function applyProxy(preferences){
 const mode=preferences.proxyMode||'system';
 let config;
 if(mode==='manual'){
  const address=new URL(preferences.proxyAddress);
  if(!['http:','https:','socks5:'].includes(address.protocol)||address.username||address.password)throw Error('Use an HTTP, HTTPS or SOCKS5 proxy URL without credentials');
  config={mode:'fixed_servers',proxyRules:address.href.replace(/\/$/, '')};
 }else if(mode==='system')config={mode:'system'};
 else if(mode==='direct')config={mode:'direct'};
 else throw Error('Invalid proxy mode');
 for(const ses of [session.defaultSession,session.fromPartition('persist:astra-default')]){await ses.setProxy(config);await ses.closeAllConnections();}
}
async function discover(){return {web:await session.fromPartition('persist:astra-default').resolveProxy('https://www.youtube.com'),ai:await session.defaultSession.resolveProxy('https://zenmux.ai')};}
module.exports={applyProxy,discover};
