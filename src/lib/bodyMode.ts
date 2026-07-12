// Body-mode UI enum ↔ the tagged `Body` contract. The select exposes six modes
// (three raw content types collapse into the single `raw` variant); transitions
// preserve raw text across content-type flips.

import type { Body, KeyValue, MultipartPart } from "./types";

export type BodyMode =
  | "none"
  | "raw-json"
  | "raw-xml"
  | "raw-text"
  | "form"
  | "multipart";

const RAW_CONTENT_TYPE: Record<"raw-json" | "raw-xml" | "raw-text", string> = {
  "raw-json": "application/json",
  "raw-xml": "application/xml",
  "raw-text": "text/plain",
};

/** Which BodyMode a stored `Body` currently represents. */
export function bodyModeOf(body: Body): BodyMode {
  switch (body.type) {
    case "none":
      return "none";
    case "form_urlencoded":
      return "form";
    case "multipart":
      return "multipart";
    case "raw":
      if (body.content_type.includes("xml")) return "raw-xml";
      if (body.content_type.includes("json")) return "raw-json";
      return "raw-text";
  }
}

/**
 * Build the new `Body` for a mode transition. Raw text is carried across the
 * three raw variants; switching to form/multipart/none starts fresh (the caller
 * may cache prior fields/parts and pass them in to restore).
 */
export function bodyForMode(
  mode: BodyMode,
  previous: Body,
  cache: { rawText: string; fields: KeyValue[]; parts: MultipartPart[] },
): Body {
  switch (mode) {
    case "none":
      return { type: "none" };
    case "raw-json":
    case "raw-xml":
    case "raw-text": {
      const text = previous.type === "raw" ? previous.text : cache.rawText;
      return { type: "raw", content_type: RAW_CONTENT_TYPE[mode], text };
    }
    case "form": {
      const fields =
        previous.type === "form_urlencoded" ? previous.fields : cache.fields;
      return { type: "form_urlencoded", fields };
    }
    case "multipart": {
      const parts = previous.type === "multipart" ? previous.parts : cache.parts;
      return { type: "multipart", parts };
    }
  }
}
