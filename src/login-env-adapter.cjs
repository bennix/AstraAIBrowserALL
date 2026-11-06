const cp=require('node:child_process');
const path=require('node:path');
const KEYS=['TZ','LANG','LANGUAGE','LC_ALL','LC_MESSAGES','DISABLE_TELEMETRY','DISABLE_ERROR_REPORTING'];
function run(file,args,options={}){return new Promise((resolve,reject)=>cp.execFile(file,args,{encoding:'utf8',timeout:12000,maxBuffer:1024*1024,windowsHide:true,...options},(error,stdout,stderr)=>{if(error){const failure=Error(String(stderr?.trim()||error.message||'Environment command failed').slice(0,2000));failure.code=error.code;reject(failure);}else resolve(stdout);}));}
const valid=keys=>{if(keys.some(key=>!KEYS.includes(key)))throw Error('Unsupported login environment variable');};
const windowsScript=String.raw`
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$OutputEncoding=[Console]::OutputEncoding
$p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:ASTRA_ENV_PAYLOAD))|ConvertFrom-Json
$reg=[Microsoft.Win32.Registry]::CurrentUser
$path=if($p.op -eq 'recovery'){'Software\Microsoft\Windows\CurrentVersion\RunOnce'}else{'Environment'}
$key=$reg.OpenSubKey($path,($p.op -ne 'read'))
if(!$key -and $p.op -ne 'read'){$key=$reg.CreateSubKey($path)}
if($p.op -eq 'read'){
 $out=@{}
 foreach($name in $p.keys){
  if($key -and $key.GetValueNames() -contains $name){
   $kind=[int]$key.GetValueKind($name)
   if($kind -notin @(1,2)){throw 'Unsupported registry environment value type'}
   $out[$name]=@{present=$true;value=[string]$key.GetValue($name,$null,[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames);kind=$kind}
  }else{$out[$name]=@{present=$false}}
 }
 $out|ConvertTo-Json -Compress -Depth 6
}elseif($p.op -eq 'write'){
 foreach($entry in $p.values.PSObject.Properties){
  $name=$entry.Name;$v=$entry.Value
  if($v.present){$kind=if($v.kind){[Microsoft.Win32.RegistryValueKind]$v.kind}else{[Microsoft.Win32.RegistryValueKind]::String};$key.SetValue($name,[string]$v.value,$kind)}else{$key.DeleteValue($name,$false)}
 }
}else{
 $name='AstraBrowserEnvironmentRestore'
 $current=[string]$key.GetValue($name,'',[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
 if($p.remove){if($current -eq $p.command){$key.DeleteValue($name,$false)}}else{
  if($current -and $current -ne $p.command){throw 'An environment recovery registration already exists'}
  $kind=if($p.expand){[Microsoft.Win32.RegistryValueKind]::ExpandString}else{[Microsoft.Win32.RegistryValueKind]::String};$key.SetValue($name,$p.command,$kind)
 }
}
if($key){$key.Close()}
if($p.op -eq 'write'){
 Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class AstraEnvNotify{[DllImport("user32.dll",CharSet=CharSet.Unicode)]public static extern IntPtr SendMessageTimeout(IntPtr h,uint m,UIntPtr w,string l,uint f,uint t,out UIntPtr r);}'
 $r=[UIntPtr]::Zero
 [void][AstraEnvNotify]::SendMessageTimeout([IntPtr]0xffff,0x1a,[UIntPtr]::Zero,'Environment',2,100,[ref]$r)
}
`;
function adapter(platform=process.platform,execute=run){
 async function powershell(payload){const exe=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');return execute(exe,['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(windowsScript,'utf16le').toString('base64')],{env:{...process.env,ASTRA_ENV_PAYLOAD:Buffer.from(JSON.stringify(payload)).toString('base64')}});}
 return {
  platform,
  async read(keys=KEYS){
   valid(keys);
   if(platform==='darwin'){const entries=await Promise.all(keys.map(async key=>{const out=await execute('/bin/launchctl',['getenv',key]);return [key,out===''?{present:false}:{present:true,value:out.replace(/\n$/,'')}];}));return Object.fromEntries(entries);}
   if(platform==='win32')return JSON.parse(await powershell({op:'read',keys}));
   if(platform==='linux'){
    const out=await execute('/usr/bin/systemctl',['--user','show-environment']);const values={};
    for(const line of out.split('\n')){const i=line.indexOf('=');if(i<0)continue;const key=line.slice(0,i);if(!keys.includes(key))continue;let value=line.slice(i+1);if(value.startsWith('"'))value=JSON.parse(value);else if(value.startsWith("'")||value.startsWith('$'))throw Error('Unsupported quoted systemd environment value');values[key]={present:true,value};}
    return Object.fromEntries(keys.map(key=>[key,values[key]||{present:false}]));
   }
   throw Error('Login environment is unsupported on this platform');
  },
  async write(values){
   valid(Object.keys(values));
   if(platform==='darwin'){await Promise.all(Object.entries(values).map(([key,v])=>execute('/bin/launchctl',v.present?['setenv',key,v.value]:['unsetenv',key])));return;}
   if(platform==='win32'){await powershell({op:'write',values});return;}
   if(platform==='linux'){
    const set=Object.entries(values).filter(([,v])=>v.present).map(([key,v])=>key+'='+v.value),unset=Object.entries(values).filter(([,v])=>!v.present).map(([key])=>key);
    if(set.length)await execute('/usr/bin/systemctl',['--user','set-environment',...set]);if(unset.length)await execute('/usr/bin/systemctl',['--user','unset-environment',...unset]);return;
   }
   throw Error('Login environment is unsupported on this platform');
  },
  async locales(){if(platform==='win32')return null;return (await execute('/usr/bin/locale',['-a'])).split(/\r?\n/).filter(Boolean);},
  async recovery(command,remove=false){if(platform==='win32')await powershell({op:'recovery',command,remove,expand:/%(?:APPDATA|LOCALAPPDATA|TEMP)%/.test(command)});}
 };
}
module.exports={adapter,KEYS,run};
