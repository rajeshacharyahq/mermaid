"use strict";

// -----------------------------------------------------------------------------
// History and preview navigation
// -----------------------------------------------------------------------------

function setEditorCode(code, options = {}) {
  const embeddedLayout = getEmbeddedDiagramLayout(code);
  const layoutChanged = embeddedLayout && embeddedLayout !== activeLayoutEngine;
  if (embeddedLayout) activeLayoutEngine = embeddedLayout;
  elements.editor.value = String(code ?? "");
  setActiveDiagramTheme(options.diagramThemeId || null);
  recordHistory();
  updateLineCount();
  updateDirectionButtons();
  updateLayoutEngineButton();
  if (layoutChanged && window.mermaid) initializeMermaid();
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
  setActiveDiagramTheme(null);
  updateLineCount();
  updateDirectionButtons();
  updateLayoutEngineButton();
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
  const directionDetails = getFlowDirectionDetails(direction);
  if (!directionDetails) return;
  closeDirectionMenu();
  const declaration = /^(\s*(?:flowchart|graph)\s+)(TD|TB|LR|RL|BT)\b/im;
  const code = declaration.test(elements.editor.value)
    ? elements.editor.value.replace(declaration, `$1${direction}`)
    : `flowchart ${direction}\n${elements.editor.value.trimStart()}`;
  setEditorCode(code);
  if (isCompactMobileLayout()) closeMobileViewControls();
  showToast(`${directionDetails.label} direction applied.`);
}

function updateDirectionButtons() {
  const match = elements.editor.value.match(/^\s*(?:flowchart|graph)\s+(TD|TB|LR|RL|BT)\b/im);
  const direction = match && match[1].toUpperCase() === "TB" ? "TD" : (match ? match[1].toUpperCase() : "TD");
  const directionDetails = getFlowDirectionDetails(direction);
  if (!elements.directionButton || !directionDetails) return;
  elements.directionButton.dataset.flowDirection = direction;
  elements.directionButton.setAttribute("aria-label", `Choose flowchart direction. Current direction: ${directionDetails.label}`);
  elements.directionButton.title = `Direction: ${directionDetails.label}`;
  document.querySelectorAll("[data-flow-direction][role='menuitemradio']").forEach(button => {
    button.setAttribute("aria-checked", String(button.dataset.flowDirection === direction));
  });
}

function getFlowDirectionDetails(direction) {
  return {
    TD: { label: "Top to bottom" },
    BT: { label: "Bottom to top" },
    LR: { label: "Left to right" },
    RL: { label: "Right to left" }
  }[direction] || null;
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

function createDiagramThemeOptions() {
  const container = document.getElementById("diagramThemeOptions");
  container.replaceChildren();
  DIAGRAM_THEMES.forEach(theme => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "diagram-theme-option";
    button.dataset.diagramTheme = theme.id;
    button.setAttribute("role", "menuitemradio");
    button.setAttribute("aria-checked", "false");
    button.setAttribute("aria-label", `Apply ${theme.name} diagram theme`);

    const sample = document.createElement("span");
    sample.className = "diagram-theme-sample";
    sample.textContent = "Aa";
    sample.setAttribute("aria-hidden", "true");
    sample.style.setProperty("--theme-fill", theme.nodes[0].fill);
    sample.style.setProperty("--theme-border", theme.nodes[0].border);
    sample.style.setProperty("--theme-text", theme.nodes[0].text);
    sample.style.setProperty("--theme-secondary", theme.nodes[1].fill);
    sample.style.setProperty("--theme-accent", theme.nodes[2].fill);

    const name = document.createElement("span");
    name.className = "diagram-theme-option-name";
    name.textContent = theme.name;
    button.append(sample, name);
    button.addEventListener("click", () => applyDiagramTheme(theme.id));
    container.appendChild(button);
  });
}

function setActiveDiagramTheme(themeId) {
  activeDiagramThemeId = themeId;
  document.querySelectorAll("[data-diagram-theme]").forEach(button => {
    const active = button.dataset.diagramTheme === themeId;
    button.classList.toggle("selected", active);
    button.setAttribute("aria-checked", String(active));
  });
}

function setDiagramLayout(layout) {
  if (!DIAGRAM_LAYOUT_ENGINES.has(layout)) return;
  closeLayoutEngineMenu();
  const nextCode = setEmbeddedDiagramLayout(elements.editor.value, layout);
  setEditorCode(nextCode, { diagramThemeId: activeDiagramThemeId });
  const activeDiagram = getActiveDiagram();
  if (activeDiagram) {
    activeDiagram.layout = layout;
    activeDiagram.layoutInCode = true;
  }
  if (isCompactMobileLayout()) closeMobileViewControls();
  showToast(`${layout === "elk" ? "Adaptive" : "Hierarchical"} layout applied.`);
}

function toggleDirectionMenu(event) {
  event.stopPropagation();
  const opening = elements.directionMenu.hidden;
  if (!opening) {
    closeDirectionMenu();
    return;
  }
  closeLayoutEngineMenu();
  closeDiagramThemeMenu();
  updateDirectionButtons();
  elements.directionMenu.hidden = false;
  elements.directionButton.setAttribute("aria-expanded", "true");
  positionDirectionMenu();
  elements.directionMenu.querySelector('[aria-checked="true"]')?.focus({ preventScroll: true });
}

function closeDirectionMenu(returnFocus = false) {
  if (!elements.directionMenu || elements.directionMenu.hidden) return;
  elements.directionMenu.hidden = true;
  elements.directionButton.setAttribute("aria-expanded", "false");
  if (returnFocus) elements.directionButton.focus({ preventScroll: true });
}

function positionDirectionMenu() {
  if (!elements.directionMenu.hidden && isCompactMobileLayout() && window.innerWidth > window.innerHeight) {
    const buttonRect = elements.directionButton.getBoundingClientRect();
    const menuRect = elements.directionMenu.getBoundingClientRect();
    const controlsRect = document.getElementById("previewViewControls").getBoundingClientRect();
    const margin = 10;
    let left = controlsRect.left - menuRect.width - margin;
    if (left < margin) left = controlsRect.right + margin;
    const maxLeft = Math.max(margin, window.innerWidth - menuRect.width - margin);
    const maxTop = Math.max(margin, window.innerHeight - menuRect.height - margin);
    const desiredTop = buttonRect.top + buttonRect.height / 2 - menuRect.height / 2;
    elements.directionMenu.style.left = `${Math.min(maxLeft, Math.max(margin, left))}px`;
    elements.directionMenu.style.top = `${Math.min(maxTop, Math.max(margin, desiredTop))}px`;
    return;
  }
  positionPreviewControlMenu(elements.directionMenu, elements.directionButton);
}

function updateLayoutEngineButton() {
  const layout = activeLayoutEngine;
  const layoutName = layout === "elk" ? "Adaptive" : "Hierarchical";
  if (!elements.layoutEngineButton) return;
  elements.layoutEngineButton.dataset.layoutEngine = layout;
  elements.layoutEngineButton.setAttribute("aria-label", `Choose diagram layout. Current layout: ${layoutName}`);
  elements.layoutEngineButton.title = `Layout: ${layoutName}`;
  document.querySelectorAll("[data-layout-engine]").forEach(button => {
    button.setAttribute("aria-checked", String(button.dataset.layoutEngine === layout));
  });
}

function toggleLayoutEngineMenu(event) {
  event.stopPropagation();
  const opening = elements.layoutEngineMenu.hidden;
  if (!opening) {
    closeLayoutEngineMenu();
    return;
  }
  closeDirectionMenu();
  closeDiagramThemeMenu();
  updateLayoutEngineButton();
  elements.layoutEngineMenu.hidden = false;
  elements.layoutEngineButton.setAttribute("aria-expanded", "true");
  positionLayoutEngineMenu();
  elements.layoutEngineMenu.querySelector('[aria-checked="true"]')?.focus({ preventScroll: true });
}

function closeLayoutEngineMenu(returnFocus = false) {
  if (!elements.layoutEngineMenu || elements.layoutEngineMenu.hidden) return;
  elements.layoutEngineMenu.hidden = true;
  elements.layoutEngineButton.setAttribute("aria-expanded", "false");
  if (returnFocus) elements.layoutEngineButton.focus({ preventScroll: true });
}

function positionLayoutEngineMenu() {
  positionPreviewControlMenu(elements.layoutEngineMenu, elements.layoutEngineButton);
}

function toggleDiagramThemeMenu(event) {
  event.stopPropagation();
  const opening = elements.diagramThemeMenu.hidden;
  if (!opening) {
    closeDiagramThemeMenu();
    return;
  }
  closeDirectionMenu();
  closeLayoutEngineMenu();
  elements.diagramThemeMenu.hidden = false;
  elements.diagramThemeButton.setAttribute("aria-expanded", "true");
  positionDiagramThemeMenu();
  const activeOption = activeDiagramThemeId
    ? elements.diagramThemeMenu.querySelector(`[data-diagram-theme="${activeDiagramThemeId}"]`)
    : null;
  (activeOption || elements.diagramThemeMenu.querySelector("[role='menuitemradio']"))?.focus({ preventScroll: true });
}

function closeDiagramThemeMenu(returnFocus = false) {
  if (!elements.diagramThemeMenu || elements.diagramThemeMenu.hidden) return;
  elements.diagramThemeMenu.hidden = true;
  elements.diagramThemeButton.setAttribute("aria-expanded", "false");
  if (returnFocus) elements.diagramThemeButton.focus({ preventScroll: true });
}

function positionDiagramThemeMenu() {
  positionPreviewControlMenu(elements.diagramThemeMenu, elements.diagramThemeButton);
}

function positionPreviewControlMenu(menu, button) {
  if (menu.hidden) return;
  const panelRect = elements.previewPanel.getBoundingClientRect();
  const buttonRect = button.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const margin = 10;
  const maxLeft = Math.max(margin, panelRect.width - menuRect.width - margin);
  const desiredLeft = buttonRect.left - panelRect.left + buttonRect.width / 2 - menuRect.width / 2;
  let top = buttonRect.top - panelRect.top - menuRect.height - margin;
  if (top < margin) top = buttonRect.bottom - panelRect.top + margin;
  const maxTop = Math.max(margin, panelRect.height - menuRect.height - margin);
  menu.style.left = `${Math.min(maxLeft, Math.max(margin, desiredLeft))}px`;
  menu.style.top = `${Math.min(maxTop, Math.max(margin, top))}px`;
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
    openPendingEdgePopup();
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
