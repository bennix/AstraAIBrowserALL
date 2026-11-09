const net=require('node:net');
const unbracket=host=>host.replace(/^\[|\]$/g,'');
function socksAddress(ip){
 const family=net.isIP(ip);
 if(family===4)return Buffer.from([1,...ip.split('.').map(Number)]);
 if(family!==6)throw Error('SOCKS destination must be a numeric address');
 // Expand IPv4-mapped tails before expanding the single optional :: gap.
 let text=ip;
 if(text.includes('.')){const at=text.lastIndexOf(':'),v=text.slice(at+1).split('.').map(Number);text=text.slice(0,at+1)+((v[0]<<8)|v[1]).toString(16)+':'+((v[2]<<8)|v[3]).toString(16);}
 const [left,right]=text.split('::'),a=left?left.split(':'):[],b=right?right.split(':'):[];
 const words=text.includes('::')?[...a,...Array(8-a.length-b.length).fill('0'),...b]:a;
 const out=Buffer.alloc(17);out[0]=4;words.forEach((word,i)=>out.writeUInt16BE(parseInt(word,16),1+i*2));return out;
}
// Stagger attempts so an unusable address family cannot block the other one.
// Every attempt uses the same configured proxy policy; never retry DIRECT.
function connectCandidates(addresses,open,{delay=250,onConnect=()=>{}}={}){
 return new Promise((resolve,reject)=>{
  let done=false,pending=addresses.length,lastError;const timers=[],controllers=addresses.map(()=>new AbortController());
  if(!pending)return reject(Error('Secure DNS returned no address'));
  addresses.forEach((ip,index)=>{const start=()=>{if(done)return;Promise.resolve().then(()=>open(ip,controllers[index].signal)).then(socket=>{if(done){socket.destroy();return;}done=true;onConnect(ip);timers.forEach(clearTimeout);controllers.forEach((controller,i)=>{if(i!==index)controller.abort();});resolve(socket);},error=>{lastError=error;if(--pending===0&&!done){done=true;reject(lastError);}});};if(index)timers.push(setTimeout(start,index*delay));else start();});
 });
}
module.exports={unbracket,socksAddress,connectCandidates};
