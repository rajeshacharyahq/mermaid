"use strict";

// -----------------------------------------------------------------------------
// Application startup and event wiring
// -----------------------------------------------------------------------------

let previewResizeObserver = null;
let pendingPreviewResizeFit = 0;

function isCompactMobileLayout() {
  return window.matchMedia("(max-width: 700px), (max-width: 1050px) and (max-height: 600px) and (orientation: landscape)").matches;
}

function initializeApp() {
  restoreLocalSession();
  applyInitialMobileEditorState();
  history = [elements.editor.value];
  historyIndex = 0;
  bindEvents();
  maybeShowMobileNotice();
  updateLineCount();
  updateDirectionButtons();
  updateLayoutEngineButton();
  updateHistoryButtons();
  updateDocumentTitle();

  if (!window.mermaid) {
    showError("Mermaid could not be loaded. Place mermaid.min.js in the vendor folder.");
    return;
  }

  const elkLayouts = window.mermaidElkLayouts && window.mermaidElkLayouts.default;
  if (!Array.isArray(elkLayouts)) {
    showError("ELK layout could not be loaded. Check vendor/mermaid-layout-elk/mermaid-layout-elk.iife.min.js.");
    return;
  }
  mermaid.registerLayoutLoaders(elkLayouts);

  initializeMermaid();
  updatePreviewThemeUI();
  renderDiagram().then(() => {
    renderShapeThumbnails();
    renderNodeShapePickerThumbnails();
  });
}

function initializeMermaid() {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: previewTheme === "dark" ? "dark" : "default",
    layout: activeLayoutEngine,
    flowchart: { htmlLabels: false, useMaxWidth: true }
  });
}

function bindEvents() {
  document.getElementById("mobileMenuButton").addEventListener("click", toggleMobileToolbar);
  document.getElementById("mobileToolbar").addEventListener("click", handleMobileToolbarAction);
  document.getElementById("mobileViewControlsButton").addEventListener("click", toggleMobileViewControls);
  document.getElementById("renderButton").addEventListener("click", renderDiagram);
  document.getElementById("diagramLibraryButton").addEventListener("click", openDiagramLibrary);
  document.getElementById("closeDiagramLibraryButton").addEventListener("click", closeDiagramLibrary);
  document.querySelectorAll(".close-diagram-library").forEach(button => button.addEventListener("click", closeDiagramLibrary));
  document.getElementById("newDiagramButton").addEventListener("click", createNewDiagram);
  document.getElementById("diagramLibraryModal").addEventListener("click", event => { if (event.target === event.currentTarget) closeDiagramLibrary(); });
  document.getElementById("closeVersionHistoryButton").addEventListener("click", closeVersionHistory);
  document.querySelectorAll(".close-version-history").forEach(button => button.addEventListener("click", closeVersionHistory));
  document.getElementById("versionHistoryModal").addEventListener("click", event => { if (event.target === event.currentTarget) closeVersionHistory(); });
  document.getElementById("createSnapshotButton").addEventListener("click", createManualSnapshot);
  document.getElementById("mmdMenuButton").addEventListener("click", toggleMmdMenu);
  document.getElementById("templateMenuButton").addEventListener("click", toggleTemplateMenu);
  document.querySelectorAll("[data-template]").forEach(button => button.addEventListener("click", () => loadDiagramTemplate(button.dataset.template)));
  document.getElementById("downloadButton").addEventListener("click", () => { closeMmdMenu(); downloadCode(); });
  document.getElementById("importButton").addEventListener("click", () => { closeMmdMenu(); elements.fileInput.click(); });
  document.getElementById("copyButton").addEventListener("click", copyCode);
  document.getElementById("toggleCodePanelButton").addEventListener("click", toggleCodePanel);
  document.getElementById("toggleShapeLibraryButton").addEventListener("click", toggleShapeLibrary);
  document.getElementById("exportMenuButton").addEventListener("click", toggleExportMenu);
  document.querySelectorAll("[data-export-format]").forEach(button => button.addEventListener("click", () => openExportModal(button.dataset.exportFormat)));
  document.getElementById("closeExportModalButton").addEventListener("click", closeExportModal);
  document.getElementById("cancelExportButton").addEventListener("click", closeExportModal);
  document.getElementById("confirmExportButton").addEventListener("click", exportWithOptions);
  document.getElementById("exportQuality").addEventListener("input", event => { document.getElementById("exportQualityValue").textContent = `${event.target.value}%`; });
  document.getElementById("exportScale").addEventListener("change", updateExportSizeSummary);
  document.getElementById("exportPadding").addEventListener("input", updateExportSizeSummary);
  document.getElementById("pdfPageSize").addEventListener("change", updateExportSizeSummary);
  document.getElementById("pdfOrientation").addEventListener("change", updateExportSizeSummary);
  document.getElementById("transparentBackground").addEventListener("change", updateExportBackgroundControls);
  document.getElementById("clearExportBackgroundButton").addEventListener("click", toggleClearExportBackground);
  document.getElementById("exportBackground").addEventListener("input", () => {
    document.getElementById("transparentBackground").checked = false;
    updateExportBackgroundControls();
  });
  document.getElementById("clearButton").addEventListener("click", clearDiagram);
  document.getElementById("dismissMobileNoticeButton").addEventListener("click", closeMobileNotice);
  document.getElementById("mobileNoticeModal").addEventListener("click", event => { if (event.target === event.currentTarget) closeMobileNotice(); });
  document.getElementById("cancelConfirmButton").addEventListener("click", closeConfirmationModal);
  document.getElementById("confirmActionButton").addEventListener("click", confirmPendingAction);
  document.getElementById("confirmModal").addEventListener("click", event => { if (event.target === event.currentTarget) closeConfirmationModal(); });
  document.getElementById("helpButton").addEventListener("click", () => openInfoModal("helpModal"));
  document.getElementById("aboutButton").addEventListener("click", () => openInfoModal("aboutModal"));
  document.querySelectorAll(".close-info-modal").forEach(button => button.addEventListener("click", closeInfoModals));
  document.querySelectorAll("#helpModal, #aboutModal").forEach(modal => modal.addEventListener("click", event => { if (event.target === modal) closeInfoModals(); }));
  document.getElementById("closePopupButton").addEventListener("click", closeNodePopup);
  document.getElementById("nodeGoToCodeButton").addEventListener("click", goToSelectedNodeCode);
  document.getElementById("editorBackdrop").addEventListener("click", () => {
    closeNodePopup();
    closeEdgePopup();
  });
  const nodePopupDragHandle = document.getElementById("nodePopupDragHandle");
  nodePopupDragHandle.addEventListener("pointerdown", startNodePopupDrag);
  nodePopupDragHandle.addEventListener("pointermove", moveNodePopupDrag);
  nodePopupDragHandle.addEventListener("pointerup", endNodePopupDrag);
  nodePopupDragHandle.addEventListener("pointercancel", endNodePopupDrag);
  nodePopupDragHandle.addEventListener("lostpointercapture", endNodePopupDrag);
  document.getElementById("deleteNodeButton").addEventListener("click", deleteSelectedNode);
  document.getElementById("createEdgeButton").addEventListener("click", beginEdgeCreation);
  document.getElementById("cancelEdgeCreationButton").addEventListener("click", () => cancelEdgeCreation());
  document.getElementById("closeEdgePopupButton").addEventListener("click", closeEdgePopup);
  document.getElementById("edgeGoToCodeButton").addEventListener("click", goToSelectedEdgeCode);
  document.getElementById("saveEdgeButton").addEventListener("click", saveEdgeChanges);
  document.getElementById("deleteEdgeButton").addEventListener("click", deleteSelectedEdge);
  document.getElementById("closeSubgraphPopupButton").addEventListener("click", closeSubgraphPopup);
  document.getElementById("subgraphGoToCodeButton").addEventListener("click", goToSelectedSubgraphCode);
  document.querySelectorAll(".apply-subgraph-button").forEach(button => button.addEventListener("click", saveSubgraphTitle));
  document.querySelectorAll("[data-subgraph-panel]").forEach(button => button.addEventListener("click", () => showSubgraphPanel(button.dataset.subgraphPanel)));
  document.getElementById("deleteSubgraphButton").addEventListener("click", deleteSelectedSubgraph);
  document.getElementById("createSubgraphEdgeButton").addEventListener("click", beginSubgraphEdge);
  document.getElementById("subgraphTitleInput").addEventListener("keydown", event => { if (event.key === "Enter") saveSubgraphTitle(); });
  document.querySelectorAll(".apply-node-button").forEach(button => button.addEventListener("click", saveNodeChanges));
  document.getElementById("nodeLabelBoldButton").addEventListener("click", () => toggleNodeLabelFormatting("bold"));
  document.getElementById("nodeLabelItalicButton").addEventListener("click", () => toggleNodeLabelFormatting("italic"));
  [elements.nodeLabel, document.getElementById("edgeLabel")].forEach(textarea => {
    textarea.addEventListener("input", () => autoResizeLabelTextarea(textarea));
  });
  elements.nodeLabel.addEventListener("keydown", event => {
    if (!(event.ctrlKey || event.metaKey) || !["b", "i"].includes(event.key.toLowerCase())) return;
    event.preventDefault();
    toggleNodeLabelFormatting(event.key.toLowerCase() === "b" ? "bold" : "italic");
  });
  document.getElementById("saveNodeImageButton").addEventListener("click", saveNodeImage);
  document.getElementById("clearNodeImageButton").addEventListener("click", clearNodeImage);
  elements.nodeImageUrl.addEventListener("keydown", event => { if (event.key === "Enter") saveNodeImage(); });
  document.getElementById("saveNodeLinkButton").addEventListener("click", saveNodeLink);
  document.getElementById("removeNodeLinkButton").addEventListener("click", removeNodeLink);
  document.getElementById("nodeLinkUrl").addEventListener("keydown", event => { if (event.key === "Enter") saveNodeLink(); });
  document.querySelectorAll("[data-node-panel]").forEach(button => button.addEventListener("click", () => showNodePanel(button.dataset.nodePanel)));
  document.querySelectorAll("[data-shape]").forEach(button => button.addEventListener("click", () => {
    selectShape(button.dataset.shape);
    applyNodeVisualChangesLive();
  }));
  elements.fileInput.addEventListener("change", importCode);
  elements.editor.addEventListener("input", handleEditorInput);
  elements.editor.addEventListener("scroll", syncEditorLineNumbers);
  elements.editor.addEventListener("keydown", insertTab);
  elements.diagramName.addEventListener("input", () => { updateDocumentTitle(); scheduleAutoSave(); });
  elements.diagramName.addEventListener("blur", normalizeDiagramName);
  elements.preview.addEventListener("click", handlePreviewClick);
  elements.preview.addEventListener("keydown", handlePreviewKeydown);
  elements.preview.addEventListener("mouseover", handlePreviewMouseOver);
  elements.preview.addEventListener("mouseout", handlePreviewMouseOut);
  elements.preview.addEventListener("pointerdown", handleDiagramPointerDown);
  elements.preview.addEventListener("pointermove", handleDiagramPointerMove);
  elements.preview.addEventListener("pointerup", handleDiagramPointerUp);
  elements.preview.addEventListener("pointercancel", handleDiagramPointerCancel);
  elements.quickAdd.addEventListener("click", createConnectedNode);
  elements.quickAdd.addEventListener("mouseenter", () => clearTimeout(quickAddHideTimer));
  elements.quickAdd.addEventListener("mouseleave", scheduleQuickAddHide);
  document.addEventListener("keydown", handleKeyboardShortcuts);
  document.addEventListener("keydown", trapModalFocus);
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    closeDirectionMenu();
    closeLayoutEngineMenu();
    closeDiagramThemeMenu();
    closeMobileToolbar();
    closeMobileViewControls();
  });
  window.addEventListener("resize", () => {
    if (!isCompactMobileLayout()) {
      closeMobileToolbar();
      closeMobileViewControls();
    }
    updateMobileEditorBackdrop();
    updateMainSeparatorOrientation();
    if (!elements.directionMenu.hidden) positionDirectionMenu();
    if (!elements.layoutEngineMenu.hidden) positionLayoutEngineMenu();
    if (!elements.diagramThemeMenu.hidden) positionDiagramThemeMenu();
    if (document.fullscreenElement === elements.previewPanel) fitDiagramToWindow();
  });
  elements.preview.addEventListener("scroll", hideQuickAddButton);
  elements.preview.addEventListener("dragover", handleShapeDragOver);
  elements.preview.addEventListener("dragleave", handleShapeDragLeave);
  elements.preview.addEventListener("drop", handleShapeDrop);
  elements.preview.addEventListener("pointerdown", startPreviewPan);
  elements.preview.addEventListener("pointermove", movePreviewPan);
  elements.preview.addEventListener("pointerup", endPreviewPan);
  elements.preview.addEventListener("pointercancel", endPreviewPan);
  elements.preview.addEventListener("pointerdown", trackPreviewTouchStart, true);
  elements.preview.addEventListener("pointermove", trackPreviewTouchMove, true);
  elements.preview.addEventListener("pointerup", trackPreviewTouchEnd, true);
  elements.preview.addEventListener("pointercancel", trackPreviewTouchEnd, true);
  elements.preview.addEventListener("wheel", zoomPreviewWithWheel, { passive: false });
  elements.undoButton.addEventListener("click", undoCode);
  elements.redoButton.addEventListener("click", redoCode);
  document.getElementById("zoomOutButton").addEventListener("click", () => changeZoom(-10));
  document.getElementById("zoomInButton").addEventListener("click", () => changeZoom(10));
  elements.zoomLevel.addEventListener("change", applyTypedZoom);
  elements.zoomLevel.addEventListener("blur", applyTypedZoom);
  elements.zoomLevel.addEventListener("focus", () => elements.zoomLevel.select());
  elements.zoomLevel.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyTypedZoom();
      elements.zoomLevel.blur();
    }
  });
  elements.directionButton.addEventListener("click", toggleDirectionMenu);
  document.querySelectorAll("[data-flow-direction][role='menuitemradio']").forEach(button => button.addEventListener("click", () => setFlowDirection(button.dataset.flowDirection)));
  document.getElementById("fitViewButton").addEventListener("click", fitDiagramToWindow);
  elements.layoutEngineButton.addEventListener("click", toggleLayoutEngineMenu);
  document.getElementById("closeLayoutEngineMenuButton").addEventListener("click", () => closeLayoutEngineMenu(true));
  document.querySelectorAll("[data-layout-engine]").forEach(button => button.addEventListener("click", () => setDiagramLayout(button.dataset.layoutEngine)));
  elements.diagramThemeButton.addEventListener("click", toggleDiagramThemeMenu);
  document.getElementById("closeDiagramThemeMenuButton").addEventListener("click", () => closeDiagramThemeMenu(true));
  elements.previewThemeButton.addEventListener("click", togglePreviewTheme);
  elements.fullscreenButton.addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", handleFullscreenChange);
  window.addEventListener("beforeunload", autoSaveDiagram);
  document.addEventListener("click", event => {
    if (!event.target.closest(".toolbar-dropdown")) {
      document.getElementById("exportMenu").hidden = true;
      document.getElementById("exportMenuButton").setAttribute("aria-expanded", "false");
      closeMmdMenu();
      closeTemplateMenu();
    }
    if (!event.target.closest(".app-header")) closeMobileToolbar();
    if (!event.target.closest("#previewViewControls, #mobileViewControlsButton")) closeMobileViewControls();
    if (!event.target.closest("#directionMenu, #directionButton")) closeDirectionMenu();
    if (!event.target.closest("#layoutEngineMenu, #layoutEngineButton")) closeLayoutEngineMenu();
    if (!event.target.closest("#diagramThemeMenu, #diagramThemeButton")) closeDiagramThemeMenu();
  });
  createDiagramThemeOptions();
  createColorPalette("textPalette", elements.textColor, "text");
  createColorPalette("fillPalette", elements.fillColor, "fill");
  createColorPalette("borderPalette", elements.borderColor, "border");
  createColorPalette("edgePalette", elements.edgeColor, "edge");
  [elements.fillColor, elements.textColor, elements.borderColor].forEach(input => {
    input.addEventListener("change", applyNodeVisualChangesLive);
  });
  elements.edgeColor.addEventListener("change", applyEdgeVisualChangesLive);
  ["edgeStyle", "edgeStartStyle", "edgeEndStyle"].forEach(id => {
    document.getElementById(id).addEventListener("change", applyEdgeVisualChangesLive);
  });
  elements.edgeThickness.addEventListener("input", () => {
    updateEdgeThicknessDisplay();
    scheduleEdgeVisualUpdate();
  });
  createColorPalette("subgraphTextPalette", document.getElementById("subgraphTextColor"), "text");
  createColorPalette("subgraphFillPalette", document.getElementById("subgraphFillColor"), "fill");
  createColorPalette("subgraphBorderPalette", document.getElementById("subgraphBorderColor"), "border");
  createShapeLibrary();
  createNodeShapePicker();
  const shapeSearch = document.getElementById("shapeSearch");
  shapeSearch.addEventListener("input", filterShapeLibrary);
  shapeSearch.addEventListener("search", filterShapeLibrary);
  initializeResizeHandles();
  initializePreviewResizeObserver();
  setupAccessibleMenu("templateMenuButton", "templateMenu");
  setupAccessibleMenu("mmdMenuButton", "mmdMenu");
  setupAccessibleMenu("exportMenuButton", "exportMenu");
}

function toggleMobileToolbar() {
  const toolbar = document.getElementById("mobileToolbar");
  const button = document.getElementById("mobileMenuButton");
  const open = !toolbar.classList.contains("mobile-menu-open");
  toolbar.classList.toggle("mobile-menu-open", open);
  button.setAttribute("aria-expanded", String(open));
  button.setAttribute("aria-label", open ? "Close application menu" : "Open application menu");
  button.title = open ? "Close menu" : "Open menu";
  if (!open) {
    closeMmdMenu();
    closeTemplateMenu();
    document.getElementById("exportMenu").hidden = true;
    document.getElementById("exportMenuButton").setAttribute("aria-expanded", "false");
  }
}

function closeMobileToolbar() {
  const toolbar = document.getElementById("mobileToolbar");
  const button = document.getElementById("mobileMenuButton");
  if (!toolbar || !button || !toolbar.classList.contains("mobile-menu-open")) return;
  toolbar.classList.remove("mobile-menu-open");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-label", "Open application menu");
  button.title = "Open menu";
}

function handleMobileToolbarAction(event) {
  if (!isCompactMobileLayout()) return;
  const button = event.target.closest("button");
  if (!button || button.hasAttribute("aria-haspopup")) return;
  closeMobileToolbar();
}

function toggleMobileViewControls() {
  if (!isCompactMobileLayout()) return;
  const controls = document.getElementById("previewViewControls");
  const button = document.getElementById("mobileViewControlsButton");
  const open = controls.classList.contains("mobile-controls-collapsed");
  controls.classList.toggle("mobile-controls-collapsed", !open);
  button.setAttribute("aria-expanded", String(open));
  button.setAttribute("aria-label", open ? "Close preview controls" : "Open preview controls");
  button.title = open ? "Close preview controls" : "Open preview controls";
}

function closeMobileViewControls() {
  const controls = document.getElementById("previewViewControls");
  const button = document.getElementById("mobileViewControlsButton");
  if (!controls || !button) return;
  controls.classList.add("mobile-controls-collapsed");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-label", "Open preview controls");
  button.title = "Open preview controls";
}

function setupAccessibleMenu(buttonId, menuId) {
  const button = document.getElementById(buttonId);
  const menu = document.getElementById(menuId);
  const getItems = () => Array.from(menu.querySelectorAll('[role="menuitem"]:not(:disabled)'));

  button.addEventListener("keydown", event => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    if (menu.hidden) button.click();
    const items = getItems();
    (event.key === "ArrowDown" ? items[0] : items[items.length - 1])?.focus();
  });

  menu.addEventListener("keydown", event => {
    const items = getItems();
    const currentIndex = items.indexOf(document.activeElement);
    let nextIndex = null;
    if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % items.length;
    if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + items.length) % items.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = items.length - 1;
    if (nextIndex !== null && items.length) {
      event.preventDefault();
      items[nextIndex].focus();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      menu.hidden = true;
      button.setAttribute("aria-expanded", "false");
      button.focus();
    }
  });
}

function openModal(modal, initialFocus, returnFocus = document.activeElement) {
  if (modal.hidden) modalFocusOrigins.set(modal, returnFocus);
  modal.hidden = false;
  const focusTarget = initialFocus || getFocusableElements(modal)[0] || modal;
  if (focusTarget === modal && !modal.hasAttribute("tabindex")) modal.tabIndex = -1;
  focusTarget.focus({ preventScroll: true });
}

function closeModal(modal, restoreFocus = true, fallbackFocus = null) {
  if (modal.hidden) return;
  modal.hidden = true;
  const origin = modalFocusOrigins.get(modal);
  modalFocusOrigins.delete(modal);
  if (!restoreFocus) return;
  const target = isVisibleFocusable(origin) ? origin : fallbackFocus;
  if (isVisibleFocusable(target)) target.focus({ preventScroll: true });
}

function getFocusableElements(container) {
  const selector = 'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
  return Array.from(container.querySelectorAll(selector)).filter(isVisibleFocusable);
}

function isVisibleFocusable(element) {
  return element instanceof HTMLElement && element.isConnected && !element.hidden && !element.closest("[hidden]") && element.getClientRects().length > 0;
}

function getTopmostOpenModal() {
  return Array.from(document.querySelectorAll(".modal-backdrop:not([hidden])")).at(-1) || null;
}

function trapModalFocus(event) {
  if (event.key !== "Tab") return;
  const modal = getTopmostOpenModal();
  if (!modal) return;
  const focusable = getFocusableElements(modal);
  if (!focusable.length) {
    event.preventDefault();
    modal.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!modal.contains(document.activeElement)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function handleKeyboardShortcuts(event) {
  const key = event.key.toLowerCase();
  const primaryModifier = event.ctrlKey || event.metaKey;
  const typing = isTypingTarget(event.target);

  if (event.key === "Escape") {
    event.preventDefault();
    const openModal = getTopmostOpenModal();
    if (openModal) {
      closeTopmostModal(openModal);
      return;
    }
    closeNodePopup();
    closeEdgePopup();
    closeExportModal();
    closeSubgraphPopup();
    closeInfoModals();
    closeConfirmationModal();
    closeMobileNotice();
    closeDiagramLibrary();
    closeVersionHistory();
    if (pendingEdgeSource) cancelEdgeCreation();
    return;
  }

  if (hasOpenModal()) return;

  if (primaryModifier && event.key === "Enter" && (!typing || event.target === elements.editor)) {
    event.preventDefault();
    renderDiagram();
    return;
  }

  if (primaryModifier && key === "z" && (!typing || event.target === elements.editor)) {
    event.preventDefault();
    if (event.shiftKey) redoCode();
    else undoCode();
    return;
  }

  if (primaryModifier && key === "y" && (!typing || event.target === elements.editor)) {
    event.preventDefault();
    redoCode();
    return;
  }

  if (primaryModifier && event.shiftKey && key === "e" && !typing) {
    event.preventDefault();
    document.getElementById("exportMenuButton").click();
    return;
  }

  if (!primaryModifier && !event.altKey && !event.shiftKey && key === "f" && !typing) {
    event.preventDefault();
    fitDiagramToWindow();
    return;
  }

  const deleteKey = event.key === "Delete" || event.key === "Backspace";
  const modifiedDelete = primaryModifier && event.key === "Delete";
  if (deleteKey && (!typing || modifiedDelete) && deleteSelectedCanvasItem()) event.preventDefault();
}

function closeTopmostModal(modal) {
  if (modal.id === "confirmModal") closeConfirmationModal();
  else if (modal.id === "exportModal") closeExportModal();
  else if (modal.id === "versionHistoryModal") closeVersionHistory();
  else if (modal.id === "diagramLibraryModal") closeDiagramLibrary();
  else if (modal.id === "mobileNoticeModal") closeMobileNotice();
  else if (modal.id === "helpModal" || modal.id === "aboutModal") closeInfoModals();
}

function isTypingTarget(target) {
  return target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function hasOpenModal() {
  return Boolean(document.querySelector(".modal-backdrop:not([hidden])"));
}

function deleteSelectedCanvasItem() {
  if (selectedEdge) { deleteSelectedEdge(); return true; }
  if (selectedNodeId) { deleteSelectedNode(); return true; }
  if (selectedSubgraphId) { deleteSelectedSubgraph(); return true; }
  return false;
}

function toggleCodePanel() {
  const editorPanel = document.querySelector(".editor-panel");
  const content = document.getElementById("codePanelContent");
  const collapsed = !content.hidden;
  content.hidden = collapsed;
  editorPanel.classList.toggle("code-collapsed", collapsed);
  updateFoldButton(document.getElementById("toggleCodePanelButton"), !collapsed, "Mermaid code");
  updateEditorFoldLayout();
}

function toggleShapeLibrary() {
  const library = document.querySelector(".shape-library");
  const grid = document.getElementById("shapeLibraryGrid");
  const tools = document.getElementById("shapeLibraryTools");
  const collapsed = !grid.hidden;
  grid.hidden = collapsed;
  tools.hidden = collapsed;
  library.classList.toggle("shapes-collapsed", collapsed);
  updateFoldButton(document.getElementById("toggleShapeLibraryButton"), !collapsed, "Flowchart shapes");
  updateEditorFoldLayout();
}

function updateFoldButton(button, expanded, sectionName) {
  const action = expanded ? "Collapse" : "Expand";
  button.setAttribute("aria-expanded", String(expanded));
  button.title = `${action} ${sectionName}`;
  button.setAttribute("aria-label", button.title);
}

function applyInitialMobileEditorState() {
  if (!window.matchMedia("(max-width: 700px) and (orientation: portrait)").matches) return;
  const editorPanel = document.querySelector(".editor-panel");
  const codeContent = document.getElementById("codePanelContent");
  const shapeLibrary = document.querySelector(".shape-library");
  const shapeGrid = document.getElementById("shapeLibraryGrid");
  const shapeTools = document.getElementById("shapeLibraryTools");

  codeContent.hidden = true;
  editorPanel.classList.add("code-collapsed");
  updateFoldButton(document.getElementById("toggleCodePanelButton"), false, "Mermaid code");

  shapeGrid.hidden = true;
  shapeTools.hidden = true;
  shapeLibrary.classList.add("shapes-collapsed");
  updateFoldButton(document.getElementById("toggleShapeLibraryButton"), false, "Flowchart shapes");
  updateEditorFoldLayout();
}

function updateEditorFoldLayout() {
  const codeCollapsed = document.getElementById("codePanelContent").hidden;
  const shapesCollapsed = document.getElementById("shapeLibraryGrid").hidden;
  const resizeHandle = document.getElementById("shapeResizeHandle");
  const mainResizeHandle = document.getElementById("mainResizeHandle");
  const workspace = document.querySelector(".workspace");
  const bothCollapsed = codeCollapsed && shapesCollapsed;
  const collapsedStateChanged = workspace.classList.contains("editor-sections-collapsed") !== bothCollapsed;
  resizeHandle.hidden = codeCollapsed || shapesCollapsed;
  resizeHandle.tabIndex = resizeHandle.hidden ? -1 : 0;
  mainResizeHandle.hidden = bothCollapsed;
  mainResizeHandle.tabIndex = bothCollapsed ? -1 : 0;
  workspace.classList.toggle("editor-sections-collapsed", bothCollapsed);

  if (collapsedStateChanged) {
    closeNodePopup();
    requestAnimationFrame(() => requestAnimationFrame(() => fitDiagramToWindow({ behavior: "auto" })));
  }
}

function isStackedWorkspaceLayout() {
  return window.matchMedia("(max-width: 1050px)").matches
    && !window.matchMedia("(orientation: landscape)").matches;
}

function isCompactLandscapeLayout() {
  return window.matchMedia("(max-width: 1050px) and (orientation: landscape)").matches;
}

function initializePreviewResizeObserver() {
  if (!window.ResizeObserver || previewResizeObserver) return;
  let previousWidth = 0;
  let previousHeight = 0;
  previewResizeObserver = new ResizeObserver(entries => {
    const entry = entries[0];
    if (!entry) return;
    const width = Math.round(entry.contentRect.width);
    const height = Math.round(entry.contentRect.height);
    if (Math.abs(width - previousWidth) < 2 && Math.abs(height - previousHeight) < 2) return;
    previousWidth = width;
    previousHeight = height;
    cancelAnimationFrame(pendingPreviewResizeFit);
    pendingPreviewResizeFit = requestAnimationFrame(() => {
      pendingPreviewResizeFit = 0;
      fitDiagramToWindow({ behavior: "auto" });
    });
  });
  previewResizeObserver.observe(elements.preview);
}

function initializeResizeHandles() {
  const workspace = document.querySelector(".workspace");
  const editorPanel = document.querySelector(".editor-panel");
  const mainHandle = document.getElementById("mainResizeHandle");
  const shapeHandle = document.getElementById("shapeResizeHandle");

  makeDraggableDivider(mainHandle, event => {
    const stacked = isStackedWorkspaceLayout();
    const compactLandscape = isCompactLandscapeLayout();
    const workspaceRect = workspace.getBoundingClientRect();
    return {
      move(moveEvent) {
        if (stacked) {
          const maxHeight = Math.max(250, workspaceRect.height - 268);
          const height = Math.max(250, Math.min(maxHeight, moveEvent.clientY - workspaceRect.top));
          workspace.style.setProperty("--editor-height", `${height}px`);
          updateSeparatorValue(mainHandle, height, "pixels high");
        } else {
          const minWidth = compactLandscape ? 220 : 280;
          const previewReserve = compactLandscape ? 268 : 380;
          const maxWidth = Math.max(minWidth, workspaceRect.width - previewReserve);
          const width = Math.max(minWidth, Math.min(maxWidth, moveEvent.clientX - workspaceRect.left));
          workspace.style.setProperty("--editor-width", `${width}px`);
          updateSeparatorValue(mainHandle, width, "pixels wide");
        }
      },
      bodyClass: stacked ? "resizing-shapes" : "resizing"
    };
  });

  makeDraggableDivider(shapeHandle, () => {
    const panelRect = editorPanel.getBoundingClientRect();
    return {
      move(moveEvent) {
        const height = Math.max(105, Math.min(panelRect.height - 180, panelRect.bottom - moveEvent.clientY));
        editorPanel.style.setProperty("--shape-height", `${height}px`);
        updateSeparatorValue(shapeHandle, height, "pixel shape library height");
      },
      bodyClass: "resizing-shapes"
    };
  });

  mainHandle.addEventListener("keydown", event => {
    const stacked = isStackedWorkspaceLayout();
    const validKeys = stacked ? ["ArrowUp", "ArrowDown"] : ["ArrowLeft", "ArrowRight"];
    if (!validKeys.includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 48 : 24;
    if (stacked) {
      const current = editorPanel.getBoundingClientRect().height;
      const workspaceHeight = workspace.getBoundingClientRect().height;
      const max = Math.max(250, workspaceHeight - 268);
      const next = Math.max(250, Math.min(max, current + (event.key === "ArrowDown" ? step : -step)));
      workspace.style.setProperty("--editor-height", `${next}px`);
      updateSeparatorValue(mainHandle, next, "pixels high");
    } else {
      const current = editorPanel.getBoundingClientRect().width;
      const compactLandscape = isCompactLandscapeLayout();
      const min = compactLandscape ? 220 : 280;
      const reserve = compactLandscape ? 268 : 380;
      const max = Math.max(min, workspace.getBoundingClientRect().width - reserve);
      const next = Math.max(min, Math.min(max, current + (event.key === "ArrowRight" ? step : -step)));
      workspace.style.setProperty("--editor-width", `${next}px`);
      updateSeparatorValue(mainHandle, next, "pixels wide");
    }
    requestAnimationFrame(() => fitDiagramToWindow({ behavior: "auto" }));
  });

  shapeHandle.addEventListener("keydown", event => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const step = event.shiftKey ? 48 : 24;
    const panelHeight = editorPanel.getBoundingClientRect().height;
    const current = document.querySelector(".shape-library").getBoundingClientRect().height;
    const next = Math.max(105, Math.min(panelHeight - 180, current + (event.key === "ArrowUp" ? step : -step)));
    editorPanel.style.setProperty("--shape-height", `${next}px`);
    updateSeparatorValue(shapeHandle, next, "pixel shape library height");
  });

  updateSeparatorValue(mainHandle, Math.round(editorPanel.getBoundingClientRect().width), "pixels wide");
  updateSeparatorValue(shapeHandle, Math.round(document.querySelector(".shape-library").getBoundingClientRect().height), "pixel shape library height");
  updateMainSeparatorOrientation();
}

function updateSeparatorValue(separator, value, description) {
  separator.setAttribute("aria-valuemin", "0");
  separator.setAttribute("aria-valuemax", "10000");
  separator.setAttribute("aria-valuenow", String(Math.round(value)));
  separator.setAttribute("aria-valuetext", `${Math.round(value)} ${description}`);
}

function updateMainSeparatorOrientation() {
  const separator = document.getElementById("mainResizeHandle");
  const stacked = isStackedWorkspaceLayout();
  separator.setAttribute("aria-orientation", stacked ? "horizontal" : "vertical");
  const editorPanel = document.querySelector(".editor-panel");
  const value = stacked ? editorPanel.getBoundingClientRect().height : editorPanel.getBoundingClientRect().width;
  updateSeparatorValue(separator, value, stacked ? "pixels high" : "pixels wide");
}

function maybeShowMobileNotice() {
  const isTouchDevice = navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches;
  const hasCompactViewport = window.matchMedia("(max-width: 900px)").matches;
  if (!isTouchDevice || !hasCompactViewport) return;
  try {
    if (localStorage.getItem(MOBILE_NOTICE_KEY) === "true") return;
  } catch (error) {
    // The notice can still be shown when storage is unavailable.
  }
  const modal = document.getElementById("mobileNoticeModal");
  openModal(modal, document.getElementById("dismissMobileNoticeButton"));
}

function closeMobileNotice() {
  const modal = document.getElementById("mobileNoticeModal");
  if (modal.hidden) return;
  closeModal(modal, false);
  try { localStorage.setItem(MOBILE_NOTICE_KEY, "true"); } catch (error) { /* Storage may be blocked. */ }
}
