// Capture only the selected passage's local context, never the whole page or form values.
(selected => {
 const selection=globalThis.getSelection();
 if(!selection?.rangeCount || selection.toString().trim()!==selected)return null;
 const range=selection.getRangeAt(0),parent=range.startContainer.nodeType===Node.ELEMENT_NODE?range.startContainer:range.startContainer.parentElement;
 if(!parent || parent.closest('input,textarea,[contenteditable]:not([contenteditable="false"])'))return null;
 const block=parent.closest('p,li,blockquote,td,th,h1,h2,h3,h4,h5,h6,figcaption,pre')||parent;
 const clone=block.cloneNode(true);
 if(clone.querySelectorAll)clone.querySelectorAll('[data-astra-translation],.astra-translation,script,style,input,textarea,select').forEach(node=>node.remove());
 let original=(clone.textContent||'').replace(/\s+/g,' ').trim();
 const index=original.toLocaleLowerCase().indexOf(selected.toLocaleLowerCase());
 if(index<0)return null;
 if(original.length>6000){const start=Math.max(0,index-1500);original=original.slice(start,Math.min(original.length,Math.max(index+selected.length+1500,start+3000)));}
 return {original,url:location.href,title:document.title};
})
