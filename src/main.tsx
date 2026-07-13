import React from "react";
import ReactDOM from "react-dom/client";

import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/primitives.css";
import "./styles/completion.css";
import "./styles/tailwind.css";
import "./components/palette/palette.css";
import "./components/common/kv-grid.css";
import "./components/workbench/workbench.css";
import "./components/workbench/tests/testing.css";
import "./components/workbench/scripts/scripts.css";
import "./components/graphql/graphql.css";
import "./components/workflow/workflow.css";

import App from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
