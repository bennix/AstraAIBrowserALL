const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../src/main.cjs'),'utf8');const helper=source.slice(source.indexOf('function isIdentityPopup('),source.indexOf('const attachedContents='));const context=vm.createContext({URL});vm.runInContext(helper,context);const accepts=context.isIdentityPopup;
test('Google and X blank handoff windows and onboarding callbacks remain native auth windows',()=>{
 for(const source of ['https://x.com/i/flow/login','https://twitter.com/i/jf/onboarding/web','https://accounts.google.com/v3/signin','https://muse.ai/','https://appleid.apple.com/auth/authorize'])for(const target of ['','about:blank'])assert.equal(accepts(source,target),true);
 for(const route of ['/i/jf/onboarding/web?mode=login','/i/flow/login','/i/oauth2/authorize','/oauth/callback'])assert.equal(accepts('https://accounts.google.com/', 'https://x.com'+route),true);
 assert.equal(accepts('https://example.org/','https://accounts.google.com/o/oauth2/auth'),true);
});
test('ordinary pages, insecure identity URLs and lookalike origins are not auth exceptions',()=>{
 for(const source of ['https://x.com.example.org/','http://x.com/i/flow/login','https://example.org/'])assert.equal(accepts(source,'about:blank'),false);
 for(const target of ['https://x.com/home','https://x.com/i/jf/onboarding-extra','http://accounts.google.com/','https://accounts.google.com.example.org/','https://accounts.google.com:8443/','https://user:password@accounts.google.com/'])assert.equal(accepts('https://x.com/i/flow/login',target),false);
});
test('authentication popup routing preserves the opener session and sandbox preferences',()=>{
 const events=[],wc={id:5,getURL:()=> 'https://x.com/i/flow/login',session:{name:'existing-session'},on:()=>{},setWindowOpenHandler:handler=>wc.handler=handler};const safe={nodeIntegration:false,contextIsolation:true,sandbox:true};
 const ctx=vm.createContext({URL,WeakSet,process:{env:{}},app:{isPackaged:true},state:()=>{},safe,externalApps:{resolve:()=>null},require:()=>({attach:()=>{},recordLogin:(...args)=>events.push(args)}),add:()=>{throw Error('Auth popup was diverted to a tab');}});
 vm.runInContext(source.slice(source.indexOf('function isIdentityPopup('),source.indexOf('function add(')),ctx);ctx.wc=wc;vm.runInContext('attach(wc)',ctx);
 for(const url of ['about:blank','https://accounts.google.com/v3/signin','https://appleid.apple.com/auth/authorize','https://x.com/i/jf/onboarding/web?mode=login']){const result=wc.handler({url});assert.equal(result.action,'allow');assert.equal(result.overrideBrowserWindowOptions.webPreferences.session,wc.session);assert.equal(result.overrideBrowserWindowOptions.webPreferences.sandbox,true);assert.equal(result.overrideBrowserWindowOptions.webPreferences.nodeIntegration,false);}
 assert.equal(events.length,4);
});

test('Apple authorize and widget routes retain authentication popups without accepting lookalike origins',()=>{
 for(const url of ['https://appleid.apple.com/auth/authorize?client_id=example','https://idmsa.apple.com/appleauth/auth/signin'])assert.equal(accepts('https://x.com/',url),true);
 for(const url of ['http://appleid.apple.com/auth/authorize','https://appleid.apple.com.example.org/auth/authorize','https://appleid.apple.com/account','https://appleid.apple.com/auth/authorize-extra'])assert.equal(accepts('https://x.com/',url),false);
});
