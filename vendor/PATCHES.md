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
