(()=>{
 const sources=[];
 const add=(value,kind)=>{
  if(typeof value!=='string'||!value)return;
  try{
   const url=new URL(value,location.href);
   if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return;
   if(!sources.some(source=>source.url===url.href))sources.push({url:url.href,kind});
  }catch{}
 };
 for(const media of document.querySelectorAll('video,audio')){
  add(media.currentSrc,'player');add(media.src,'player');
  for(const source of media.querySelectorAll('source[src]'))add(source.src,'player');
 }
 for(const entry of [...performance.getEntriesByType('resource')].reverse()){
  try{
   if(/\.(?:m3u8|mp4|webm|m4a)(?:$|\?)/i.test(new URL(entry.name).pathname+new URL(entry.name).search))add(entry.name,'request');
  }catch{}
 }
 return sources.slice(0,20);
})()
