const fs=require('node:fs');
module.exports=function(file){
 let entries=[];try{entries=JSON.parse(fs.readFileSync(file,'utf8'));if(!Array.isArray(entries))entries=[];}catch{}
 const persist=()=>fs.writeFileSync(file,JSON.stringify(entries),{mode:0o600});
 return {has:url=>entries.some(entry=>entry.url===url),list:()=>entries.slice(),toggle(url,title){if(!/^https?:\/\//.test(url))throw Error('Only webpages can be bookmarked');const index=entries.findIndex(entry=>entry.url===url);if(index>=0)entries.splice(index,1);else entries.unshift({url,title:title||url,addedAt:Date.now()});persist();},remove(url){entries=entries.filter(entry=>entry.url!==url);persist();}};
};
