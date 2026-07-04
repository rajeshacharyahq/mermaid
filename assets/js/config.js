"use strict";

// -----------------------------------------------------------------------------
// Defaults, templates, and configuration
// -----------------------------------------------------------------------------

const DEFAULT_CODE = `flowchart TD
    welcome(["Welcome to Mermaid Flow Editor"])
    choose{"How would you like to begin?"}
    code@{ shape: doc, label: "Write Mermaid code" }
    shapes@{ shape: processes, label: "Drag flowchart shapes" }
    preview@{ shape: rounded, label: "See the live preview" }
    customize@{ shape: hex, label: "Click nodes and arrows to customize" }
    saved[("Auto-saved in your browser")]
    export(["Export as SVG, PNG, JPG or PDF"])

    welcome --> choose
    choose -->|Use the editor| code
    choose -->|Use the shape library| shapes
    code --> preview
    shapes --> preview
    preview --> customize
    customize --> saved
    saved --> export

    style welcome fill:#5271ff,color:#ffffff,stroke:#2948b8
    style choose fill:#ffde59,color:#1f2937,stroke:#c69000
    style preview fill:#5ce1e6,color:#083344,stroke:#0891a6
    style customize fill:#8c52ff,color:#ffffff,stroke:#5e17a8
    style saved fill:#00bf63,color:#ffffff,stroke:#08783f
    style export fill:#ff66c4,color:#ffffff,stroke:#c02682`;

const DIAGRAM_TEMPLATES = {
  "quick-start": { name: "Customer Request Journey", code: `flowchart LR
    start(("Start")) --> request@{ shape: lean-r, label: "Customer request" }
    request --> review@{ shape: rounded, label: "Review request" }
    review --> decision{"Ready to proceed?"}
    decision -->|Yes| deliver@{ shape: processes, label: "Deliver solution" }
    decision -->|No| improve@{ shape: doc, label: "Request changes" }
    improve --> review
    deliver --> complete(["Complete"])
    style start fill:#5271ff,color:#ffffff,stroke:#2948b8
    style deliver fill:#00bf63,color:#ffffff,stroke:#08783f
    style complete fill:#8c52ff,color:#ffffff,stroke:#5e17a8` },
  approval: { name: "Approval Workflow", code: `flowchart TD
    request["Submit request"] --> review["Manager review"]
    review --> decision{"Approved?"}
    decision -->|Yes| approved["Process request"]
    decision -->|No| changes["Request changes"]
    changes --> request
    approved --> done(("Done"))` },
  system: { name: "System Architecture", code: `flowchart LR
    user(["User"]) --> web["Web application"]
    subgraph backend["Backend services"]
        api["API service"]
        worker["Background worker"]
        db[("Database")]
        api --> db
        api --> worker
        worker --> db
    end
    web --> api` },
  incident: { name: "Incident Response", code: `flowchart TD
    alert@{ shape: bolt, label: "Alert received" }
    triage{"Critical incident?"}
    team@{ shape: processes, label: "Response team" }
    fix["Apply fix"]
    verify@{ shape: hex, label: "Verify recovery" }
    closed(("Closed"))
    alert --> triage
    triage -->|Yes| team
    team --> fix
    fix --> verify
    verify --> closed
    triage -->|No| closed
    style alert fill:#ff5757,color:#ffffff,stroke:#b91c1c
    style closed fill:#00bf63,color:#ffffff,stroke:#08783f` },
  collaboration: { name: "Team Collaboration", code: `flowchart LR
    subgraph design["Design team"]
        brief["Project brief"]
        mockup["Create mockup"]
        brief --> mockup
    end
    subgraph engineering["Engineering team"]
        build["Build feature"]
        test["Test feature"]
        build --> test
    end
    mockup <--> build
    test --> release(["Release"])` },
  "vpn-connectivity": { name: "On-Premises to Azure VPN", code: `flowchart LR
    subgraph onprem["On-Premises Datacenter"]
        users(["Corporate users"])
        internal["Internal application"]
        vpnOnPrem@{ shape: hex, label: "VPN Gateway" }
        users --> internal
        internal --> vpnOnPrem
    end
    subgraph azure["Azure Datacenter"]
        vpnAzure@{ shape: hex, label: "Azure VPN Gateway" }
        vnet@{ shape: rounded, label: "Azure VNet" }
        vm["Application VM"]
        sql[("Azure SQL")]
        vpnAzure --> vnet
        vnet --> vm
        vm --> sql
    end
    vpnOnPrem <-->|IPsec VPN tunnel| vpnAzure
    style vpnOnPrem fill:#ffbd59,color:#111111,stroke:#c97b00
    style vpnAzure fill:#38b6ff,color:#ffffff,stroke:#0876b9
    style onprem fill:#fff8e8,stroke:#c97b00
    style azure fill:#eaf7ff,stroke:#0876b9` }
};

const STORAGE_KEY = "mermaid-flow-editor-code";
const NAME_STORAGE_KEY = "mermaid-flow-editor-name";
const PREVIEW_THEME_KEY = "mermaid-flow-editor-preview-theme";
const MOBILE_NOTICE_KEY = "mermaid-flow-editor-mobile-notice-seen";
const DIAGRAM_LIBRARY_KEY = "mermaid-flow-editor-diagram-library-v1";
const ACTIVE_DIAGRAM_KEY = "mermaid-flow-editor-active-diagram";
const RENDER_DELAY = 450;
const RENDERED_NODE_SELECTOR = "g.node, g.image-shape";
const SNAPSHOT_INTERVAL_MS = 2 * 60 * 1000;
const MAX_SNAPSHOTS_PER_DIAGRAM = 20;
const MAX_SNAPSHOT_CHARACTERS = 300000;
const NEW_DIAGRAM_CODE = `flowchart TD
    start["Start here"]`;

const elements = {
  editor: document.getElementById("codeEditor"),
  lineNumbers: document.getElementById("codeLineNumbers"),
  diagramName: document.getElementById("diagramName"),
  preview: document.getElementById("diagramPreview"),
  error: document.getElementById("errorMessage"),
  status: document.getElementById("renderStatus"),
  lineCount: document.getElementById("lineCount"),
  fileInput: document.getElementById("fileInput"),
  popup: document.getElementById("nodePopup"),
  nodeId: document.getElementById("nodeId"),
  nodeLabel: document.getElementById("nodeLabel"),
  nodeImageUrl: document.getElementById("nodeImageUrl"),
  fillColor: document.getElementById("fillColor"),
  textColor: document.getElementById("textColor"),
  borderColor: document.getElementById("borderColor"),
  edgeColor: document.getElementById("edgeColor"),
  toast: document.getElementById("toast"),
  quickAdd: document.getElementById("quickAddButton"),
  previewPanel: document.querySelector(".preview-panel"),
  fullscreenButton: document.getElementById("fullscreenButton"),
  previewThemeButton: document.getElementById("previewThemeButton"),
  undoButton: document.getElementById("undoButton"),
  redoButton: document.getElementById("redoButton"),
  zoomLevel: document.getElementById("zoomLevel")
};

let renderTimer;
let renderSequence = 0;
let selectedNodeId = null;
let selectedShape = "rectangle";
let pendingEdgeSource = null;
let quickAddSource = null;
let quickAddSubgraph = null;
let quickAddHideTimer;
let toastTimer;
let historyTimer;
let autoSaveTimer;
let history = [DEFAULT_CODE];
let historyIndex = 0;
let zoom = 100;
let panX = 0;
let panY = 0;
let panStart = null;
let pendingFitFrame = 0;
let openNodeAfterRender = null;
let selectedEdge = null;
let selectedEdgePath = null;
let selectedExportFormat = "svg";
let selectedSubgraphId = null;
let selectedSubgraphElement = null;
let shapeThumbnailObserver = null;
let nodeShapeThumbnailObserver = null;
let thumbnailRenderQueue = Promise.resolve();
let activeNodeDrag = null;
let suppressNodeClick = false;
let activeSubgraphDrag = null;
let suppressSubgraphClick = false;
let previewTheme = "light";
let pendingConfirmation = null;
let confirmationReturnFocus = null;
let activeLibraryShapeDrag = null;
const previewTouchPoints = new Map();
let pinchGesture = null;
let diagramLibrary = [];
let activeDiagramId = null;
let versionHistoryDiagramId = null;
let parsedEdgeCacheCode = null;
let parsedEdgeCache = [];
const subgraphRangeCache = new Map();
let nodePopupDrag = null;
const modalFocusOrigins = new WeakMap();

const PALETTE_COLORS = [
  "#000000", "#595959", "#808080", "#b3b3b3", "#d9d9d9", "#ffffff", "#ff3838", "#ff5757", "#ff66c4",
  "#cb6ce6", "#8c52ff", "#5e17eb", "#0097b2", "#0cc0df", "#5ce1e6", "#38b6ff", "#5271ff", "#0b53b6",
  "#00bf63", "#7ed957", "#b4ff72", "#ffde59", "#ffbd59", "#ff914d"
];

const FLOWCHART_SHAPES = [
  ["subgraph", "Subgraph"],
  ["rect", "Process"], ["rounded", "Event"], ["stadium", "Terminal"], ["subproc", "Subprocess"],
  ["cyl", "Database"], ["circle", "Start"], ["odd", "Odd"], ["diamond", "Decision"],
  ["hex", "Prepare"], ["lean-r", "Input / Output"], ["lean-l", "Output / Input"], ["datastore", "Datastore"],
  ["trap-b", "Priority action"], ["trap-t", "Manual operation"], ["dbl-circ", "Stop"], ["text", "Text block"],
  ["notch-rect", "Card"], ["lin-rect", "Lined process"], ["sm-circ", "Small start"], ["framed-circle", "Framed stop"],
  ["fork", "Fork / Join"], ["hourglass", "Collate"], ["comment", "Comment"], ["brace-r", "Comment right"],
  ["braces", "Comments"], ["bolt", "Communication"], ["doc", "Document"], ["delay", "Delay"],
  ["das", "Direct storage"], ["h-cyl", "Horizontal cylinder"], ["lin-cyl", "Disk storage"], ["curv-trap", "Display"], ["div-rect", "Divided process"],
  ["tri", "Extract"], ["win-pane", "Internal storage"], ["f-circ", "Junction"], ["lin-doc", "Lined document"],
  ["notch-pent", "Loop limit"], ["flip-tri", "Manual file"], ["sl-rect", "Manual input"], ["docs", "Documents"],
  ["processes", "Processes"], ["flag", "Paper tape"], ["bow-rect", "Stored data"], ["cross-circ", "Summary"],
  ["tag-doc", "Tagged document"], ["tag-rect", "Tagged process"], ["bang", "Bang"]
];
