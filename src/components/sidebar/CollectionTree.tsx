import { useCollectionsStore } from "../../state/useCollectionsStore";
import type { Collection, StoredRequest } from "../../lib/types";
import { RequestRow } from "./RequestRow";

interface CollectionTreeProps {
  collections: Collection[];
  requests: StoredRequest[];
  activeRequestId: string | null;
}

/** Flat-ish collection tree: each collection group with its requests, plus any
 *  orphan requests (no matching collection). Drag & drop is out of scope for
 *  the shell milestone. */
export function CollectionTree({
  collections,
  requests,
  activeRequestId,
}: CollectionTreeProps) {
  const selectRequest = useCollectionsStore((state) => state.selectRequest);

  const grouped = collections.map((collection) => ({
    collection,
    items: requests.filter((request) => request.collection_id === collection.id),
  }));
  const collectionIds = new Set(collections.map((collection) => collection.id));
  const orphans = requests.filter(
    (request) => !collectionIds.has(request.collection_id),
  );

  return (
    <nav aria-label="Kolekcje" className="flex flex-col py-1">
      {grouped.map(({ collection, items }) => (
        <div key={collection.id}>
          <p
            className="px-3 pb-1 pt-2 uppercase"
            style={{
              color: "var(--lok-text-tertiary)",
              fontSize: "var(--lok-fs-2xs)",
              letterSpacing: "var(--lok-tracking-caps)",
            }}
          >
            {collection.name}
          </p>
          {items.map((request) => (
            <RequestRow
              key={request.id}
              request={request}
              selected={request.id === activeRequestId}
              onSelect={selectRequest}
            />
          ))}
        </div>
      ))}
      {orphans.length > 0 && (
        <div>
          {orphans.map((request) => (
            <RequestRow
              key={request.id}
              request={request}
              selected={request.id === activeRequestId}
              onSelect={selectRequest}
            />
          ))}
        </div>
      )}
    </nav>
  );
}
