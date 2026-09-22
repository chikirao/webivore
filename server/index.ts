import express from "express";
import { validateURL } from "./security.ts";
import { snapshot } from "./snapshot.ts";
const app = express();
app.use(express.json({ limit: "4kb" }));
// Admission control only. All readiness, networking and cancellation belong to a job.
let busy = false;
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.post("/api/snapshot", async (req, res) => {
  if (busy) {
    res
      .status(429)
      .json({ error: "Another page is loading. Try again shortly." });
    return;
  }
  const url = String(req.body.url ?? "");
  try {
    validateURL(url);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message.split("\n")[0] });
    return;
  }
  busy = true;
  try {
    res.json(await snapshot(url));
  } catch (error) {
    res.status(422).json({ error: (error as Error).message.split("\n")[0] });
  } finally {
    busy = false;
  }
});
app.listen(3001, "127.0.0.1", () =>
  console.log("Snapshot API: http://127.0.0.1:3001"),
);
