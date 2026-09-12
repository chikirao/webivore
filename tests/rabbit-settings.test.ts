import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultRabbitSettings,
  parseRabbitSettings,
} from "../src/rabbit-settings.ts";
test("rabbit tuning round-trips all views and keeps edits independent", () => {
  const s = defaultRabbitSettings();
  s.views[12].head.x = 41;
  s.views[0].leftHand.front = true;
  s.views[23].bodyRow = 1;
  const restored = parseRabbitSettings(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(restored, s);
  assert.equal(
    restored.views[11].head.x,
    defaultRabbitSettings().views[11].head.x,
  );
});
test("rabbit tuning rejects incomplete and non-finite imports", () => {
  assert.throws(() => parseRabbitSettings({ version: 1, views: [] }));
  const s = defaultRabbitSettings();
  s.views[2].head.scale = NaN;
  assert.throws(() => parseRabbitSettings(s));
  s.views[2].head.scale = 999;
  assert.throws(() => parseRabbitSettings(s));
});
