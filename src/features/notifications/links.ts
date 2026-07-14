const LOCAL_ORIGIN = "https://sonder.local";
const REDIRECT_PARAM_NAMES = new Set([
  "callbackurl",
  "next",
  "redirect",
  "redirectto",
  "returnto",
]);

function hasUnsafeRedirectParam(url: URL) {
  for (const [name, value] of url.searchParams.entries()) {
    if (!REDIRECT_PARAM_NAMES.has(name.toLowerCase())) {
      continue;
    }

    if (
      !value.startsWith("/") ||
      value.startsWith("//") ||
      value.includes("\\")
    ) {
      return true;
    }
  }

  return false;
}

export function sanitizeInternalHref(href: string | null | undefined) {
  if (!href) {
    return null;
  }

  const candidate = href.trim();

  if (
    candidate !== href ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\")
  ) {
    return null;
  }

  try {
    const decodedCandidate = decodeURIComponent(candidate);

    if (
      !decodedCandidate.startsWith("/") ||
      decodedCandidate.startsWith("//") ||
      decodedCandidate.includes("\\")
    ) {
      return null;
    }

    const url = new URL(candidate, LOCAL_ORIGIN);

    if (url.origin !== LOCAL_ORIGIN || hasUnsafeRedirectParam(url)) {
      return null;
    }

    const safeHref = `${url.pathname}${url.search}${url.hash}`;
    const decodedSafeHref = decodeURIComponent(safeHref);

    if (
      !decodedSafeHref.startsWith("/") ||
      decodedSafeHref.startsWith("//") ||
      decodedSafeHref.includes("\\")
    ) {
      return null;
    }

    return safeHref;
  } catch {
    return null;
  }
}

export function requireInternalHref(
  href: string | null | undefined,
  fallback = "/dashboard",
) {
  return sanitizeInternalHref(href) ?? fallback;
}
