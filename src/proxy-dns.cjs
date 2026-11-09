const http=require('node:http');
const net=require('node:net');
const tls=require('node:tls');
const {unbracket,socksAddress,connectCandidates}=require('./proxy-address.cjs');

// Resolve visited hostnames through DoH before opening an upstream proxy tunnel.
// The original HTTPS client keeps its hostname for SNI and certificate validation.
module.exports=async function createDnsBridge(upstream,{provider='cloudflare'}={}){
 const sockets=new Set(),cache=new Map();let closing=false;
 function track(socket){sockets.add(socket);socket.once('close',()=>sockets.delete(socket));socket.on('error',()=>{});socket.setTimeout(45000,()=>socket.destroy(Error('Connection idle timeout')));return socket;}
 async function resolve(host){
  host=unbracket(host);if(net.isIP(host))return [host];
  const cached=cache.get(host);if(cached?.expires>Date.now())return cached.addresses;
  const results=await Promise.allSettled(['A','AAAA'].map(async(type)=>{
   const response=await upstream.fetch(require('./dns-providers.cjs').query(provider,host,type),{headers:{accept:'application/dns-json'},signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw Error('Secure DNS service unavailable');
   const result=await response.json();if(result.Status!==undefined&&result.Status!==0)throw Error('Secure DNS query failed');
   return (result.Answer||[]).filter(a=>a.type===(type==='A'?1:28)&&net.isIP(a.data)===(type==='A'?4:6));
  }));
  const answers=results.flatMap(result=>result.status==='fulfilled'?result.value:[]);
  if(!answers.length)throw Error('Secure DNS returned no address');
  const v4=answers.filter(a=>net.isIP(a.data)===4),v6=answers.filter(a=>net.isIP(a.data)===6),addresses=[];
  for(let i=0;i<Math.max(v4.length,v6.length);i++){if(v4[i])addresses.push(v4[i].data);if(v6[i])addresses.push(v6[i].data);}
  const unique=[...new Set(addresses)].slice(0,8);
  cache.set(host,{addresses:unique,expires:Date.now()+Math.max(0,Math.min(...answers.map(a=>Number.isFinite(Number(a.TTL))?Number(a.TTL):60),300))*1000});if(cache.size>2000)cache.delete(cache.keys().next().value);return unique;
 }
 function connect(host,port,secure=false,signal){if(closing)return Promise.reject(Error('Proxy bridge is closed'));return new Promise((resolve,reject)=>{const socket=track(secure?tls.connect({host,port,signal,servername:net.isIP(host)?undefined:host}):net.connect({host,port,signal}));socket.once('error',reject);socket.once(secure?'secureConnect':'connect',()=>{socket.removeListener('error',reject);resolve(socket);});});}
 function read(socket,ready){return new Promise((resolve,reject)=>{let buffer=Buffer.alloc(0);const timer=setTimeout(()=>finish(Error('Proxy handshake timed out')),15000);function finish(error,value){clearTimeout(timer);socket.removeListener('data',data);socket.removeListener('error',errorEvent);socket.removeListener('close',closed);if(error){socket.destroy();reject(error);}else resolve(value);}const errorEvent=e=>finish(e),closed=()=>finish(Error('Proxy connection closed'));function data(chunk){buffer=Buffer.concat([buffer,chunk]);if(buffer.length>65536)return finish(Error('Proxy response too large'));let count;try{count=ready(buffer);}catch(e){return finish(e);}if(count!==null&&count!==undefined){socket.pause();const value=buffer.subarray(0,count);const tail=buffer.subarray(count);if(tail.length)socket.unshift(tail);finish(null,value);}}socket.on('data',data);socket.once('error',errorEvent);socket.once('close',closed);socket.resume();});}
 async function tunnel(url,ip,port,signal){
  const routes=await upstream.resolveProxy(url);const route=routes.split(';')[0].trim();
  if(route==='DIRECT')return connect(ip,port,false,signal);
  const match=/^(PROXY|HTTPS|SOCKS5|SOCKS)\s+(.+)$/.exec(route);if(!match)throw Error('Unsupported secure DNS proxy route');
  const endpoint=new URL('http://'+match[2]);const socket=await connect(endpoint.hostname.replace(/^\[|\]$/g,''),Number(endpoint.port)||80,match[1]==='HTTPS',signal);
  try{if(match[1]==='PROXY'||match[1]==='HTTPS'){
   const authority=(net.isIP(ip)===6?'['+ip+']':ip)+':'+port;
   socket.write('CONNECT '+authority+' HTTP/1.1\r\nHost: '+authority+'\r\nConnection: keep-alive\r\n\r\n');
   const header=await read(socket,b=>{const end=b.indexOf('\r\n\r\n');return end<0?null:end+4;});
   if(!/^HTTP\/1\.[01] 2\d\d/.test(header.toString())){socket.destroy();throw Error('Upstream proxy rejected the tunnel');}
  }else{
   socket.write(Buffer.from([5,1,0]));const greeting=await read(socket,b=>b.length>=2?2:null);
   if(greeting[0]!==5||greeting[1]!==0){socket.destroy();throw Error('SOCKS proxy requires unsupported authentication');}
   socket.write(Buffer.concat([Buffer.from([5,1,0]),socksAddress(ip),Buffer.from([port>>8,port&255])]));
   const reply=await read(socket,b=>{if(b.length<5)return null;const size=b[3]===1?10:b[3]===4?22:b[3]===3?7+b[4]:0;if(!size)throw Error('Invalid SOCKS reply');return b.length>=size?size:null;});
   if(reply[0]!==5||reply[1]!==0){socket.destroy();throw Error('SOCKS proxy rejected the tunnel');}
  }
  return socket;}catch(error){socket.destroy();throw error;}
 }
 async function destination(url,host,port){return connectCandidates(await resolve(host),(ip,signal)=>tunnel(url,ip,port,signal),{onConnect:ip=>{const entry=cache.get(unbracket(host));if(entry)entry.addresses=[ip,...entry.addresses.filter(value=>value!==ip)];}});}
 const server=http.createServer(async(req,res)=>{
  let remote;try{
   const url=new URL(req.url);if(url.protocol!=='http:')throw Error('Unsupported proxy request');
   const ip=unbracket(url.hostname),port=Number(url.port)||80;remote=await destination(url.href,ip,port);
   const headers={...req.headers,host:url.host,connection:'close'};delete headers['proxy-connection'];delete headers['proxy-authorization'];
   const agent=new http.Agent({keepAlive:false});agent.createConnection=()=>remote;const request=http.request({method:req.method,path:url.pathname+url.search,headers,host:ip,port,agent},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});
   request.on('error',()=>{remote.destroy();if(!res.headersSent)res.writeHead(502);res.end('Secure proxy request failed');});req.pipe(request);remote.resume();
  }catch{remote?.destroy();res.writeHead(502);res.end('Secure DNS or proxy connection failed');}
 });
 server.on('connection',track);
 server.on('connect',async(req,client,head)=>{
  let remote;try{const target=new URL('https://'+req.url);const host=target.hostname.replace(/^\[|\]$/g,'');remote=await destination(target.href,host,Number(target.port)||443);if(client.destroyed){remote.destroy();return;}client.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)remote.write(head);client.pipe(remote);remote.pipe(client);remote.on('error',()=>client.destroy());client.on('error',()=>remote.destroy());remote.resume();}catch{remote?.destroy();if(!client.destroyed)client.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');}
 });
 server.on('clientError',(_error,socket)=>socket.destroy());
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 return {url:'http://127.0.0.1:'+server.address().port,close:async()=>{closing=true;for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}};
};
