const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),vm=require('node:vm');
test('login diagnostic exports exclude secrets, arbitrary paths and unrelated browsing',()=>{
 const mod={exports:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../src/diagnostics.cjs'),'utf8'),{module:mod,require:name=>name==='electron'?{}:require(name),Date,URL,console});
 const diagnostics=mod.exports;
 diagnostics.recordLogin('test',{id:1,url:'https://accounts.google.com/signin/secret-user?code=secret-code',target:'https://x.com/i/jf/onboarding/secret-token?state=secret-state',headers:{cookie:'secret-cookie'},password:'secret-password',status:403,stage:'sso-finalize',subtasks:['LoginDeny','secret-subtask'],errorCodes:[239,'secret-code']});
 const output=JSON.stringify(diagnostics.loginSnapshot());assert.ok(output.includes('403')&&output.includes('/i/jf/onboarding'));assert.equal(output.includes('secret-'),false);assert.ok(output.includes('sso-finalize')&&output.includes('LoginDeny')&&output.includes('239'));
 const count=diagnostics.loginSnapshot().length;diagnostics.recordLogin('test',{url:'https://unrelated.example/private'});assert.equal(diagnostics.loginSnapshot().length,count);
 for(let i=0;i<1100;i++)diagnostics.recordLogin('test',{url:'https://x.com/login'});assert.equal(diagnostics.loginSnapshot().length,1000);
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

test('format 3 reports compare environments without exporting settings or proxy credentials',()=>{
 const mod={exports:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../src/diagnostics.cjs'),'utf8'),{module:mod,require:name=>name==='electron'?{}:require(name),Date,URL,console});
 const diagnostics=mod.exports;
 for(let i=0;i<1002;i++)diagnostics.recordLogin('test',{url:'https://x.com/login?secret-token',status:200});
 const report=diagnostics.loginReport({version:'0.1.10',platform:'darwin',arch:'arm64',electron:'45.2.1',chromium:'134.0',osVersion:'25.6.0',strictPrivacy:true,doNotTrack:true,secureDns:true,proxyMode:'manual',timezone:'Asia/Tokyo',languages:'zh-CN,zh,en-US,en',proxyAddress:'https://secret-proxy',password:'secret-password',cookies:'secret-cookie'});
 assert.equal(report.formatVersion,3);assert.equal(report.capture.droppedEvents,2);assert.equal(report.capture.eventCount,1000);assert.equal(report.events[0].sequence,3);assert.equal(report.runtime.arch,'arm64');assert.equal(report.preferences.proxyMode,'manual');assert.equal(JSON.stringify(report).includes('secret-'),false);
 report.events[0].status=999;assert.equal(diagnostics.loginSnapshot()[0].status,200);
});
