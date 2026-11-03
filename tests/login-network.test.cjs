const {test}=require('node:test');const assert=require('node:assert/strict');const {EventEmitter}=require('node:events');
test('login observer scopes response inspection and exports only numeric error codes',async()=>{
 const frames=require('../src/browser-frames.cjs'),debug=new EventEmitter(),wc=new EventEmitter(),calls=[],events=[];Object.assign(wc,{id:9,debugger:debug,getURL:()=> 'https://x.com/i/jf/onboarding/web'});Object.assign(debug,{isAttached:()=>true,sendCommand:async(method,args)=>{calls.push({method,args});return method==='Network.getResponseBody'?{body:JSON.stringify({errors:[{code:399,message:'secret-email'},{code:'secret-token'}],auth_token:'secret-cookie'}),base64Encoded:false}:{};}});
 await frames.observeLogin(wc,(event,data)=>events.push({event,...data}));
 debug.emit('message',{},'Network.responseReceived',{requestId:'unrelated',response:{url:'https://accounts.google.com/secret-token',status:200}});debug.emit('message',{},'Network.loadingFinished',{requestId:'unrelated',encodedDataLength:100});
 assert.equal(calls.some(call=>call.method==='Network.getResponseBody'),false);
 debug.emit('message',{},'Network.responseReceived',{requestId:'x-api',response:{url:'https://api.x.com/1.1/onboarding/task.json',status:403}});debug.emit('message',{},'Network.loadingFinished',{requestId:'x-api',encodedDataLength:100});await new Promise(setImmediate);
 assert.deepEqual(events[0].errorCodes,[399]);assert.equal(JSON.stringify(events).includes('secret-'),false);
 debug.emit('message',{},'Runtime.exceptionThrown',{exceptionDetails:{exception:{description:'NotAllowedError: Blocked by strict fingerprint protection secret-token'}}});assert.equal(events.at(-1).category,'fingerprint-protection');assert.equal(JSON.stringify(events).includes('secret-token'),false);
 wc.emit('destroyed');assert.equal(debug.listenerCount('message'),0);
});
