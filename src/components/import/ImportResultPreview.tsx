import { MethodBadge } from "../common/MethodBadge";
import { Icon } from "../common/Icon";
import type { ImportResult } from "../../lib/types";
import { useT } from "../../i18n/useT";

interface ImportResultPreviewProps {
  result: ImportResult;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Dumb preview of an ImportResult: counts, a collection→request tree, and a
 *  prominent warnings block (skipped scripts / detected secrets), never
 *  color-only (icon + text), announced via aria-live. */
export function ImportResultPreview({ result }: ImportResultPreviewProps) {
  const t = useT();
  return (
    <div className="import-modal-body" style={{ paddingTop: 0 }}>
      <p className="import-counts lok-tnums">
        {t("import.previewSummary", {
          collections: result.collections.length,
          requests: result.requests.length,
          environments: result.environments.length,
        })}
      </p>

      {result.warnings.length > 0 && (
        <div className="import-warnings" role="status" aria-live="polite">
          {result.warnings.map((warning, index) => (
            <span className="import-warning-row" key={`${warning}-${index}`}>
              <Icon name="i-alert" size={14} />
              <span>{warning}</span>
            </span>
          ))}
        </div>
      )}

      <div className="import-tree">
        {result.collections.map((collection) => (
          <div key={collection.id}>
            <div className="import-tree-collection">{collection.name}</div>
            {result.requests
              .filter((request) => request.collection_id === collection.id)
              .map((request) => (
                <div className="import-tree-request" key={request.id}>
                  <MethodBadge method={request.method} />
                  <span>{request.name}</span>
                  <span className="import-tree-host">{hostOf(request.url)}</span>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
