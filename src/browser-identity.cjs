// Capture Chromium's own Client Hints once from an isolated local secure-origin fixture.
// No external identity service or fabricated OS/version values are used.
let pending;
module.exports=function nativeIdentity(){
 if(pending)return pending;
 pending=(async()=>{
  const {session,WebContentsView}=require('electron');
  const ses=session.fromPartition('astra-native-identity');
  ses.protocol.handle('https',request=>new Response(new URL(request.url).hostname==='astra-identity.invalid'?'<meta charset="utf-8">':'',{status:new URL(request.url).hostname==='astra-identity.invalid'?200:404,headers:{'Content-Type':'text/html'}}));
  const view=new WebContentsView({webPreferences:{session:ses,nodeIntegration:false,contextIsolation:true,sandbox:true}});
  try{
   await view.webContents.loadURL('https://astra-identity.invalid/');
   const metadata=await view.webContents.executeJavaScript(`navigator.userAgentData.getHighEntropyValues(['architecture','bitness','model','platformVersion','fullVersionList','wow64'])`);
   if(!metadata.brands?.length||!metadata.platform)throw Error('Native Client Hints unavailable');
   return metadata;
  }finally{view.webContents.close();}
 })();return pending;
};
