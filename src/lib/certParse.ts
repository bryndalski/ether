// Best-effort pure-JS PEM → DER → minimal ASN.1 field extraction, with a hard
// fallback to raw PEM + SHA-256 fingerprint. NO heavy libs (no node-forge /
// pkijs / asn1js). Every field getter degrades to null on any parse miss and
// sets parseComplete=false; the fingerprint is ALWAYS available (SubtleCrypto).

export interface ParsedCert {
  subjectCn: string | null;
  issuerCn: string | null;
  notBefore: string | null; // ISO
  notAfter: string | null; // ISO
  sans: string[];
  serialHex: string | null;
  fingerprintSha256: string; // ALWAYS set
  raw: string; // the PEM
  parseComplete: boolean;
}

interface Tlv {
  tag: number;
  length: number;
  headerLength: number;
  contentStart: number;
  contentEnd: number;
}

const OID_COMMON_NAME = "2.5.4.3";
const OID_SUBJECT_ALT_NAME = "2.5.29.17";

/** Strip PEM armor and base64-decode to DER bytes. Throws on garbage base64. */
function pemToDer(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** Uppercase colon-separated hex of a byte array. */
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0").toUpperCase())
    .join(":");
}

/** Always-available SHA-256 fingerprint of the DER, independent of ASN.1. */
export async function certFingerprintSha256(pem: string): Promise<string> {
  const der = pemToDer(pem);
  const digest = await crypto.subtle.digest("SHA-256", der);
  return toHex(new Uint8Array(digest));
}

/** Read one DER TLV at `offset`. Supports short + long-form length. */
function readTlv(bytes: Uint8Array, offset: number): Tlv {
  const tag = bytes[offset];
  let lengthByte = bytes[offset + 1];
  let headerLength = 2;
  let length: number;
  if (lengthByte < 0x80) {
    length = lengthByte;
  } else {
    const numBytes = lengthByte & 0x7f;
    length = 0;
    for (let i = 0; i < numBytes; i += 1) {
      length = length * 256 + bytes[offset + 2 + i];
    }
    headerLength = 2 + numBytes;
  }
  const contentStart = offset + headerLength;
  return {
    tag,
    length,
    headerLength,
    contentStart,
    contentEnd: contentStart + length,
  };
}

/** Iterate children of a constructed TLV. */
function children(bytes: Uint8Array, parent: Tlv): Tlv[] {
  const out: Tlv[] = [];
  let cursor = parent.contentStart;
  while (cursor < parent.contentEnd) {
    const tlv = readTlv(bytes, cursor);
    out.push(tlv);
    cursor = tlv.contentEnd;
  }
  return out;
}

/** Decode an ASN.1 OBJECT IDENTIFIER's content bytes to dotted string. */
function decodeOid(bytes: Uint8Array, tlv: Tlv): string {
  const content = bytes.subarray(tlv.contentStart, tlv.contentEnd);
  const parts: number[] = [];
  const first = content[0];
  parts.push(Math.floor(first / 40), first % 40);
  let value = 0;
  for (let i = 1; i < content.length; i += 1) {
    value = value * 128 + (content[i] & 0x7f);
    if ((content[i] & 0x80) === 0) {
      parts.push(value);
      value = 0;
    }
  }
  return parts.join(".");
}

/** ASN.1 time (UTCTime / GeneralizedTime) → ISO string. */
function decodeTime(bytes: Uint8Array, tlv: Tlv): string | null {
  const raw = new TextDecoder().decode(
    bytes.subarray(tlv.contentStart, tlv.contentEnd),
  );
  let year: number;
  let rest: string;
  if (tlv.tag === 0x17) {
    // UTCTime YYMMDDHHMMSSZ, pivot at 2049.
    const yy = Number(raw.slice(0, 2));
    year = yy >= 50 ? 1900 + yy : 2000 + yy;
    rest = raw.slice(2);
  } else if (tlv.tag === 0x18) {
    // GeneralizedTime YYYYMMDDHHMMSSZ.
    year = Number(raw.slice(0, 4));
    rest = raw.slice(4);
  } else {
    return null;
  }
  const month = Number(rest.slice(0, 2));
  const day = Number(rest.slice(2, 4));
  const hour = Number(rest.slice(4, 6));
  const minute = Number(rest.slice(6, 8));
  const second = Number(rest.slice(8, 10)) || 0;
  const date = new Date(
    Date.UTC(year, month - 1, day, hour, minute, second),
  );
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Find the CN string inside a Name (RDNSequence). */
function extractCn(bytes: Uint8Array, name: Tlv): string | null {
  for (const rdn of children(bytes, name)) {
    for (const attr of children(bytes, rdn)) {
      const parts = children(bytes, attr);
      if (parts.length < 2) continue;
      if (parts[0].tag !== 0x06) continue;
      if (decodeOid(bytes, parts[0]) !== OID_COMMON_NAME) continue;
      return new TextDecoder().decode(
        bytes.subarray(parts[1].contentStart, parts[1].contentEnd),
      );
    }
  }
  return null;
}

/** Extract dNSName SANs from the extensions [3] block. Best-effort. */
function extractSans(bytes: Uint8Array, tbs: Tlv): string[] {
  const sans: string[] = [];
  const extensionsWrapper = children(bytes, tbs).find(
    (child) => child.tag === 0xa3,
  );
  if (!extensionsWrapper) return sans;
  const extensionsSeq = children(bytes, extensionsWrapper)[0];
  if (!extensionsSeq) return sans;
  for (const ext of children(bytes, extensionsSeq)) {
    const extParts = children(bytes, ext);
    if (extParts.length < 2 || extParts[0].tag !== 0x06) continue;
    if (decodeOid(bytes, extParts[0]) !== OID_SUBJECT_ALT_NAME) continue;
    const octetString = extParts[extParts.length - 1];
    const sanSeq = readTlv(bytes, octetString.contentStart);
    for (const generalName of children(bytes, sanSeq)) {
      // dNSName is context tag [2] (0x82).
      if (generalName.tag === 0x82) {
        sans.push(
          new TextDecoder().decode(
            bytes.subarray(generalName.contentStart, generalName.contentEnd),
          ),
        );
      }
    }
  }
  return sans;
}

/** Parse a PEM cert into the handful of fields users care about, with a hard
 *  fallback: any miss returns null + parseComplete=false; fingerprint is always
 *  set. Never throws for a decodable-base64 PEM. */
export async function parseCert(pem: string): Promise<ParsedCert> {
  const fingerprintSha256 = await certFingerprintSha256(pem);
  const fallback: ParsedCert = {
    subjectCn: null,
    issuerCn: null,
    notBefore: null,
    notAfter: null,
    sans: [],
    serialHex: null,
    fingerprintSha256,
    raw: pem,
    parseComplete: false,
  };

  try {
    const der = pemToDer(pem);
    const certificate = readTlv(der, 0);
    if (certificate.tag !== 0x30) return fallback;
    const tbs = children(der, certificate)[0];
    if (!tbs || tbs.tag !== 0x30) return fallback;

    const tbsChildren = children(der, tbs);
    // Optional explicit version [0]; when present, serial follows it.
    let cursor = 0;
    if (tbsChildren[0]?.tag === 0xa0) cursor = 1;

    const serialTlv = tbsChildren[cursor];
    const serialHex =
      serialTlv?.tag === 0x02
        ? toHex(
            der.subarray(serialTlv.contentStart, serialTlv.contentEnd),
          )
        : null;

    // TBS order after version/serial: signature AlgId, issuer Name, validity,
    // subject Name. Find the two Name SEQUENCEs and the validity SEQUENCE.
    const sequences = tbsChildren.filter((child) => child.tag === 0x30);
    // sequences[0] = signature algId, [1] = issuer, [2] = validity, [3] = subject
    const issuerName = sequences[1] ?? null;
    const validity = sequences[2] ?? null;
    const subjectName = sequences[3] ?? null;

    const issuerCn = issuerName ? extractCn(der, issuerName) : null;
    const subjectCn = subjectName ? extractCn(der, subjectName) : null;

    let notBefore: string | null = null;
    let notAfter: string | null = null;
    if (validity) {
      const times = children(der, validity);
      notBefore = times[0] ? decodeTime(der, times[0]) : null;
      notAfter = times[1] ? decodeTime(der, times[1]) : null;
    }

    let sans: string[] = [];
    try {
      sans = extractSans(der, tbs);
    } catch {
      sans = [];
    }

    const parseComplete =
      subjectCn != null &&
      issuerCn != null &&
      notBefore != null &&
      notAfter != null &&
      serialHex != null;

    return {
      subjectCn,
      issuerCn,
      notBefore,
      notAfter,
      sans,
      serialHex,
      fingerprintSha256,
      raw: pem,
      parseComplete,
    };
  } catch {
    return fallback;
  }
}
