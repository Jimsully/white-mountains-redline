export type AdminRuntimeEnv = Pick<NodeJS.ProcessEnv, "NODE_ENV">;

export function isAdminToolsRuntimeAvailable(env: AdminRuntimeEnv = process.env) {
  return env.NODE_ENV === "development";
}

export function isAdminRoutePath(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export function shouldBlockAdminRoute(pathname: string, env: AdminRuntimeEnv = process.env) {
  return isAdminRoutePath(pathname) && !isAdminToolsRuntimeAvailable(env);
}
