"use strict";

function createCompactLayoutLoader(elk) {
  return {
    name: "elk.compact",
    algorithm: elk.algorithm,
    loader: async () => {
      const renderer = await elk.loader();
      return { render: (data, svg, helpers, options, context) => renderer.render(
        data, svg, helpers, { ...options, prepareGraph: prepareCompactElkGraph }, context
      ) };
    }
  };
}

function prepareCompactElkGraph(graph) {
  const connected = new Set();
  const packed = new Map();
  function collect(node) {
    (node.edges || []).forEach(edge => [...edge.sources, ...edge.targets].forEach(id => connected.add(id)));
    (node.children || []).forEach(collect);
  }
  collect(graph);
  function pack(node) {
    const children = node.children || [];
    children.forEach(pack);
    if (children.length) {
      // Keep placement compact without ELK's post-compaction pass: that pass
      // can move compound groups without keeping their boundary routes valid.
      Object.assign(node.layoutOptions, {
        "elk.layered.nodePlacement.strategy": "LINEAR_SEGMENTS"
      });
    }
    // Only pack independent leaves. Edges to the enclosing group remain valid;
    // edges involving any child keep the entire group in the layered layout.
    if (node !== graph && children.length >= 3 && children.every(child => !child.isGroup && !connected.has(child.id))) {
      const columns = Math.ceil(Math.sqrt(children.length));
      const rows = Math.ceil(children.length / columns);
      const cellWidth = Math.max(...children.map(child => child.width));
      const cellHeight = Math.max(...children.map(child => child.height));
      const top = Math.ceil((node.labelData?.height || 20) + 20);
      node.width = Math.max(columns * cellWidth + (columns - 1) * 24 + 40, (node.labelData?.width || 0) + 40);
      node.height = rows * cellHeight + (rows - 1) * 24 + top + 20;
      node.layoutOptions["elk.nodeSize.minimum"] = `(${Math.ceil(node.width)},${Math.ceil(node.height)})`;
      const left = (node.width - columns * cellWidth - (columns - 1) * 24) / 2;
      children.forEach((child, index) => {
        child.x = left + (index % columns) * (cellWidth + 24) + (cellWidth - child.width) / 2;
        child.y = top + Math.floor(index / columns) * (cellHeight + 24) + (cellHeight - child.height) / 2;
      });
      packed.set(node.id, children);
      // Route the enclosing graph around the final packed footprint. Restore
      // these edge-free children afterwards; their source membership is unchanged.
      node.children = [];
    }
  }
  pack(graph);
  return function restore(node) {
    if (packed.has(node.id)) node.children = packed.get(node.id);
    (node.children || []).forEach(restore);
  };
}

