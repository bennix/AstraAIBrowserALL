const fs=require('node:fs');
module.exports=function(file){
 let entries=[];try{entries=JSON.parse(fs.readFileSync(file,'utf8'));if(!Array.isArray(entries))entries=[];}catch{}
 const persist=()=>fs.writeFileSync(file,JSON.stringify(entries),{mode:0o600});
 return {
  record(url,title){if(!/^https?:\/\//.test(url))return;const previous=entries[0];if(previous?.url===url){previous.title=title||url;previous.visitedAt=Date.now();}else entries.unshift({url,title:title||url,visitedAt:Date.now()});entries=entries.slice(0,1000);persist();},
  list(){return entries.slice();},clear(){entries=[];persist();}
 };
};
