const {timezone}=require('./site-locale.cjs');
function parse(data,provider){
 if(data?.error||data?.success===false)throw Error('IP region lookup rejected');
 const country=String(data?.country_code||data?.country||'').toUpperCase();
 if(!/^[A-Z]{2}$/.test(country))throw Error('Invalid exit country');
 const timezoneId=timezone(typeof data.timezone==='string'?data.timezone:data.timezone?.id);
 if(!timezoneId)throw Error('Exit timezone unavailable');
 const fallback=new Intl.Locale('und-'+country).maximize().language+'-'+country;
 const candidates=typeof data.languages==='string'?data.languages.split(','):[];
 let languages=[];
 for(const language of candidates.slice(0,8))try{languages.push(...Intl.getCanonicalLocales(language.trim()));}catch{}
 if(!languages.length)languages=[fallback];
 return {country,timezoneId,acceptLanguage:[...new Set(languages)].slice(0,4).join(','),provider,checkedAt:Date.now()};
}
module.exports=function exitRegion({fetch,enabled,cached,onChange=()=>{},notify=()=>{}}){
 let profile=cached||null,pending=null,controller=null,generation=0,lastAttempt=0,status={phase:profile?'cached':'idle',profile};
 const providers=[['ipapi.co','https://ipapi.co/json/'],['ipwho.is','https://ipwho.is/']];
 async function refresh(force=false){
  if(!enabled())return profile;
  if(pending&&!force)return pending;
  if(!force&&Date.now()-lastAttempt<300000)return profile;
  lastAttempt=Date.now();
  const current=++generation;controller?.abort();controller=new AbortController();const signal=controller.signal;
  status={phase:'checking',profile};notify();
  const task=(async()=>{
   for(const [provider,url] of providers){
    try{
     const response=await fetch(url,{credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(8000)])});
     if(!response.ok)throw Error('Lookup HTTP failure');
     const next=parse(await response.json(),provider);
     if(current!==generation||!enabled())return profile;
     const changed=!profile||profile.country!==next.country||profile.timezoneId!==next.timezoneId||profile.acceptLanguage!==next.acceptLanguage;
     profile=next;status={phase:'ready',profile};await onChange(profile,changed);notify();return profile;
    }catch{if(signal.aborted||current!==generation)return profile;}
   }
   if(current===generation){status={phase:'failed',profile};notify();}return profile;
  })();pending=task;
  try{return await task;}finally{if(current===generation)pending=null;}
 }
 return {refresh,profile:()=>profile,status:()=>({...status,enabled:enabled()}),stop:()=>{generation++;controller?.abort();pending=null;}};
};
module.exports.parse=parse;
