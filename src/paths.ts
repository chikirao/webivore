export function withBase(path: string, base = "/") {
  const root = `/${base.replace(/^\/+|\/+$/g, "")}/`.replace(/^\/\/$/, "/");
  return `${root}${path.replace(/^\/+/, "")}`;
}

export const appUrl = (path: string) => withBase(path, import.meta.env.BASE_URL);

export function routeAt(pathname: string, route: string, base = "/") {
  const target = withBase(route, base).replace(/\/$/, "");
  return pathname.replace(/\/$/, "") === target;
}
