const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const create=require('../src/mcp-server.cjs');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
test('MCP authenticates local clients, gates automation and stops accepting calls',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'astra-mcp-test-'));
 let automation=false,writes=0;
 const server=create({tokenFile:path.join(directory,'key'),secureStorage:{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()},version:'0.1.8',allowAutomation:()=>automation,dispatch:async(args,context)=>{context.assertActive();if(args.action==='click')writes++;return {action:args.action};}});
 const client=new Client({name:'test',version:'1'});
 try{
  assert.equal(server.status().running,false);
  await server.start(0);
  const url=server.status().url;
  assert.equal((await fetch(url)).status,401);
  const config=JSON.parse(server.configuration('json')).mcpServers.astra_browser;
  assert.equal((await fetch(url,{headers:{...config.headers,Origin:'https://example.com'}})).status,403);
  assert.equal(await new Promise(resolve=>{require('node:http').get(url,{headers:{...config.headers,Host:'example.com'}},response=>{response.resume();resolve(response.statusCode);});}),403);
  await client.connect(new StreamableHTTPClientTransport(new URL(url),{requestInit:{headers:config.headers}}));
  assert.equal((await client.listTools()).tools.length,3);
  assert.equal((await client.callTool({name:'browser_action',arguments:{action:'click',ref:'e1'}})).isError,true);
  assert.equal(writes,0);
  automation=true;
  assert.notEqual((await client.callTool({name:'browser_action',arguments:{action:'click',ref:'e1'}})).isError,true);
  assert.equal(writes,1);
  assert.equal((await server.testConnection()).tools,3);
  assert.equal(fs.statSync(path.join(directory,'key')).mode&0o777,0o600);
  await server.stop();
  await assert.rejects(fetch(url));
 }finally{await client.close();await server.stop();fs.rmSync(directory,{recursive:true,force:true});}
});
