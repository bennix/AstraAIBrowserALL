const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),vm=require('node:vm');
test('login diagnostic exports exclude secrets, arbitrary paths and unrelated browsing',()=>{
 const mod={exports:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../src/diagnostics.cjs'),'utf8'),{module:mod,require:name=>name==='electron'?{}:require(name),Date,URL,console});
 const diagnostics=mod.exports;
 diagnostics.recordLogin('test',{id:1,url:'https://accounts.google.com/signin/secret-user?code=secret-code',target:'https://x.com/i/jf/onboarding/secret-token?state=secret-state',headers:{cookie:'secret-cookie'},password:'secret-password',status:403});
 const output=JSON.stringify(diagnostics.loginSnapshot());assert.ok(output.includes('403')&&output.includes('/i/jf/onboarding'));assert.equal(output.includes('secret-'),false);
 const count=diagnostics.loginSnapshot().length;diagnostics.recordLogin('test',{url:'https://unrelated.example/private'});assert.equal(diagnostics.loginSnapshot().length,count);
 for(let i=0;i<400;i++)diagnostics.recordLogin('test',{url:'https://x.com/login'});assert.equal(diagnostics.loginSnapshot().length,300);
});
test('diagnostics include API subdomains and distinguish report warnings without changing response headers',()=>{
 const {EventEmitter}=require('node:events'),mod={exports:{}},hooks={};vm.runInNewContext(fs.readFileSync(require.resolve('../src/diagnostics.cjs'),'utf8'),{module:mod,require:name=>name==='electron'?{}:require(name),Date,URL,console});
 const wc=new EventEmitter();Object.assign(wc,{id:3,getURL:()=> 'https://x.com/i/jf/onboarding/web',session:{webRequest:{onCompleted:fn=>hooks.completed=fn,onErrorOccurred:fn=>hooks.failed=fn,onHeadersReceived:fn=>hooks.headers=fn}}});mod.exports.attach(wc,{persist:false});
 hooks.completed({webContentsId:3,url:'https://api.x.com/1.1/onboarding/task.json?code=secret-token',method:'POST',resourceType:'xhr',statusCode:403});
 wc.emit('console-message',{message:'Cross-Origin-Opener-Policy policy would block the window.postMessage call',sourceId:'https://accounts.google.com/secret-script',level:'warning'});
 const headers={'Cross-Origin-Opener-Policy-Report-Only':['same-origin; report-to="secret-report"'],'Set-Cookie':['secret-cookie']};const original=JSON.stringify(headers);let response;
 hooks.headers({webContentsId:3,url:'https://accounts.google.com/signin',responseHeaders:headers},value=>response=value);
 assert.equal(JSON.stringify(response),'{}');assert.equal(JSON.stringify(headers),original);
 hooks.failed({webContentsId:3,url:'https://api.twitter.com/1.1/onboarding/task.json',resourceType:'xhr',error:'net::ERR_CONNECTION_RESET'});
 const output=mod.exports.loginSnapshot();assert.equal(output[0].status,403);assert.equal(output[1].policyMode,'report-warning');assert.equal(output[1].operation,'postMessage');assert.equal(output[2].coopReportOnly,'same-origin');assert.equal(output[3].networkError,'net::ERR_CONNECTION_RESET');assert.equal(JSON.stringify(output).includes('secret-'),false);
});
