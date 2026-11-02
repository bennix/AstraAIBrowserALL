const http=require('node:http');
const net=require('node:net');
const tls=require('node:tls');

// Resolve visited hostnames through DoH before opening an upstream proxy tunnel.
// The original HTTPS client keeps its hostname for SNI and certificate validation.
module.exports=async function createDnsBridge(upstream){
 const sockets=new Set(),cache=new Map();
 function track(socket){sockets.add(socket);socket.once('close',()=>sockets.delete(socket));socket.on('error',()=>{});socket.setTimeout(45000,()=>socket.destroy(Error('Connection idle timeout')));return socket;}
 async function resolve(host){
  if(net.isIP(host))return host;
  const cached=cache.get(host);if(cached?.expires>Date.now())return cached.ip;
  for(const type of ['A','AAAA']){
   const response=await upstream.fetch('https://1.1.1.1/dns-query?name='+encodeURIComponent(host)+'&type='+type,{headers:{accept:'application/dns-json'},signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw Error('Secure DNS service unavailable');
   const result=await response.json();const answer=result.Answer?.find(a=>net.isIP(a.data));
   if(answer){cache.set(host,{ip:answer.data,expires:Date.now()+Math.min(Number(answer.TTL)||60,300)*1000});if(cache.size>2000)cache.delete(cache.keys().next().value);return answer.data;}
  }
  throw Error('Secure DNS returned no address');
 }
 function connect(host,port,secure=false){return new Promise((resolve,reject)=>{const socket=track(secure?tls.connect({host,port,servername:net.isIP(host)?undefined:host}):net.connect({host,port}));socket.once('error',reject);socket.once(secure?'secureConnect':'connect',()=>{socket.removeListener('error',reject);resolve(socket);});});}
 function read(socket,ready){return new Promise((resolve,reject)=>{let buffer=Buffer.alloc(0);const timer=setTimeout(()=>finish(Error('Proxy handshake timed out')),15000);function finish(error,value){clearTimeout(timer);socket.removeListener('data',data);socket.removeListener('error',errorEvent);socket.removeListener('close',closed);if(error){socket.destroy();reject(error);}else resolve(value);}const errorEvent=e=>finish(e),closed=()=>finish(Error('Proxy connection closed'));function data(chunk){buffer=Buffer.concat([buffer,chunk]);if(buffer.length>65536)return finish(Error('Proxy response too large'));let count;try{count=ready(buffer);}catch(e){return finish(e);}if(count!==null&&count!==undefined){socket.pause();const value=buffer.subarray(0,count);const tail=buffer.subarray(count);if(tail.length)socket.unshift(tail);finish(null,value);}}socket.on('data',data);socket.once('error',errorEvent);socket.once('close',closed);socket.resume();});}
 async function tunnel(url,ip,port){
  const routes=await upstream.resolveProxy(url);const route=routes.split(';')[0].trim();
  if(route==='DIRECT')return connect(ip,port);
  const match=/^(PROXY|HTTPS|SOCKS5|SOCKS)\s+(.+)$/.exec(route);if(!match)throw Error('Unsupported secure DNS proxy route');
  const endpoint=new URL('http://'+match[2]);const socket=await connect(endpoint.hostname.replace(/^\[|\]$/g,''),Number(endpoint.port)||80,match[1]==='HTTPS');
  if(match[1]==='PROXY'||match[1]==='HTTPS'){
   const authority=(net.isIP(ip)===6?'['+ip+']':ip)+':'+port;
   socket.write('CONNECT '+authority+' HTTP/1.1\r\nHost: '+authority+'\r\nConnection: keep-alive\r\n\r\n');
   const header=await read(socket,b=>{const end=b.indexOf('\r\n\r\n');return end<0?null:end+4;});
   if(!/^HTTP\/1\.[01] 2\d\d/.test(header.toString())){socket.destroy();throw Error('Upstream proxy rejected the tunnel');}
  }else{
   socket.write(Buffer.from([5,1,0]));const greeting=await read(socket,b=>b.length>=2?2:null);
   if(greeting[0]!==5||greeting[1]!==0){socket.destroy();throw Error('SOCKS proxy requires unsupported authentication');}
   // A domain-typed numeric address avoids local DNS and works for IPv4/IPv6.
   const address=Buffer.from(ip);socket.write(Buffer.concat([Buffer.from([5,1,0,3,address.length]),address,Buffer.from([port>>8,port&255])]));
   const reply=await read(socket,b=>{if(b.length<5)return null;const size=b[3]===1?10:b[3]===4?22:b[3]===3?7+b[4]:0;if(!size)throw Error('Invalid SOCKS reply');return b.length>=size?size:null;});
   if(reply[0]!==5||reply[1]!==0){socket.destroy();throw Error('SOCKS proxy rejected the tunnel');}
  }
  return socket;
 }
 const server=http.createServer(async(req,res)=>{
  let remote;try{
   const url=new URL(req.url);if(url.protocol!=='http:')throw Error('Unsupported proxy request');
   const ip=await resolve(url.hostname),port=Number(url.port)||80;remote=await tunnel(url.href,ip,port);
   const headers={...req.headers,host:url.host,connection:'close'};delete headers['proxy-connection'];delete headers['proxy-authorization'];
   const agent=new http.Agent({keepAlive:false});agent.createConnection=()=>remote;const request=http.request({method:req.method,path:url.pathname+url.search,headers,host:ip,port,agent},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});
   request.on('error',()=>{remote.destroy();if(!res.headersSent)res.writeHead(502);res.end('Secure proxy request failed');});req.pipe(request);remote.resume();
  }catch{remote?.destroy();res.writeHead(502);res.end('Secure DNS or proxy connection failed');}
 });
 server.on('connection',track);
 server.on('connect',async(req,client,head)=>{
  let remote;try{const target=new URL('https://'+req.url);const host=target.hostname.replace(/^\[|\]$/g,'');remote=await tunnel(target.href,await resolve(host),Number(target.port)||443);if(client.destroyed){remote.destroy();return;}client.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)remote.write(head);client.pipe(remote);remote.pipe(client);remote.on('error',()=>client.destroy());client.on('error',()=>remote.destroy());remote.resume();}catch{remote?.destroy();if(!client.destroyed)client.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');}
 });
 server.on('clientError',(_error,socket)=>socket.destroy());
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 return {url:'http://127.0.0.1:'+server.address().port,close:async()=>{for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}};
};
