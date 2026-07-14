import { Icon } from "../common/Icon";
import { useT } from "../../i18n/useT";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

export type GqlOp = "query" | "mutation" | "subscription";

export type RequestKindPick =
  | { graphql: false; method: string }
  | { graphql: true; op: GqlOp };

interface RequestKindSelectProps {
  method: string;
  /** Active GraphQL operation type, or null when the draft is REST. */
  graphqlOp: GqlOp | null;
  onPick: (pick: RequestKindPick) => void;
}

const GQL_SHORT: Record<GqlOp, string> = {
  query: "QUERY",
  mutation: "MUTATION",
  subscription: "SUB·WSS",
};

/** ONE picker for what this request IS: an HTTP verb or a GraphQL operation
 *  (subscription rides WSS). Replaces the REST|GraphQL toggle + method dropdown
 *  + operation picker triple. A native <select> with optgroups is overlaid
 *  transparently, so keyboard + a11y come for free (the MethodSelect pattern). */
export function RequestKindSelect({
  method,
  graphqlOp,
  onPick,
}: RequestKindSelectProps) {
  const t = useT();
  const value = graphqlOp ? `gql:${graphqlOp}` : `http:${method.toUpperCase()}`;
  return (
    <div className="method-select kind-select">
      {graphqlOp ? (
        <span className="method gql">
          <Icon name="i-graph" size={13} />
          {GQL_SHORT[graphqlOp]}
        </span>
      ) : (
        <span className={`method ${method.toLowerCase()}`}>
          {method.toUpperCase()}
        </span>
      )}
      <Icon name="i-chev" size={13} />
      <select
        aria-label={t("workbench.requestKindAria")}
        value={value}
        onChange={(event) => {
          const [proto, rest] = event.target.value.split(":");
          if (proto === "gql") onPick({ graphql: true, op: rest as GqlOp });
          else onPick({ graphql: false, method: rest });
        }}
      >
        <optgroup label="HTTP">
          {HTTP_METHODS.map((verb) => (
            <option key={verb} value={`http:${verb}`}>
              {verb}
            </option>
          ))}
        </optgroup>
        <optgroup label="GraphQL">
          <option value="gql:query">GraphQL · query</option>
          <option value="gql:mutation">GraphQL · mutation</option>
          <option value="gql:subscription">GraphQL · subscription (WSS)</option>
        </optgroup>
      </select>
    </div>
  );
}
