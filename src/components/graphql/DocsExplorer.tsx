import type { GraphQLSchema } from "graphql";
import { DocsBreadcrumb } from "./DocsBreadcrumb";
import { DocsTypePanel } from "./DocsTypePanel";
import type { DocsNav } from "../../hooks/useDocsNav";
import { EmptyState } from "../common/EmptyState";

interface DocsExplorerProps {
  schema: GraphQLSchema;
  nav: DocsNav;
}

/** The docs column (`.docs-col`). Shows the focused type with a breadcrumb; the
 *  root Query type is focused on open. Focusing a type (click a field type here,
 *  or a `.ftype` in the tree) pushes it onto the breadcrumb. */
export function DocsExplorer({ schema, nav }: DocsExplorerProps) {
  const focused = nav.focus ? schema.getType(nav.focus) : null;

  return (
    <div className="gql-col docs-col">
      <div className="col-head">Docs Explorer</div>
      <div className="col-body lok-scroll">
        <DocsBreadcrumb stack={nav.stack} onNavigate={nav.navigateTo} />
        {focused ? (
          <DocsTypePanel type={focused} onFocusType={nav.focusType} />
        ) : (
          <EmptyState
            headline="Wybierz typ"
            hint="Kliknij typ pola, by zobaczyć jego dokumentację."
            icon="~"
          />
        )}
      </div>
    </div>
  );
}
