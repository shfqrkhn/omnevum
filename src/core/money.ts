export interface MoneyValue {
  amountMinor: string;
  currency: string;
}

const currencyScales: Record<string, number> = { CAD: 2, USD: 2, EUR: 2, GBP: 2, JPY: 0, KWD: 3 };

export function parseMoney(amount: string | number, currency: string): MoneyValue {
  const normalizedCurrency = currency.trim().toUpperCase();
  const scale = currencyScales[normalizedCurrency];
  if (scale === undefined) throw new Error("Unsupported or missing currency");
  const source = String(amount).trim();
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(source)) throw new Error("Money must be a plain decimal amount");
  const [whole, fraction = ""] = source.replace("-", "").split(".");
  if (fraction.length > scale || (scale === 0 && fraction.length > 0)) throw new Error("Money has more fractional precision than the currency permits");
  const minor = BigInt(whole || "0") * 10n ** BigInt(scale) + BigInt((fraction + "0".repeat(scale)).slice(0, scale) || "0");
  const signed = source.startsWith("-") ? -minor : minor;
  if (signed < -(2n ** 63n) || signed > 2n ** 63n - 1n) throw new Error("Money amount is outside the supported range");
  return { amountMinor: signed.toString(), currency: normalizedCurrency };
}

export function addMoney(left: MoneyValue, right: MoneyValue): MoneyValue {
  assertSameCurrency(left, right);
  return { currency: left.currency, amountMinor: (BigInt(left.amountMinor) + BigInt(right.amountMinor)).toString() };
}

export function subtractMoney(left: MoneyValue, right: MoneyValue): MoneyValue {
  assertSameCurrency(left, right);
  return { currency: left.currency, amountMinor: (BigInt(left.amountMinor) - BigInt(right.amountMinor)).toString() };
}

export function formatMoney(value: MoneyValue, locale = "en-CA"): string {
  const scale = currencyScales[value.currency];
  if (scale === undefined || !/^-?\d+$/.test(value.amountMinor)) throw new Error("Invalid Money value");
  const minor = BigInt(value.amountMinor);
  const negative = minor < 0n;
  const absolute = negative ? -minor : minor;
  const digits = absolute.toString().padStart(scale + 1, "0");
  const decimal = scale === 0 ? digits : `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
  return new Intl.NumberFormat(locale, { style: "currency", currency: value.currency }).format(Number(negative ? `-${decimal}` : decimal));
}

function assertSameCurrency(left: MoneyValue, right: MoneyValue): void {
  if (left.currency !== right.currency || !/^-?\d+$/.test(left.amountMinor) || !/^-?\d+$/.test(right.amountMinor)) throw new Error("Money currencies or minor-unit values do not match");
}
