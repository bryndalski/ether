import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TlsSummary } from "./TlsSummary";
import type { TlsInfo } from "../../lib/types";

const tls: TlsInfo = {
  protocol: "TLSv1.3",
  cipher: "TLS_AES_128_GCM_SHA256",
  verify_ok: true,
  cert_chain: [],
};

describe("TlsSummary", () => {
  it("shows protocol, cipher and a verified badge", () => {
    render(<TlsSummary tls={tls} insecure={false} />);
    expect(screen.getByText("TLSv1.3")).toBeInTheDocument();
    expect(screen.getByText("TLS_AES_128_GCM_SHA256")).toBeInTheDocument();
    expect(screen.getByText("Zweryfikowany")).toBeInTheDocument();
  });

  it("shows an unverified badge when verify_ok is false", () => {
    render(<TlsSummary tls={{ ...tls, verify_ok: false }} insecure={false} />);
    expect(screen.getByText("Niezweryfikowany")).toBeInTheDocument();
  });

  it("adds the --insecure note when verification was skipped", () => {
    render(<TlsSummary tls={tls} insecure />);
    expect(screen.getByText(/--insecure/)).toBeInTheDocument();
  });
});
