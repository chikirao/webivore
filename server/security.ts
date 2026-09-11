import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
export function isPublicIP(ip: string): boolean {
  if (net.isIP(ip) !== 4) return false; // IPv6 deliberately disabled in this MVP, including mapped addresses.
  const [a, b] = ip.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || b === 2)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0)
  );
}
export function validateURL(value: string) {
  const u = new URL(value);
  if (
    !["http:", "https:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    (u.port && !["80", "443"].includes(u.port))
  )
    throw new Error("Use a public http/https URL on port 80 or 443.");
  if (
    u.hostname === "localhost" ||
    u.hostname.endsWith(".localhost") ||
    u.hostname.endsWith(".local") ||
    u.hostname.includes(":") ||
    u.hostname.startsWith("[") ||
    (net.isIP(u.hostname) && !isPublicIP(u.hostname))
  )
    throw new Error("Private and local addresses are blocked.");
  return u;
}
export async function safeFetch(
  value: string,
  budget: { bytes: number },
  signal: AbortSignal,
) {
  const u = validateURL(value);
  let answers = await dns.lookup(u.hostname, { all: true, family: 4 });
  // VPN fake-IP ranges are never used as destinations. Resolve again through
  // a fixed HTTPS DNS provider, then validate and pin the real public address.
  if (
    answers.length &&
    answers.every((a) => /^198\.(18|19)\./.test(a.address))
  ) {
    const endpoint = new URL("https://cloudflare-dns.com/dns-query");
    endpoint.searchParams.set("name", u.hostname);
    endpoint.searchParams.set("type", "A");
    const response = await fetch(endpoint, {
      headers: { accept: "application/dns-json" },
      redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
    });
    if (!response.ok) throw new Error("Public DNS resolution failed.");
    const payload = (await response.json()) as {
      Answer?: { type: number; data: string }[];
    };
    answers = (payload.Answer ?? [])
      .filter((a) => a.type === 1)
      .map((a) => ({ address: a.data, family: 4 }));
  }
  if (!answers.length || answers.some((a) => !isPublicIP(a.address)))
    throw new Error("Destination is not a public IPv4 address.");
  const address = answers[0].address;
  return new Promise<{
    status: number;
    headers: Record<string, string>;
    body: Buffer;
  }>((resolve, reject) => {
    const req = (u.protocol === "https:" ? https : http).request(
      u,
      {
        signal,
        method: "GET",
        headers: {
          "user-agent": "Mozilla/5.0 Webivore/0.1",
          accept: "*/*",
          "accept-encoding": "identity",
        },
        lookup: ((_host: unknown, opts: { all?: boolean }, cb: Function) =>
          opts.all
            ? cb(null, [{ address, family: 4 }])
            : cb(null, address, 4)) as any,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          budget.bytes += chunk.length;
          if (size > 6_000_000 || budget.bytes > 24_000_000) {
            req.destroy(new Error("Page resource budget exceeded."));
            return;
          }
          chunks.push(chunk);
        });
        res.on("error", reject);
        res.on("end", () => {
          const headers: Record<string, string> = {};
          for (const key of [
            "content-type",
            "location",
            "content-encoding",
            "access-control-allow-origin",
          ]) {
            const v = res.headers[key];
            if (typeof v === "string") headers[key] = v;
          }
          resolve({
            status: res.statusCode ?? 502,
            headers,
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(8000, () => req.destroy(new Error("Resource timeout.")));
    req.end();
  });
}
