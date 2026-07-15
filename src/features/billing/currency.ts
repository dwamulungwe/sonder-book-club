export const SUPPORTED_BILLING_CURRENCIES = ["ZMW"] as const;

export type SupportedBillingCurrency =
  (typeof SUPPORTED_BILLING_CURRENCIES)[number];

const MINOR_UNITS_BY_CURRENCY: Record<SupportedBillingCurrency, number> = {
  ZMW: 2,
};

const MAX_BIGINT_MINOR_UNITS = BigInt("9223372036854775807");

function getMinorUnitScale(currency: string) {
  return BigInt(10) ** BigInt(getCurrencyMinorUnits(currency));
}

export function normalizeCurrencyCode(
  currency: string | null | undefined,
): SupportedBillingCurrency {
  const normalized = (currency ?? "ZMW").trim().toUpperCase();

  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error("Currency must be a three-letter ISO code.");
  }

  if (!(normalized in MINOR_UNITS_BY_CURRENCY)) {
    throw new Error(`Currency ${normalized} is not supported yet.`);
  }

  return normalized as SupportedBillingCurrency;
}

export function isSupportedBillingCurrencyCode(
  currency: string | null | undefined,
): currency is SupportedBillingCurrency {
  const normalized = (currency ?? "").trim().toUpperCase();

  return SUPPORTED_BILLING_CURRENCIES.includes(
    normalized as SupportedBillingCurrency,
  );
}

export function getCurrencyMinorUnits(currency: string) {
  return MINOR_UNITS_BY_CURRENCY[normalizeCurrencyCode(currency)];
}

export function assertValidMinorUnitAmount(amountMinor: bigint | number) {
  let normalized: bigint;

  if (typeof amountMinor === "number") {
    if (!Number.isSafeInteger(amountMinor)) {
      throw new Error("Amount must be a safe integer minor-unit value.");
    }

    normalized = BigInt(amountMinor);
  } else {
    normalized = amountMinor;
  }

  if (normalized < 0) {
    throw new Error("Amount must be a non-negative integer minor-unit value.");
  }

  if (normalized > MAX_BIGINT_MINOR_UNITS) {
    throw new Error("Amount is too large for the current billing storage.");
  }

  return normalized;
}

export function parseMinorUnits(value: string, currency = "ZMW") {
  const normalizedCurrency = normalizeCurrencyCode(currency);
  const minorUnits = getCurrencyMinorUnits(normalizedCurrency);
  const normalized = value.trim().replace(/\s+/g, "");

  if (!normalized) {
    throw new Error("Enter an amount.");
  }

  if (normalized.startsWith("-")) {
    throw new Error("Amount cannot be negative.");
  }

  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error("Enter a valid money amount.");
  }

  const [wholePart, fractionPart = ""] = normalized.split(".");

  if (fractionPart.length > minorUnits) {
    throw new Error(
      `${normalizedCurrency} amounts can have at most ${minorUnits} decimal places.`,
    );
  }

  const paddedFraction = fractionPart.padEnd(minorUnits, "0");
  const amountMinor =
    BigInt(wholePart) * getMinorUnitScale(normalizedCurrency) +
    BigInt(paddedFraction || "0");

  if (amountMinor > MAX_BIGINT_MINOR_UNITS) {
    throw new Error("Amount is too large for the current billing storage.");
  }

  return amountMinor;
}

export function formatMinorUnits(amountMinor: bigint | number, currency = "ZMW") {
  const validAmount = assertValidMinorUnitAmount(amountMinor);

  try {
    const normalizedCurrency = normalizeCurrencyCode(currency);
    const minorUnits = getCurrencyMinorUnits(normalizedCurrency);
    const scale = getMinorUnitScale(normalizedCurrency);
    const majorAmount = Number(validAmount) / Number(scale);

    if (
      !Number.isFinite(majorAmount) ||
      validAmount > BigInt(Number.MAX_SAFE_INTEGER)
    ) {
      return fallbackMinorUnitFormat(validAmount, currency);
    }

    return new Intl.NumberFormat("en-ZM", {
      style: "currency",
      currency: normalizedCurrency,
      currencyDisplay: "symbol",
      minimumFractionDigits: minorUnits,
      maximumFractionDigits: minorUnits,
    })
      .format(majorAmount)
      .replace(/\u00a0/g, " ")
      .replace(/^K\s+/, "K");
  } catch {
    return fallbackMinorUnitFormat(validAmount, currency);
  }
}

export function minorUnitsToDecimalString(
  amountMinor: bigint | number,
  currency = "ZMW",
) {
  const validAmount = assertValidMinorUnitAmount(amountMinor);

  let minorUnits = 2;

  try {
    minorUnits = getCurrencyMinorUnits(currency);
  } catch {
    // Historical or malformed currency values should not break billing pages.
  }

  const scale = BigInt(10) ** BigInt(minorUnits);
  const wholePart = validAmount / scale;
  const fractionPart = String(validAmount % scale).padStart(minorUnits, "0");

  return minorUnits === 0 ? String(wholePart) : `${wholePart}.${fractionPart}`;
}

function fallbackCurrencyCode(currency: string | null | undefined) {
  const raw = (currency ?? "").trim().toUpperCase();

  if (!raw) {
    return "UNKNOWN";
  }

  return raw.replace(/\s+/g, "_").slice(0, 24);
}

function fallbackMinorUnitFormat(
  amountMinor: bigint,
  currency: string | null | undefined,
) {
  const scale = BigInt(100);
  const wholePart = amountMinor / scale;
  const fractionPart = String(amountMinor % scale).padStart(2, "0");

  return `${fallbackCurrencyCode(currency)} ${wholePart}.${fractionPart}`;
}
