"use strict";

// -----------------------------------------------------------------------------
// Diagram interaction: nodes, subgraphs, connectors, and popups
// -----------------------------------------------------------------------------

function handlePreviewClick(event) {
  const target = event.target instanceof Element ? event.target : event.target.parentElement;
  const edgeTarget = target && target.closest("[data-edge-index]");
  if (edgeTarget && elements.preview.contains(edgeTarget)) {
    const edge = parseEdges()[Number(edgeTarget.dataset.edgeIndex)];
    const visiblePath = edgeTarget._visibleEdgePath || edgeTarget;
    if (edge) openEdgePopup(edge, visiblePath);
    return;
  }
  const nodeElement = target && target.closest(RENDERED_NODE_SELECTOR);
  if (nodeElement && elements.preview.contains(nodeElement)) {
    if (suppressNodeClick) return;
    openClickedNode(nodeElement);
    return;
  }
  const cluster = target && target.closest("g.cluster");
  if (!cluster || !elements.preview.contains(cluster) || suppressSubgraphClick) return;
  if (target.closest(".edgePath, .flowchart-link")) return;
  const label = target.closest(".cluster-label");
  openSubgraphPopup(getSubgraphId(cluster), (label || cluster).getBoundingClientRect(), cluster);
}

function handlePreviewKeydown(event) {
  if (event.key !== "Enter" && event.key !== " ") return;
  const edgeTarget = event.target instanceof Element ? event.target.closest("[data-edge-index]") : null;
  if (edgeTarget) {
    const edge = parseEdges()[Number(edgeTarget.dataset.edgeIndex)];
    if (!edge) return;
    event.preventDefault();
    openEdgePopup(edge, edgeTarget._visibleEdgePath || edgeTarget);
    return;
  }
  const node = event.target instanceof Element ? event.target.closest(RENDERED_NODE_SELECTOR) : null;
  if (node) {
    event.preventDefault();
    openClickedNode(node);
    return;
  }
  const cluster = event.target instanceof Element ? event.target.closest("g.cluster") : null;
  if (!cluster) return;
  event.preventDefault();
  const label = cluster.querySelector(".cluster-label") || cluster;
  openSubgraphPopup(getSubgraphId(cluster), label.getBoundingClientRect(), cluster);
}

function handlePreviewMouseOver(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const hitArea = target.closest(".edge-hit-area");
  if (hitArea) {
    hitArea._visibleEdgePath?.classList.add("edge-hover");
    return;
  }
  const node = target.closest(RENDERED_NODE_SELECTOR);
  if (node) {
    if (!(event.relatedTarget instanceof Node) || !node.contains(event.relatedTarget)) showQuickAddButton(node);
    return;
  }
  const cluster = target.closest("g.cluster");
  if (cluster) showQuickAddForSubgraph(cluster);
}

function handlePreviewMouseOut(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const hitArea = target.closest(".edge-hit-area");
  if (hitArea) hitArea._visibleEdgePath?.classList.remove("edge-hover");
  const node = target.closest(RENDERED_NODE_SELECTOR);
  if (node && (!(event.relatedTarget instanceof Node) || !node.contains(event.relatedTarget))) scheduleQuickAddHide();
  const cluster = target.closest("g.cluster");
  if (cluster && (!(event.relatedTarget instanceof Node) || !cluster.contains(event.relatedTarget))) scheduleQuickAddHide();
}

function handleDiagramPointerDown(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const node = target.closest(RENDERED_NODE_SELECTOR);
  if (node) { startNodeDrag(event, node); return; }
  const cluster = target.closest("g.cluster");
  if (cluster) startSubgraphDrag(event, cluster);
}

function handleDiagramPointerMove(event) {
  if (activeNodeDrag) moveNodeDrag(event);
  else if (activeSubgraphDrag) moveSubgraphDrag(event);
}

function handleDiagramPointerUp(event) {
  if (activeNodeDrag) endNodeDrag(event);
  else if (activeSubgraphDrag) endSubgraphDrag(event);
}

function handleDiagramPointerCancel(event) {
  if (activeNodeDrag) cancelNodeDrag(event);
  if (activeSubgraphDrag) cancelSubgraphDrag(event);
}

function bindRenderedNodes() {
  const nodes = elements.preview.querySelectorAll(RENDERED_NODE_SELECTOR);
  nodes.forEach(node => {
    node.classList.add("editable-node");
    node.setAttribute("tabindex", "0");
    node.setAttribute("role", "button");
    const nodeId = getNodeId(node) || "node";
    const label = node.textContent.replace(/\s+/g, " ").trim();
    node.setAttribute("aria-label", `Edit node ${nodeId}${label && label !== nodeId ? `: ${label}` : ""}`);
  });
  bindRenderedSubgraphs();
}

function startNodeDrag(event, nodeElement) {
  if (event.button !== 0) return;
  const nodeId = getNodeId(nodeElement);
  if (!nodeId) return;
  activeNodeDrag = { nodeId, nodeElement, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, dragging: false, ghost: null };
  nodeElement.setPointerCapture(event.pointerId);
}

function moveNodeDrag(event) {
  if (!activeNodeDrag || event.pointerId !== activeNodeDrag.pointerId) return;
  const distance = Math.hypot(event.clientX - activeNodeDrag.startX, event.clientY - activeNodeDrag.startY);
  if (!activeNodeDrag.dragging && distance < 7) return;
  if (!activeNodeDrag.dragging) {
    activeNodeDrag.dragging = true;
    activeNodeDrag.hitTestCache = createPreviewHitTestCache();
    activeNodeDrag.nodeElement.classList.add("node-dragging");
    activeNodeDrag.ghost = document.createElement("div");
    activeNodeDrag.ghost.className = "node-drag-ghost";
    activeNodeDrag.ghost.textContent = `Move ${activeNodeDrag.nodeId}`;
    document.body.appendChild(activeNodeDrag.ghost);
    hideQuickAddButton();
    closeNodePopup();
  }
  activeNodeDrag.ghost.style.left = `${event.clientX}px`;
  activeNodeDrag.ghost.style.top = `${event.clientY}px`;
  clearNodeDropTargets();
  const previewRect = elements.preview.getBoundingClientRect();
  if (event.clientX >= previewRect.left && event.clientX <= previewRect.right && event.clientY >= previewRect.top && event.clientY <= previewRect.bottom) {
    const targetNode = findNodeAtPoint(event.clientX, event.clientY, activeNodeDrag.nodeId, activeNodeDrag.hitTestCache);
    if (targetNode) targetNode.classList.add("node-group-target");
    else findSubgraphAtPoint(event.clientX, event.clientY, null, activeNodeDrag.hitTestCache)?.classList.add("node-drop-target");
  }
  event.preventDefault();
}

function endNodeDrag(event) {
  if (!activeNodeDrag || event.pointerId !== activeNodeDrag.pointerId) return;
  const drag = activeNodeDrag;
  const previewRect = elements.preview.getBoundingClientRect();
  const insidePreview = event.clientX >= previewRect.left && event.clientX <= previewRect.right && event.clientY >= previewRect.top && event.clientY <= previewRect.bottom;
  cleanupNodeDrag();
  if (!drag.dragging || !insidePreview) return;
  suppressNodeClick = true;
  setTimeout(() => { suppressNodeClick = false; }, 0);
  const targetNode = findNodeAtPoint(event.clientX, event.clientY, drag.nodeId, drag.hitTestCache);
  if (targetNode) {
    createSubgraphFromNodes(drag.nodeId, getNodeId(targetNode));
    return;
  }
  const targetSubgraph = findSubgraphAtPoint(event.clientX, event.clientY, null, drag.hitTestCache);
  moveNodeToSubgraph(drag.nodeId, targetSubgraph ? getSubgraphId(targetSubgraph) : null);
}

function cancelNodeDrag() {
  cleanupNodeDrag();
}

function cleanupNodeDrag() {
  if (!activeNodeDrag) return;
  if (activeNodeDrag.nodeElement.hasPointerCapture(activeNodeDrag.pointerId)) activeNodeDrag.nodeElement.releasePointerCapture(activeNodeDrag.pointerId);
  activeNodeDrag.nodeElement.classList.remove("node-dragging");
  activeNodeDrag.ghost?.remove();
  clearNodeDropTargets();
  activeNodeDrag = null;
}

function bindRenderedSubgraphs() {
  elements.preview.querySelectorAll("g.cluster").forEach(cluster => {
    const label = cluster.querySelector(".cluster-label") || cluster.querySelector(":scope > text");
    const subgraphId = getSubgraphId(cluster) || "subgraph";
    const title = label?.textContent.replace(/\s+/g, " ").trim();
    cluster.setAttribute("tabindex", "0");
    cluster.setAttribute("role", "button");
    cluster.setAttribute("aria-label", `Edit subgraph ${subgraphId}${title && title !== subgraphId ? `: ${title}` : ""}`);
    applySubgraphTextColor(cluster, label);
  });
}

function applySubgraphTextColor(cluster, label) {
  if (!label) return;
  const subgraphId = getSubgraphId(cluster);
  if (!subgraphId) return;
  const subgraphStyle = findSubgraphStyle(subgraphId);
  if (!subgraphStyle.explicit.has("color")) return;
  label.style.setProperty("color", subgraphStyle.color, "important");
  label.querySelectorAll("text, tspan").forEach(element => {
    element.style.setProperty("fill", subgraphStyle.color, "important");
    element.style.setProperty("color", subgraphStyle.color, "important");
  });
  label.querySelectorAll("div, span, p").forEach(element => element.style.setProperty("color", subgraphStyle.color, "important"));
}

function startSubgraphDrag(event, clusterElement) {
  if (event.button !== 0) return;
  const target = event.target instanceof Element ? event.target : null;
  if (!target || target.closest(`${RENDERED_NODE_SELECTOR}, .edgePath, .flowchart-link, .cluster-label`)) return;
  const subgraphId = getSubgraphId(clusterElement);
  if (!subgraphId) return;
  activeSubgraphDrag = { subgraphId, clusterElement, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, dragging: false, ghost: null };
  clusterElement.setPointerCapture(event.pointerId);
  event.stopPropagation();
}

function moveSubgraphDrag(event) {
  if (!activeSubgraphDrag || event.pointerId !== activeSubgraphDrag.pointerId) return;
  const distance = Math.hypot(event.clientX - activeSubgraphDrag.startX, event.clientY - activeSubgraphDrag.startY);
  if (!activeSubgraphDrag.dragging && distance < 7) return;
  if (!activeSubgraphDrag.dragging) {
    activeSubgraphDrag.dragging = true;
    activeSubgraphDrag.hitTestCache = createPreviewHitTestCache();
    activeSubgraphDrag.clusterElement.classList.add("subgraph-dragging");
    activeSubgraphDrag.ghost = document.createElement("div");
    activeSubgraphDrag.ghost.className = "node-drag-ghost";
    activeSubgraphDrag.ghost.textContent = `Move ${activeSubgraphDrag.subgraphId}`;
    document.body.appendChild(activeSubgraphDrag.ghost);
    hideQuickAddButton();
    closeSubgraphPopup();
  }
  activeSubgraphDrag.ghost.style.left = `${event.clientX}px`;
  activeSubgraphDrag.ghost.style.top = `${event.clientY}px`;
  clearNodeDropTargets();
  const targetSubgraph = findSubgraphAtPoint(event.clientX, event.clientY, activeSubgraphDrag.subgraphId, activeSubgraphDrag.hitTestCache);
  if (targetSubgraph) {
    const targetId = getSubgraphId(targetSubgraph);
    if (canNestSubgraph(activeSubgraphDrag.subgraphId, targetId, elements.editor.value)) targetSubgraph.classList.add("node-drop-target");
  }
  event.preventDefault();
}

function endSubgraphDrag(event) {
  if (!activeSubgraphDrag || event.pointerId !== activeSubgraphDrag.pointerId) return;
  const drag = activeSubgraphDrag;
  const previewRect = elements.preview.getBoundingClientRect();
  const insidePreview = event.clientX >= previewRect.left && event.clientX <= previewRect.right && event.clientY >= previewRect.top && event.clientY <= previewRect.bottom;
  const targetSubgraph = insidePreview ? findSubgraphAtPoint(event.clientX, event.clientY, drag.subgraphId, drag.hitTestCache) : null;
  cleanupSubgraphDrag();
  if (!drag.dragging || !insidePreview) return;
  suppressSubgraphClick = true;
  setTimeout(() => { suppressSubgraphClick = false; }, 0);
  moveSubgraphToSubgraph(drag.subgraphId, targetSubgraph ? getSubgraphId(targetSubgraph) : null);
}

function cancelSubgraphDrag() {
  cleanupSubgraphDrag();
}

function cleanupSubgraphDrag() {
  if (!activeSubgraphDrag) return;
  if (activeSubgraphDrag.clusterElement.hasPointerCapture(activeSubgraphDrag.pointerId)) activeSubgraphDrag.clusterElement.releasePointerCapture(activeSubgraphDrag.pointerId);
  activeSubgraphDrag.clusterElement.classList.remove("subgraph-dragging");
  activeSubgraphDrag.ghost?.remove();
  clearNodeDropTargets();
  activeSubgraphDrag = null;
}

function openSubgraphPopup(subgraphId, labelRect, clusterElement) {
  closeSubgraphPopup();
  const range = getSubgraphRanges(elements.editor.value).find(item => item.id === subgraphId);
  if (!range) return;
  const line = elements.editor.value.split(/\r?\n/)[range.start];
  const titleMatch = line.match(/\[\s*"?([^\]"]*)"?\s*\]/);
  selectedSubgraphId = subgraphId;
  selectedSubgraphElement = clusterElement;
  if (selectedSubgraphElement) selectedSubgraphElement.classList.add("subgraph-selected");
  document.getElementById("subgraphId").textContent = subgraphId;
  document.getElementById("subgraphTitleInput").value = titleMatch ? titleMatch[1] : subgraphId;
  const style = findSubgraphStyle(subgraphId);
  setColorInputState(document.getElementById("subgraphFillColor"), style.fill, style.explicit.has("fill"));
  setColorInputState(document.getElementById("subgraphTextColor"), style.color, style.explicit.has("color"));
  setColorInputState(document.getElementById("subgraphBorderColor"), style.stroke, style.explicit.has("stroke"));
  showSubgraphPanel("label");
  updateSelectedSwatches();
  const popup = document.getElementById("subgraphPopup");
  popup.hidden = false;
  const popupRect = popup.getBoundingClientRect();
  let left = labelRect.right + 12;
  if (left + popupRect.width > window.innerWidth - 12) left = labelRect.left - popupRect.width - 12;
  popup.style.left = `${Math.max(12, left)}px`;
  popup.style.top = `${Math.max(12, Math.min(labelRect.top, window.innerHeight - popupRect.height - 12))}px`;
  document.getElementById("subgraphTitleInput").focus();
  document.getElementById("subgraphTitleInput").select();
}

function showSubgraphPanel(panelName) {
  document.querySelectorAll("[data-subgraph-content]").forEach(panel => { panel.hidden = panel.dataset.subgraphContent !== panelName; });
  document.querySelectorAll("[data-subgraph-panel]").forEach(button => {
    const active = button.dataset.subgraphPanel === panelName;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function findSubgraphStyle(subgraphId) {
  const style = { fill: "#ffffde", color: "#000000", stroke: "#aaaa33", explicit: new Set() };
  const match = elements.editor.value.match(new RegExp(`^\\s*style\\s+${escapeRegExp(subgraphId)}\\s+(.+)$`, "mi"));
  if (!match) return style;
  match[1].split(",").forEach(entry => {
    const [key, value] = entry.split(":").map(part => part.trim());
    if (["fill", "color", "stroke"].includes(key) && /^#[0-9a-f]{6}$/i.test(value)) { style[key] = value; style.explicit.add(key); }
  });
  return style;
}

function closeSubgraphPopup() {
  document.getElementById("subgraphPopup").hidden = true;
  if (selectedSubgraphElement) selectedSubgraphElement.classList.remove("subgraph-selected");
  selectedSubgraphElement = null;
  selectedSubgraphId = null;
}

function saveSubgraphTitle() {
  if (!selectedSubgraphId) return;
  const title = document.getElementById("subgraphTitleInput").value.trim();
  if (!title) { showToast("A subgraph title cannot be empty."); return; }
  const safeTitle = title.replace(/"/g, "&quot;");
  const lines = elements.editor.value.split(/\r?\n/);
  const range = getSubgraphRanges(elements.editor.value).find(item => item.id === selectedSubgraphId);
  if (!range) return;
  const id = selectedSubgraphId;
  lines[range.start] = lines[range.start].replace(new RegExp(`(subgraph\\s+${escapeRegExp(id)})(?:\\s*\\[.*\\])?`, "i"), `$1["${safeTitle}"]`);
  const styleParts = getSelectedStyleParts([
    ["fill", document.getElementById("subgraphFillColor")], ["color", document.getElementById("subgraphTextColor")], ["stroke", document.getElementById("subgraphBorderColor")]
  ]);
  const stylePattern = new RegExp(`^\\s*style\\s+${escapeRegExp(id)}\\s+.*$`, "i");
  const styleIndex = lines.findIndex(line => stylePattern.test(line));
  if (styleParts.length && styleIndex >= 0) lines[styleIndex] = `style ${id} ${styleParts.join(",")}`;
  else if (styleParts.length) lines.push(`style ${id} ${styleParts.join(",")}`);
  else if (styleIndex >= 0) lines.splice(styleIndex, 1);
  closeSubgraphPopup();
  setEditorCode(lines.join("\n"));
  showToast(`Subgraph ${id} updated.`);
}

function beginSubgraphEdge() {
  if (!selectedSubgraphId) return;
  const sourceId = selectedSubgraphId;
  closeSubgraphPopup();
  startEdgeCreation(sourceId);
}

function deleteSelectedSubgraph() {
  if (!selectedSubgraphId) return;
  const id = selectedSubgraphId;
  if (!window.confirm(`Delete subgraph ${id} and all nodes inside it?`)) return;
  const lines = elements.editor.value.split(/\r?\n/);
  const range = getSubgraphRanges(elements.editor.value).find(item => item.id === id);
  if (!range) return;
  const allEdges = parseEdges();
  const containedIds = new Set([id]);
  allEdges.filter(edge => edge.lineIndex > range.start && edge.lineIndex < range.end).forEach(edge => { containedIds.add(edge.source); containedIds.add(edge.target); });
  lines.slice(range.start + 1, range.end).forEach(line => {
    const definition = line.match(/^\s*([A-Za-z_][\w-]*)\s*(?:@\{|\[|\(|\{|>)/);
    if (definition) containedIds.add(definition[1]);
  });
  const externalAffectedLines = new Set(allEdges.filter(edge => containedIds.has(edge.source) || containedIds.has(edge.target)).map(edge => edge.lineIndex));
  const removedEdgeIndexes = new Set(allEdges.filter(edge => (edge.lineIndex >= range.start && edge.lineIndex <= range.end) || externalAffectedLines.has(edge.lineIndex)).map(edge => edge.index));
  const edgeIndexMap = new Map();
  let nextEdgeIndex = 0;
  allEdges.forEach(edge => { if (!removedEdgeIndexes.has(edge.index)) edgeIndexMap.set(edge.index, nextEdgeIndex++); });
  const containedStylePattern = new RegExp(`^\\s*style\\s+(?:${[...containedIds].map(escapeRegExp).join("|")})(?:\\s|$)`, "i");

  const filtered = lines.flatMap((line, lineIndex) => {
    if (lineIndex >= range.start && lineIndex <= range.end) return [];
    if (containedStylePattern.test(line)) return [];
    if (/^\s*linkStyle\s+/i.test(line)) {
      const remapped = remapLinkStyleLine(line, edgeIndexMap);
      return remapped ? [remapped] : [];
    }
    if (externalAffectedLines.has(lineIndex)) {
      const otherIds = allEdges.filter(edge => edge.lineIndex === lineIndex).flatMap(edge => [edge.source, edge.target]).filter(nodeId => !containedIds.has(nodeId));
      return [...new Set(otherIds)].flatMap(nodeId => {
        const definition = findNodeInCode(line, nodeId);
        return definition ? [`${(line.match(/^\s*/) || [""])[0]}${definition.match.trim()}`] : [];
      });
    }
    return [line];
  });
  closeSubgraphPopup();
  setEditorCode(filtered.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd());
  showToast(`Subgraph ${id} deleted.`);
}

function findSubgraphAtPoint(x, y, excludedSubgraphId = null, hitTestCache = null) {
  const subgraphs = hitTestCache?.subgraphs || Array.from(elements.preview.querySelectorAll("g.cluster"), cluster => {
    const rect = cluster.getBoundingClientRect();
    return { element: cluster, id: getSubgraphId(cluster), rect, area: rect.width * rect.height };
  }).sort((first, second) => first.area - second.area);
  return subgraphs.find(entry => entry.id !== excludedSubgraphId && x >= entry.rect.left && x <= entry.rect.right && y >= entry.rect.top && y <= entry.rect.bottom)?.element || null;
}

function getSubgraphId(cluster) {
  if (cluster.dataset.id) return cluster.dataset.id;
  const rawId = cluster.id || "";
  const knownIds = getSubgraphRanges(elements.editor.value).map(range => range.id);
  return knownIds.find(id => rawId === id || rawId.endsWith(`-${id}`) || rawId.includes(`flowchart-${id}`)) || getNodeId(cluster);
}

function showQuickAddForSubgraph(cluster) {
  if (pendingEdgeSource) return;
  clearTimeout(quickAddHideTimer);
  const subgraphId = getSubgraphId(cluster);
  if (!subgraphId) return;
  const rect = cluster.getBoundingClientRect();
  const buttonSize = getQuickAddButtonSize();
  let left = rect.right + 9;
  if (left + buttonSize > window.innerWidth - 8) left = rect.left - buttonSize - 9;
  const top = rect.top + (rect.height - buttonSize) / 2;
  elements.quickAdd.style.left = `${Math.max(8, left)}px`;
  elements.quickAdd.style.top = `${Math.max(8, top)}px`;
  quickAddSource = null;
  quickAddSubgraph = subgraphId;
  elements.quickAdd.title = "Create connected shape outside subgraph";
  elements.quickAdd.setAttribute("aria-label", elements.quickAdd.title);
  elements.quickAdd.hidden = false;
}

function bindRenderedEdges() {
  const edges = parseEdges();
  let paths = Array.from(elements.preview.querySelectorAll("path.flowchart-link"));
  if (!paths.length) paths = Array.from(elements.preview.querySelectorAll(".edgePath path")).filter(path => !path.closest("defs"));
  paths.forEach((path, index) => {
    if (!edges[index]) return;
    path.classList.add("editable-edge");
    path.dataset.edgeIndex = String(index);
    const hitArea = path.cloneNode(false);
    hitArea.removeAttribute("id");
    hitArea.removeAttribute("style");
    hitArea.removeAttribute("marker-start");
    hitArea.removeAttribute("marker-end");
    hitArea.setAttribute("class", "edge-hit-area");
    hitArea.dataset.edgeIndex = String(index);
    hitArea.setAttribute("tabindex", "0");
    hitArea.setAttribute("role", "button");
    hitArea.setAttribute("aria-label", `Edit arrow from ${edges[index].source} to ${edges[index].target}${edges[index].label ? `: ${edges[index].label}` : ""}`);
    path._visibleEdgePath = path;
    hitArea._visibleEdgePath = path;
    path.parentNode.insertBefore(hitArea, path);
  });
}

function parseEdges() {
  const code = elements.editor.value;
  if (code !== parsedEdgeCacheCode) {
    parsedEdgeCacheCode = code;
    parsedEdgeCache = parseEdgesFromCode(code);
  }
  return parsedEdgeCache;
}

function parseEdgesFromCode(code) {
  const edges = [];
  code.split(/\r?\n/).forEach((line, lineIndex) => {
    const operatorPattern = /([ox<]?(?:--[>ox-]|-\.-[>ox]?|==[=>ox]))(?:\|([^|]*)\|)?/g;
    const operators = Array.from(line.matchAll(operatorPattern));
    operators.forEach((operatorMatch, operatorOrdinal) => {
      const previous = operators[operatorOrdinal - 1];
      const next = operators[operatorOrdinal + 1];
      const leftStart = previous ? previous.index + previous[0].length : 0;
      const rightEnd = next ? next.index : line.length;
      const sources = extractEndpointIds(line.slice(leftStart, operatorMatch.index));
      const targets = extractEndpointIds(line.slice(operatorMatch.index + operatorMatch[0].length, rightEnd));
      const pairCount = sources.length * targets.length;
      sources.forEach(source => targets.forEach(target => edges.push({
        index: edges.length,
        lineIndex,
        source,
        target,
        operator: operatorMatch[1],
        label: operatorMatch[2] || "",
        operatorText: operatorMatch[0],
        operatorStart: operatorMatch.index,
        operatorEnd: operatorMatch.index + operatorMatch[0].length,
        complex: operators.length > 1 || pairCount > 1
      })));
    });
  });
  return edges;
}

function extractEndpointIds(segment) {
  return segment.split("&").flatMap(part => {
    const match = part.trim().match(/^([A-Za-z_][\w-]*)/);
    return match ? [match[1]] : [];
  });
}

function openEdgePopup(edge, path) {
  closeNodePopup();
  closeEdgePopup();
  selectedEdge = edge;
  selectedEdgePath = path;
  path.classList.add("edge-selected");
  document.getElementById("edgeEndpoints").textContent = `${edge.source} → ${edge.target}`;
  document.getElementById("edgeLabel").value = edge.label;
  document.getElementById("edgeStyle").value = getEdgeLineStyle(edge.operator);
  document.getElementById("edgeStartStyle").value = getEdgeStartStyle(edge.operator);
  document.getElementById("edgeEndStyle").value = getEdgeEndStyle(edge.operator);
  const edgeColor = getEdgeColor(edge.index);
  setColorInputState(elements.edgeColor, edgeColor || "#333333", Boolean(edgeColor));
  updateSelectedSwatches();
  const popup = document.getElementById("edgePopup");
  popup.hidden = false;
  updateMobileEditorBackdrop();
  const edgeRect = path.getBoundingClientRect();
  const popupRect = popup.getBoundingClientRect();
  let left = edgeRect.right + 12;
  let top = edgeRect.top + edgeRect.height / 2 - popupRect.height / 2;
  if (left + popupRect.width > window.innerWidth - 12) left = edgeRect.left - popupRect.width - 12;
  popup.style.left = `${Math.max(12, left)}px`;
  popup.style.top = `${Math.max(12, Math.min(top, window.innerHeight - popupRect.height - 12))}px`;
  document.getElementById("edgeLabel").focus();
}

function closeEdgePopup() {
  document.getElementById("edgePopup").hidden = true;
  if (selectedEdgePath) selectedEdgePath.classList.remove("edge-selected");
  selectedEdgePath = null;
  selectedEdge = null;
  updateMobileEditorBackdrop();
}

function getEdgeColor(index) {
  const pattern = new RegExp(`^\\s*linkStyle\\s+${index}\\s+[^\\n]*stroke:\\s*(#[0-9a-f]{6})`, "mi");
  const match = elements.editor.value.match(pattern);
  return match ? match[1] : null;
}

function getEdgeLineStyle(operator) {
  const withoutStart = /^[ox<]/.test(operator) ? operator.slice(1) : operator;
  if (withoutStart.startsWith("-.")) return "dotted";
  if (withoutStart.startsWith("=")) return "thick";
  return "solid";
}

function getEdgeStartStyle(operator) {
  if (operator.startsWith("o")) return "circle";
  if (operator.startsWith("x")) return "cross";
  if (operator.startsWith("<")) return "arrow";
  return "none";
}

function getEdgeEndStyle(operator) {
  if (operator.endsWith("o")) return "circle";
  if (operator.endsWith("x")) return "cross";
  if (operator.endsWith(">")) return "arrow";
  return "none";
}

function buildEdgeOperator(lineStyle, startStyle, endStyle) {
  const start = { none: "", arrow: "<", circle: "o", cross: "x" }[startStyle] || "";
  const end = { arrow: ">", circle: "o", cross: "x" }[endStyle] || "";
  if (lineStyle === "dotted") return `${start}-.-${end}`;
  if (lineStyle === "thick") return `${start}==${end || "="}`;
  return `${start}--${end || "-"}`;
}

function saveEdgeChanges() {
  if (!selectedEdge) return;
  const edge = selectedEdge;
  const lines = elements.editor.value.split(/\r?\n/);
  const label = document.getElementById("edgeLabel").value.trim().replace(/\|/g, "");
  const operator = buildEdgeOperator(document.getElementById("edgeStyle").value, document.getElementById("edgeStartStyle").value, document.getElementById("edgeEndStyle").value);
  const replacement = `${operator}${label ? `|${label}|` : ""}`;
  const edgeLine = lines[edge.lineIndex];
  lines[edge.lineIndex] = `${edgeLine.slice(0, edge.operatorStart)}${replacement}${edgeLine.slice(edge.operatorEnd)}`;
  const useEdgeColor = elements.edgeColor.dataset.userSelected === "true" && elements.edgeColor.dataset.noColor !== "true";
  const styleLine = `linkStyle ${edge.index} stroke:${elements.edgeColor.value},stroke-width:2px`;
  const stylePattern = new RegExp(`^\\s*linkStyle\\s+${edge.index}\\s+.*$`, "i");
  const styleIndex = lines.findIndex(line => stylePattern.test(line));
  if (useEdgeColor && styleIndex >= 0) lines[styleIndex] = styleLine;
  else if (useEdgeColor) lines.push(styleLine);
  else if (styleIndex >= 0) lines.splice(styleIndex, 1);
  closeEdgePopup();
  setEditorCode(lines.join("\n"));
  showToast(`Arrow ${edge.source} → ${edge.target} updated.`);
}

function deleteSelectedEdge() {
  if (!selectedEdge) return;
  const edge = selectedEdge;
  if (edge.complex) {
    showToast("This connector shares a chained or fan-out statement. Delete it directly in Mermaid code.");
    return;
  }
  const lines = elements.editor.value.split(/\r?\n/);
  const edgeLine = lines[edge.lineIndex];
  const targetDefinition = edgeLine.match(new RegExp(`${escapeRegExp(edge.target)}\\s*(@\\{.*\\}|\\[.*\\]|\\(.*\\)|\\{.*\\})\\s*$`));
  if (targetDefinition) {
    const indent = edgeLine.match(/^\s*/)[0];
    lines[edge.lineIndex] = `${indent}${edge.target}${targetDefinition[1]}`;
  } else {
    lines.splice(edge.lineIndex, 1);
  }
  const stylePattern = new RegExp(`^\\s*linkStyle\\s+${edge.index}(?:\\s|$)`, "i");
  const adjusted = lines.filter(line => !stylePattern.test(line)).map(line => line.replace(/^([ \t]*linkStyle\s+)(\d+)/i, (match, prefix, number) => {
    return Number(number) > edge.index ? `${prefix}${Number(number) - 1}` : match;
  }));
  closeEdgePopup();
  setEditorCode(adjusted.join("\n"));
  showToast(`Arrow ${edge.source} → ${edge.target} deleted.`);
}

function showQuickAddButton(nodeElement) {
  if (pendingEdgeSource) return;
  clearTimeout(quickAddHideTimer);
  const nodeId = getNodeId(nodeElement);
  if (!nodeId) return;
  const rect = nodeElement.getBoundingClientRect();
  const buttonSize = getQuickAddButtonSize();
  let left = rect.right + 9;
  if (left + buttonSize > window.innerWidth - 8) left = rect.left - buttonSize - 9;
  elements.quickAdd.style.left = `${Math.max(8, left)}px`;
  elements.quickAdd.style.top = `${Math.max(8, rect.top + (rect.height - buttonSize) / 2)}px`;
  quickAddSource = nodeId;
  quickAddSubgraph = null;
  elements.quickAdd.title = "Create connected shape";
  elements.quickAdd.setAttribute("aria-label", elements.quickAdd.title);
  elements.quickAdd.hidden = false;
}

function scheduleQuickAddHide() {
  clearTimeout(quickAddHideTimer);
  quickAddHideTimer = setTimeout(hideQuickAddButton, 320);
}

function hideQuickAddButton() {
  clearTimeout(quickAddHideTimer);
  elements.quickAdd.hidden = true;
  quickAddSource = null;
  quickAddSubgraph = null;
}

function getQuickAddButtonSize() {
  return window.matchMedia("(pointer: coarse)").matches ? 44 : 34;
}

function createConnectedNode(event) {
  event.stopPropagation();
  const sourceId = quickAddSource;
  const subgraphFromButton = quickAddSubgraph;
  if (!sourceId && !subgraphFromButton) return;
  const newNodeId = getNextNodeId();
  const currentCode = elements.editor.value.trimEnd();
  if (subgraphFromButton && !sourceId) {
    const code = `${currentCode}\n    ${newNodeId}["New node"]\n    ${subgraphFromButton} --> ${newNodeId}`;
    hideQuickAddButton();
    openNodeAfterRender = newNodeId;
    setEditorCode(code);
    showToast(`Created ${newNodeId} outside ${subgraphFromButton}.`);
    return;
  }
  const subgraphId = subgraphFromButton || findContainingSubgraphId(sourceId, currentCode);
  const newLines = [`${newNodeId}["New node"]`];
  if (sourceId) newLines.push(`${sourceId} --> ${newNodeId}`);
  const code = subgraphId ? insertLinesIntoSubgraph(currentCode, subgraphId, newLines) : `${currentCode}\n    ${newLines.join("\n    ")}`;
  hideQuickAddButton();
  openNodeAfterRender = newNodeId;
  setEditorCode(code);
  showToast(sourceId ? `Created ${newNodeId} from ${sourceId}.` : `Created ${newNodeId} inside ${subgraphId}.`);
}

function openPendingNodePopup() {
  if (!openNodeAfterRender) return;
  const nodeId = openNodeAfterRender;
  openNodeAfterRender = null;
  requestAnimationFrame(() => {
    const renderedNode = Array.from(elements.preview.querySelectorAll(RENDERED_NODE_SELECTOR))
      .find(node => getNodeId(node) === nodeId);
    if (renderedNode) openNodePopup(nodeId, renderedNode.getBoundingClientRect());
  });
}

function getNextNodeId() {
  const usedNumbers = Array.from(elements.editor.value.matchAll(/\bn(\d+)\b/g), match => Number(match[1]));
  let candidate = usedNumbers.length ? Math.max(...usedNumbers) + 1 : 1;
  while (new RegExp(`\\bn${candidate}\\b`).test(elements.editor.value)) candidate += 1;
  return `n${candidate}`;
}

function findContainingSubgraphId(nodeId, code) {
  const escapedId = escapeRegExp(nodeId);
  const nodePattern = new RegExp(`\\b${escapedId}\\b`);
  const lines = code.split(/\r?\n/);
  const ranges = getSubgraphRanges(code).filter(range => lines.slice(range.start + 1, range.end).some(line => nodePattern.test(line)));
  return ranges.length ? ranges.sort((a, b) => b.start - a.start)[0].id : null;
}

function getSubgraphRanges(code) {
  if (subgraphRangeCache.has(code)) return subgraphRangeCache.get(code);
  const ranges = [];
  const stack = [];
  code.split(/\r?\n/).forEach((line, index) => {
    const start = line.match(/^\s*subgraph\s+([^\s[]+)/i);
    if (start) stack.push({ id: start[1], start: index });
    if (/^\s*end\s*$/i.test(line) && stack.length) {
      const range = stack.pop();
      ranges.push({ ...range, end: index });
    }
  });
  subgraphRangeCache.set(code, ranges);
  if (subgraphRangeCache.size > 8) subgraphRangeCache.delete(subgraphRangeCache.keys().next().value);
  return ranges;
}

function getParentSubgraphId(subgraphId, code) {
  const ranges = getSubgraphRanges(code);
  const child = ranges.find(range => range.id === subgraphId);
  if (!child) return null;
  const parents = ranges.filter(range => range.id !== subgraphId && range.start < child.start && range.end > child.end);
  return parents.length ? parents.sort((a, b) => b.start - a.start)[0].id : null;
}

function canNestSubgraph(sourceSubgraphId, targetSubgraphId, code) {
  if (!targetSubgraphId) return true;
  if (sourceSubgraphId === targetSubgraphId) return false;
  const ranges = getSubgraphRanges(code);
  const source = ranges.find(range => range.id === sourceSubgraphId);
  const target = ranges.find(range => range.id === targetSubgraphId);
  if (!source || !target) return false;
  return !(target.start > source.start && target.end < source.end);
}

function moveSubgraphToSubgraph(sourceSubgraphId, targetSubgraphId) {
  const originalCode = elements.editor.value;
  const currentParentId = getParentSubgraphId(sourceSubgraphId, originalCode);
  if (currentParentId === targetSubgraphId) {
    showToast(targetSubgraphId ? `${sourceSubgraphId} is already inside ${targetSubgraphId}.` : `${sourceSubgraphId} is already at the top level.`);
    return;
  }
  if (!canNestSubgraph(sourceSubgraphId, targetSubgraphId, originalCode)) {
    showToast("A subgraph cannot be moved into itself or one of its descendants.");
    return;
  }
  const lines = originalCode.split(/\r?\n/);
  const sourceRange = getSubgraphRanges(originalCode).find(range => range.id === sourceSubgraphId);
  if (!sourceRange) return;
  const sourceIndent = (lines[sourceRange.start].match(/^\s*/) || [""])[0];
  const block = lines.slice(sourceRange.start, sourceRange.end + 1).map(line => line.startsWith(sourceIndent) ? line.slice(sourceIndent.length) : line);
  lines.splice(sourceRange.start, sourceRange.end - sourceRange.start + 1);
  let nextCode = lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
  const emptyResult = currentParentId ? removeEmptySubgraph(nextCode, currentParentId) : { code: nextCode, removed: false };
  nextCode = emptyResult.code;
  nextCode = targetSubgraphId
    ? insertLinesIntoSubgraph(nextCode, targetSubgraphId, block)
    : `${nextCode}\n    ${block.join("\n    ")}`;
  nextCode = remapAllLinkStyles(originalCode, nextCode);
  setEditorCode(nextCode);
  const location = targetSubgraphId ? `inside ${targetSubgraphId}` : "to the top level";
  showToast(emptyResult.removed ? `Moved ${sourceSubgraphId} ${location}. Empty subgraph removed.` : `Moved ${sourceSubgraphId} ${location}.`);
}

function insertLinesIntoSubgraph(code, subgraphId, newLines) {
  const lines = code.split(/\r?\n/);
  const range = getSubgraphRanges(code).find(item => item.id === subgraphId);
  if (!range) return `${code}\n    ${newLines.join("\n    ")}`;
  const endIndent = (lines[range.end].match(/^\s*/) || [""])[0];
  const itemIndent = `${endIndent}    `;
  lines.splice(range.end, 0, ...newLines.map(line => `${itemIndent}${line}`));
  return lines.join("\n");
}

function moveNodeToSubgraph(nodeId, targetSubgraphId, options = {}) {
  const originalCode = elements.editor.value;
  const sourceSubgraphId = findContainingSubgraphId(nodeId, originalCode);
  if (sourceSubgraphId === targetSubgraphId) {
    if (!options.silent) showToast(targetSubgraphId ? `Node ${nodeId} is already inside ${targetSubgraphId}.` : `Node ${nodeId} is already outside all subgraphs.`);
    return { moved: false, emptySubgraphRemoved: false };
  }

  const lines = originalCode.split(/\r?\n/);
  const definition = findNodeInCode(originalCode, nodeId);
  const definitionText = definition ? definition.match.trim() : `${nodeId}["${nodeId}"]`;
  const definitionLineIndex = definition ? originalCode.slice(0, definition.index).split(/\r?\n/).length - 1 : -1;
  const sourceRange = sourceSubgraphId ? getSubgraphRanges(originalCode).find(range => range.id === sourceSubgraphId) : null;
  const sourceEdges = sourceRange ? parseEdgesFromCode(originalCode).filter(edge => edge.lineIndex > sourceRange.start && edge.lineIndex < sourceRange.end && (edge.source === nodeId || edge.target === nodeId)) : [];
  const movedEdgeLineIndexes = new Set(sourceEdges.map(edge => edge.lineIndex));
  const movedEdgeLines = [];

  const remainingLines = lines.flatMap((line, lineIndex) => {
    if (movedEdgeLineIndexes.has(lineIndex)) {
      const edgesOnLine = parseEdgesFromCode(originalCode).filter(edge => edge.lineIndex === lineIndex);
      const endpointIds = [...new Set(edgesOnLine.flatMap(edge => [edge.source, edge.target]))];
      let edgeOnlyLine = line;
      const preservedDefinitions = [];
      endpointIds.forEach(id => {
        const inlineDefinition = findNodeInCode(edgeOnlyLine, id);
        if (!inlineDefinition) return;
        if (id !== nodeId) preservedDefinitions.push(`${(line.match(/^\s*/) || [""])[0]}${inlineDefinition.match.trim()}`);
        edgeOnlyLine = `${edgeOnlyLine.slice(0, inlineDefinition.index)}${id}${edgeOnlyLine.slice(inlineDefinition.index + inlineDefinition.match.length)}`;
      });
      movedEdgeLines.push(edgeOnlyLine.trim());
      return preservedDefinitions;
    }
    if (lineIndex === definitionLineIndex) {
      const withoutDefinition = line.replace(definition.match, nodeId);
      return withoutDefinition.trim() === nodeId ? [] : [withoutDefinition];
    }
    return [line];
  });

  let nextCode = remainingLines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
  nextCode = targetSubgraphId
    ? insertLinesIntoSubgraph(nextCode, targetSubgraphId, [definitionText])
    : `${nextCode}\n    ${definitionText}`;
  if (movedEdgeLines.length) nextCode = `${nextCode}\n    ${[...new Set(movedEdgeLines)].join("\n    ")}`;
  const emptyResult = sourceSubgraphId && sourceSubgraphId !== targetSubgraphId
    ? removeEmptySubgraph(nextCode, sourceSubgraphId)
    : { code: nextCode, removed: false };
  nextCode = emptyResult.code;
  nextCode = remapAllLinkStyles(originalCode, nextCode);

  if (options.deferRender) elements.editor.value = nextCode;
  else setEditorCode(nextCode);
  if (!options.silent) {
    const message = targetSubgraphId ? `Moved ${nodeId} into ${targetSubgraphId}.` : `Moved ${nodeId} outside the subgraph.`;
    showToast(emptyResult.removed ? `${message} Empty subgraph removed.` : message);
  }
  return { moved: true, emptySubgraphRemoved: emptyResult.removed };
}

function removeEmptySubgraph(code, subgraphId) {
  const lines = code.split(/\r?\n/);
  const range = getSubgraphRanges(code).find(item => item.id === subgraphId);
  if (!range) return { code, removed: false };
  const hasContent = lines.slice(range.start + 1, range.end).some(line => {
    const trimmed = line.trim();
    if (!trimmed || /^%%/.test(trimmed) || /^direction\s+/i.test(trimmed)) return false;
    if (/^(?:style|classDef|class|linkStyle)\s+/i.test(trimmed)) return false;
    return true;
  });
  if (hasContent) return { code, removed: false };
  lines.splice(range.start, range.end - range.start + 1);
  const stylePattern = new RegExp(`^\\s*style\\s+${escapeRegExp(subgraphId)}(?:\\s|$)`, "i");
  return { code: lines.filter(line => !stylePattern.test(line)).join("\n").replace(/\n{3,}/g, "\n\n").trimEnd(), removed: true };
}

function createSubgraphFromNodes(firstNodeId, secondNodeId) {
  if (!firstNodeId || !secondNodeId || firstNodeId === secondNodeId) return;
  const originalCode = elements.editor.value;
  const firstParent = findContainingSubgraphId(firstNodeId, originalCode);
  const secondParent = findContainingSubgraphId(secondNodeId, originalCode);
  const commonParent = firstParent && firstParent === secondParent ? firstParent : null;
  const subgraphId = getNextSubgraphId();
  const block = [`subgraph ${subgraphId}["New group"]`, "end"];
  elements.editor.value = commonParent
    ? insertLinesIntoSubgraph(originalCode, commonParent, block)
    : `${originalCode.trimEnd()}\n    ${block.join("\n    ")}`;
  const firstMove = moveNodeToSubgraph(firstNodeId, subgraphId, { deferRender: true, silent: true });
  const secondMove = moveNodeToSubgraph(secondNodeId, subgraphId, { deferRender: true, silent: true });
  setEditorCode(elements.editor.value);
  const removedEmptySubgraph = firstMove.emptySubgraphRemoved || secondMove.emptySubgraphRemoved;
  showToast(removedEmptySubgraph ? `Created ${subgraphId} with ${firstNodeId} and ${secondNodeId}. Empty subgraph removed.` : `Created ${subgraphId} with ${firstNodeId} and ${secondNodeId}.`);
}

function remapAllLinkStyles(oldCode, newCode) {
  const oldEdges = parseEdgesFromCode(oldCode);
  const styleRecords = [];
  oldCode.split(/\r?\n/).forEach(line => {
    const match = line.match(/^\s*linkStyle\s+([\d,\s]+)(\s+.*)$/i);
    if (!match) return;
    match[1].split(",").map(value => Number(value.trim())).filter(Number.isFinite).forEach(index => {
      if (oldEdges[index]) styleRecords.push({ edge: oldEdges[index], suffix: match[2] });
    });
  });
  const withoutStyles = newCode.split(/\r?\n/).filter(line => !/^\s*linkStyle\s+/i.test(line)).join("\n");
  if (!styleRecords.length) return withoutStyles;
  const newEdges = parseEdgesFromCode(withoutStyles);
  const usedIndexes = new Set();
  const remappedStyles = styleRecords.flatMap(record => {
    const newIndex = newEdges.findIndex((edge, index) => !usedIndexes.has(index) && edge.source === record.edge.source && edge.target === record.edge.target && edge.operator === record.edge.operator && edge.label === record.edge.label);
    if (newIndex < 0) return [];
    usedIndexes.add(newIndex);
    return [`linkStyle ${newIndex}${record.suffix}`];
  });
  return remappedStyles.length ? `${withoutStyles.trimEnd()}\n${remappedStyles.join("\n")}` : withoutStyles;
}

function openClickedNode(nodeElement) {
  const nodeId = getNodeId(nodeElement);
  if (!nodeId) {
    showToast("This node ID could not be resolved.");
    return;
  }
  if (pendingEdgeSource) {
    finishEdgeCreation(nodeId);
    return;
  }
  openNodePopup(nodeId, nodeElement.getBoundingClientRect());
}

function getNodeId(nodeElement) {
  const dataNode = nodeElement.closest("[data-id]");
  if (dataNode && dataNode.dataset.id) return dataNode.dataset.id;
  const rawId = nodeElement.id || "";
  const flowchartMarker = rawId.lastIndexOf("flowchart-");
  if (flowchartMarker !== -1) {
    return rawId.slice(flowchartMarker + "flowchart-".length).replace(/-\d+$/, "");
  }
  return rawId.replace(/-\d+$/, "");
}

function openNodePopup(nodeId, nodeRect) {
  closeEdgePopup();
  const node = findNode(nodeId);
  if (!node) {
    showToast(`Definition for node ${nodeId} was not found.`);
    return;
  }
  const style = findNodeStyle(nodeId);
  selectedNodeId = nodeId;
  elements.nodeId.textContent = nodeId;
  elements.nodeLabel.value = node.label;
  elements.nodeImageUrl.value = node.imageUrl || "";
  document.getElementById("clearNodeImageButton").disabled = !node.imageUrl;
  setColorInputState(elements.fillColor, style.fill, style.explicit.has("fill"));
  setColorInputState(elements.textColor, style.color, style.explicit.has("color"));
  setColorInputState(elements.borderColor, style.stroke, style.explicit.has("stroke"));
  selectedShape = node.imageUrl ? "rectangle" : getShapeType(node.shape);
  const nodeShapeSearch = document.getElementById("nodeShapeSearch");
  nodeShapeSearch.value = "";
  filterNodeShapePicker();
  selectShape(selectedShape);
  updateSelectedSwatches();
  showNodePanel("label");
  elements.popup.hidden = false;
  updateMobileEditorBackdrop();

  const popupRect = elements.popup.getBoundingClientRect();
  let left = nodeRect.right + 12;
  let top = nodeRect.top;
  if (left + popupRect.width > window.innerWidth - 12) left = nodeRect.left - popupRect.width - 12;
  if (left < 12) left = 12;
  if (top + popupRect.height > window.innerHeight - 12) top = window.innerHeight - popupRect.height - 12;
  positionNodePopup(left, Math.max(12, top));
  const touchLayout = isCompactMobileLayout() || window.matchMedia("(pointer: coarse)").matches;
  if (!touchLayout) {
    elements.nodeLabel.focus();
    elements.nodeLabel.select();
  }
}

function positionNodePopup(left, top) {
  const popupRect = elements.popup.getBoundingClientRect();
  const margin = 12;
  const maxLeft = Math.max(margin, window.innerWidth - popupRect.width - margin);
  const maxTop = Math.max(margin, window.innerHeight - popupRect.height - margin);
  elements.popup.style.left = `${Math.min(maxLeft, Math.max(margin, left))}px`;
  elements.popup.style.top = `${Math.min(maxTop, Math.max(margin, top))}px`;
}

function startNodePopupDrag(event) {
  if (isCompactMobileLayout()) return;
  if (event.button !== 0 || event.target.closest("button")) return;
  const popupRect = elements.popup.getBoundingClientRect();
  nodePopupDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    left: popupRect.left,
    top: popupRect.top
  };
  event.currentTarget.setPointerCapture(event.pointerId);
  event.preventDefault();
}

function moveNodePopupDrag(event) {
  if (!nodePopupDrag || event.pointerId !== nodePopupDrag.pointerId) return;
  positionNodePopup(
    nodePopupDrag.left + event.clientX - nodePopupDrag.startX,
    nodePopupDrag.top + event.clientY - nodePopupDrag.startY
  );
  event.preventDefault();
}

function endNodePopupDrag(event) {
  if (!nodePopupDrag || event.pointerId !== nodePopupDrag.pointerId) return;
  if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  nodePopupDrag = null;
}

function showNodePanel(panelName) {
  document.querySelectorAll("[data-panel]").forEach(panel => { panel.hidden = panel.dataset.panel !== panelName; });
  document.querySelectorAll("[data-node-panel]").forEach(button => {
    const active = button.dataset.nodePanel === panelName;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  if (panelName === "shape") requestAnimationFrame(() => {
    document.querySelector("#nodeShapeList .node-shape-option.selected")?.scrollIntoView({ block: "nearest", inline: "center" });
  });
}

function selectShape(shape) {
  selectedShape = shape === "rectangle" ? "rect" : shape === "decision" ? "diamond" : shape;
  document.querySelectorAll("[data-shape]").forEach(button => {
    const buttonShape = button.dataset.shape === "rectangle" ? "rect" : button.dataset.shape === "decision" ? "diamond" : button.dataset.shape;
    const selected = buttonShape === selectedShape;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  document.querySelectorAll("[data-node-shape]").forEach(button => {
    const selected = button.dataset.nodeShape === selectedShape;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-selected", String(selected));
  });
  const selectedName = document.getElementById("selectedNodeShapeName");
  const catalogEntry = FLOWCHART_SHAPES.find(([catalogShape]) => catalogShape === selectedShape);
  if (selectedName) selectedName.textContent = catalogEntry ? catalogEntry[1] : selectedShape;
}

function setColorInputState(input, value, explicitlyStyled) {
  input.value = value;
  input.dataset.userSelected = explicitlyStyled ? "true" : "false";
  input.dataset.noColor = "false";
}

function getSelectedStyleParts(entries) {
  return entries.flatMap(([property, input]) => {
    if (input.dataset.userSelected !== "true" || input.dataset.noColor === "true") return [];
    return [`${property}:${input.value}`];
  });
}

function updateSelectedSwatches() {
  [["textPalette", elements.textColor], ["fillPalette", elements.fillColor], ["borderPalette", elements.borderColor], ["edgePalette", elements.edgeColor], ["subgraphTextPalette", document.getElementById("subgraphTextColor")], ["subgraphFillPalette", document.getElementById("subgraphFillColor")], ["subgraphBorderPalette", document.getElementById("subgraphBorderColor")]].forEach(([id, input]) => {
    document.querySelectorAll(`#${id} .swatch`).forEach(button => {
      const isSelected = input.dataset.userSelected === "true" && (input.dataset.noColor === "true" ? button.dataset.color === "none" : button.dataset.color.toLowerCase() === input.value.toLowerCase());
      button.classList.toggle("selected", isSelected);
      button.setAttribute("aria-pressed", String(isSelected));
    });
  });
}

function getShapeType(shape) {
  if (shape === "rect") return "rectangle";
  if (shape === "diamond") return "decision";
  if (FLOWCHART_SHAPES.some(entry => entry[0] === shape)) return shape;
  if (shape.startsWith("((")) return "circle";
  if (shape.startsWith("{")) return "decision";
  if (shape.startsWith("(")) return "rounded";
  return "rectangle";
}

function closeNodePopup() {
  const dragHandle = document.getElementById("nodePopupDragHandle");
  if (nodePopupDrag && dragHandle.hasPointerCapture(nodePopupDrag.pointerId)) dragHandle.releasePointerCapture(nodePopupDrag.pointerId);
  nodePopupDrag = null;
  elements.popup.hidden = true;
  selectedNodeId = null;
  updateMobileEditorBackdrop();
}

function updateMobileEditorBackdrop() {
  const backdrop = document.getElementById("editorBackdrop");
  if (!backdrop) return;
  const mobile = isCompactMobileLayout();
  const editorOpen = !elements.popup.hidden || !document.getElementById("edgePopup").hidden;
  const visible = mobile && editorOpen;
  backdrop.hidden = !visible;
  document.body.classList.toggle("mobile-editor-open", visible);
}

function findNodeInCode(code, nodeId) {
  const escapedId = escapeRegExp(nodeId);
  const expandedMatch = new RegExp(`\\b${escapedId}\\s*@\\{([^}]*)\\}`).exec(code);
  if (expandedMatch) {
    const shape = expandedMatch[1].match(/(?:^|,)\s*shape:\s*([\w-]+)/i);
    const image = expandedMatch[1].match(/(?:^|,)\s*img:\s*"([^"]*)"/i);
    const label = expandedMatch[1].match(/(?:^|,)\s*label:\s*"([^"]*)"/i);
    const imageHeight = expandedMatch[1].match(/(?:^|,)\s*h:\s*(\d+(?:\.\d+)?)/i);
    if (shape || image) return {
      match: expandedMatch[0],
      index: expandedMatch.index,
      shape: shape ? shape[1] : "image",
      label: label ? label[1] : nodeId,
      imageUrl: image ? image[1] : "",
      imageHeight: imageHeight ? Number(imageHeight[1]) : 80
    };
  }

  const legacyPatterns = [
    ["dbl-circ", `\\(\\(\\(\\s*"?([^"()]*)"?\\s*\\)\\)\\)`],
    ["circle", `\\(\\(\\s*"?([^"()]*)"?\\s*\\)\\)`],
    ["stadium", `\\(\\s*\\[\\s*"?([^"\\]]*)"?\\s*\\]\\s*\\)`],
    ["subproc", `\\[\\s*\\[\\s*"?([^"\\]]*)"?\\s*\\]\\s*\\]`],
    ["cyl", `\\[\\s*\\(\\s*"?([^"()]*)"?\\s*\\)\\s*\\]`],
    ["hex", `\\{\\s*\\{\\s*"?([^"{}]*)"?\\s*\\}\\s*\\}`],
    ["trap-b", `\\[\\/\\s*"?([^"\\\\]*)"?\\s*\\\\\\]`],
    ["trap-t", `\\[\\\\\\s*"?([^"\\/]*)"?\\s*\\/\\]`],
    ["lean-r", `\\[\\/\\s*"?([^"\\/]*)"?\\s*\\/\\]`],
    ["lean-l", `\\[\\\\\\s*"?([^"\\\\]*)"?\\s*\\\\\\]`],
    ["odd", `>\\s*"?([^"\\]]*)"?\\s*\\]`],
    ["diamond", `\\{\\s*"?([^"{}]*)"?\\s*\\}`],
    ["rounded", `\\(\\s*"?([^"()]*)"?\\s*\\)`],
    ["rect", `\\[\\s*"?([^"\\[\\]]*)"?\\s*\\]`]
  ];
  for (const [shape, shapePattern] of legacyPatterns) {
    const match = new RegExp(`\\b${escapedId}\\s*${shapePattern}`).exec(code);
    if (match) return { match: match[0], index: match.index, shape, label: match[1] || nodeId };
  }
  return null;
}

function findNode(nodeId) {
  return findNodeInCode(elements.editor.value, nodeId);
}

function findNodeStyle(nodeId) {
  const defaults = { fill: "#ffffff", color: "#000000", stroke: "#333333", explicit: new Set() };
  const pattern = new RegExp(`^\\s*style\\s+${escapeRegExp(nodeId)}\\s+(.+)$`, "mi");
  const match = elements.editor.value.match(pattern);
  if (!match) return defaults;
  match[1].split(",").forEach(entry => {
    const [key, value] = entry.split(":").map(part => part.trim());
    if (["fill", "color", "stroke"].includes(key) && /^#[0-9a-f]{6}$/i.test(value)) { defaults[key] = value; defaults.explicit.add(key); }
  });
  return defaults;
}

function saveNodeChanges() {
  if (!selectedNodeId) return;
  const nodeId = selectedNodeId;
  const label = elements.nodeLabel.value.trim();
  if (!label) {
    showToast("A node label cannot be empty.");
    return;
  }

  const escapedId = escapeRegExp(nodeId);
  const safeLabel = label.replace(/"/g, "&quot;");
  const node = findNode(nodeId);
  if (!node) { showToast(`Definition for node ${nodeId} was not found.`); return; }
  const activePanel = document.querySelector("[data-node-panel].active")?.dataset.nodePanel;
  const replacement = node.imageUrl && activePanel !== "shape"
    ? buildImageNode(nodeId, node.imageUrl, safeLabel, node.imageHeight)
    : `${nodeId}${buildShape(selectedShape, safeLabel)}`;
  let code = `${elements.editor.value.slice(0, node.index)}${replacement}${elements.editor.value.slice(node.index + node.match.length)}`;

  const styleParts = getSelectedStyleParts([["fill", elements.fillColor], ["color", elements.textColor], ["stroke", elements.borderColor]]);
  const stylePattern = new RegExp(`^\\s*style\\s+${escapedId}\\s+.*$`, "mi");
  if (styleParts.length) code = stylePattern.test(code) ? code.replace(stylePattern, `style ${nodeId} ${styleParts.join(",")}`) : `${code.trimEnd()}\nstyle ${nodeId} ${styleParts.join(",")}`;
  else code = code.replace(stylePattern, "").replace(/\n{3,}/g, "\n\n").trimEnd();
  closeNodePopup();
  setEditorCode(code);
  showToast(`Node ${nodeId} updated.`);
}

function saveNodeImage() {
  if (!selectedNodeId) return;
  const nodeId = selectedNodeId;
  const imageUrl = elements.nodeImageUrl.value.trim();
  const validationError = validateNodeImageUrl(imageUrl);
  if (validationError) {
    showToast(validationError);
    return;
  }

  const node = findNode(nodeId);
  if (!node) { showToast(`Definition for node ${nodeId} was not found.`); return; }
  const label = elements.nodeLabel.value.trim() || node.label || nodeId;
  const safeLabel = label.replace(/"/g, "&quot;");
  const replacement = buildImageNode(nodeId, imageUrl, safeLabel, node.imageHeight || 80);
  const code = `${elements.editor.value.slice(0, node.index)}${replacement}${elements.editor.value.slice(node.index + node.match.length)}`;
  closeNodePopup();
  setEditorCode(code);
  showToast(`Node ${nodeId} converted to an image.`);
}

function clearNodeImage() {
  if (!selectedNodeId) return;
  const nodeId = selectedNodeId;
  const node = findNode(nodeId);
  if (!node || !node.imageUrl) {
    showToast("This node does not contain an image.");
    return;
  }
  const label = elements.nodeLabel.value.trim() || node.label || nodeId;
  const safeLabel = label.replace(/"/g, "&quot;");
  const replacement = `${nodeId}${buildShape("rectangle", safeLabel)}`;
  const code = `${elements.editor.value.slice(0, node.index)}${replacement}${elements.editor.value.slice(node.index + node.match.length)}`;
  closeNodePopup();
  setEditorCode(code);
  showToast(`Image removed from node ${nodeId}.`);
}

function validateNodeImageUrl(imageUrl) {
  if (!imageUrl) return "Enter an image URL.";
  if (/["{}\r\n]/.test(imageUrl)) return "The image URL contains unsupported characters.";
  const normalized = imageUrl.toLowerCase();
  if (normalized.startsWith("javascript:") || normalized.startsWith("vbscript:")) return "That image URL is not allowed.";
  if (normalized.startsWith("data:") && !normalized.startsWith("data:image/")) return "Only image data URLs are supported.";
  return "";
}

function buildImageNode(nodeId, imageUrl, label, height = 80) {
  const safeHeight = Math.min(500, Math.max(24, Number(height) || 80));
  return `${nodeId}@{ img: "${imageUrl}", label: "${label}", pos: "t", h: ${safeHeight}, constraint: "on" }`;
}

function buildShape(shape, label) {
  if (shape === "circle") return `(("${label}"))`;
  if (shape === "rounded") return `("${label}")`;
  if (shape === "decision") return `{"${label}"}`;
  if (shape === "rectangle") return `["${label}"]`;
  return `@{ shape: ${shape}, label: "${label}" }`;
}

function beginEdgeCreation() {
  const sourceId = selectedNodeId;
  closeNodePopup();
  startEdgeCreation(sourceId);
}

function startEdgeCreation(sourceId) {
  if (!sourceId) return;
  pendingEdgeSource = sourceId;
  hideQuickAddButton();
  updateEdgeCreationMode();
}

function updateEdgeCreationMode() {
  const active = Boolean(pendingEdgeSource);
  const banner = document.getElementById("edgeCreationMode");
  banner.hidden = !active;
  elements.preview.classList.toggle("edge-creation-active", active);
  elements.preview.querySelectorAll(".edge-creation-source").forEach(element => element.classList.remove("edge-creation-source"));
  if (!active) return;
  document.getElementById("edgeCreationSource").textContent = pendingEdgeSource;
  const sourceNode = Array.from(elements.preview.querySelectorAll(RENDERED_NODE_SELECTOR)).find(node => getNodeId(node) === pendingEdgeSource);
  const sourceSubgraph = Array.from(elements.preview.querySelectorAll("g.cluster")).find(cluster => getSubgraphId(cluster) === pendingEdgeSource);
  (sourceNode || sourceSubgraph)?.classList.add("edge-creation-source");
}

function cancelEdgeCreation(showMessage = true) {
  if (!pendingEdgeSource) return;
  pendingEdgeSource = null;
  updateEdgeCreationMode();
  if (showMessage) showToast("Edge creation cancelled.");
}

function finishEdgeCreation(targetId) {
  const sourceId = pendingEdgeSource;
  if (!sourceId) return;
  if (sourceId === targetId) {
    showToast("Choose a different destination node.");
    return;
  }
  pendingEdgeSource = null;
  updateEdgeCreationMode();
  setEditorCode(`${elements.editor.value.trimEnd()}\n    ${sourceId} --> ${targetId}`);
  showToast(`Edge ${sourceId} → ${targetId} created.`);
}

function deleteSelectedNode() {
  if (!selectedNodeId) return;
  const nodeId = selectedNodeId;
  if (!window.confirm(`Delete node ${nodeId} and its connected edges?`)) return;
  const escapedId = escapeRegExp(nodeId);
  const styleLine = new RegExp(`^\\s*style\\s+${escapedId}(?:\\s|$)`);
  const lines = elements.editor.value.split(/\r?\n/);
  const allEdges = parseEdges();
  const removedEdges = allEdges.filter(edge => edge.source === nodeId || edge.target === nodeId);
  const affectedLines = new Set(removedEdges.map(edge => edge.lineIndex));
  const removedEdgeIndexes = new Set(allEdges.filter(edge => affectedLines.has(edge.lineIndex)).map(edge => edge.index));
  const edgeIndexMap = new Map();
  let nextEdgeIndex = 0;
  allEdges.forEach(edge => { if (!removedEdgeIndexes.has(edge.index)) edgeIndexMap.set(edge.index, nextEdgeIndex++); });

  const filtered = lines.flatMap((line, lineIndex) => {
    if (styleLine.test(line)) return [];
    if (/^\s*linkStyle\s+/i.test(line)) {
      const remapped = remapLinkStyleLine(line, edgeIndexMap);
      return remapped ? [remapped] : [];
    }
    if (affectedLines.has(lineIndex)) {
      const relatedIds = allEdges.filter(edge => edge.lineIndex === lineIndex).flatMap(edge => [edge.source, edge.target]);
      const definitions = [...new Set(relatedIds)].filter(id => id !== nodeId).flatMap(id => {
        const definition = findNodeInCode(line, id);
        return definition ? [`${(line.match(/^\s*/) || [""])[0]}${definition.match.trim()}`] : [];
      });
      return definitions;
    }
    const definition = findNodeInCode(line, nodeId);
    if (definition && line.trim() === definition.match.trim()) return [];
    return [line];
  });
  closeNodePopup();
  setEditorCode(filtered.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd());
  showToast(`Node ${nodeId} deleted.`);
}

function remapLinkStyleLine(line, edgeIndexMap) {
  const match = line.match(/^(\s*linkStyle\s+)([\d,\s]+)(\s+.*)$/i);
  if (!match) return line;
  const indexes = match[2].split(",").map(value => Number(value.trim())).filter(Number.isFinite);
  const remapped = indexes.flatMap(index => edgeIndexMap.has(index) ? [edgeIndexMap.get(index)] : []);
  return remapped.length ? `${match[1]}${remapped.join(",")}${match[3]}` : "";
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  toastTimer = setTimeout(() => { elements.toast.hidden = true; }, 2600);
}
