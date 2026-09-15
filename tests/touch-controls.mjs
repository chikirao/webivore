import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
const out = "artifacts/touch-qa";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  args: ["--enable-unsafe-swiftshader"],
});
const results = [],
  errors = [];
const state = (p) =>
  p.evaluate(() => {
    const g = window.__game;
    return {
      x: g.x,
      y: g.y,
      stick: g.stick,
      yaw: g.cam.yaw,
      pitch: g.cam.pitch,
      paused: g.paused,
      drag: !!g.drag,
    };
  });
try {
  for (const [name, width, height, hasTouch, isMobile] of [
    ["phone", 390, 844, true, true],
    ["tablet", 768, 1024, true, false],
    ["desktop", 1536, 1024, false, false],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch,
      isMobile,
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
    await page.goto(process.env.WEBIVORE_URL ?? "http://localhost:5174");
    await page.locator(".demo").click();
    await page.waitForFunction(
      () => window.__game?.ready && !window.__game.paused,
    );
    if (!hasTouch) {
      assert.equal(await page.locator(".touch-joystick").count(), 0);
      const a = await state(page);
      await page.keyboard.down("d");
      await page.waitForTimeout(400);
      await page.keyboard.up("d");
      assert((await state(page)).x > a.x);
      await page.mouse.move(800, 500);
      await page.mouse.down();
      await page.mouse.move(850, 520, { steps: 4 });
      await page.mouse.up();
      assert.notEqual((await state(page)).yaw, a.yaw);
      await page.mouse.down({ button: "right" });
      await page.mouse.move(890, 550, { steps: 4 });
      await page.mouse.up({ button: "right" });
      assert(await page.evaluate(() => window.__game.cam.free && window.__game.cam.pan.length() > 0));
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await page.locator(".touch-joystick").count(), 0);
      results.push({
        name,
        joystick: "hidden at desktop and phone widths",
        keyboard: "passed",
        mouseOrbitPan: "passed",
      });
      await context.close();
      continue;
    }
    const stick = page.getByRole("button", { name: "Movement joystick" });
    await stick.waitFor();
    const cdp = await context.newCDPSession(page);
    const send = async (type, points) => {
      await cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: points.map((p) => ({
          ...p,
          radiusX: 5,
          radiusY: 5,
          force: 1,
        })),
      });
      await page.waitForTimeout(50);
    };
    const bounds = await stick.boundingBox(),
      p1 = {
        id: 1,
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2,
      };
    assert(
      bounds.x >= 0 &&
        bounds.y >= 0 &&
        bounds.x + bounds.width <= width &&
        bounds.y + bounds.height <= height,
    );
    const before = await state(page);
    await send("touchStart", [p1]);
    await send("touchMove", [{ ...p1, x: p1.x + 1 }]);
    assert(
      Math.hypot(...Object.values((await state(page)).stick)) < 0.01,
      "dead zone",
    );
    const moved = { ...p1, x: p1.x + 60 };
    await send("touchMove", [moved]);
    await page.waitForTimeout(400);
    assert((await state(page)).x > before.x + 2, "Joystick must move player");
    assert.equal(
      (await state(page)).yaw,
      before.yaw,
      "Joystick must not rotate camera",
    );
    const p2 = { id: 2, x: width * 0.72, y: height * 0.48 };
    await send("touchStart", [moved, p2]);
    const turned = { ...p2, x: p2.x - 42, y: p2.y + 32 };
    await send("touchMove", [moved, turned]);
    await page.waitForTimeout(100);
    const both = await state(page);
    assert(
      Math.abs(both.yaw - before.yaw) > 0.1 &&
        Math.abs(both.pitch - before.pitch) > 0.1,
      "Second finger must rotate camera",
    );
    assert(both.stick.x > 0.9, "Second finger must preserve movement");
    await page.screenshot({ path: `${out}/${name}-two-fingers.png` });
    await send("touchEnd", [moved]);
    await page.waitForTimeout(50);
    assert.deepEqual((await state(page)).stick, { x: 0, y: 0 });
    await send("touchMove", [{ ...turned, x: turned.x + 25 }]);
    assert.notEqual(
      (await state(page)).yaw,
      both.yaw,
      "Camera finger survives releasing joystick",
    );
    await send("touchCancel", []);
    assert.equal((await state(page)).drag, false);
    // Swiping the left part of the field now rotates too: only the visible stick moves.
    const field = { id: 3, x: width * 0.35, y: height * 0.42 },
      a = await state(page);
    await send("touchStart", [field]);
    await send("touchMove", [{ ...field, x: field.x + 25 }]);
    assert.notEqual((await state(page)).yaw, a.yaw);
    assert.deepEqual((await state(page)).stick, { x: 0, y: 0 });
    await send("touchEnd", []);
    await send("touchStart", [p1]);
    await send("touchMove", [moved]);
    // Mouse activation while a touch is held also exercises hybrid devices.
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await page.getByRole("button", { name: "Keep walking" }).waitFor();
    assert.deepEqual((await state(page)).stick, { x: 0, y: 0 });
    assert.equal(await stick.count(), 0);
    await send("touchEnd", []);
    await page.getByRole("button", { name: "Keep walking" }).click();
    await stick.waitFor();
    await send("touchStart", [p1]);
    await send("touchMove", [moved]);
    await send("touchCancel", []);
    assert.deepEqual((await state(page)).stick, { x: 0, y: 0 });
    await send("touchStart", [p1]);
    await send("touchMove", [moved]);
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await page.getByRole("button", { name: "Keep walking" }).waitFor();
    assert.deepEqual((await state(page)).stick, { x: 0, y: 0 });
    await send("touchCancel", []);
    await page.getByRole("button", { name: "Keep walking" }).click();
    await stick.waitFor();
    await page.keyboard.down("ArrowRight");
    await stick.focus();
    await page.keyboard.up("ArrowRight");
    assert(await page.evaluate(() => !window.__game.keys.has("ArrowRight")));
    await page.setViewportSize({ width: height, height: width });
    await page.waitForTimeout(300);
    const landscape = await stick.boundingBox();
    assert(landscape.y + landscape.height <= width);
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    const controls = await page
      .locator(".playing button")
      .evaluateAll((buttons) =>
        buttons
          .filter((b) => b.getBoundingClientRect().width > 0)
          .map((b) => {
            const r = b.getBoundingClientRect();
            return {
              name: b.getAttribute("aria-label"),
              x: r.x,
              y: r.y,
              w: r.width,
              h: r.height,
              hit: b.contains(
                document.elementFromPoint(
                  r.x + r.width / 2,
                  r.y + r.height / 2,
                ),
              ),
            };
          }),
      );
    for (const b of controls) {
      assert(
        b.x >= 0 &&
          b.y >= 0 &&
          b.x + b.w <= height + 1 &&
          b.y + b.h <= width + 1,
        JSON.stringify(b),
      );
      assert(b.w >= 44 && b.h >= 44, JSON.stringify(b));
      assert(b.hit, JSON.stringify(b));
    }
    await page.screenshot({ path: `${out}/${name}-landscape.png` });
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/${name}.png` });
    results.push({
      name,
      joystick: "visible",
      deadZone: "passed",
      movement: "passed",
      twoFingers: "passed",
      leftFieldCamera: "passed",
      releaseCancelPauseBlur: "passed",
      landscape: "passed",
    });
    await context.close();
  }
  assert.deepEqual(errors, []);
  writeFileSync(
    `${out}/results.json`,
    JSON.stringify({ results, errors }, null, 2),
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
