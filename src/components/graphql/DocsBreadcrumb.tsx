import { Fragment } from "react";
import { useT } from "../../i18n/useT";

interface DocsBreadcrumbProps {
  stack: string[];
  onNavigate: (index: number) => void;
}

/** A `Query › User › Role` trail; clicking an ancestor pops back to it. */
export function DocsBreadcrumb({ stack, onNavigate }: DocsBreadcrumbProps) {
  const t = useT();
  if (stack.length <= 1) return null;
  return (
    <nav className="docs-breadcrumb" aria-label={t("graphql.docsPath")}>
      {stack.map((name, index) => (
        <Fragment key={`${name}-${index}`}>
          {index > 0 && (
            <span className="sep" aria-hidden="true">
              ›
            </span>
          )}
          <button
            type="button"
            onClick={() => onNavigate(index)}
            aria-current={index === stack.length - 1 ? "page" : undefined}
          >
            {name}
          </button>
        </Fragment>
      ))}
    </nav>
  );
}
