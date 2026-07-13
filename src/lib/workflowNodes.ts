// Pure factory for new workflow nodes dropped from the palette. Kept out of the
// hook so node defaults are one place and unit-testable. Ids are generated with
// the shared id helper so they never collide with a StoredRequest id.

import { makeId } from "./ids";
import type { StoredRequest } from "./types";
import type { NodePosition, WorkflowNode, WorkflowNodeKind } from "./workflow";

/** A blank, self-contained request the inspector edits when a Request node is
 *  configured inline (rather than referencing a saved request). Mirrors the
 *  StoredRequest defaults used when creating a request in a collection, so the
 *  Rust engine executes it via the identical path (resolve → execute). */
export function blankInlineRequest(name: string): StoredRequest {
  return {
    id: makeId("req"),
    collection_id: "",
    name,
    method: "GET",
    url: "",
    headers: [],
    query_params: [],
    body: { type: "none" },
    auth: { type: "none" },
    options: {
      follow_redirects: true,
      max_redirects: 10,
      timeout_ms: 30_000,
      insecure: false,
      ca_bundle_path: null,
      compressed: true,
      cookie_jar: null,
    },
    sort_order: 0,
    docs_md: null,
    graphql: null,
    assertions: [],
    pre_script: null,
    post_script: null,
  };
}

/** Create a new node of `kind` at `position` with sensible v1 defaults. A request
 *  node starts as an empty reference the inspector then fills in. */
export function createNode(
  kind: WorkflowNodeKind,
  position: NodePosition,
): WorkflowNode {
  const id = makeId("wf-node");
  switch (kind) {
    case "request":
      return { kind: "request", id, request_ref: "", position };
    case "extract":
      return { kind: "extract", id, source: "$.", var_name: "", position };
    case "condition":
      return {
        kind: "condition",
        id,
        expr: { type: "status_equals", expected: 200 },
        position,
      };
    case "delay":
      return { kind: "delay", id, ms: 500, position };
  }
}

/** The palette's node kinds, in display order. */
export const PALETTE_KINDS: readonly WorkflowNodeKind[] = [
  "request",
  "extract",
  "condition",
  "delay",
];
