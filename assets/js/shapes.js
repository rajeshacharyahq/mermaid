"use strict";

// -----------------------------------------------------------------------------
// Shape library and drag-and-drop
// -----------------------------------------------------------------------------

function makeDraggableDivider(handle, createDrag) {
  let drag = null;
  handle.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    drag = createDrag(event);
    handle.setPointerCapture(event.pointerId);
    document.body.classList.add(drag.bodyClass);
    event.preventDefault();
  });
  handle.addEventListener("pointermove", event => {
    if (drag && handle.hasPointerCapture(event.pointerId)) drag.move(event);
  });
  const stop = event => {
    if (!drag) return;
    document.body.classList.remove(drag.bodyClass);
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    drag = null;
  };
  handle.addEventListener("pointerup", stop);
  handle.addEventListener("pointercancel", stop);
}

function createShapeLibrary() {
  const library = document.getElementById("shapeLibraryGrid");
  FLOWCHART_SHAPES.forEach(([shape, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "library-shape";
    button.draggable = true;
    button.dataset.mermaidShape = shape;
    button.dataset.shapeLabel = label;
    button.setAttribute("aria-label", `Add ${label} to the diagram. Drag to choose a location.`);
    button.innerHTML = `<span class="shape-thumbnail" aria-hidden="true"><span class="library-glyph ${shape}"></span></span><span>${label}</span><span class="shape-touch-handle" aria-hidden="true" title="Drag shape"><svg viewBox="0 0 16 20"><circle cx="5" cy="4" r="1"/><circle cx="11" cy="4" r="1"/><circle cx="5" cy="10" r="1"/><circle cx="11" cy="10" r="1"/><circle cx="5" cy="16" r="1"/><circle cx="11" cy="16" r="1"/></svg></span>`;
    button.addEventListener("dragstart", event => {
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData("application/x-mermaid-shape", shape);
      event.dataTransfer.setData("text/plain", shape);
    });
    button.addEventListener("click", event => {
      if (event.detail === 0) insertLibraryShapeAtPoint(shape, 0, 0, null, true);
    });
    button.addEventListener("pointerdown", event => startLibraryShapePointerDrag(event, button));
    button.addEventListener("pointermove", moveLibraryShapePointerDrag);
    button.addEventListener("pointerup", endLibraryShapePointerDrag);
    button.addEventListener("pointercancel", cancelLibraryShapePointerDrag);
    library.appendChild(button);
  });
}

function createNodeShapePicker() {
  const list = document.getElementById("nodeShapeList");
  FLOWCHART_SHAPES.filter(([shape]) => shape !== "subgraph").forEach(([shape, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "node-shape-option";
    button.dataset.nodeShape = shape;
    button.dataset.mermaidShape = shape;
    button.dataset.shapeLabel = label;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", "false");
    button.setAttribute("aria-label", `Use ${label} shape`);
    button.innerHTML = `<span class="shape-thumbnail" aria-hidden="true"><span class="library-glyph ${shape}"></span></span><span>${label}</span>`;
    button.addEventListener("click", () => {
      selectShape(shape);
      applyNodeVisualChangesLive();
    });
    list.appendChild(button);
  });

  const search = document.getElementById("nodeShapeSearch");
  search.addEventListener("input", filterNodeShapePicker);
  search.addEventListener("search", filterNodeShapePicker);
  document.getElementById("previousNodeShapesButton").addEventListener("click", () => scrollNodeShapePicker(-1));
  document.getElementById("nextNodeShapesButton").addEventListener("click", () => scrollNodeShapePicker(1));
}

function filterNodeShapePicker() {
  const query = document.getElementById("nodeShapeSearch").value.trim().toLowerCase();
  let visibleCount = 0;
  document.querySelectorAll("#nodeShapeList .node-shape-option").forEach(button => {
    const searchableText = `${button.dataset.mermaidShape} ${button.dataset.shapeLabel} ${getNodeShapeSearchAliases(button.dataset.mermaidShape)}`.toLowerCase();
    const matches = !query || searchableText.includes(query);
    button.hidden = !matches;
    if (matches) visibleCount += 1;
  });
  document.getElementById("nodeShapeEmpty").hidden = visibleCount !== 0;
  document.getElementById("nodeShapeList").scrollTo({ left: 0, behavior: "smooth" });
}

function getNodeShapeSearchAliases(shape) {
  const aliases = {
    rect: "rectangle box",
    rounded: "rounded rectangle",
    subproc: "double rectangle",
    diamond: "rhombus question",
    "notch-rect": "notched rectangle",
    "lin-rect": "lined rectangle",
    "div-rect": "divided rectangle",
    "sl-rect": "sloped rectangle",
    "bow-rect": "bow rectangle",
    "tag-rect": "tagged rectangle"
  };
  return aliases[shape] || "";
}

function scrollNodeShapePicker(direction) {
  const list = document.getElementById("nodeShapeList");
  list.scrollBy({ left: direction * Math.max(180, list.clientWidth * 0.8), behavior: "smooth" });
}

function startLibraryShapePointerDrag(event, button) {
  if (event.pointerType === "mouse" || event.button !== 0) return;
  const target = event.target instanceof Element ? event.target : null;
  if (!target?.closest(".shape-thumbnail, .shape-touch-handle")) return;
  activeLibraryShapeDrag = {
    pointerId: event.pointerId,
    button,
    shape: button.dataset.mermaidShape,
    label: button.dataset.shapeLabel,
    startX: event.clientX,
    startY: event.clientY,
    dragging: false,
    ghost: null
  };
  button.setPointerCapture(event.pointerId);
  event.preventDefault();
}

function moveLibraryShapePointerDrag(event) {
  if (!activeLibraryShapeDrag || event.pointerId !== activeLibraryShapeDrag.pointerId) return;
  const drag = activeLibraryShapeDrag;
  const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
  if (!drag.dragging && distance < 6) return;
  if (!drag.dragging) {
    drag.dragging = true;
    drag.hitTestCache = createPreviewHitTestCache();
    drag.button.classList.add("library-shape-dragging");
    drag.ghost = document.createElement("div");
    drag.ghost.className = "node-drag-ghost shape-drag-ghost";
    drag.ghost.textContent = `Add ${drag.label}`;
    document.body.appendChild(drag.ghost);
    hideQuickAddButton();
    closeNodePopup();
    closeEdgePopup();
    closeSubgraphPopup();
  }

  drag.ghost.style.left = `${event.clientX}px`;
  drag.ghost.style.top = `${event.clientY}px`;
  updateLibraryShapeDropTarget(event.clientX, event.clientY);
  if (autoScrollTouchDrag(event.clientY)) drag.hitTestCache = createPreviewHitTestCache();
  event.preventDefault();
}

function updateLibraryShapeDropTarget(clientX, clientY) {
  clearNodeDropTargets();
  const previewRect = elements.preview.getBoundingClientRect();
  const insidePreview = clientX >= previewRect.left && clientX <= previewRect.right && clientY >= previewRect.top && clientY <= previewRect.bottom;
  elements.preview.classList.toggle("drag-target", insidePreview);
  if (!insidePreview) return;
  const targetNode = findNodeAtPoint(clientX, clientY, null, activeLibraryShapeDrag?.hitTestCache);
  if (targetNode) targetNode.classList.add("node-group-target");
  else findSubgraphAtPoint(clientX, clientY, null, activeLibraryShapeDrag?.hitTestCache)?.classList.add("node-drop-target");
}

function autoScrollTouchDrag(clientY) {
  const edgeSize = 72;
  if (clientY < edgeSize) { window.scrollBy(0, -14); return true; }
  if (clientY > window.innerHeight - edgeSize) { window.scrollBy(0, 14); return true; }
  return false;
}

function endLibraryShapePointerDrag(event) {
  if (!activeLibraryShapeDrag || event.pointerId !== activeLibraryShapeDrag.pointerId) return;
  const drag = activeLibraryShapeDrag;
  const previewRect = elements.preview.getBoundingClientRect();
  const insidePreview = event.clientX >= previewRect.left && event.clientX <= previewRect.right && event.clientY >= previewRect.top && event.clientY <= previewRect.bottom;
  cleanupLibraryShapePointerDrag();
  if (drag.dragging && insidePreview) insertLibraryShapeAtPoint(drag.shape, event.clientX, event.clientY, document.elementFromPoint(event.clientX, event.clientY));
  event.preventDefault();
}

function cancelLibraryShapePointerDrag() {
  cleanupLibraryShapePointerDrag();
}

function cleanupLibraryShapePointerDrag() {
  if (!activeLibraryShapeDrag) return;
  const drag = activeLibraryShapeDrag;
  if (drag.button.hasPointerCapture(drag.pointerId)) drag.button.releasePointerCapture(drag.pointerId);
  drag.button.classList.remove("library-shape-dragging");
  drag.ghost?.remove();
  elements.preview.classList.remove("drag-target");
  clearNodeDropTargets();
  activeLibraryShapeDrag = null;
}

function renderShapeThumbnails() {
  const buttons = document.querySelectorAll("#shapeLibraryGrid .library-shape");
  if (!("IntersectionObserver" in window)) {
    buttons.forEach((button, index) => queueShapeThumbnail(button, index));
    return;
  }
  shapeThumbnailObserver = new IntersectionObserver(entries => entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    shapeThumbnailObserver.unobserve(entry.target);
    queueShapeThumbnail(entry.target, Number(entry.target.dataset.thumbnailIndex));
  }), { root: document.getElementById("shapeLibraryGrid"), rootMargin: "120px" });
  buttons.forEach((button, index) => {
    button.dataset.thumbnailIndex = String(index);
    shapeThumbnailObserver.observe(button);
  });
}

function renderNodeShapePickerThumbnails() {
  const buttons = document.querySelectorAll("#nodeShapeList .node-shape-option");
  if (!("IntersectionObserver" in window)) {
    buttons.forEach((button, index) => queueShapeThumbnail(button, 1000 + index));
    return;
  }
  nodeShapeThumbnailObserver = new IntersectionObserver(entries => entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    nodeShapeThumbnailObserver.unobserve(entry.target);
    queueShapeThumbnail(entry.target, 1000 + Number(entry.target.dataset.thumbnailIndex));
  }), { root: document.getElementById("nodeShapeList"), rootMargin: "120px" });
  buttons.forEach((button, index) => {
    button.dataset.thumbnailIndex = String(index);
    nodeShapeThumbnailObserver.observe(button);
  });
}

function queueShapeThumbnail(button, index) {
  thumbnailRenderQueue = thumbnailRenderQueue.then(() => renderShapeThumbnail(button, index)).catch(() => {});
}

async function renderShapeThumbnail(button, index) {
  const shape = button.dataset.mermaidShape;
  const container = button.querySelector(".shape-thumbnail");
  if (!container || shape === "text" || shape === "subgraph") return;
  try {
    const result = await mermaid.render(`shape-thumbnail-${index}-${Date.now()}`, `flowchart TD\nshape@{ shape: ${shape}, label: " " }`);
    container.innerHTML = typeof result === "string" ? result : result.svg;
    const svg = container.querySelector("svg");
    if (svg) {
      svg.removeAttribute("width");
      svg.removeAttribute("height");
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    }
  } catch (error) {
    // Keep the lightweight fallback glyph if a future Mermaid build removes a shape.
    removeMermaidErrorArtifacts();
  }
}

function filterShapeLibrary() {
  const query = document.getElementById("shapeSearch").value.trim().toLowerCase();
  document.querySelectorAll("#shapeLibraryGrid .library-shape").forEach(button => {
    const searchableText = `${button.dataset.mermaidShape} ${button.dataset.shapeLabel}`.toLowerCase();
    button.classList.toggle("shape-filtered", query !== "" && !searchableText.includes(query));
  });
}

function handleShapeDragOver(event) {
  const types = Array.from(event.dataTransfer.types);
  if (!types.includes("application/x-mermaid-shape")) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
  elements.preview.classList.add("drag-target");
}

function handleShapeDragLeave(event) {
  if (!elements.preview.contains(event.relatedTarget)) {
    elements.preview.classList.remove("drag-target");
    clearNodeDropTargets();
  }
}

function handleShapeDrop(event) {
  const shape = event.dataTransfer.getData("application/x-mermaid-shape");
  if (!shape) return;
  event.preventDefault();
  elements.preview.classList.remove("drag-target");
  insertLibraryShapeAtPoint(shape, event.clientX, event.clientY, event.target);
}

function insertLibraryShapeAtPoint(shape, clientX, clientY, dropTarget = null, forceRoot = false) {
  const catalogEntry = FLOWCHART_SHAPES.find(entry => entry[0] === shape);
  const label = catalogEntry ? catalogEntry[1] : "New node";
  const newNodeId = getNextNodeId();
  const targetElement = forceRoot ? null : (dropTarget instanceof Element ? dropTarget : document.elementFromPoint(clientX, clientY));
  const target = forceRoot ? null : (targetElement?.closest(RENDERED_NODE_SELECTOR) || findNodeAtPoint(clientX, clientY));
  const cluster = forceRoot ? null : findSubgraphAtPoint(clientX, clientY);
  const sourceId = target && elements.preview.contains(target) ? getNodeId(target) : null;
  const header = elements.editor.value.trim() ? elements.editor.value.trimEnd() : "flowchart TD";
  const targetSubgraphId = cluster ? getSubgraphId(cluster) : (sourceId ? findContainingSubgraphId(sourceId, header) : null);
  if (shape === "subgraph") {
    const subgraphId = getNextSubgraphId();
    const innerNodeId = getNextNodeId();
    const block = [`subgraph ${subgraphId}["Subgraph"]`, "    direction TB", `    ${innerNodeId}["New node"]`, "end"];
    const nextCode = targetSubgraphId ? insertLinesIntoSubgraph(header, targetSubgraphId, block) : `${header}\n    ${block.join("\n    ")}`;
    setEditorCode(sourceId ? `${nextCode}\n    ${sourceId} --> ${innerNodeId}` : nextCode);
    showToast(`Created ${subgraphId}.`);
    return;
  }
  const newLines = [`${newNodeId}@{ shape: ${shape}, label: "${label}" }`];
  if (sourceId) newLines.push(`${sourceId} --> ${newNodeId}`);
  const nextCode = targetSubgraphId ? insertLinesIntoSubgraph(header, targetSubgraphId, newLines) : `${header}\n    ${newLines.join("\n    ")}`;
  setEditorCode(nextCode);
  showToast(sourceId ? `Created ${newNodeId} and connected it to ${sourceId}.` : `Created ${newNodeId}.`);
}

function clearNodeDropTargets() {
  elements.preview.querySelectorAll("g.cluster.node-drop-target").forEach(cluster => cluster.classList.remove("node-drop-target"));
  elements.preview.querySelectorAll(".node-group-target").forEach(node => node.classList.remove("node-group-target"));
}

function createPreviewHitTestCache() {
  const nodes = Array.from(elements.preview.querySelectorAll(RENDERED_NODE_SELECTOR), node => ({ element: node, id: getNodeId(node), rect: node.getBoundingClientRect() }));
  const subgraphs = Array.from(elements.preview.querySelectorAll("g.cluster"), cluster => {
    const rect = cluster.getBoundingClientRect();
    return { element: cluster, id: getSubgraphId(cluster), rect, area: rect.width * rect.height };
  }).sort((first, second) => first.area - second.area);
  return { nodes, subgraphs };
}

function findNodeAtPoint(x, y, excludedNodeId, hitTestCache = null) {
  const nodes = hitTestCache?.nodes || Array.from(elements.preview.querySelectorAll(RENDERED_NODE_SELECTOR), node => ({ element: node, id: getNodeId(node), rect: node.getBoundingClientRect() }));
  return nodes.find(entry => entry.id !== excludedNodeId && x >= entry.rect.left && x <= entry.rect.right && y >= entry.rect.top && y <= entry.rect.bottom)?.element || null;
}

function getNextSubgraphId() {
  const usedNumbers = Array.from(elements.editor.value.matchAll(/\bsg(\d+)\b/g), match => Number(match[1]));
  const nextNumber = usedNumbers.length ? Math.max(...usedNumbers) + 1 : 1;
  return `sg${nextNumber}`;
}

function createColorPalette(containerId, colorInput, paletteRole) {
  const container = document.getElementById(containerId);
  const palette = STYLE_COLOR_PALETTE.map(theme => ({ name: theme.name, color: theme[paletteRole], border: theme.border }));
  const noColorButton = document.createElement("button");
  noColorButton.type = "button";
  noColorButton.className = "swatch no-color";
  noColorButton.dataset.color = "none";
  noColorButton.title = "No color";
  noColorButton.setAttribute("aria-label", "No color");
  noColorButton.addEventListener("click", () => {
    colorInput.dataset.noColor = "true";
    colorInput.dataset.userSelected = "true";
    updateSelectedSwatches();
    colorInput.dispatchEvent(new Event("change", { bubbles: true }));
  });
  container.appendChild(noColorButton);
  palette.forEach(({ name, color, border }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `swatch swatch-${paletteRole}`;
    button.style.setProperty("--swatch", color);
    if (paletteRole === "fill") button.style.setProperty("--swatch-border", border);
    button.dataset.color = color;
    button.title = `${name} (${color})`;
    button.setAttribute("aria-label", `Choose ${name} ${paletteRole}`);
    button.addEventListener("click", () => {
      colorInput.value = color;
      colorInput.dataset.noColor = "false";
      colorInput.dataset.userSelected = "true";
      updateSelectedSwatches();
      colorInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
    container.appendChild(button);
  });
  colorInput.addEventListener("input", () => {
    colorInput.dataset.noColor = "false";
    colorInput.dataset.userSelected = "true";
    updateSelectedSwatches();
  });
}
