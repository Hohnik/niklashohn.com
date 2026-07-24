// Tiny 3x5 pixel font, used to engrave duck names onto the gravestones.
// Glyphs are 3 wide x 5 tall; advance is 4px, line height 6px.
window.PixelFont = (() => {
  const G = {
    A: ".#.,#.#,###,#.#,#.#", B: "##.,#.#,##.,#.#,##.", C: ".##,#..,#..,#..,.##",
    D: "##.,#.#,#.#,#.#,##.", E: "###,#..,##.,#..,###", F: "###,#..,##.,#..,#..",
    G: ".##,#..,#.#,#.#,.##", H: "#.#,#.#,###,#.#,#.#", I: "###,.#.,.#.,.#.,###",
    J: "..#,..#,..#,#.#,.#.", K: "#.#,#.#,##.,#.#,#.#", L: "#..,#..,#..,#..,###",
    M: "#.#,###,###,#.#,#.#", N: "#.#,##.,###,.##,#.#", O: ".#.,#.#,#.#,#.#,.#.",
    P: "##.,#.#,##.,#..,#..", Q: ".#.,#.#,#.#,##.,.##", R: "##.,#.#,##.,#.#,#.#",
    S: ".##,#..,.#.,..#,##.", T: "###,.#.,.#.,.#.,.#.", U: "#.#,#.#,#.#,#.#,.##",
    V: "#.#,#.#,#.#,#.#,.#.", W: "#.#,#.#,###,###,#.#", X: "#.#,#.#,.#.,#.#,#.#",
    Y: "#.#,#.#,.#.,.#.,.#.", Z: "###,..#,.#.,#..,###",
    0: ".#.,#.#,#.#,#.#,.#.", 1: ".#.,##.,.#.,.#.,###", 2: "##.,..#,.#.,#..,###",
    3: "##.,..#,.#.,..#,##.", 4: "#.#,#.#,###,..#,..#", 5: "###,#..,##.,..#,##.",
    6: ".##,#..,##.,#.#,.#.", 7: "###,..#,.#.,.#.,.#.", 8: ".#.,#.#,.#.,#.#,.#.",
    9: ".#.,#.#,.##,..#,##.",
    " ": "...,...,...,...,...", ".": "...,...,...,...,.#.", "'": ".#.,.#.,...,...,...",
    "-": "...,...,###,...,...", "!": ".#.,.#.,.#.,...,.#.",
  };
  const glyphs = {};
  for (const k in G) glyphs[k] = G[k].split(",");

  const W = 3, ADV = 4, LH = 6;

  function lineWidth(text) {
    return text.length * ADV - 1;
  }

  function drawLine(ctx, text, x, y, color) {
    ctx.fillStyle = color;
    let cx = x;
    for (const ch of text) {
      const g = glyphs[ch] || glyphs[" "];
      for (let gy = 0; gy < 5; gy++) {
        const row = g[gy];
        for (let gx = 0; gx < W; gx++) {
          if (row[gx] === "#") ctx.fillRect(cx + gx, y + gy, 1, 1);
        }
      }
      cx += ADV;
    }
  }

  function wrap(text, maxChars) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = "";
    for (let w of words) {
      while (w.length > maxChars) {
        if (cur) { lines.push(cur); cur = ""; }
        lines.push(w.slice(0, maxChars));
        w = w.slice(maxChars);
      }
      const next = cur ? cur + " " + w : w;
      if (next.length <= maxChars) cur = next;
      else { if (cur) lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [""];
  }

  // Engrave text centred inside a box (all in the canvas' own pixel units).
  function drawBox(ctx, text, bx, by, bw, bh, color) {
    text = String(text).toUpperCase();
    const maxChars = Math.max(1, Math.floor((bw + 1) / ADV));
    let lines = wrap(text, maxChars);
    const maxLines = Math.max(1, Math.floor((bh + 1) / LH));
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      const last = lines[maxLines - 1];
      lines[maxLines - 1] = last.slice(0, Math.max(0, maxChars - 1)) + ".";
    }
    const totalH = lines.length * LH - 1;
    let y = by + Math.floor((bh - totalH) / 2);
    for (const line of lines) {
      const lw = lineWidth(line);
      const x = bx + Math.floor((bw - lw) / 2);
      drawLine(ctx, line, x, y, color);
      y += LH;
    }
  }

  return { drawLine, drawBox, lineWidth, wrap };
})();
