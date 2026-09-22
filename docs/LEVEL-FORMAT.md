# WEBIVORE portable level format

The first portable map format is a single UTF-8 JSON file whose recommended suffix is `.webivore.json`. It contains no HTML, JavaScript, functions or executable expressions. Import treats every field as untrusted data.

```ts
type WebivoreLevelFile = {
  format: "webivore-level";
  version: 1;
  createdAt?: string;
  source: {
    kind: "remote" | "html" | "image" | "demo";
    url?: string;
    fileName?: string;
    degraded?: boolean;
  };
  level: {
    url: string;
    title: string;
    width: number;
    height: number;
    pieces: Piece[];
    truncated: boolean;
    coverage?: "exclusive";
    pageColor?: string;
    sourceElementCount?: number;
  };
  atlas: {
    mimeType: "image/png" | "image/jpeg" | "image/webp";
    dataUrl: string;
  };
  background?:
    | { kind: "atlas" }
    | {
        kind: "embedded";
        mimeType: "image/png" | "image/jpeg" | "image/webp";
        dataUrl: string;
      };
};
```

`Piece` is the existing game contract from `src/shared.ts`: geometry, optional exclusive regions, presentation metadata, and the already-balanced `mass`, `threshold`, `score` and `growthValue`. Keeping those values makes export/import preserve the collection count, total mass and completion budget exactly.

Version 1 limits are enforced in `src/level-file.ts`:

- file: 25 MiB;
- atlas data URL: fewer than 23 MiB of characters;
- pieces: 12,000;
- level: 64–4,096 px wide and 64–12,000 px high;
- coordinates: finite, non-negative and inside the level;
- embedded images: base64 PNG, JPEG or WebP only;
- strings and regions: bounded lengths/counts.

Every numeric value must be finite. Unknown or incompatible versions fail closed with a user-facing error. New optional fields may be added in a future version; a breaking schema change must increment `version`. ZIP is deliberately not part of version 1.

Export uses a short-lived object URL and revokes it immediately after the browser starts the download. Imported atlases remain data URLs, so ending a game does not leave any file object URL alive.
