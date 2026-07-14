export function getString(formData: FormData, field: string) {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

export function getOptionalString(formData: FormData, field: string) {
  const value = getString(formData, field);
  return value.length > 0 ? value : undefined;
}

export function getCheckbox(formData: FormData, field: string) {
  return formData.get(field) === "on";
}

export function getInt(formData: FormData, field: string) {
  const value = getString(formData, field);

  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function getStringArray(formData: FormData, field: string) {
  return formData
    .getAll(field)
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}
