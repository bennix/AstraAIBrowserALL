// Chinese primary labels; English remains available in tooltips and settings copy.
fetch('i18n/ui.json').then(response=>response.json()).then(catalog=>{
 const byEnglish=new Map(Object.values(catalog).map(entry=>[entry.en,entry]));
 function translate(element){
  if(element.closest('.dictionary-entry')||element.closest('#tabs')||(element.closest('#history-list,#bookmarks-list')&&element.textContent.trim()!=='Remove')||(element.closest('#conversation')&&!element.matches('.copy-button,.markdown.waiting')))return;
  const entry=element.dataset.i18n?catalog[element.dataset.i18n]:byEnglish.get(element.textContent.trim());
  if(entry&&!element.querySelector('input,select,textarea')){element.textContent=entry.zh;element.title=entry.en;}
  for(const attribute of ['placeholder','title','aria-label']){const text=element.getAttribute(attribute),copy=byEnglish.get(text);if(copy)element.setAttribute(attribute,copy.zh+' · '+copy.en);}
 }
 document.querySelectorAll('[data-i18n],button,summary,label,option,textarea,input,h1,h2,p').forEach(translate);
 document.documentElement.lang='zh-CN';
 const observer=new MutationObserver(records=>{for(const record of records){const target=record.target.nodeType===Node.ELEMENT_NODE?record.target:record.target.parentElement;if(target?.matches('button,.markdown.waiting,[role=status]'))translate(target);for(const node of record.addedNodes)if(node.nodeType===Node.ELEMENT_NODE){if(node.matches('button,.markdown.waiting'))translate(node);node.querySelectorAll('button').forEach(translate);}}});
 observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['title','aria-label']});
});
