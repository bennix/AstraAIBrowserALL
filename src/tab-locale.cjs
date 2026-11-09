// Cached exit profiles can be applied immediately. An unavailable region service
// must not hold a new tab blank for two network timeouts or environment startup.
module.exports=async function prepareTabLocale({hasProfile,refresh,apply,waitMs=1500}){
 const lookup=Promise.resolve().then(refresh).catch(()=>{});
 let timer;
 try{if(!hasProfile())await Promise.race([lookup,new Promise(resolve=>{timer=setTimeout(resolve,waitMs);})]);}
 finally{clearTimeout(timer);}
 return apply();
};
