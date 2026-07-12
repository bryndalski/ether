// Owns everything schema-side: cache-first hydrate -> introspect via
// resolve_and_send (carrying the draft's headers/auth) -> SDL fallback, as a
// small state machine. Introspection calls resolveAndSend DIRECTLY (not the
// shared useSendRequest) so an introspection response never clobbers the
// operation's ResponseDock.

import { useCallback, useEffect, useRef, useState } from "react";
import type { GraphQLSchema } from "graphql";
import { gqlSchemaGet, gqlSchemaPut, resolveAndSend } from "../lib/ipc";
import type { StoredRequest } from "../lib/types";
import { useEnvStore } from "../state/useEnvStore";
import {
  buildIntrospectionRequest,
  countSchemaTypes,
  introspectionEnvelope,
  parseCache,
  parseSchemaResponse,
  sdlEnvelope,
} from "../lib/graphqlIntrospection";

export type SchemaState =
  | "no-schema"
  | "introspecting"
  | "ready"
  | "error"
  | "sdl-fallback";

export interface GraphqlSchemaApi {
  state: SchemaState;
  schema: GraphQLSchema | null;
  typeCount: number;
  error: string | null;
  lastRefreshedAt: string | null;
  sdlText: string;
  refresh: () => Promise<void>;
  applySdl: (sdl: string) => void;
  setSdlText: (sdl: string) => void;
}

export function useGraphqlSchema(draft: StoredRequest): GraphqlSchemaApi {
  const endpointUrl = draft.url;
  const activeEnvironmentId = useEnvStore((s) => s.activeEnvironmentId);

  const [state, setState] = useState<SchemaState>("no-schema");
  const [schema, setSchema] = useState<GraphQLSchema | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [sdlText, setSdlText] = useState("");

  // Latest-wins guard so a double-click on Refresh doesn't race.
  const introspectSeq = useRef(0);
  // Keep the freshest draft available to refresh() without re-creating it.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const envRef = useRef(activeEnvironmentId);
  envRef.current = activeEnvironmentId;

  function applyReady(next: GraphQLSchema, kind: SchemaState) {
    setSchema(next);
    setError(null);
    setState(kind);
  }

  // Cache-first hydrate on open and whenever the endpoint URL changes.
  useEffect(() => {
    let alive = true;
    if (!endpointUrl || endpointUrl.trim() === "") {
      setState("no-schema");
      setSchema(null);
      return;
    }
    void gqlSchemaGet(endpointUrl).then((cached) => {
      if (!alive) return;
      if (!cached) {
        setState("no-schema");
        setSchema(null);
        return;
      }
      try {
        const next = parseCache(cached);
        const isSdl = cached.includes("__lok_sdl");
        if (isSdl) setSdlText(JSON.parse(cached).__lok_sdl ?? "");
        applyReady(next, isSdl ? "sdl-fallback" : "ready");
      } catch (err) {
        setError(`Cached schema unreadable: ${String(err)}`);
        setState("no-schema");
      }
    });
    return () => {
      alive = false;
    };
  }, [endpointUrl]);

  const refresh = useCallback(async () => {
    const url = draftRef.current.url;
    if (!url || url.trim() === "") {
      setError("Set an endpoint URL before introspecting.");
      setState("error");
      return;
    }
    const seq = ++introspectSeq.current;
    setState("introspecting");
    setError(null);
    try {
      const request = buildIntrospectionRequest(draftRef.current, url);
      const response = await resolveAndSend(request, envRef.current);
      if (seq !== introspectSeq.current) return; // superseded
      if (response.status < 200 || response.status >= 300) {
        setError(`Introspection HTTP ${response.status}.`);
        setState("error");
        return;
      }
      const result = parseSchemaResponse(response.body);
      if (result.error || !result.schema) {
        setError(result.error ?? "Introspection failed.");
        setState("error");
        return;
      }
      const introspectionData = JSON.parse(response.body).data;
      void gqlSchemaPut(url, introspectionEnvelope(introspectionData));
      setLastRefreshedAt(new Date().toISOString());
      applyReady(result.schema, "ready");
    } catch (err) {
      if (seq !== introspectSeq.current) return;
      setError(String(err));
      setState("error");
    }
  }, []);

  const applySdl = useCallback((sdl: string) => {
    const url = draftRef.current.url;
    try {
      const next = parseCache(sdlEnvelope(sdl));
      if (url && url.trim() !== "") {
        void gqlSchemaPut(url, sdlEnvelope(sdl));
      }
      setSdlText(sdl);
      setLastRefreshedAt(new Date().toISOString());
      applyReady(next, "sdl-fallback");
    } catch (err) {
      setSdlText(sdl);
      setError(`SDL parse error: ${String(err)}`);
      setState("sdl-fallback");
      setSchema(null);
    }
  }, []);

  return {
    state,
    schema,
    typeCount: schema ? countSchemaTypes(schema) : 0,
    error,
    lastRefreshedAt,
    sdlText,
    refresh,
    applySdl,
    setSdlText,
  };
}
