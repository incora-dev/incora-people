const PUBLIC_INFORMATION_PATHS = new Set(["/about", "/privacy", "/terms"]);

export function isPublicInformationPath(pathname: string) {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  return PUBLIC_INFORMATION_PATHS.has(normalizedPath);
}
