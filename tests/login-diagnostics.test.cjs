const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),vm=require('node:vm');
test('login diagnostic exports exclude secrets, arbitrary paths and unrelated browsing',()=>{
 const mod={exports:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../src/diagnostics.cjs'),'utf8'),{module:mod,require:name=>name==='electron'?{}:require(name),Date,URL,console});
 const diagnostics=mod.exports;
 diagnostics.recordLogin('test',{id:1,url:'https://accounts.google.com/signin/secret-user?code=secret-code',target:'https://x.com/i/jf/onboarding/secret-token?state=secret-state',headers:{cookie:'secret-cookie'},password:'secret-password',status:403});
 const output=JSON.stringify(diagnostics.loginSnapshot());assert.ok(output.includes('403')&&output.includes('/i/jf/onboarding'));assert.equal(output.includes('secret-'),false);
 const count=diagnostics.loginSnapshot().length;diagnostics.recordLogin('test',{url:'https://unrelated.example/private'});assert.equal(diagnostics.loginSnapshot().length,count);
 for(let i=0;i<400;i++)diagnostics.recordLogin('test',{url:'https://x.com/login'});assert.equal(diagnostics.loginSnapshot().length,300);
});
