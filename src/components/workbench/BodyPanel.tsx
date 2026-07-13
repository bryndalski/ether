import { useRef } from "react";
import type { Body, KeyValue, MultipartPart } from "../../lib/types";
import { bodyForMode, bodyModeOf, type BodyMode } from "../../lib/bodyMode";
import { BodyModeSelect } from "./BodyModeSelect";
import { BodyEditor } from "./BodyEditor";
import { KeyValueTable } from "./KeyValueTable";
import { MultipartTable } from "./MultipartTable";
import { useT } from "../../i18n/useT";

interface BodyPanelProps {
  body: Body;
  onChange: (body: Body) => void;
}

/** Choose the body mode and render the matching editor. Raw text is cached in a
 *  ref so toggling away and back to a raw variant restores what was typed. */
export function BodyPanel({ body, onChange }: BodyPanelProps) {
  const t = useT();
  const cache = useRef({
    rawText: "",
    fields: [] as KeyValue[],
    parts: [] as MultipartPart[],
  });

  if (body.type === "raw") cache.current.rawText = body.text;
  if (body.type === "form_urlencoded") cache.current.fields = body.fields;
  if (body.type === "multipart") cache.current.parts = body.parts;

  function changeMode(mode: BodyMode) {
    onChange(bodyForMode(mode, body, cache.current));
  }

  return (
    <div className="pane" role="tabpanel" aria-label={t("workbench.bodyPane")}>
      <div className="pane-inner">
        <BodyModeSelect mode={bodyModeOf(body)} onChange={changeMode} />
        {body.type === "none" && (
          <p className="wb-label">{t("workbench.noBody")}</p>
        )}
        {body.type === "raw" && (
          <BodyEditor
            value={body.text}
            contentType={body.content_type}
            onChange={(text) =>
              onChange({ type: "raw", content_type: body.content_type, text })
            }
          />
        )}
        {body.type === "form_urlencoded" && (
          <KeyValueTable
            rows={body.fields}
            onChange={(fields) => onChange({ type: "form_urlencoded", fields })}
            keyHeader="Field"
          />
        )}
        {body.type === "multipart" && (
          <MultipartTable
            parts={body.parts}
            onChange={(parts) => onChange({ type: "multipart", parts })}
          />
        )}
      </div>
    </div>
  );
}
