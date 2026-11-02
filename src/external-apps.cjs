// Only known App Store and Tencent Meeting entry points may leave the browser.
function resolve(value,platform=process.platform){
 if(typeof value!=='string'||value.length>8192||/[\x00-\x20]|%0[0ad]/i.test(value))return null;
 let url;try{url=new URL(value);}catch{return null;}
 if(url.username||url.password)return null;
 if(platform==='darwin'&&['https:','itms-apps:','itms-appss:','macappstore:','macappstores:'].includes(url.protocol)&&['apps.apple.com','itunes.apple.com'].includes(url.hostname)&&!url.port){
  const match=/^\/(?:(?<country>[a-z]{2})\/)?app\/(?:[^/]+\/)?id(?<id>\d+)\/?$/i.exec(url.pathname);
  if(match)return {kind:'appStore',url:url.protocol==='https:'?url.href.replace(/^https:/,'macappstore:'):url.href};
 }
 if(['wemeet:','wemeet3:'].includes(url.protocol)&&!url.port&&((!url.hostname&&!url.pathname)||(url.hostname==='launch'&&['','/'].includes(url.pathname))||(url.hostname==='page'&&/^\/inmeeting\/?$/.test(url.pathname))))return {kind:'tencentMeeting',url:url.href};
 return null;
}
module.exports={resolve};
