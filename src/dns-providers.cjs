const providers={
 cloudflare:{id:'cloudflare',label:'Cloudflare',wire:'https://1.1.1.1/dns-query',json:'https://1.1.1.1/dns-query'},
 google:{id:'google',label:'Google Public DNS',wire:'https://dns.google/dns-query',json:'https://dns.google/resolve'}
};
function get(value='cloudflare'){if(!Object.hasOwn(providers,value))throw Error('Unknown encrypted DNS provider');return providers[value];}
function query(value,host,type){const provider=get(value),url=new URL(provider.json);url.searchParams.set('name',host);url.searchParams.set('type',type);if(provider.id==='google')url.searchParams.set('edns_client_subnet','0.0.0.0/0');return url.href;}
module.exports={get,query};
