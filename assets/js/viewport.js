"use strict";

// -----------------------------------------------------------------------------
// History and preview navigation
// -----------------------------------------------------------------------------

function setEditorCode(code) {
  elements.editor.value = code;
  recordHistory();
  updateLineCount();
  updateDirectionButtons();
  scheduleAutoSave();
  renderDiagram();
}

function getDiagramName() {
  return elements.diagramName.value.trim() || "Untitled Diagram";
}

function normalizeDiagramName() {
  elements.diagramName.value = getDiagramName();
  updateDocumentTitle();
}

function updateDocumentTitle() {
  document.title = `${getDiagramName()} — Mermaid Flow Editor`;
}

function getSafeFilename() {
  const safeName = getDiagramName().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim();
  return safeName || "diagram";
}

function recordHistory() {
  clearTimeout(historyTimer);
  const code = elements.editor.value;
  if (history[historyIndex] === code) return;
  history = history.slice(0, historyIndex + 1);
  history.push(code);
  if (history.length > 100) history.shift();
  historyIndex = history.length - 1;
  updateHistoryButtons();
}

function undoCode() {
  recordHistory();
  if (historyIndex <= 0) return;
  historyIndex -= 1;
  restoreHistoryEntry();
}

function redoCode() {
  if (historyIndex >= history.length - 1) return;
  historyIndex += 1;
  restoreHistoryEntry();
}

function restoreHistoryEntry() {
  elements.editor.value = history[historyIndex];
  updateLineCount();
  updateDirectionButtons();
  updateHistoryButtons();
  renderDiagram();
}

function updateHistoryButtons() {
  elements.undoButton.disabled = historyIndex <= 0;
  elements.redoButton.disabled = historyIndex >= history.length - 1;
}

function changeZoom(amount) {
  zoom = clampZoom(zoom + amount);
  applyZoom();
}

function setFlowDirection(direction) {
  const declaration = /^(\s*(?:flowchart|graph)\s+)(TD|TB|LR|RL|BT)\b/im;
  const code = declaration.test(elements.editor.value)
    ? elements.editor.value.replace(declaration, `$1${direction}`)
    : `flowchart ${direction}\n${elements.editor.value.trimStart()}`;
  setEditorCode(code);
  showToast(direction === "TD" ? "Top-down layout applied." : "Left-to-right layout applied.");
}

function updateDirectionButtons() {
  const match = elements.editor.value.match(/^\s*(?:flowchart|graph)\s+(TD|TB|LR|RL|BT)\b/im);
  const direction = match ? match[1].toUpperCase() : "TD";
  document.getElementById("topDownButton").classList.toggle("active", direction === "TD" || direction === "TB");
  document.getElementById("leftRightButton").classList.toggle("active", direction === "LR");
  document.getElementById("topDownButton").setAttribute("aria-pressed", String(direction === "TD" || direction === "TB"));
  document.getElementById("leftRightButton").setAttribute("aria-pressed", String(direction === "LR"));
}

function applyTypedZoom() {
  const requestedZoom = Number.parseInt(elements.zoomLevel.value.replace("%", "").trim(), 10);
  if (Number.isFinite(requestedZoom)) zoom = clampZoom(requestedZoom);
  applyZoom();
}

function clampZoom(value) {
  return Math.round(Math.min(200, Math.max(10, value)) * 10) / 10;
}

function applyZoom() {
  const svg = elements.preview.querySelector("svg");
  elements.zoomLevel.value = `${Number.isInteger(zoom) ? zoom : zoom.toFixed(1)}%`;
  if (!svg) return;
  const viewBox = svg.viewBox && svg.viewBox.baseVal;
  const naturalWidth = viewBox && viewBox.width ? viewBox.width : svg.getBoundingClientRect().width;
  svg.style.width = `${Math.max(1, naturalWidth * zoom / 100)}px`;
  svg.style.maxWidth = "none";
  svg.style.height = "auto";
  svg.style.transform = `translate(${panX}px, ${panY}px)`;
}

function zoomPreviewWithWheel(event) {
  if (!elements.preview.querySelector("svg") || event.deltaY === 0) return;
  event.preventDefault();
  const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? elements.preview.clientHeight : 1;
  const factor = Math.exp(-event.deltaY * unit * 0.0015);
  setZoomAtPreviewPoint(zoom * factor, event.clientX, event.clientY);
  closeNodePopup();
  closeEdgePopup();
  closeSubgraphPopup();
  hideQuickAddButton();
}

function setZoomAtPreviewPoint(requestedZoom, clientX, clientY) {
  const nextZoom = clampZoom(requestedZoom);
  if (nextZoom === zoom) return;
  const previewRect = elements.preview.getBoundingClientRect();
  const anchorX = clientX - (previewRect.left + previewRect.width / 2);
  const anchorY = clientY - (previewRect.top + previewRect.height / 2);
  const ratio = nextZoom / zoom;
  panX = anchorX - (anchorX - panX) * ratio;
  panY = anchorY - (anchorY - panY) * ratio;
  zoom = nextZoom;
  applyZoom();
}

function trackPreviewTouchStart(event) {
  if (event.pointerType !== "touch") return;
  previewTouchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (previewTouchPoints.size < 2) return;
  if (!pinchGesture) beginPreviewPinch();
  event.preventDefault();
  event.stopPropagation();
}

function beginPreviewPinch() {
  const points = Array.from(previewTouchPoints.values()).slice(0, 2);
  const distance = getPointDistance(points[0], points[1]);
  if (!distance) return;
  cancelPreviewPan();
  cancelNodeDrag();
  cancelSubgraphDrag();
  const midpoint = getPointMidpoint(points[0], points[1]);
  pinchGesture = {
    startDistance: distance,
    startMidpoint: midpoint,
    startZoom: zoom,
    startPanX: panX,
    startPanY: panY
  };
  previewTouchPoints.forEach((point, pointerId) => {
    try { elements.preview.setPointerCapture(pointerId); } catch (error) { /* Pointer may already have ended. */ }
  });
  suppressNodeClick = true;
  suppressSubgraphClick = true;
  elements.preview.classList.add("pinching");
  closeNodePopup();
  closeEdgePopup();
  closeSubgraphPopup();
  hideQuickAddButton();
}

function trackPreviewTouchMove(event) {
  if (event.pointerType !== "touch" || !previewTouchPoints.has(event.pointerId)) return;
  previewTouchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (!pinchGesture || previewTouchPoints.size < 2) return;
  const points = Array.from(previewTouchPoints.values()).slice(0, 2);
  const distance = getPointDistance(points[0], points[1]);
  const midpoint = getPointMidpoint(points[0], points[1]);
  const nextZoom = clampZoom(pinchGesture.startZoom * distance / pinchGesture.startDistance);
  const ratio = nextZoom / pinchGesture.startZoom;
  const previewRect = elements.preview.getBoundingClientRect();
  const centerX = previewRect.left + previewRect.width / 2;
  const centerY = previewRect.top + previewRect.height / 2;
  const startAnchorX = pinchGesture.startMidpoint.x - centerX;
  const startAnchorY = pinchGesture.startMidpoint.y - centerY;
  const currentAnchorX = midpoint.x - centerX;
  const currentAnchorY = midpoint.y - centerY;
  panX = currentAnchorX - (startAnchorX - pinchGesture.startPanX) * ratio;
  panY = currentAnchorY - (startAnchorY - pinchGesture.startPanY) * ratio;
  zoom = nextZoom;
  applyZoom();
  event.preventDefault();
  event.stopPropagation();
}

function trackPreviewTouchEnd(event) {
  if (event.pointerType !== "touch") return;
  const wasPinching = Boolean(pinchGesture);
  previewTouchPoints.delete(event.pointerId);
  if (pinchGesture && previewTouchPoints.size < 2) finishPreviewPinch();
  if (wasPinching) {
    event.preventDefault();
    event.stopPropagation();
  }
}

function finishPreviewPinch() {
  pinchGesture = null;
  elements.preview.classList.remove("pinching");
  setTimeout(() => {
    suppressNodeClick = false;
    suppressSubgraphClick = false;
  }, 150);
}

function getPointDistance(first, second) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function getPointMidpoint(first, second) {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

function startPreviewPan(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target || target.closest(`${RENDERED_NODE_SELECTOR}, g.cluster, .edgePath, .flowchart-link, .edge-hit-area, [data-edge-index]`)) return;
  if (event.button !== 0) return;
  panStart = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, panX, panY };
  elements.preview.setPointerCapture(event.pointerId);
  elements.preview.classList.add("panning");
  closeNodePopup();
  hideQuickAddButton();
  event.preventDefault();
}

function movePreviewPan(event) {
  if (!panStart || event.pointerId !== panStart.pointerId) return;
  panX = panStart.panX + event.clientX - panStart.x;
  panY = panStart.panY + event.clientY - panStart.y;
  applyZoom();
}

function endPreviewPan(event) {
  if (!panStart || event.pointerId !== panStart.pointerId) return;
  cancelPreviewPan();
}

function cancelPreviewPan() {
  if (panStart && elements.preview.hasPointerCapture(panStart.pointerId)) elements.preview.releasePointerCapture(panStart.pointerId);
  panStart = null;
  elements.preview.classList.remove("panning");
}

function togglePreviewTheme() {
  previewTheme = previewTheme === "dark" ? "light" : "dark";
  try {
    localStorage.setItem(PREVIEW_THEME_KEY, previewTheme);
  } catch (error) {
    // The theme still works for this session when browser storage is unavailable.
  }
  initializeMermaid();
  updatePreviewThemeUI();
  renderDiagram();
}

function updatePreviewThemeUI() {
  const isDark = previewTheme === "dark";
  const label = isDark ? "Switch preview to light theme" : "Switch preview to dark theme";
  elements.preview.classList.toggle("dark-preview", isDark);
  elements.previewThemeButton.classList.toggle("is-dark", isDark);
  elements.previewThemeButton.setAttribute("aria-pressed", String(isDark));
  elements.previewThemeButton.title = label;
  elements.previewThemeButton.setAttribute("aria-label", label);
  elements.preview.setAttribute("data-theme", previewTheme);
}

function centerView(options = {}) {
  const svg = elements.preview.querySelector("svg");
  if (!svg) return;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const behavior = (options && options.behavior === "auto") || reduceMotion ? "auto" : "smooth";
  const compactView = isCompactMobileLayout();
  const viewControls = elements.previewPanel.querySelector(".view-controls");
  const controlsHeight = !compactView && viewControls ? viewControls.getBoundingClientRect().height : 0;
  panX = 0;
  panY = controlsHeight ? -controlsHeight / 2 : 0;
  applyZoom();
  elements.preview.scrollTo({
    left: Math.max(0, (elements.preview.scrollWidth - elements.preview.clientWidth) / 2),
    top: Math.max(0, (elements.preview.scrollHeight - elements.preview.clientHeight) / 2),
    behavior
  });
  hideQuickAddButton();
}

function fitDiagramToWindow(options = {}) {
  const svg = elements.preview.querySelector("svg");
  if (!svg) return;
  const behavior = options && options.behavior === "smooth" ? "smooth" : "auto";
  const viewBox = svg.viewBox && svg.viewBox.baseVal;
  if (!viewBox || !viewBox.width || !viewBox.height) {
    zoom = 100;
    applyZoom();
    centerView({ behavior });
    return;
  }

  const compactView = isCompactMobileLayout();
  const viewControls = elements.previewPanel.querySelector(".view-controls");
  const controlsHeight = !compactView && viewControls ? viewControls.getBoundingClientRect().height : 0;
  const availableWidth = Math.max(1, elements.preview.clientWidth - (compactView ? 28 : 56));
  const controlsClearance = controlsHeight + 48;
  const availableHeight = Math.max(1, elements.preview.clientHeight - Math.max(compactView ? 36 : 112, controlsClearance));
  const widthZoom = availableWidth / viewBox.width * 100;
  const heightZoom = availableHeight / viewBox.height * 100;
  zoom = clampZoom(Math.min(100, widthZoom, heightZoom));
  panX = 0;
  panY = 0;
  applyZoom();
  centerView({ behavior });
}

function finalizeRenderedPreview(requestId) {
  cancelAnimationFrame(pendingFitFrame);

  // Fit immediately to avoid showing the new SVG at the previous view state.
  fitDiagramToWindow({ behavior: "auto" });

  // Confirm the fit after the browser has applied the SVG's final layout.
  pendingFitFrame = requestAnimationFrame(() => {
    if (requestId !== renderSequence) return;
    fitDiagramToWindow({ behavior: "auto" });
    openPendingNodePopup();
  });
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement === elements.previewPanel) {
      await document.exitFullscreen();
    } else {
      await elements.previewPanel.requestFullscreen();
    }
  } catch (error) {
    showToast(`Fullscreen is unavailable: ${error.message || error}`);
  }
}

function handleFullscreenChange() {
  const isFullscreen = document.fullscreenElement === elements.previewPanel;
  elements.fullscreenButton.classList.toggle("is-fullscreen", isFullscreen);
  elements.fullscreenButton.title = isFullscreen ? "Exit fullscreen preview" : "Fullscreen preview";
  elements.fullscreenButton.setAttribute("aria-label", elements.fullscreenButton.title);

  // Only descendants of the fullscreen element can be displayed by browsers.
  const overlayParent = isFullscreen ? elements.previewPanel : document.body;
  overlayParent.appendChild(elements.popup);
  overlayParent.appendChild(document.getElementById("editorBackdrop"));
  overlayParent.appendChild(document.getElementById("edgePopup"));
  overlayParent.appendChild(document.getElementById("subgraphPopup"));
  overlayParent.appendChild(document.getElementById("exportModal"));
  overlayParent.appendChild(document.getElementById("diagramLibraryModal"));
  overlayParent.appendChild(document.getElementById("versionHistoryModal"));
  overlayParent.appendChild(document.getElementById("confirmModal"));
  overlayParent.appendChild(document.getElementById("mobileNoticeModal"));
  overlayParent.appendChild(document.getElementById("helpModal"));
  overlayParent.appendChild(document.getElementById("aboutModal"));
  overlayParent.appendChild(elements.quickAdd);
  hideQuickAddButton();
  closeNodePopup();
  closeEdgePopup();
  if (isFullscreen) {
    requestAnimationFrame(() => requestAnimationFrame(fitDiagramToWindow));
  } else {
    requestAnimationFrame(centerView);
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function insertTab(event) {
  if (event.key !== "Tab") return;
  event.preventDefault();
  const start = elements.editor.selectionStart;
  const end = elements.editor.selectionEnd;
  elements.editor.setRangeText("    ", start, end, "end");
  elements.editor.dispatchEvent(new Event("input"));
}
