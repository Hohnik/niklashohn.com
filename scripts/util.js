/* util.js — the helpers that more than one file needs. */
window.NH = window.NH || {};

NH.util = {
  /* The shortest turn from angle a to angle b. The sign gives the
     direction of the turn. */
  angleDelta: function (a, b) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  },

  clamp: function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; },

  /* True when the caret is in a text field. Every key handler on
     the page must test this first. If it does not, the letters
     that you put in the project filter also turn the plane. */
  typing: function () {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  },

  /* Give back the address only if the browser can open it as a
     page. To escape the HTML is not enough here: a "javascript:"
     address holds no character that the escape function changes,
     and it then runs when a person clicks the link. The list of
     projects comes from the network, so it gets this test. */
  safeUrl: function (s) {
    try {
      const u = new URL(String(s), location.href);
      return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : '';
    } catch (e) {
      return '';
    }
  },

  escapeHtml: function (s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
};
