const {test}=require('node:test'),assert=require('node:assert/strict'),net=require('node:net'),http=require('node:http');
const bridge=require('../src/proxy-dns.cjs'),{socksAddress}=require('../src/proxy-address.cjs');
const listen=server=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'::1',()=>resolve(server.address().port));});
test('SOCKS uses RFC 1928 numeric address types including compressed and mapped IPv6',()=>{
 assert.equal(socksAddress('192.0.2.1').toString('hex'),'01c0000201');
 assert.equal(socksAddress('2001:db8::1').toString('hex'),'0420010db8000000000000000000000001');
 assert.equal(socksAddress('::ffff:192.0.2.1').toString('hex'),'0400000000000000000000ffffc0000201');
 assert.throws(()=>socksAddress('example.test'));
});
async function fixture(t,{silentV4=false,failA=false,onlyV4=false}={}){
 const sockets=new Set(),types=[],queries=[];
 const proxy=net.createServer(socket=>{sockets.add(socket);socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));let state=0,buffer=Buffer.alloc(0);socket.on('data',chunk=>{
  if(state===2){socket.write(chunk);return;}buffer=Buffer.concat([buffer,chunk]);
  if(state===0&&buffer.length>=3){buffer=buffer.subarray(3);socket.write(Buffer.from([5,0]));state=1;}
  if(state===1&&buffer.length>=4){const type=buffer[3],length=type===1?10:type===4?22:0;if(!length){socket.destroy();return;}if(buffer.length<length)return;types.push(type);buffer=buffer.subarray(length);if(type===1){if(!silentV4)socket.end(Buffer.from([5,3,0,1,0,0,0,0,0,0]));return;}state=2;socket.write(Buffer.from([5,0,0,4,...Array(16).fill(0),0,0]));}
 });});
 const port=await listen(proxy);
 const upstream={resolveProxy:async()=>`SOCKS5 [::1]:${port}`,fetch:async url=>{const u=new URL(url),type=u.searchParams.get('type');queries.push({host:u.hostname,type});if(failA&&type==='A')throw Error('A query failed');return {ok:true,json:async()=>({Status:0,Answer:onlyV4&&type==='AAAA'?[]:[{type:type==='A'?1:28,data:type==='A'?'192.0.2.1':'2001:db8::1',TTL:60}]})};}};
 const b=await bridge(upstream);t.after(async()=>{await b.close();for(const s of sockets)s.destroy();await new Promise(r=>proxy.close(r));});return {b,types,queries};
}
function requestTunnel(url,host='example.test:443'){
 return new Promise((resolve,reject)=>{const u=new URL(url),socket=net.connect({host:u.hostname,port:u.port});const timeout=setTimeout(()=>socket.destroy(Error('Test timeout')),3000);let buffer='',sent=false;socket.on('error',reject);socket.on('connect',()=>socket.write(`CONNECT ${host} HTTP/1.1\r\nHost: ${host}\r\n\r\n`));socket.on('data',chunk=>{buffer+=chunk;if(!sent&&buffer.includes('\r\n\r\n')){if(!buffer.startsWith('HTTP/1.1 200')){clearTimeout(timeout);socket.destroy();resolve(buffer);return;}sent=true;socket.write('ECHO_TEST');}if(buffer.includes('ECHO_TEST')){clearTimeout(timeout);socket.destroy();resolve(buffer);}});socket.once('close',()=>clearTimeout(timeout));});
}
test('IPv6-only SOCKS exit rejects IPv4 and receives binary IPv6 through an IPv6 proxy endpoint',async t=>{const f=await fixture(t);assert.match(await requestTunnel(f.b.url),/ECHO_TEST/);assert.deepEqual(f.types,[1,4]);assert.deepEqual(f.queries.map(q=>q.type).sort(),['A','AAAA']);assert.ok(f.queries.every(q=>q.host==='cloudflare-dns.com'));});
test('blackholed IPv4 does not block working IPv6',async t=>{const f=await fixture(t,{silentV4:true});const start=Date.now();assert.match(await requestTunnel(f.b.url),/ECHO_TEST/);assert.ok(Date.now()-start<2000);});
test('one failed encrypted DNS family still permits the other',async t=>{const f=await fixture(t,{failA:true});assert.match(await requestTunnel(f.b.url),/ECHO_TEST/);assert.deepEqual(f.types,[4]);});
test('IPv6 literal tunnel avoids DNS and retains brackets in destination parsing',async t=>{const f=await fixture(t);assert.match(await requestTunnel(f.b.url,'[2001:db8::1]:443'),/ECHO_TEST/);assert.deepEqual(f.queries,[]);assert.deepEqual(f.types,[4]);});
test('no working family fails closed instead of a direct connection',async t=>{const f=await fixture(t,{onlyV4:true});assert.match(await requestTunnel(f.b.url),/^HTTP\/1.1 502/);assert.deepEqual(f.types,[1]);});
test('HTTP proxy CONNECT brackets IPv6 destinations and retries through the same IPv6 proxy',async t=>{
 const seen=[],sockets=new Set();const proxy=http.createServer();proxy.on('connection',s=>{sockets.add(s);s.on('error',()=>{});s.on('close',()=>sockets.delete(s));});proxy.on('connect',(req,socket)=>{seen.push(req.url);if(!req.url.startsWith('[')){socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');return;}socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');socket.on('data',data=>socket.write(data));});
 const port=await listen(proxy),b=await bridge({resolveProxy:async()=>`PROXY [::1]:${port}`,fetch:async url=>({ok:true,json:async()=>({Answer:[new URL(url).searchParams.get('type')==='A'?{type:1,data:'192.0.2.1',TTL:60}:{type:28,data:'2001:db8::2',TTL:60}]})})});t.after(async()=>{await b.close();for(const s of sockets)s.destroy();await new Promise(r=>proxy.close(r));});assert.match(await requestTunnel(b.url),/ECHO_TEST/);assert.deepEqual(seen,['192.0.2.1:443','[2001:db8::2]:443']);
});
test('plain HTTP IPv6 literal bypasses DNS while preserving the bracketed Host header',async t=>{
 const server=http.createServer((req,res)=>res.end(req.headers.host)),port=await listen(server);const b=await bridge({resolveProxy:async()=> 'DIRECT',fetch:async()=>{throw Error('Unexpected DNS');}});t.after(async()=>{await b.close();await new Promise(r=>server.close(r));});
 const body=await new Promise((resolve,reject)=>{http.get(b.url+'/ignored',{path:`http://[::1]:${port}/test`},res=>{let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve(text));}).on('error',reject);});assert.equal(body,`[::1]:${port}`);
});
