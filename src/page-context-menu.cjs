// Native image copying uses Chromium's decoded image, without canvas reads or a second network request.
module.exports = function pageContextItems(wc, params, clipboard, label) {
  const items = [];
  if (params.mediaType === 'image') {
    items.push({ label: label('context.copyImage'), enabled: params.hasImageContents === true,
      click: () => { if (!wc.isDestroyed()) wc.copyImageAt(params.x, params.y); } });
    if (params.srcURL) items.push({ label: label('context.copyImageAddress'),
      click: () => clipboard.writeText(params.srcURL) });
  }
  if (params.selectionText?.trim() || params.isEditable) {
    items.push({ label: label('context.copy'), enabled: params.editFlags?.canCopy === true,
      click: () => { if (!wc.isDestroyed()) wc.copy(); } });
  }
  if (params.isEditable) items.push({ label: label('context.paste'), enabled: params.editFlags?.canPaste === true,
    click: () => { if (!wc.isDestroyed()) wc.paste(); } });
  return items;
};
