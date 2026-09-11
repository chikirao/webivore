import type { Level, Piece } from "./shared";
import { properties, balancePieces } from "./shared";
export function demoLevel(): Level {
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 3400;
  const c = canvas.getContext("2d")!;
  c.fillStyle = "#f4f0e7";
  c.fillRect(0, 0, 1280, 3400);
  c.strokeStyle = "#d5d0c4";
  for (const y of [100, 740, 1510, 2400, 3250]) {
    c.beginPath();
    c.moveTo(55, y);
    c.lineTo(1225, y);
    c.stroke();
  }
  const background = canvas.toDataURL();
  const pieces: Piece[] = [];
  function add(
    text: string,
    x: number,
    y: number,
    w: number,
    h: number,
    type = "TEXT_BLOCK",
    color = "#22251f",
    bg?: string,
    font = 22,
  ) {
    if (bg) {
      c.fillStyle = bg;
      c.fillRect(x, y, w, h);
    }
    c.fillStyle = color;
    c.font = `${type === "HERO" ? "bold " : ""}${font}px ${type === "LINK" ? "monospace" : "Arial"}`;
    c.textBaseline = "middle";
    c.fillText(text, x + 8, y + h / 2, w - 16);
    pieces.push({
      id: pieces.length,
      text,
      x,
      y,
      width: w,
      height: h,
      type,
      tagName: "DIV",
      fontSize: font,
      backgroundColor: bg ?? "transparent",
      borderRadius: "0",
      zIndex: "0",
      ...properties(w, h, type),
    });
  }
  add("THE SMALL INTERNET", 55, 30, 360, 40, "HERO", undefined, undefined, 25);
  ["Stories", "Objects", "About", "Subscribe ↗"].forEach((t, i) =>
    add(t, 690 + i * 135, 35, 125, 30, "LINK", undefined, undefined, 16),
  );
  add("A place for", 55, 155, 790, 125, "HERO", undefined, undefined, 110);
  add("little things.", 55, 285, 920, 140, "HERO", undefined, undefined, 125);
  add(
    "Independent thoughts. Interesting objects. Absolutely edible.",
    62,
    460,
    770,
    40,
  );
  add(
    "Explore the collection ↗",
    62,
    550,
    290,
    60,
    "BUTTON",
    "#22251f",
    "#eaff59",
  );
  // Tiny punctuation is actual world content: a reachable seed trail leads into progressively larger objects.
  for (let i = 0; i < 95; i++) {
    const x = 65 + (i % 19) * 59,
      y = 660 + Math.floor(i / 19) * 38;
    add(
      ["*", "@", "+", "#", "a", "↗"][i % 6],
      x,
      y,
      18 + (i % 4) * 5,
      23,
      "TEXT_SMALL",
      i % 3 === 0 ? "#d84d31" : "#454c38",
      undefined,
      18,
    );
  }
  add("01 / FIELD NOTES", 60, 900, 300, 36, "LINK", undefined, undefined, 20);
  for (let i = 0; i < 12; i++) {
    let x = 60 + (i % 3) * 395,
      y = 990 + Math.floor(i / 3) * 325;
    add(
      [
        "A very good orange.",
        "The shape of a thought.",
        "Found on the internet.",
      ][i % 3],
      x,
      y + 218,
      350,
      40,
      "TEXT_BLOCK",
    );
    c.fillStyle = ["#f2a26b", "#b6bdcd", "#c3cd9b"][i % 3];
    c.fillRect(x, y, 350, 200);
    c.fillStyle = ["#e95e21", "#626dba", "#526942"][i % 3];
    c.beginPath();
    c.ellipse(x + 175, y + 100, 65 + i * 2, 70, 0, 0, Math.PI * 2);
    c.fill();
    pieces.push({
      id: pieces.length,
      text: ["orange.png", "thought.svg", "found-object.jpg"][i % 3],
      x,
      y,
      width: 350,
      height: 200,
      type: "IMAGE",
      tagName: "IMG",
      fontSize: 16,
      backgroundColor: "transparent",
      borderRadius: "0",
      zIndex: "0",
      ...properties(350, 200, "IMAGE"),
    });
    add("READ STORY ↗", x, y + 267, 150, 25, "LINK", undefined, undefined, 15);
  }
  add(
    "Keep something strange.",
    60,
    2470,
    1140,
    140,
    "HERO",
    undefined,
    undefined,
    84,
  );
  [
    "A bookmark. A button. An entire website.",
    "The internet is made of small things.",
    "And small things add up.",
  ].forEach((t, i) =>
    add(t, 65, 2680 + i * 85, 900, 50, "TEXT_BLOCK", undefined, undefined, 34),
  );
  add(
    "YOU HAVE REACHED THE END OF THE INTERNET.",
    60,
    3070,
    1150,
    120,
    "FOOTER",
    "#f4f0e7",
    "#25281f",
    34,
  );
  add(
    "Go make something. © The Small Internet / demo world",
    60,
    3290,
    1000,
    40,
    "LINK",
  );
  return {
    url: "demo://the-small-internet",
    title: "The Small Internet",
    width: 1280,
    height: 3400,
    atlas: canvas.toDataURL(),
    background,
    pieces: balancePieces(pieces),
    truncated: false,
  };
}
