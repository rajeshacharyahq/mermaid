"use strict";

// -----------------------------------------------------------------------------
// Rendering, errors, local persistence, and files
// -----------------------------------------------------------------------------

function handleEditorInput() {
  if (pendingEdgeSource) cancelEdgeCreation(false);
  updateLineCount();
  updateDirectionButtons();
  closeNodePopup();
  closeEdgePopup();
  closeSubgraphPopup();
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderDiagram, getAdaptiveRenderDelay(elements.editor.value));
  clearTimeout(historyTimer);
  historyTimer = setTimeout(recordHistory, 650);
  scheduleAutoSave();
}

function getAdaptiveRenderDelay(code) {
  if (code.length > 20000) return 900;
  if (code.length > 8000) return 700;
  return RENDER_DELAY;
}

async function renderDiagram() {
  clearTimeout(renderTimer);
  const renderStartedAt = performance.now();
  const code = elements.editor.value.trim();
  const requestId = ++renderSequence;
  closeNodePopup();
  closeEdgePopup();
  closeSubgraphPopup();
  hideQuickAddButton();

  if (!window.mermaid) {
    showError("Mermaid is unavailable. Check that vendor/mermaid.min.js exists.");
    return;
  }
  if (!code) {
    elements.preview.innerHTML = "";
    showError("Enter Mermaid code to render a diagram.");
    return;
  }

  setStatus("Rendering…", "");
  try {
    const renderId = `mermaid-render-${Date.now()}-${requestId}`;
    const result = await mermaid.render(renderId, code);
    if (requestId !== renderSequence) return;
    elements.preview.innerHTML = typeof result === "string" ? result : result.svg;
    if (result && typeof result.bindFunctions === "function") result.bindFunctions(elements.preview);
    bindRenderedNodes();
    bindRenderedEdges();
    updateEdgeCreationMode();
    finalizeRenderedPreview(requestId);
    hideError();
    setStatus("Rendered", "success");
    const elapsed = Math.round(performance.now() - renderStartedAt);
    const nodeCount = elements.preview.querySelectorAll(RENDERED_NODE_SELECTOR).length;
    elements.status.title = `${nodeCount} ${nodeCount === 1 ? "node" : "nodes"} rendered in ${elapsed} ms`;
  } catch (error) {
    if (requestId !== renderSequence) return;
    removeMermaidErrorArtifacts();
    showError(formatError(error));
    setStatus("Syntax error", "error");
    elements.status.removeAttribute("title");
  }
}

function removeMermaidErrorArtifacts() {
  document.querySelectorAll("body > div[id^='dmermaid-render-'], body > svg[id^='mermaid-render-']").forEach(node => node.remove());
}

function formatError(error) {
  const message = error && (error.str || error.message) ? (error.str || error.message) : String(error);
  return `Unable to render this diagram.\n\n${message}`;
}

function showError(message) {
  elements.error.textContent = message;
  elements.error.hidden = false;
  setStatus("Error", "error");
}

function hideError() {
  elements.error.textContent = "";
  elements.error.hidden = true;
}

function setStatus(text, className) {
  elements.status.textContent = text;
  elements.status.className = `status ${className}`.trim();
}

function updateLineCount() {
  const count = elements.editor.value ? elements.editor.value.split(/\r?\n/).length : 0;
  const lineNumberDigits = String(Math.max(count, 1)).length;
  elements.lineCount.textContent = `${count} ${count === 1 ? "line" : "lines"}`;
  elements.lineNumbers.textContent = Array.from({ length: Math.max(count, 1) }, (_, index) => index + 1).join("\n");
  elements.lineNumbers.parentElement.style.setProperty("--compact-line-number-gutter-width", `${lineNumberDigits + 2}ch`);
  syncEditorLineNumbers();
}

function syncEditorLineNumbers() {
  elements.lineNumbers.scrollTop = elements.editor.scrollTop;
}

function restoreLocalSession() {
  try {
    previewTheme = localStorage.getItem(PREVIEW_THEME_KEY) === "dark" ? "dark" : "light";
  } catch (error) {
    previewTheme = "light";
  }

  try {
    const savedCode = localStorage.getItem(STORAGE_KEY);
    const savedName = localStorage.getItem(NAME_STORAGE_KEY) || (savedCode === null ? "Getting Started" : "Untitled Diagram");
    const storedLibrary = JSON.parse(localStorage.getItem(DIAGRAM_LIBRARY_KEY) || "null");
    const storedDiagrams = storedLibrary && Array.isArray(storedLibrary.diagrams) ? storedLibrary.diagrams : [];
    const usedIds = new Set();
    diagramLibrary = storedDiagrams.flatMap((diagram, index) => {
      if (!diagram || typeof diagram.code !== "string") return [];
      const id = typeof diagram.id === "string" && diagram.id && !usedIds.has(diagram.id) ? diagram.id : createDiagramId();
      usedIds.add(id);
      const now = new Date().toISOString();
      return [{
        id,
        name: typeof diagram.name === "string" && diagram.name.trim() ? diagram.name.trim().slice(0, 80) : `Untitled Diagram ${index + 1}`,
        code: diagram.code,
        createdAt: isValidDateString(diagram.createdAt) ? diagram.createdAt : now,
        updatedAt: isValidDateString(diagram.updatedAt) ? diagram.updatedAt : now,
        versions: normalizeStoredVersions(diagram.versions)
      }];
    });

    if (!diagramLibrary.length) {
      diagramLibrary = [createDiagramRecord(savedName, savedCode ?? DEFAULT_CODE)];
    }
    const storedActiveId = localStorage.getItem(ACTIVE_DIAGRAM_KEY);
    activeDiagramId = diagramLibrary.some(diagram => diagram.id === storedActiveId) ? storedActiveId : diagramLibrary[0].id;
    persistDiagramLibrary();
  } catch (error) {
    diagramLibrary = [createDiagramRecord("Getting Started", DEFAULT_CODE)];
    activeDiagramId = diagramLibrary[0].id;
  }

  const activeDiagram = getActiveDiagram();
  elements.editor.value = activeDiagram.code;
  elements.diagramName.value = activeDiagram.name;
  updateDiagramLibraryCount();
}

function createDiagramId() {
  try {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
  } catch (error) {
    // Fall through to a timestamp-based ID on restricted file:// contexts.
  }
  return `diagram-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createDiagramRecord(name, code) {
  const now = new Date().toISOString();
  return { id: createDiagramId(), name: String(name || "Untitled Diagram").trim().slice(0, 80) || "Untitled Diagram", code: String(code ?? ""), createdAt: now, updatedAt: now, versions: [] };
}

function normalizeStoredVersions(versions) {
  if (!Array.isArray(versions)) return [];
  const normalized = versions.flatMap(version => {
    if (!version || typeof version.code !== "string") return [];
    const createdAt = isValidDateString(version.createdAt) ? version.createdAt : new Date().toISOString();
    return [{
      id: typeof version.id === "string" && version.id ? version.id : createSnapshotId(),
      name: typeof version.name === "string" && version.name.trim() ? version.name.trim().slice(0, 80) : "Untitled Diagram",
      code: version.code,
      createdAt,
      reason: typeof version.reason === "string" && version.reason.trim() ? version.reason.trim().slice(0, 80) : "Automatic snapshot"
    }];
  }).sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt));
  return trimSnapshotHistory(normalized);
}

function createSnapshotId() {
  return `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isValidDateString(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function getActiveDiagram() {
  return diagramLibrary.find(diagram => diagram.id === activeDiagramId) || diagramLibrary[0];
}

function persistDiagramLibrary() {
  localStorage.setItem(DIAGRAM_LIBRARY_KEY, JSON.stringify({ version: 2, diagrams: diagramLibrary }));
  localStorage.setItem(ACTIVE_DIAGRAM_KEY, activeDiagramId);
}

function updateDiagramLibraryCount() {
  const count = diagramLibrary.length;
  const badge = document.getElementById("diagramCount");
  badge.textContent = String(count);
  badge.setAttribute("aria-label", `${count} saved ${count === 1 ? "diagram" : "diagrams"}`);
}

function scheduleAutoSave() {
  clearTimeout(autoSaveTimer);
  const status = document.getElementById("autosaveStatus");
  status.textContent = "Saving…";
  status.className = "autosave-status saving";
  autoSaveTimer = setTimeout(autoSaveDiagram, 500);
}

function autoSaveDiagram() {
  clearTimeout(autoSaveTimer);
  const status = document.getElementById("autosaveStatus");
  try {
    let activeDiagram = getActiveDiagram();
    if (!activeDiagram) {
      activeDiagram = createDiagramRecord(getDiagramName(), elements.editor.value);
      diagramLibrary.push(activeDiagram);
      activeDiagramId = activeDiagram.id;
    }
    const nextName = getDiagramName();
    const nextCode = elements.editor.value;
    if (activeDiagram.name !== nextName || activeDiagram.code !== nextCode) recordDiagramSnapshot(activeDiagram, "Automatic snapshot");
    activeDiagram.name = nextName;
    activeDiagram.code = nextCode;
    activeDiagram.updatedAt = new Date().toISOString();
    persistDiagramLibrary();
    localStorage.setItem(STORAGE_KEY, elements.editor.value);
    localStorage.setItem(NAME_STORAGE_KEY, getDiagramName());
    updateDiagramLibraryCount();
    status.textContent = "Saved locally";
    status.className = "autosave-status";
  } catch (error) {
    status.textContent = "Save failed";
    status.className = "autosave-status error";
  }
}

function recordDiagramSnapshot(diagram, reason, force = false, state = null) {
  if (!diagram) return false;
  if (!Array.isArray(diagram.versions)) diagram.versions = [];
  const snapshotState = state || { name: diagram.name, code: diagram.code };
  const name = String(snapshotState.name || "Untitled Diagram").trim().slice(0, 80) || "Untitled Diagram";
  const code = String(snapshotState.code ?? "");
  const latest = diagram.versions[0];
  if (latest && latest.name === name && latest.code === code) return false;
  if (!force && latest && Date.now() - Date.parse(latest.createdAt) < SNAPSHOT_INTERVAL_MS) return false;

  diagram.versions.unshift({
    id: createSnapshotId(),
    name,
    code,
    createdAt: new Date().toISOString(),
    reason: String(reason || "Automatic snapshot").trim().slice(0, 80) || "Automatic snapshot"
  });
  diagram.versions = trimSnapshotHistory(diagram.versions);
  return true;
}

function trimSnapshotHistory(versions) {
  const trimmed = versions.slice(0, MAX_SNAPSHOTS_PER_DIAGRAM);
  let totalCharacters = trimmed.reduce((total, version) => total + version.code.length, 0);
  while (trimmed.length > 1 && totalCharacters > MAX_SNAPSHOT_CHARACTERS) {
    totalCharacters -= trimmed.pop().code.length;
  }
  return trimmed;
}

function captureCurrentSnapshot(reason) {
  const diagram = getActiveDiagram();
  if (!diagram) return false;
  const added = recordDiagramSnapshot(diagram, reason, true, { name: getDiagramName(), code: elements.editor.value });
  if (!added) return false;
  try {
    persistDiagramLibrary();
    return true;
  } catch (error) {
    showError(`Could not save a recovery snapshot: ${error.message || error}`);
    return false;
  }
}

function downloadCode() {
  downloadBlob(new Blob([elements.editor.value], { type: "text/plain;charset=utf-8" }), `${getSafeFilename()}.mmd`);
  showToast("Mermaid file downloaded.");
}

function importCode(event) {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".mmd")) {
    showError("Choose a file with the .mmd extension.");
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    captureCurrentSnapshot(`Before importing ${file.name}`);
    elements.diagramName.value = file.name.replace(/\.mmd$/i, "") || "Untitled Diagram";
    updateDocumentTitle();
    setEditorCode(String(reader.result));
    showToast(`${file.name} imported.`);
  };
  reader.onerror = () => showError("The selected file could not be read.");
  reader.readAsText(file);
}

async function copyCode() {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(elements.editor.value);
    } else {
      elements.editor.focus();
      elements.editor.select();
      if (!document.execCommand("copy")) throw new Error("Browser denied clipboard access");
    }
    showToast("Code copied to clipboard.");
  } catch (error) {
    showError(`Could not copy code: ${formatError(error)}`);
  }
}

function toggleExportMenu(event) {
  event.stopPropagation();
  closeMmdMenu();
  closeTemplateMenu();
  const menu = document.getElementById("exportMenu");
  menu.hidden = !menu.hidden;
  document.getElementById("exportMenuButton").setAttribute("aria-expanded", String(!menu.hidden));
}
