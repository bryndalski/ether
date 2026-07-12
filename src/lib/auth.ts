// Auth-type UI helpers. Switching type produces a fresh default Auth of that
// variant; the FE only stores templates ({{secret.NAME}}) — it never resolves
// secrets (that happens in Rust at resolve time).

import type { Auth } from "./types";

export type AuthType = Auth["type"];

/** A fresh default Auth for the selected type. */
export function defaultAuth(type: AuthType): Auth {
  switch (type) {
    case "none":
      return { type: "none" };
    case "bearer":
      return { type: "bearer", token: "" };
    case "basic":
      return { type: "basic", username: "", password: "" };
    case "api_key":
      return { type: "api_key", name: "", value: "", placement: "header" };
    case "sig_v4":
      return { type: "sig_v4", profile: "", region: "", service: "" };
  }
}
