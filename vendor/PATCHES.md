# Local Mermaid patches

`mermaid.min.js`: In Dagre's `extractor` (`f0e`), the explicit-direction
cluster branch also requires `!Br.get(i).externalConnections`.

Extracting a cluster with connections to its children from outside the cluster
disconnects those edges from their actual endpoints. For example, with an
explicit `direction TB` inside `sg1`, `n3 --> n2` starts at the cluster boundary
instead of the internal node `n3`. Keep externally connected clusters in the
parent graph, as the existing implicit-direction branch already does. Isolated
clusters continue to use their explicit direction.

Recheck this patch when replacing the Mermaid bundle. Open
`tests/subgraph-connections.html` in a browser to run the rendering regression
checks against the bundled Dagre and ELK engines.

`mermaid-layout-elk/mermaid-layout-elk.iife.min.js`: In
`buildSubgraphLayoutOptions` (`EWt`), set ELK node size constraints to
`[MINIMUM_SIZE, NODE_LABELS]` and a minimum width of the measured title width
plus twice the greater of the node padding and 16 pixels. ELK must reserve
title space before packing compound graphs; expanding a cluster only during
SVG drawing can overlap adjacent groups and escape parent bounds. This also
reserves some clearance for the title and the preview shadows.

The group's `addVertex` measurement also uses `insertCluster` on a temporary
copy, then removes it, instead of `labelHelper`. The generic helper can wrap
or measure a title differently from the actual cluster renderer. Even with
minimum-size constraints, that underestimated width allowed a long-titled
child to spill out of its parent. Use the returned `labelBBox` for layout.

Run `tests/nested-subgraph-spacing.html` when updating the ELK bundle. It checks
title containment, parent containment, and spacing with connected and
disconnected nested groups in both diagram directions, including two sibling
subgraphs inside the same parent.

The ELK renderer accepts an optional `prepareGraph` callback in its rendering
options, invoked before `elk.layout`. If it returns a function, that function
receives the resulting graph before drawing. `assets/js/compact-layout.js`
uses these hooks to reserve grid-sized footprints for independent leaf groups
and restore their children at packed positions. Standard ELK has no callback
and retains its existing behavior. Test with `tests/compact-layout.html`.
