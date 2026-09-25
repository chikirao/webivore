const blockedNames = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata",
]);

export function isPublicIPv4(value: string) {
  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = parts;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0 && c === 113)
  );
}

export function isPublicIPv6(value: string) {
  let ip = value.toLowerCase().replace(/^\[|\]$/g, "");
  if (!ip.includes(":") || ip.includes("%")) return false;
  const dotted = ip.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (dotted) {
    const bytes = dotted.split(".").map(Number);
    if (bytes.length !== 4 || bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) return false;
    ip = `${ip.slice(0, -dotted.length)}${((bytes[0] << 8) | bytes[1]).toString(16)}:${((bytes[2] << 8) | bytes[3]).toString(16)}`;
  }
  if ((ip.match(/::/g) ?? []).length > 1) return false;
  const [leftRaw, rightRaw] = ip.split("::");
  const left = leftRaw ? leftRaw.split(":") : [];
  const right = rightRaw ? rightRaw.split(":") : [];
  const missing = ip.includes("::") ? 8 - left.length - right.length : 0;
  if ((!ip.includes("::") && left.length !== 8) || missing < 1) return false;
  const words = [...left, ...Array(missing).fill("0"), ...right];
  if (words.length !== 8 || words.some((word) => !/^[0-9a-f]{1,4}$/.test(word))) return false;
  const numbers = words.map((word) => parseInt(word, 16));
  const [first, second] = numbers;
  if (numbers.every((word) => word === 0) || numbers.slice(0, 7).every((word) => word === 0) && numbers[7] === 1) return false;
  // Only globally routable unicast space is accepted. Explicit exceptions below
  // reject documentation, benchmark and transition ranges within 2000::/3.
  if (first < 0x2000 || first > 0x3fff) return false;
  if (
    (first === 0x2001 && (second === 0x0000 || second === 0x0002 || second === 0x0db8 || (second & 0xfff0) === 0x0010 || (second & 0xfff0) === 0x0020)) ||
    first === 0x2002 ||
    (first === 0x3fff && (second & 0xf000) === 0)
  ) return false;
  return true;
}

export function normalizeUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a valid public URL.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
    throw new Error("Use a public HTTP or HTTPS URL without credentials.");
  if (url.port && !["80", "443"].includes(url.port))
    throw new Error("Only ports 80 and 443 are allowed.");
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || blockedNames.has(hostname) || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal"))
    throw new Error("Private and local destinations are blocked.");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) && !isPublicIPv4(hostname))
    throw new Error("Private and reserved IP addresses are blocked.");
  if (hostname.includes(":") && !isPublicIPv6(hostname))
    throw new Error("Private and reserved IP addresses are blocked.");
  url.hostname = hostname;
  url.hash = "";
  if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) url.port = "";
  return url;
}

type DnsAnswer = { type: number; data: string };
const dnsCache = new Map<string, Promise<void>>();

async function queryDns(hostname: string, type: "A" | "AAAA") {
  const endpoint = new URL("https://cloudflare-dns.com/dns-query");
  endpoint.searchParams.set("name", hostname);
  endpoint.searchParams.set("type", type);
  const response = await fetch(endpoint, {
    headers: { accept: "application/dns-json" },
    // Workers reject "error"; a manual redirect is not ok and fails below.
    redirect: "manual",
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) throw new Error("Public DNS validation failed.");
  const result = (await response.json()) as { Answer?: DnsAnswer[] };
  return (result.Answer ?? []).filter((answer) => answer.type === (type === "A" ? 1 : 28)).map((answer) => answer.data);
}

export function verifyPublicHostname(hostname: string) {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    if (!isPublicIPv4(hostname)) return Promise.reject(new Error("Private destination blocked."));
    return Promise.resolve();
  }
  if (hostname.includes(":")) {
    if (!isPublicIPv6(hostname)) return Promise.reject(new Error("Private destination blocked."));
    return Promise.resolve();
  }
  let pending = dnsCache.get(hostname);
  if (!pending) {
    pending = Promise.all([queryDns(hostname, "A"), queryDns(hostname, "AAAA")]).then(([v4, v6]) => {
      if (!v4.length && !v6.length) throw new Error("Destination has no public address.");
      if (v4.some((ip) => !isPublicIPv4(ip)) || v6.some((ip) => !isPublicIPv6(ip)))
        throw new Error("Destination resolves to a private or reserved address.");
    });
    dnsCache.set(hostname, pending);
    setTimeout(() => dnsCache.delete(hostname), 60_000);
  }
  return pending;
}

export async function sha256(value: string | ArrayBuffer | Uint8Array) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value instanceof Uint8Array ? value : new Uint8Array(value);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new Uint8Array(bytes),
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
