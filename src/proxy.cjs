const {app,session}=require('electron');
let bridge;
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
 app.configureHostResolver({enableBuiltInResolver:true,secureDnsMode:preferences.secureDns===false?'off':'secure',secureDnsServers:preferences.secureDns===false?[]:['https://1.1.1.1/dns-query']});
 const dnsSession=session.fromPartition('astra-secure-dns');await dnsSession.setProxy(config);await dnsSession.closeAllConnections();
 const nextBridge=preferences.secureDns===false?null:await require('./proxy-dns.cjs')(dnsSession);
 const browserConfig=nextBridge?{mode:'fixed_servers',proxyRules:nextBridge.url,proxyBypassRules:'<-loopback>'}:config;
 for(const ses of [session.defaultSession,session.fromPartition('persist:astra-default')]){await ses.setProxy(browserConfig);await ses.clearHostResolverCache();await ses.closeAllConnections();}
 const previous=bridge;bridge=nextBridge;await previous?.close();
}
async function discover(){return {web:await session.fromPartition('persist:astra-default').resolveProxy('https://www.youtube.com'),ai:await session.defaultSession.resolveProxy('https://zenmux.ai')};}
module.exports={applyProxy,discover};
