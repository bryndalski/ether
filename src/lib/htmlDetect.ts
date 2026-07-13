// Decide whether a response body should offer the HTML Preview view. We trust a
// `text/html` (or xhtml) content-type first; failing that we sniff the leading
// bytes for a doctype / <html> / <!-- comment / a top-level tag, so an HTML
// response served with a wrong or missing content-type is still previewable.

const HTML_HEAD = /^\s*(?:<!doctype html|<html\b|<!--|<head\b|<body\b)/i;

export function isHtmlBody(body: string, contentType?: string): boolean {
  const type = contentType?.toLowerCase() ?? "";
  if (type.includes("text/html") || type.includes("application/xhtml"))
    return true;
  // Never treat JSON/plain as HTML even if it happens to contain angle brackets.
  if (type.includes("json") || type.startsWith("text/plain")) return false;
  return HTML_HEAD.test(body);
}
