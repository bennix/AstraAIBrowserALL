const modes=['zh','en','exit'];
function mode(settings){return modes.includes(settings.websiteLanguageMode)?settings.websiteLanguageMode:'zh';}
function languages(settings,automatic,fallback){const selected=mode(settings);return selected==='zh'?'zh-CN,zh,en-US,en':selected==='en'?'en-US,en,zh-CN,zh':automatic?.acceptLanguage||fallback;}
function geminiUrl(value,settings){
 if(mode(settings)==='exit')return value;
 try{const u=new URL(value);if(u.protocol!=='https:'||u.hostname!=='gemini.google.com'||! /^(?:\/u\/\d+)?\/(?:app(?:\/|$)|$)/.test(u.pathname))return value;
 const preferred=mode(settings)==='en'?'en':'zh-CN';if(u.searchParams.get('hl')===preferred)return value;u.searchParams.set('hl',preferred);return u.href;}catch{return value;}
}
module.exports={mode,languages,geminiUrl,modes};
