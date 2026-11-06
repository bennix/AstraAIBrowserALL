// Reduce application-specific version disclosure without inventing an engine or OS identity.
module.exports=function browserUserAgent(value){
 return String(value).replace(/\s+(?:astra-browser-electron|Electron)\/[A-Za-z0-9._-]+/g,'');
};
