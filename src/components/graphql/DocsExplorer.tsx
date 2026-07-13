import type { GraphQLSchema } from "graphql";
import { DocsBreadcrumb } from "./DocsBreadcrumb";
import { DocsTypePanel } from "./DocsTypePanel";
import type { DocsNav } from "../../hooks/useDocsNav";
import { EmptyState } from "../common/EmptyState";
import { Icon } from "../common/Icon";
import { useT } from "../../i18n/useT";

interface DocsExplorerProps {
  schema: GraphQLSchema;
  nav: DocsNav;
}

/** The docs column (`.docs-col`). Shows the focused type with a breadcrumb; the
 *  root Query type is focused on open. Focusing a type (click a field type here,
 *  or a `.ftype` in the tree) pushes it onto the breadcrumb. */
export function DocsExplorer({ schema, nav }: DocsExplorerProps) {
  const t = useT();
  const focused = nav.focus ? schema.getType(nav.focus) : null;

  return (
    <div className="gql-col docs-col">
      <div className="col-head">{t("graphql.docsColumn")}</div>
      <div className="col-body lok-scroll">
        <DocsBreadcrumb stack={nav.stack} onNavigate={nav.navigateTo} />
        {focused ? (
          <DocsTypePanel type={focused} onFocusType={nav.focusType} />
        ) : (
          <EmptyState
            compact
            headline={t("graphql.pickTypeHeadline")}
            hint={t("graphql.docsHint")}
            icon={<Icon name="i-book" size={18} />}
          />
        )}
      </div>
    </div>
  );
}
