"use strict";

// -----------------------------------------------------------------------------
// Export pipeline
// -----------------------------------------------------------------------------

function toggleMmdMenu(event) {
  event.stopPropagation();
  closeTemplateMenu();
  document.getElementById("exportMenu").hidden = true;
  document.getElementById("exportMenuButton").setAttribute("aria-expanded", "false");
  const menu = document.getElementById("mmdMenu");
  menu.hidden = !menu.hidden;
  document.getElementById("mmdMenuButton").setAttribute("aria-expanded", String(!menu.hidden));
}

function closeMmdMenu() {
  document.getElementById("mmdMenu").hidden = true;
  document.getElementById("mmdMenuButton").setAttribute("aria-expanded", "false");
}

function toggleTemplateMenu(event) {
  event.stopPropagation();
  closeMmdMenu();
  document.getElementById("exportMenu").hidden = true;
  document.getElementById("exportMenuButton").setAttribute("aria-expanded", "false");
  const menu = document.getElementById("templateMenu");
  menu.hidden = !menu.hidden;
  document.getElementById("templateMenuButton").setAttribute("aria-expanded", String(!menu.hidden));
}

function closeTemplateMenu() {
  document.getElementById("templateMenu").hidden = true;
  document.getElementById("templateMenuButton").setAttribute("aria-expanded", "false");
}

function openInfoModal(modalId) {
  closeDiagramLibrary();
  closeVersionHistory();
  closeTemplateMenu();
  closeMmdMenu();
  document.getElementById("exportMenu").hidden = true;
  document.getElementById("exportMenuButton").setAttribute("aria-expanded", "false");
  closeInfoModals();
  const modal = document.getElementById(modalId);
  const trigger = modalId === "helpModal" ? document.getElementById("helpButton") : document.getElementById("aboutButton");
  openModal(modal, modal.querySelector(".popup-close"), trigger);
}

function closeInfoModals() {
  closeModal(document.getElementById("helpModal"), true, document.getElementById("helpButton"));
  closeModal(document.getElementById("aboutModal"), true, document.getElementById("aboutButton"));
}

function openDiagramLibrary() {
  autoSaveDiagram();
  closeVersionHistory();
  closeTemplateMenu();
  closeMmdMenu();
  document.getElementById("exportMenu").hidden = true;
  document.getElementById("exportMenuButton").setAttribute("aria-expanded", "false");
  renderDiagramLibrary();
  openModal(document.getElementById("diagramLibraryModal"), document.getElementById("newDiagramButton"), document.getElementById("diagramLibraryButton"));
}

function closeDiagramLibrary() {
  closeModal(document.getElementById("diagramLibraryModal"), true, document.getElementById("diagramLibraryButton"));
}

function openVersionHistory(diagramId) {
  autoSaveDiagram();
  const diagram = diagramLibrary.find(item => item.id === diagramId);
  if (!diagram) return;
  versionHistoryDiagramId = diagramId;
  renderVersionHistory();
  const modal = document.getElementById("versionHistoryModal");
  openModal(modal, document.getElementById("createSnapshotButton"));
}

function closeVersionHistory() {
  const libraryItem = document.querySelector(`.diagram-library-item[data-diagram-id="${CSS.escape(versionHistoryDiagramId || "")}"]`);
  const historyButton = Array.from(libraryItem?.querySelectorAll("button") || []).find(button => button.textContent.startsWith("History"));
  closeModal(document.getElementById("versionHistoryModal"), true, historyButton || document.getElementById("diagramLibraryButton"));
  versionHistoryDiagramId = null;
}

function renderVersionHistory() {
  const diagram = diagramLibrary.find(item => item.id === versionHistoryDiagramId);
  const list = document.getElementById("versionHistoryList");
  list.replaceChildren();
  if (!diagram) return;
  document.getElementById("versionHistorySubtitle").textContent = diagram.name;
  const versions = Array.isArray(diagram.versions) ? diagram.versions : [];
  if (!versions.length) {
    const empty = document.createElement("div");
    empty.className = "version-history-empty";
    empty.textContent = "No recovery points yet. A snapshot is created automatically when this diagram changes.";
    list.appendChild(empty);
    return;
  }

  versions.forEach(version => {
    const item = document.createElement("article");
    item.className = "version-history-item";
    const details = document.createElement("div");
    const reason = document.createElement("strong");
    reason.textContent = version.reason;
    const lineCount = version.code ? version.code.split(/\r?\n/).length : 0;
    const meta = document.createElement("p");
    meta.textContent = `${formatLibraryDate(version.createdAt)} Â· ${lineCount} ${lineCount === 1 ? "line" : "lines"}`;
    details.append(reason, meta);
    const restoreButton = createLibraryActionButton("Restore", "", () => requestRestoreVersion(diagram.id, version.id, restoreButton));
    item.append(details, restoreButton);
    list.appendChild(item);
  });
}

function createManualSnapshot() {
  const diagram = diagramLibrary.find(item => item.id === versionHistoryDiagramId);
  if (!diagram) return;
  if (diagram.id === activeDiagramId) autoSaveDiagram();
  const added = recordDiagramSnapshot(diagram, "Manual snapshot", true);
  if (!added) {
    showToast("The current version is already saved.");
    return;
  }
  try {
    persistDiagramLibrary();
    renderVersionHistory();
    renderDiagramLibrary();
    showToast("Snapshot saved locally.");
  } catch (error) {
    showError(`Could not save the snapshot: ${error.message || error}`);
  }
}

function requestRestoreVersion(diagramId, versionId, returnFocus) {
  const diagram = diagramLibrary.find(item => item.id === diagramId);
  const version = diagram?.versions?.find(item => item.id === versionId);
  if (!diagram || !version) return;
  openConfirmationModal({
    title: "Restore this version?",
    message: "The current diagram will be saved as a recovery point before this version is restored.",
    confirmLabel: "Restore version",
    returnFocus,
    onConfirm: () => restoreDiagramVersion(diagramId, versionId)
  });
}

function restoreDiagramVersion(diagramId, versionId) {
  let diagram = diagramLibrary.find(item => item.id === diagramId);
  if (!diagram) return;
  if (diagram.id === activeDiagramId) autoSaveDiagram();
  diagram = diagramLibrary.find(item => item.id === diagramId);
  const version = diagram?.versions?.find(item => item.id === versionId);
  if (!diagram || !version) return;

  recordDiagramSnapshot(diagram, "Before restoring a previous version", true);
  diagram.code = version.code;
  diagram.name = getAvailableRestoredName(diagram.id, version.name);
  diagram.updatedAt = new Date().toISOString();
  try {
    persistDiagramLibrary();
    if (diagram.id === activeDiagramId) {
      localStorage.setItem(STORAGE_KEY, diagram.code);
      localStorage.setItem(NAME_STORAGE_KEY, diagram.name);
    }
  } catch (error) {
    showError(`Could not restore the version: ${error.message || error}`);
    return;
  }

  if (diagram.id === activeDiagramId) loadActiveDiagramIntoEditor();
  renderDiagramLibrary();
  closeVersionHistory();
  showToast("Previous version restored.");
}

function getAvailableRestoredName(diagramId, preferredName) {
  const normalized = String(preferredName || "Untitled Diagram").trim().slice(0, 80) || "Untitled Diagram";
  const usedNames = new Set(diagramLibrary.filter(diagram => diagram.id !== diagramId).map(diagram => diagram.name.toLowerCase()));
  if (!usedNames.has(normalized.toLowerCase())) return normalized;
  let number = 2;
  while (usedNames.has(`${normalized} ${number}`.toLowerCase())) number += 1;
  return `${normalized} ${number}`;
}

function renderDiagramLibrary() {
  const list = document.getElementById("diagramLibraryList");
  list.replaceChildren();
  const diagrams = [...diagramLibrary].sort((first, second) => Date.parse(second.updatedAt) - Date.parse(first.updatedAt));
  diagrams.forEach(diagram => {
    const item = document.createElement("article");
    item.className = `diagram-library-item${diagram.id === activeDiagramId ? " is-active" : ""}`;
    item.dataset.diagramId = diagram.id;

    const details = document.createElement("div");
    const nameRow = document.createElement("div");
    nameRow.className = "diagram-library-name-row";
    const name = document.createElement("span");
    name.className = "diagram-library-name";
    name.textContent = diagram.name;
    nameRow.appendChild(name);
    if (diagram.id === activeDiagramId) {
      const badge = document.createElement("span");
      badge.className = "diagram-active-badge";
      badge.textContent = "Current";
      nameRow.appendChild(badge);
    }
    const lineCount = diagram.code ? diagram.code.split(/\r?\n/).length : 0;
    const meta = document.createElement("p");
    meta.className = "diagram-library-meta";
    meta.textContent = `${lineCount} ${lineCount === 1 ? "line" : "lines"} · Updated ${formatLibraryDate(diagram.updatedAt)}`;
    details.append(nameRow, meta);

    const actions = document.createElement("div");
    actions.className = "diagram-library-actions";
    const openButton = createLibraryActionButton(diagram.id === activeDiagramId ? "Current" : "Open", "", () => activateDiagram(diagram.id));
    openButton.disabled = diagram.id === activeDiagramId;
    actions.append(
      openButton,
      createLibraryActionButton(`History${diagram.versions?.length ? ` (${diagram.versions.length})` : ""}`, "", () => openVersionHistory(diagram.id)),
      createLibraryActionButton("Rename", "", () => beginDiagramRename(diagram.id, item)),
      createLibraryActionButton("Duplicate", "", () => duplicateDiagram(diagram.id)),
      createLibraryActionButton("Delete", "delete-diagram-button", () => requestDeleteDiagram(diagram.id))
    );
    item.append(details, actions);
    list.appendChild(item);
  });
}

function createLibraryActionButton(label, className, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  if (className) button.className = className;
  button.addEventListener("click", action);
  return button;
}

function formatLibraryDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "recently";
  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function createNewDiagram() {
  autoSaveDiagram();
  const diagram = createDiagramRecord(getUniqueDiagramName("Untitled Diagram"), NEW_DIAGRAM_CODE);
  diagramLibrary.push(diagram);
  activeDiagramId = diagram.id;
  try { persistDiagramLibrary(); } catch (error) { showError(`Could not create the diagram: ${error.message || error}`); return; }
  loadActiveDiagramIntoEditor();
  closeDiagramLibrary();
  showToast(`${diagram.name} created.`);
}

function activateDiagram(diagramId) {
  if (diagramId === activeDiagramId) { closeDiagramLibrary(); return; }
  const diagram = diagramLibrary.find(item => item.id === diagramId);
  if (!diagram) return;
  autoSaveDiagram();
  activeDiagramId = diagramId;
  try { persistDiagramLibrary(); } catch (error) { showError(`Could not open the diagram: ${error.message || error}`); return; }
  loadActiveDiagramIntoEditor();
  closeDiagramLibrary();
  showToast(`${diagram.name} opened.`);
}

function loadActiveDiagramIntoEditor() {
  const diagram = getActiveDiagram();
  if (!diagram) return;
  cancelEdgeCreation(false);
  clearTimeout(autoSaveTimer);
  clearTimeout(historyTimer);
  clearTimeout(renderTimer);
  elements.diagramName.value = diagram.name;
  elements.editor.value = diagram.code;
  history = [diagram.code];
  historyIndex = 0;
  panX = 0;
  panY = 0;
  updateLineCount();
  updateDirectionButtons();
  updateHistoryButtons();
  updateDocumentTitle();
  updateDiagramLibraryCount();
  hideError();
  renderDiagram();
  const status = document.getElementById("autosaveStatus");
  status.textContent = "Saved locally";
  status.className = "autosave-status";
}

function beginDiagramRename(diagramId, item) {
  const diagram = diagramLibrary.find(entry => entry.id === diagramId);
  if (!diagram) return;
  const nameRow = item.querySelector(".diagram-library-name-row");
  const editor = document.createElement("div");
  editor.className = "diagram-rename-editor";
  const input = document.createElement("input");
  input.type = "text";
  input.value = diagram.name;
  input.maxLength = 80;
  input.setAttribute("aria-label", "Diagram name");
  const saveButton = createLibraryActionButton("Save", "primary", () => commitDiagramRename(diagramId, input));
  const cancelButton = createLibraryActionButton("Cancel", "", renderDiagramLibrary);
  input.addEventListener("keydown", event => {
    if (event.key === "Enter") commitDiagramRename(diagramId, input);
    if (event.key === "Escape") { event.stopPropagation(); renderDiagramLibrary(); }
  });
  editor.append(input, saveButton, cancelButton);
  nameRow.replaceWith(editor);
  input.focus();
  input.select();
}

function commitDiagramRename(diagramId, input) {
  const diagram = diagramLibrary.find(entry => entry.id === diagramId);
  if (!diagram) return;
  const name = input.value.trim();
  if (!name) { showToast("A diagram name cannot be empty."); input.focus(); return; }
  if (diagramLibrary.some(entry => entry.id !== diagramId && entry.name.toLowerCase() === name.toLowerCase())) {
    showToast("A diagram with that name already exists.");
    input.focus();
    input.select();
    return;
  }
  diagram.name = name.slice(0, 80);
  diagram.updatedAt = new Date().toISOString();
  if (diagramId === activeDiagramId) {
    elements.diagramName.value = diagram.name;
    updateDocumentTitle();
  }
  try {
    persistDiagramLibrary();
    if (diagramId === activeDiagramId) localStorage.setItem(NAME_STORAGE_KEY, diagram.name);
  } catch (error) {
    showError(`Could not rename the diagram: ${error.message || error}`);
    return;
  }
  renderDiagramLibrary();
  showToast(`Renamed to ${diagram.name}.`);
}

function duplicateDiagram(diagramId) {
  autoSaveDiagram();
  const source = diagramLibrary.find(diagram => diagram.id === diagramId);
  if (!source) return;
  const copy = createDiagramRecord(getUniqueDiagramName(`${source.name} Copy`), source.code);
  const sourceIndex = diagramLibrary.findIndex(diagram => diagram.id === diagramId);
  diagramLibrary.splice(sourceIndex + 1, 0, copy);
  activeDiagramId = copy.id;
  try { persistDiagramLibrary(); } catch (error) { showError(`Could not duplicate the diagram: ${error.message || error}`); return; }
  loadActiveDiagramIntoEditor();
  renderDiagramLibrary();
  showToast(`${copy.name} created.`);
}

function getUniqueDiagramName(baseName) {
  const usedNames = new Set(diagramLibrary.map(diagram => diagram.name.toLowerCase()));
  if (!usedNames.has(baseName.toLowerCase())) return baseName;
  let number = 2;
  while (usedNames.has(`${baseName} ${number}`.toLowerCase())) number += 1;
  return `${baseName} ${number}`;
}

function requestDeleteDiagram(diagramId) {
  const diagram = diagramLibrary.find(item => item.id === diagramId);
  if (!diagram) return;
  const isOnlyDiagram = diagramLibrary.length === 1;
  openConfirmationModal({
    title: `Delete ${diagram.name}?`,
    message: isOnlyDiagram
      ? "This permanently removes the diagram from this browser. A new blank diagram will be created."
      : "This permanently removes the diagram from this browser. This action cannot be undone.",
    confirmLabel: "Delete diagram",
    danger: true,
    onConfirm: () => deleteDiagram(diagramId)
  });
}

function deleteDiagram(diagramId) {
  const diagram = diagramLibrary.find(item => item.id === diagramId);
  if (!diagram) return;
  const deletedActiveDiagram = diagramId === activeDiagramId;
  diagramLibrary = diagramLibrary.filter(item => item.id !== diagramId);
  if (!diagramLibrary.length) diagramLibrary.push(createDiagramRecord("Untitled Diagram", NEW_DIAGRAM_CODE));
  if (deletedActiveDiagram) activeDiagramId = diagramLibrary[0].id;
  try { persistDiagramLibrary(); } catch (error) { showError(`Could not delete the diagram: ${error.message || error}`); return; }
  if (deletedActiveDiagram) loadActiveDiagramIntoEditor();
  updateDiagramLibraryCount();
  renderDiagramLibrary();
  showToast(`${diagram.name} deleted.`);
}

function loadDiagramTemplate(templateId) {
  const template = DIAGRAM_TEMPLATES[templateId];
  if (!template) return;
  closeTemplateMenu();
  if (elements.editor.value.trim()) {
    openConfirmationModal({
      title: `Load ${template.name}?`,
      message: "This replaces the current diagram. A recovery snapshot will be saved first.",
      confirmLabel: "Load template",
      returnFocus: document.getElementById("templateMenuButton"),
      onConfirm: () => applyDiagramTemplate(template)
    });
    return;
  }
  applyDiagramTemplate(template);
}

function applyDiagramTemplate(template) {
  captureCurrentSnapshot(`Before loading ${template.name}`);
  elements.diagramName.value = template.name;
  updateDocumentTitle();
  setEditorCode(template.code);
  showToast(`${template.name} template loaded.`);
}

function openConfirmationModal({ title, message, confirmLabel, danger = false, returnFocus = null, onConfirm }) {
  const modal = document.getElementById("confirmModal");
  pendingConfirmation = onConfirm;
  confirmationReturnFocus = returnFocus || document.activeElement;
  document.getElementById("confirmModalTitle").textContent = title;
  document.getElementById("confirmModalMessage").textContent = message;
  document.getElementById("confirmActionButton").textContent = confirmLabel;
  modal.querySelector(".confirm-modal").classList.toggle("is-danger", danger);
  modal.hidden = false;
  document.getElementById("cancelConfirmButton").focus();
}

function closeConfirmationModal(restoreFocus = true) {
  const modal = document.getElementById("confirmModal");
  if (modal.hidden) return;
  modal.hidden = true;
  pendingConfirmation = null;
  if (restoreFocus && confirmationReturnFocus && typeof confirmationReturnFocus.focus === "function") confirmationReturnFocus.focus();
  confirmationReturnFocus = null;
}

function confirmPendingAction() {
  const action = pendingConfirmation;
  closeConfirmationModal(false);
  if (typeof action === "function") action();
}

function openExportModal(format) {
  if (!elements.preview.querySelector("svg")) {
    showToast("Render a valid diagram before exporting.");
    return;
  }
  selectedExportFormat = format;
  document.getElementById("exportMenu").hidden = true;
  document.getElementById("exportMenuButton").setAttribute("aria-expanded", "false");
  document.getElementById("exportModalTitle").textContent = `Export ${format.toUpperCase()}`;
  const descriptions = {
    svg: "Scalable vector output, ideal for websites and further editing.",
    png: "Lossless raster image, ideal for documents and transparent backgrounds.",
    jpg: "Compressed raster image with adjustable quality and a solid background.",
    pdf: "Single-page PDF fitted to your selected paper size."
  };
  document.getElementById("exportFormatDescription").textContent = descriptions[format];
  const supportsTransparency = format === "svg" || format === "png";
  document.getElementById("exportQualityField").hidden = !["jpg", "pdf"].includes(format);
  document.getElementById("exportBackgroundField").hidden = false;
  document.getElementById("transparentBackground").disabled = !supportsTransparency;
  document.getElementById("transparentBackground").checked = false;
  document.getElementById("clearExportBackgroundButton").hidden = !supportsTransparency;
  document.getElementById("pdfPageField").hidden = format !== "pdf";
  document.getElementById("pdfOrientationField").hidden = format !== "pdf";
  if (format === "pdf") selectRecommendedPdfOrientation();
  document.getElementById("exportScaleLabel").textContent = format === "pdf"
    ? "Diagram resolution"
    : format === "svg" ? "Export scale" : "Output size";
  updateExportBackgroundControls();
  updateExportSizeSummary();
  openModal(
    document.getElementById("exportModal"),
    document.getElementById("closeExportModalButton"),
    document.getElementById("exportMenuButton")
  );
}

function selectRecommendedPdfOrientation() {
  const svg = elements.preview.querySelector("svg");
  if (!svg) return;
  const viewBox = svg.viewBox && svg.viewBox.baseVal;
  const width = viewBox?.width || svg.getBoundingClientRect().width;
  const height = viewBox?.height || svg.getBoundingClientRect().height;
  if (!width || !height) return;
  document.getElementById("pdfOrientation").value = width > height ? "landscape" : "portrait";
}

function updateExportBackgroundControls() {
  const supportsTransparency = selectedExportFormat === "svg" || selectedExportFormat === "png";
  const transparent = supportsTransparency && document.getElementById("transparentBackground").checked;
  const clearButton = document.getElementById("clearExportBackgroundButton");
  clearButton.setAttribute("aria-pressed", String(transparent));
  clearButton.title = transparent ? "Use the selected background color" : "Export without a background color";
  const backgroundHint = document.getElementById("exportBackgroundHint");
  backgroundHint.hidden = !supportsTransparency;
  backgroundHint.textContent = transparent
    ? "The exported background will be transparent."
    : "The selected color will fill the exported canvas.";
}

function toggleClearExportBackground() {
  const checkbox = document.getElementById("transparentBackground");
  checkbox.checked = !checkbox.checked;
  updateExportBackgroundControls();
}

function getExportPixelDimensions() {
  const svg = elements.preview.querySelector("svg");
  if (!svg) return { width: 0, height: 0 };
  const viewBox = svg.viewBox && svg.viewBox.baseVal;
  const baseWidth = Math.max(1, (viewBox && viewBox.width) || svg.getBoundingClientRect().width);
  const baseHeight = Math.max(1, (viewBox && viewBox.height) || svg.getBoundingClientRect().height);
  const scale = Math.max(1, Number(document.getElementById("exportScale").value) || 1);
  const padding = Math.min(500, Math.max(0, Number(document.getElementById("exportPadding").value) || 0));
  return {
    width: Math.max(1, Math.round((baseWidth + padding * 2) * scale)),
    height: Math.max(1, Math.round((baseHeight + padding * 2) * scale))
  };
}

function updateExportSizeSummary() {
  const size = getExportPixelDimensions();
  const summary = document.getElementById("exportSizeSummary");
  if (selectedExportFormat !== "pdf") {
    summary.textContent = `Output dimensions: ${size.width} × ${size.height} px`;
    return;
  }
  const pageChoice = document.getElementById("pdfPageSize").value;
  const orientationSelect = document.getElementById("pdfOrientation");
  const orientation = orientationSelect.value;
  const fitsDiagram = pageChoice === "diagram";
  orientationSelect.disabled = fitsDiagram;
  document.getElementById("pdfOrientationField").hidden = fitsDiagram;
  const page = getPdfPageDimensions(pageChoice, orientation, size.width, size.height);
  const pageName = pageChoice === "diagram" ? "Fit to diagram" : `${pageChoice.toUpperCase()} ${orientation}`;
  summary.textContent = `PDF page: ${pageName} (${Math.round(page.width)} × ${Math.round(page.height)} pt) · Diagram: ${size.width} × ${size.height} px`;
}

function closeExportModal() {
  closeModal(document.getElementById("exportModal"), true, document.getElementById("exportMenuButton"));
}

async function exportWithOptions() {
  const button = document.getElementById("confirmExportButton");
  button.disabled = true;
  button.textContent = "Exporting…";
  try {
    const svg = elements.preview.querySelector("svg");
    const scale = Number(document.getElementById("exportScale").value);
    const padding = Math.min(500, Math.max(0, Number(document.getElementById("exportPadding").value) || 0));
    const background = document.getElementById("exportBackground").value;
    const transparent = document.getElementById("transparentBackground").checked && !["jpg", "pdf"].includes(selectedExportFormat);
    const quality = Number(document.getElementById("exportQuality").value) / 100;
    const prepared = prepareSvgForExport(svg, scale, padding, background, transparent);

    if (selectedExportFormat === "svg") {
      downloadBlob(new Blob([prepared.source], { type: "image/svg+xml;charset=utf-8" }), `${getSafeFilename()}.svg`);
    } else {
      const canvas = await svgSourceToCanvas(prepared.source, prepared.width, prepared.height, transparent ? null : background);
      if (selectedExportFormat === "png") {
        downloadBlob(await canvasToBlob(canvas, "image/png", 1), `${getSafeFilename()}.png`);
      } else {
        const jpegBlob = await canvasToBlob(canvas, "image/jpeg", quality);
        if (selectedExportFormat === "jpg") {
          downloadBlob(jpegBlob, `${getSafeFilename()}.jpg`);
        } else {
          const pdf = await createPdfFromJpeg(jpegBlob, canvas.width, canvas.height, background);
          downloadBlob(pdf, `${getSafeFilename()}.pdf`);
        }
      }
    }
    closeExportModal();
    showToast(`${selectedExportFormat.toUpperCase()} exported.`);
  } catch (error) {
    showError(`Export failed: ${error.message || error}`);
  } finally {
    button.disabled = false;
    button.textContent = "Export";
  }
}

function prepareSvgForExport(svg, scale, padding, background, transparent) {
  const clone = svg.cloneNode(true);
  clone.querySelectorAll(".edge-hit-area").forEach(node => node.remove());
  clone.querySelectorAll(".edge-hover, .edge-selected").forEach(node => node.classList.remove("edge-hover", "edge-selected"));
  clone.querySelectorAll("[tabindex]").forEach(node => node.removeAttribute("tabindex"));
  replaceForeignObjectLabels(clone, svg);
  removeExternalSvgResources(clone);
  clone.style.removeProperty("transform");
  clone.style.removeProperty("width");
  clone.style.removeProperty("height");
  clone.style.removeProperty("max-width");
  const viewBox = svg.viewBox.baseVal;
  const baseWidth = Math.max(1, viewBox.width || svg.getBoundingClientRect().width);
  const baseHeight = Math.max(1, viewBox.height || svg.getBoundingClientRect().height);
  const paddedWidth = baseWidth + padding * 2;
  const paddedHeight = baseHeight + padding * 2;
  const width = Math.max(1, Math.round(paddedWidth * scale));
  const height = Math.max(1, Math.round(paddedHeight * scale));
  clone.setAttribute("width", width);
  clone.setAttribute("height", height);
  clone.setAttribute("viewBox", `${viewBox.x - padding} ${viewBox.y - padding} ${paddedWidth} ${paddedHeight}`);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  if (!transparent) {
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", String(viewBox.x - padding)); rect.setAttribute("y", String(viewBox.y - padding));
    rect.setAttribute("width", String(paddedWidth)); rect.setAttribute("height", String(paddedHeight));
    rect.setAttribute("fill", background);
    rect.style.setProperty("fill", background, "important");
    rect.setAttribute("data-export-background", "true");
    clone.insertBefore(rect, clone.firstChild);
  }
  return { source: new XMLSerializer().serializeToString(clone), width, height };
}

function replaceForeignObjectLabels(svgClone, sourceSvg) {
  const sourceLabels = sourceSvg.querySelectorAll("foreignObject");
  svgClone.querySelectorAll("foreignObject").forEach((foreignObject, index) => {
    const sourceLabel = sourceLabels[index];
    const textValue = ((sourceLabel && sourceLabel.innerText) || foreignObject.textContent).trim();
    if (!textValue) {
      foreignObject.remove();
      return;
    }
    const x = Number.parseFloat(foreignObject.getAttribute("x")) || 0;
    const y = Number.parseFloat(foreignObject.getAttribute("y")) || 0;
    const width = Number.parseFloat(foreignObject.getAttribute("width")) || 0;
    const height = Number.parseFloat(foreignObject.getAttribute("height")) || 0;
    const styledElement = sourceLabel && (sourceLabel.querySelector(".nodeLabel, .edgeLabel, span, div") || sourceLabel);
    const computed = styledElement ? getComputedStyle(styledElement) : null;
    const fontSize = Math.max(10, Number.parseFloat(computed && computed.fontSize) || 16);
    const lineHeight = fontSize * 1.25;
    const maxCharacters = Math.max(4, Math.floor(width / (fontSize * 0.58)));
    const lines = textValue.split(/\r?\n/).flatMap(line => wrapExportText(line.replace(/\s+/g, " ").trim(), maxCharacters));
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", String(x + width / 2));
    text.setAttribute("y", String(y + height / 2 - ((lines.length - 1) * lineHeight) / 2));
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "middle");
    text.setAttribute("font-family", (computed && computed.fontFamily) || "Arial, sans-serif");
    text.setAttribute("font-size", String(fontSize));
    text.setAttribute("font-weight", (computed && computed.fontWeight) || "400");
    text.setAttribute("fill", (computed && computed.color) || "#222222");
    lines.forEach((line, lineIndex) => {
      const span = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
      span.setAttribute("x", String(x + width / 2));
      if (lineIndex) span.setAttribute("dy", String(lineHeight));
      span.textContent = line;
      text.appendChild(span);
    });
    foreignObject.replaceWith(text);
  });
}

function wrapExportText(text, maxCharacters) {
  if (!text || text.length <= maxCharacters) return [text];
  const lines = [];
  let current = "";
  text.split(" ").forEach(word => {
    if (!current || `${current} ${word}`.length <= maxCharacters) current = current ? `${current} ${word}` : word;
    else { lines.push(current); current = word; }
  });
  if (current) lines.push(current);
  return lines;
}

function removeExternalSvgResources(svg) {
  svg.querySelectorAll("image").forEach(image => {
    const href = image.getAttribute("href") || image.getAttribute("xlink:href") || "";
    if (href && !href.startsWith("data:")) image.remove();
  });
  svg.querySelectorAll("style").forEach(style => {
    style.textContent = style.textContent
      .replace(/@import[^;]+;/gi, "")
      .replace(/url\((['"]?)https?:\/\/.*?\1\)/gi, "none");
  });
}

function svgSourceToCanvas(source, width, height, background) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const blobUrl = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));
    let triedDataUrl = false;
    image.onload = () => {
      try {
        const limitScale = Math.min(1, 16384 / width, 16384 / height, Math.sqrt(100000000 / (width * height)));
        const safeWidth = Math.max(1, Math.floor(width * limitScale));
        const safeHeight = Math.max(1, Math.floor(height * limitScale));
        const canvas = document.createElement("canvas");
        canvas.width = safeWidth; canvas.height = safeHeight;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas is not supported by this browser.");
        if (background) { context.fillStyle = background; context.fillRect(0, 0, safeWidth, safeHeight); }
        context.drawImage(image, 0, 0, safeWidth, safeHeight);
        URL.revokeObjectURL(blobUrl);
        resolve(canvas);
      } catch (error) { URL.revokeObjectURL(blobUrl); reject(error); }
    };
    image.onerror = () => {
      if (!triedDataUrl) {
        triedDataUrl = true;
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
      } else {
        URL.revokeObjectURL(blobUrl);
        reject(new Error("The diagram SVG could not be converted to an image."));
      }
    };
    image.src = blobUrl;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Image encoding failed.")), type, quality));
}

async function createPdfFromJpeg(jpegBlob, imageWidth, imageHeight, background) {
  const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
  const pageChoice = document.getElementById("pdfPageSize").value;
  const orientation = document.getElementById("pdfOrientation").value;
  const margin = 36;
  const page = getPdfPageDimensions(pageChoice, orientation, imageWidth, imageHeight, margin);
  const pageWidth = page.width;
  const pageHeight = page.height;

  const scale = Math.min((pageWidth - margin * 2) / imageWidth, (pageHeight - margin * 2) / imageHeight);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  const drawX = (pageWidth - drawWidth) / 2;
  const drawY = (pageHeight - drawHeight) / 2;
  const [red, green, blue] = hexToPdfRgb(background);
  const content = `q\n${red} ${green} ${blue} rg\n0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)} re\nf\nQ\nq\n${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} ${drawX.toFixed(2)} ${drawY.toFixed(2)} cm\n/Im0 Do\nQ\n`;
  const encode = value => new TextEncoder().encode(value);
  const objects = [
    encode("<< /Type /Catalog /Pages 2 0 R >>"),
    encode("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`),
    joinBytes([encode(`<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`), jpegBytes, encode("\nendstream")]),
    encode(`<< /Length ${encode(content).length} >>\nstream\n${content}endstream`)
  ];

  const chunks = [encode("%PDF-1.4\n%----\n")];
  const offsets = [0];
  let byteLength = chunks[0].length;
  objects.forEach((object, index) => {
    offsets.push(byteLength);
    const wrapped = joinBytes([encode(`${index + 1} 0 obj\n`), object, encode("\nendobj\n")]);
    chunks.push(wrapped);
    byteLength += wrapped.length;
  });
  const xrefOffset = byteLength;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(offset => { xref += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  chunks.push(encode(xref));
  return new Blob(chunks, { type: "application/pdf" });
}

function getPdfPageDimensions(pageChoice, orientation, imageWidth, imageHeight, margin = 36) {
  if (pageChoice === "diagram") {
    return { width: imageWidth * 0.75 + margin * 2, height: imageHeight * 0.75 + margin * 2 };
  }
  let [width, height] = pageChoice === "letter" ? [612, 792] : [595.28, 841.89];
  if (orientation === "landscape") [width, height] = [height, width];
  return { width, height };
}

function hexToPdfRgb(hex) {
  const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : "ffffff";
  return [0, 2, 4].map(index => (Number.parseInt(normalized.slice(index, index + 2), 16) / 255).toFixed(4));
}

function joinBytes(parts) {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  parts.forEach(part => { output.set(part, offset); offset += part.length; });
  return output;
}

function clearDiagram() {
  openConfirmationModal({
    title: "Clear this diagram?",
    message: "This removes all Mermaid code and clears the preview. A recovery snapshot will be saved first.",
    confirmLabel: "Clear diagram",
    danger: true,
    returnFocus: document.getElementById("clearButton"),
    onConfirm: performClearDiagram
  });
}

function performClearDiagram() {
  captureCurrentSnapshot("Before clearing the diagram");
  cancelEdgeCreation(false);
  elements.editor.value = "";
  recordHistory();
  elements.preview.innerHTML = "";
  hideError();
  closeNodePopup();
  updateLineCount();
  updateDirectionButtons();
  scheduleAutoSave();
  setStatus("Cleared", "");
  elements.editor.focus();
}
