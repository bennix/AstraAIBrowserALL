const {test}=require('node:test'),assert=require('node:assert/strict'),locale=require('../src/website-language.cjs');
test('Chinese defaults and English preference remain independent of exit region',()=>{
 const exit={timezoneId:'Asia/Kolkata',acceptLanguage:'mr-IN,hi-IN,en'};
 assert.equal(locale.languages({},exit,'ja-JP'),'zh-CN,zh,en-US,en');assert.equal(locale.languages({websiteLanguageMode:'en'},exit,''),'en-US,en,zh-CN,zh');assert.equal(locale.languages({websiteLanguageMode:'exit'},exit,''),exit.acceptLanguage);
});
test('Gemini explicit nonpreferred UI language is corrected idempotently without losing notebook route or other query parameters',()=>{
 for(const [setting,expected] of [['zh','zh-CN'],['en','en']]){const input='https://gemini.google.com/u/1/app/abc?hl=mr&authuser=1#draft';const url=locale.geminiUrl(input,{websiteLanguageMode:setting});const parsed=new URL(url);assert.equal(parsed.searchParams.get('hl'),expected);assert.equal(parsed.searchParams.get('authuser'),'1');assert.equal(parsed.hash,'#draft');assert.equal(locale.geminiUrl(url,{websiteLanguageMode:setting}),url);}
});
test('exit language choice, other sites and authentication paths are not rewritten',()=>{
 for(const input of ['https://accounts.google.com/signin?hl=mr','https://gemini.google.com/signin?hl=mr','https://example.test/app?hl=mr'])assert.equal(locale.geminiUrl(input,{}),input);
 const input='https://gemini.google.com/app?hl=mr';assert.equal(locale.geminiUrl(input,{websiteLanguageMode:'exit'}),input);
});
