import { redirect } from "next/navigation";

type SearchParams = Record<string, string | string[] | undefined>;
type NoticeType = "error" | "success";

function getSingleValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

export function getNotice(searchParams: SearchParams) {
  const error = getSingleValue(searchParams.error);
  const success = getSingleValue(searchParams.success);

  if (error) {
    return { tone: "error" as const, message: error };
  }

  if (success) {
    return { tone: "success" as const, message: success };
  }

  return null;
}

export function resolveReturnPath(formData: FormData, fallback: string) {
  const candidate = formData.get("redirectTo");

  if (typeof candidate !== "string") {
    return fallback;
  }

  return candidate.startsWith("/") ? candidate : fallback;
}

export function buildNoticeUrl(
  path: string,
  type: NoticeType,
  message: string,
) {
  const [pathname, query = ""] = path.split("?");
  const params = new URLSearchParams(query);

  params.delete(type === "error" ? "success" : "error");
  params.set(type, message);

  const suffix = params.toString();
  return suffix ? `${pathname}?${suffix}` : pathname;
}

export function redirectWithNotice(
  path: string,
  type: NoticeType,
  message: string,
): never {
  redirect(buildNoticeUrl(path, type, message));
}
