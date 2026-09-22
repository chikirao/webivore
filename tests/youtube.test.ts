import test from "node:test";
import assert from "node:assert/strict";
import { parseWatchPage, parseComments } from "../server/youtube.ts";
import {
  initial,
  player,
  comments,
  videoId,
} from "./fixtures/readiness/youtube-data.ts";
test("watch recovery uses source title, channel, description and both recommendation formats", () => {
  const data = parseWatchPage(initial, player, videoId)!;
  assert.equal(data.title, "Fixture skate video");
  assert.equal(data.author, "Fixture channel");
  assert.match(data.description, /real description/);
  assert.deepEqual(
    data.recommendations.map((r) => r.title),
    ["Related skate lesson", "Second related video"],
  );
  assert.equal(data.image, "https://fixture.example/hero.svg");
  assert.equal(data.continuation, "fixture-read-only-continuation");
  assert.equal(parseWatchPage(initial, player, "aaaaaaaaaaa"), null);
});
test("comments follow displayed thread order, join entity payloads and exclude unused replies", () => {
  const data = parseComments(comments);
  assert.equal(data.count, "2 comments");
  assert.deepEqual(
    data.comments.map((c) => c.id),
    ["first", "second"],
  );
  assert.equal(data.comments[0].author, "First viewer");
  assert.match(data.comments[0].text, /actual comment/);
});
test("malformed, duplicate, disabled and unknown responses do not invent content", () => {
  assert.equal(parseWatchPage(null, null, videoId), null);
  assert.deepEqual(parseComments({ newSchema: {} }).comments, []);
  const duplicate = { ...comments, duplicate: comments };
  assert.equal(parseComments(duplicate).comments.length, 2);
  const copy = structuredClone(initial);
  (
    copy.contents.twoColumnWatchNextResults.secondaryResults.secondaryResults
      .results[0] as any
  ).lockupViewModel.metadata.lockupMetadataViewModel.metadata.contentMetadataViewModel.metadataRows =
    [{ metadataParts: { unexpected: true } }];
  assert.doesNotThrow(() => parseWatchPage(copy, player, videoId));
});

test("mixed recommendation schemas keep source order and disabled comments stay explicit", () => {
  const copy = structuredClone(initial);
  copy.contents.twoColumnWatchNextResults.secondaryResults.secondaryResults.results.reverse();
  const data = parseWatchPage(copy, player, videoId)!;
  assert.deepEqual(
    data.recommendations.map((r) => r.title),
    ["Second related video", "Related skate lesson"],
  );
  const disabled: any = structuredClone(initial);
  disabled.contents.twoColumnWatchNextResults.results.results.contents[2].itemSectionRenderer.contents =
    [{ messageRenderer: { text: { simpleText: "Comments are turned off." } } }];
  const result = parseWatchPage(disabled, player, videoId)!;
  assert.equal(result.continuation, "");
  assert.equal(result.commentsMessage, "Comments are turned off.");
});
