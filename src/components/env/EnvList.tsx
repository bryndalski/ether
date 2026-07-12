import type { Environment } from "../../lib/types";
import { envKind } from "../../state/useEnvStore";
import { Icon } from "../common/Icon";

interface EnvListProps {
  environments: Environment[];
  selectedEnvId: string | null;
  onSelect: (id: string) => void;
  onCreate: (parentId: string | null) => void;
  onRequestDelete: (id: string) => void;
}

interface EnvRowProps {
  environment: Environment;
  depth: number;
  selected: boolean;
  onSelect: (id: string) => void;
  onRequestDelete: (id: string) => void;
}

function EnvRow({
  environment,
  depth,
  selected,
  onSelect,
  onRequestDelete,
}: EnvRowProps) {
  const kind = envKind(environment);
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <button
        type="button"
        className={`env-list-row${selected ? " selected" : ""}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        aria-current={selected}
        data-env={kind}
        onClick={() => onSelect(environment.id)}
      >
        <span className="env-dot" aria-hidden />
        <span className="truncate flex-1">{environment.name}</span>
        {kind === "prod" && (
          <span className="env-prod-tag">
            <Icon name="i-shield" size={11} />
            PROD
          </span>
        )}
      </button>
      <button
        type="button"
        className="icon-btn danger"
        aria-label={`Usuń środowisko ${environment.name}`}
        onClick={() => onRequestDelete(environment.id)}
      >
        <Icon name="i-trash" size={13} />
      </button>
    </div>
  );
}

/** Left column: environments grouped by base (a parent env then its children
 *  indented), with create / select / delete. */
export function EnvList({
  environments,
  selectedEnvId,
  onSelect,
  onCreate,
  onRequestDelete,
}: EnvListProps) {
  const bases = environments.filter((e) => e.parent_id === null);
  const childrenOf = (id: string) =>
    environments.filter((e) => e.parent_id === id);

  return (
    <div className="env-list">
      <div className="env-list-scroll lok-scroll" role="listbox" aria-label="Środowiska">
        {bases.map((base) => (
          <div key={base.id}>
            <EnvRow
              environment={base}
              depth={0}
              selected={base.id === selectedEnvId}
              onSelect={onSelect}
              onRequestDelete={onRequestDelete}
            />
            {childrenOf(base.id).map((child) => (
              <EnvRow
                key={child.id}
                environment={child}
                depth={1}
                selected={child.id === selectedEnvId}
                onSelect={onSelect}
                onRequestDelete={onRequestDelete}
              />
            ))}
          </div>
        ))}
        {environments.length === 0 && (
          <p
            style={{
              color: "var(--lok-text-tertiary)",
              fontSize: "var(--lok-fs-xs)",
              padding: "8px",
            }}
          >
            Brak środowisk.
          </p>
        )}
      </div>
      <button
        type="button"
        className="env-list-add"
        onClick={() => onCreate(null)}
      >
        <Icon name="i-plus" size={15} />
        Nowe środowisko
      </button>
    </div>
  );
}
