/* ============================================================
   util.js — the handful of helpers more than one file needs.
   ============================================================ */
window.NH = window.NH || {};

NH.util = {
  /* Shortest signed way round from angle a to angle b. */
  angleDelta: function (a, b) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  },

  clamp: function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; },

  /* True while the caret is in a text field. Every keyboard
     handler on the page has to check this first, or typing "add"
     into the project filter banks the plane into the sea. */
  typing: function () {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  },

  escapeHtml: function (s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
};
