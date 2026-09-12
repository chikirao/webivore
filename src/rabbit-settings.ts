import approvedSettings from "./rabbit-user-settings.json";
export type PartTuning = {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  visible: boolean;
  front: boolean;
};
export type RabbitViewTuning = {
  head: PartTuning;
  body: PartTuning;
  leftHand: PartTuning;
  rightHand: PartTuning;
  headColumn: number;
  headRow: number;
  bodyColumn: number;
  bodyRow: number;
  ground: number;
};
export type RabbitSettings = { version: 1; views: RabbitViewTuning[] };
export const RABBIT_DRAFT_KEY = "webivore.rabbit-editor.v1";
export const RABBIT_GAME_KEY = "webivore.rabbit-tuning.v1";
export function defaultRabbitSettings(): RabbitSettings {
  return structuredClone(approvedSettings) as RabbitSettings;
}
/** Only finite, known fields enter the renderer. Imported data is never executed. */
export function parseRabbitSettings(value: unknown): RabbitSettings {
  if (
    !value ||
    typeof value !== "object" ||
    !("version" in value) ||
    value.version !== 1 ||
    !("views" in value) ||
    !Array.isArray(value.views) ||
    value.views.length !== 24
  )
    throw new Error("Нужен JSON версии 1 с 24 ракурсами.");
  const result = defaultRabbitSettings();
  const number = (v: unknown, min: number, max: number) => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
      throw new Error("Настройки содержат недопустимое число.");
    return v;
  };
  value.views.forEach((view, i) => {
    if (!view || typeof view !== "object")
      throw new Error("Некорректный ракурс.");
    const target = result.views[i];
    for (const key of ["head", "body", "leftHand", "rightHand"] as const) {
      const p = view[key];
      if (!p || typeof p !== "object")
        throw new Error("Не хватает настроек части персонажа.");
      target[key] = {
        x: number(p.x, -180, 180),
        y: number(p.y, -180, 180),
        scale: number(p.scale, 0.2, 2.5),
        rotation: number(p.rotation, -90, 90),
        visible: p.visible !== false,
        front: p.front === true,
      };
    }
    for (const key of ["headColumn", "bodyColumn"] as const)
      target[key] = Math.round(number(view[key], 0, 7));
    for (const key of ["headRow", "bodyRow"] as const)
      target[key] = Math.round(number(view[key], 0, 2));
    target.ground = number(view.ground, -80, 80);
  });
  return result;
}
export function readRabbitSettings(key: string): RabbitSettings {
  try {
    const saved = localStorage.getItem(key);
    if (saved) return parseRabbitSettings(JSON.parse(saved));
  } catch {
    /* Bad/old drafts must not prevent the game from loading. */
  }
  return defaultRabbitSettings();
}
