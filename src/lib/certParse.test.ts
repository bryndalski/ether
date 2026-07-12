import { describe, expect, it } from "vitest";
import { certFingerprintSha256, parseCert } from "./certParse";

// A real self-signed leaf (CN=lokowka.test, SAN dNSName lokowka.test +
// www.lokowka.test), generated once with openssl. Known-good field values
// below come from `openssl x509 -noout -startdate -enddate -serial -fingerprint`.
const KNOWN_PEM = `-----BEGIN CERTIFICATE-----
MIIDOjCCAiKgAwIBAgIUNpWDHCBC07+JGC4HI/yeW3O43BMwDQYJKoZIhvcNAQEL
BQAwFzEVMBMGA1UEAwwMbG9rb3drYS50ZXN0MB4XDTI2MDcxMjIzMDIyMloXDTM2
MDcwOTIzMDIyMlowFzEVMBMGA1UEAwwMbG9rb3drYS50ZXN0MIIBIjANBgkqhkiG
9w0BAQEFAAOCAQ8AMIIBCgKCAQEA5txOrCwR3nSdqWSnaga028jJBOzGD3oGBGGA
pNOgeHSuAQXqvq09VYAJN/ZwWlgvpE4PnNuUPwx3b9xjtWwVBjL/SDjhrSOsbLkL
8qB5WoJyKXCn42LZRRjXFixfa5M+FAwqR4vZD7fwICsl3cC4dneichh89YBb/sOV
YD6NaSWFlNr8YWJHZvXKUqhih/pb8Wiycl6VMFgodxuYn3TTCJVeRdcH3PBCB/V2
ns0JLtk7+q6jiH0gybV0HqVolMMgBYr+TbJWK7ZufapWSPqMvDHjGAvsxF6kd0WX
suLHmm5GzV1tjT4RwXBf6sZvDMl75g66vjJe4TiZZXNxe9JjLQIDAQABo34wfDAd
BgNVHQ4EFgQUYEpp+TaobieuluMYhUQwxA2ygsEwHwYDVR0jBBgwFoAUYEpp+Tao
bieuluMYhUQwxA2ygsEwDwYDVR0TAQH/BAUwAwEB/zApBgNVHREEIjAgggxsb2tv
d2thLnRlc3SCEHd3dy5sb2tvd2thLnRlc3QwDQYJKoZIhvcNAQELBQADggEBAFd+
lrcmDUSOsPZeo4wGJqiRYJTovD4Tv/hh6enUKCqBFmU/49Cu2swBA24UFlJQziCn
5Qqb8G3FfVFcxApDtKiC5TEbiJREkv8Pl0awUJCEwlsvoqYbAq3HcHQtOc3fgULl
kz4CoQO8yAFZDlaigs/EWoza23+E77v+6BBYE3nl0g0TFuotuZbHtuD0Uw+wQ8Qk
VLJBqb3mrcqrfpqKc6OFy9fI/4ZpgXQr6tokRMxQvWM4VwOvNZ+XoJchFDODVTQs
Tsrm/OAcyFsWCcINgVM1Zi4fesmMG2KXw7cFvVGegGMijWTZwiT3FSdjVLecEEoP
5dkBASzhZdi8hzT2BSk=
-----END CERTIFICATE-----`;

const KNOWN_FINGERPRINT =
  "A3:EF:F5:B8:34:42:99:2F:FB:3A:5E:4A:C6:AA:E1:4F:FD:CE:D4:04:30:AA:7D:2F:0D:69:A5:6B:54:C8:74:20";

describe("certFingerprintSha256", () => {
  it("matches openssl's SHA-256 fingerprint", async () => {
    const fingerprint = await certFingerprintSha256(KNOWN_PEM);
    expect(fingerprint).toBe(KNOWN_FINGERPRINT);
  });
});

describe("parseCert (known-good PEM)", () => {
  it("extracts CN, issuer, validity, serial, and SANs", async () => {
    const cert = await parseCert(KNOWN_PEM);
    expect(cert.subjectCn).toBe("lokowka.test");
    expect(cert.issuerCn).toBe("lokowka.test");
    expect(cert.notBefore).toBe("2026-07-12T23:02:22.000Z");
    expect(cert.notAfter).toBe("2036-07-09T23:02:22.000Z");
    expect(cert.serialHex).toBe("36:95:83:1C:20:42:D3:BF:89:18:2E:07:23:FC:9E:5B:73:B8:DC:13");
    expect(cert.sans).toContain("lokowka.test");
    expect(cert.sans).toContain("www.lokowka.test");
    expect(cert.fingerprintSha256).toBe(KNOWN_FINGERPRINT);
    expect(cert.parseComplete).toBe(true);
  });
});

describe("parseCert (garbage / truncated PEM fallback)", () => {
  it("does not throw and still returns a fingerprint", async () => {
    // Valid base64 (so a fingerprint is computable) but not valid ASN.1.
    const garbage = `-----BEGIN CERTIFICATE-----\nQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=\n-----END CERTIFICATE-----`;
    const cert = await parseCert(garbage);
    expect(cert.parseComplete).toBe(false);
    expect(cert.subjectCn).toBeNull();
    expect(cert.notAfter).toBeNull();
    expect(cert.fingerprintSha256.length).toBeGreaterThan(0);
    expect(cert.raw).toBe(garbage);
  });
});
