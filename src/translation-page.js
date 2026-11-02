// Page-only DOM work. API access and translation lifecycle belong to translation.cjs.
(() => {
 if (globalThis.__astraTranslation) return;
 const marker = 'data-astra-translation';
 const excluded = 'script,style,noscript,template,pre,textarea,input,select,option,svg,math,[contenteditable]:not([contenteditable="false"]),[aria-hidden="true"],[translate="no"],.notranslate,[' + marker + ']';
 const readable = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,figcaption,dt,dd,td,th,caption,legend,summary,[role="heading"],[data-testid="tweetText"]';
 let session;
 const normalize = text => text.replace(/\s+/g, ' ').trim();
 function restore() {
  if (!session) return;
  for (const record of session.records.values()) {
   record.translation?.remove();
   if (record.replacement !== undefined && record.node.nodeValue === record.replacement) record.node.nodeValue = record.original;
  }
  session = null;
 }
 function sourceText(record) {
  return normalize(record.nodes.map(node => node.nodeValue || '').join(' '));
 }
 function collect(id, mode) {
  if (session?.id !== id) { restore(); session = {id, mode, records:new Map(), owners:new WeakMap(), next:0}; }
  const groups = new Map();
  const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
   const parent = node.parentElement;
   if (!parent || parent.closest(excluded) || (mode === 'translated' && parent.closest('code')) || !normalize(node.nodeValue) || !/[\p{L}]/u.test(node.nodeValue)) continue;
   const style = getComputedStyle(parent);
   if (style.display === 'none' || style.visibility === 'hidden' || !parent.getClientRects().length) continue;
   let owner = mode === 'translated' ? node : (parent.closest(readable) || parent.closest('button,label,[role="button"]')); 
   if (!owner) {
    owner = parent;
    while (owner.parentElement && owner.parentElement !== document.body && /^(inline|contents)/.test(getComputedStyle(owner).display)) owner = owner.parentElement;
   }
   if (mode === 'translated') owner = node;
   if (!groups.has(owner)) groups.set(owner, []);
   groups.get(owner).push(node);
  }
  const pending = [];
  for (const [owner, nodes] of groups) {
   let record = session.owners.get(owner);
   // In replacement mode, our own text must never be sent back for translation.
   if (record?.replacement !== undefined && owner.nodeValue === record.replacement) continue;
   const text = normalize(nodes.map(node => node.nodeValue).join(' '));
   if (text.length < 2) continue;
   if (record && record.text === text && (record.translation?.isConnected || record.pending || record.failed)) continue;
   if (record) { record.translation?.remove(); session.records.delete(record.id); }
   record = {id:String(++session.next), owner, nodes, text, pending:true};
   session.owners.set(owner, record);session.records.set(record.id, record);
   pending.push({id:record.id, text});
   if (pending.length >= 64) break;
  }
  for (const [key, record] of session.records) if (!record.owner.isConnected) { record.translation?.remove();session.records.delete(key); }
  return pending;
 }
 function apply(id, values, language) {
  if (session?.id !== id) return 0;
  let applied = 0;
  for (const value of values) {
   const record = session.records.get(value.id);
   if (!record || !record.owner.isConnected || sourceText(record) !== record.text) continue;
   record.pending = false;
   if (session.mode === 'translated') {
    record.node = record.owner;record.original = record.node.nodeValue;record.replacement = value.text;record.node.nodeValue = value.text;
   } else {
    const translation = document.createElement('span');
    translation.setAttribute(marker, '');translation.lang = language;translation.dir = 'auto';translation.textContent = value.text;
    translation.style.cssText = 'display:block;white-space:pre-wrap;font:inherit;line-height:inherit;color:inherit;opacity:.85;margin:.35em 0 .65em;border-inline-start:2px solid #39a5d1;padding-inline-start:.6em;text-align:start';
    record.owner.appendChild(translation);record.translation = translation;
   }
   applied++;
  }
  return applied;
 }
 function fail(id, ids) { if (session?.id === id) for (const key of ids) { const record=session.records.get(key);if(record){record.pending=false;record.failed=true;} } }
 function retry(id) { if(session?.id===id) for(const record of session.records.values()) if(record.failed){session.owners.delete(record.owner);session.records.delete(record.id);} }
 globalThis.__astraTranslation = {collect, apply, fail, retry, restore};
})();
