function visible(tabs,active,background=false){return background?tabs:tabs.filter(tab=>String(tab.id)===String(active));}
function assertAllowed(tab,active,background=false){if(!background&&String(tab.id)!==String(active))throw Error('MCP is limited to the active tab. Enable background-tab access in Settings to access other tabs.');}
module.exports={visible,assertAllowed};
