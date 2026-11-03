# AI sidebar resizing

The main process owns the webpage WebContentsView bounds and clamps the sidebar width to leave at least 320 pixels of webpage content. The renderer owns pointer interaction and presentation. Width updates use the existing ai-panel-resize command; the main process broadcasts the accepted width so the DOM panel and native webpage remain aligned.

A 12-pixel shell-owned gutter sits outside the AI panel. Native webpage bounds stop before that gutter. Do not move the resize handle inside the panel or allow the native webpage to overlap its hit area: CSS z-index cannot put shell content above a native child view. Both shell margins and webpage bounds account for the same gutter width. The gutter hides with the sidebar and ends above the download shelf.

Dragging uses the initial pointer position and width to avoid a jump when grabbing different parts of the gutter. Pointer capture, cancellation, capture loss and window blur finish the interaction and persist the last requested width. The main process clamps it before saving. Arrow keys change width by 20 pixels; Home restores 360 pixels and End expands to the available maximum.
