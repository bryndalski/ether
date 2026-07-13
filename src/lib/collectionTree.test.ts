import { describe, expect, it } from "vitest";
import {
  buildTree,
  descendantCollectionIds,
  filterTree,
  matchingCollectionIds,
} from "./collectionTree";
import type { Collection, StoredRequest } from "./types";

function col(
  id: string,
  name: string,
  parent_id: string | null = null,
  sort_order = 0,
): Collection {
  return { id, name, parent_id, sort_order, docs_md: null };
}

function req(
  id: string,
  collection_id: string,
  name = id,
  method = "GET",
  url = "https://api/x",
  sort_order = 0,
): StoredRequest {
  return {
    id,
    collection_id,
    name,
    method,
    url,
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
    sort_order,
    docs_md: null,
    graphql: null,
    assertions: [],
  };
}

describe("buildTree", () => {
  it("nests by parent_id and sorts by sort_order then name", () => {
    const collections = [
      col("root", "Root", null, 0),
      col("b", "Bravo", "root", 1),
      col("a", "Alpha", "root", 0),
    ];
    const requests = [
      req("r2", "root", "zeta", "GET", "https://api/z", 1),
      req("r1", "root", "alpha", "POST", "https://api/a", 0),
    ];
    const { roots } = buildTree(collections, requests);
    expect(roots).toHaveLength(1);
    expect(roots[0].children.map((c) => c.collection.id)).toEqual(["a", "b"]);
    expect(roots[0].requests.map((r) => r.id)).toEqual(["r1", "r2"]);
  });

  it("surfaces orphan requests whose collection is missing", () => {
    const { roots, orphanRequests } = buildTree(
      [col("c1", "One")],
      [req("r1", "c1"), req("r2", "ghost")],
    );
    expect(roots[0].requests.map((r) => r.id)).toEqual(["r1"]);
    expect(orphanRequests.map((r) => r.id)).toEqual(["r2"]);
  });

  it("guards a malformed cyclic parent_id chain (no infinite loop)", () => {
    const collections = [
      col("x", "X", "y"),
      col("y", "Y", "x"), // cycle x <-> y
    ];
    const { roots } = buildTree(collections, []);
    // Neither is a real root, so nothing crashes and roots is empty.
    expect(roots).toEqual([]);
  });
});

describe("filterTree", () => {
  const tree = buildTree(
    [col("api", "API"), col("auth", "Auth")],
    [
      req("r1", "api", "List users", "GET", "https://api/users"),
      req("r2", "api", "Create user", "POST", "https://api/users"),
      req("r3", "auth", "Login", "POST", "https://api/login"),
    ],
  );

  it("passes the tree through for an empty query", () => {
    expect(filterTree(tree, "")).toBe(tree);
  });

  it("matches by request name substring and keeps matching folders", () => {
    const filtered = filterTree(tree, "list");
    expect(filtered.roots.map((n) => n.collection.id)).toEqual(["api"]);
    expect(filtered.roots[0].requests.map((r) => r.id)).toEqual(["r1"]);
    expect(matchingCollectionIds(filtered)).toContain("api");
  });

  it("matches by method and by url", () => {
    expect(filterTree(tree, "post").roots.map((n) => n.collection.id)).toEqual([
      "api",
      "auth",
    ]);
    expect(filterTree(tree, "login").roots.map((n) => n.collection.id)).toEqual(
      ["auth"],
    );
  });
});

describe("filterTree facets", () => {
  const tree = buildTree(
    [col("api", "API")],
    [
      req("r1", "api", "List", "GET", "https://api/users"),
      req("r2", "api", "Create", "POST", "https://api/users"),
      {
        ...req("r3", "api", "GqlOp", "POST", "https://api/graphql"),
        graphql: { operation_type: "query", query: "query { me }", variables_json: "{}" },
      },
    ],
  );

  it("filters by method (multi)", () => {
    const out = filterTree(tree, "", { methods: ["GET"], type: "all" });
    expect(out.roots[0].requests.map((r) => r.id)).toEqual(["r1"]);
  });

  it("filters by type rest vs graphql", () => {
    const rest = filterTree(tree, "", { methods: [], type: "rest" });
    expect(rest.roots[0].requests.map((r) => r.id).sort()).toEqual(["r1", "r2"]);
    const gql = filterTree(tree, "", { methods: [], type: "graphql" });
    expect(gql.roots[0].requests.map((r) => r.id)).toEqual(["r3"]);
  });

  it("combines facets with the text query", () => {
    const out = filterTree(tree, "users", { methods: ["POST"], type: "rest" });
    expect(out.roots[0].requests.map((r) => r.id)).toEqual(["r2"]);
  });

  it("drops a folder whose requests are all filtered out (no name-only rescue)", () => {
    const out = filterTree(tree, "", { methods: ["PUT"], type: "all" });
    expect(out.roots).toEqual([]);
  });
});

describe("descendantCollectionIds", () => {
  it("returns the full subtree inclusive", () => {
    const collections = [
      col("root", "Root"),
      col("child", "Child", "root"),
      col("grand", "Grand", "child"),
      col("other", "Other"),
    ];
    expect(descendantCollectionIds(collections, "root").sort()).toEqual([
      "child",
      "grand",
      "root",
    ]);
    expect(descendantCollectionIds(collections, "child").sort()).toEqual([
      "child",
      "grand",
    ]);
  });
});
