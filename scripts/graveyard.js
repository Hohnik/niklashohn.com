// Shared "duck graveyard" database backed by JSONBin.io. The access key is
// intentionally in the client (static site, throwaway bin — nothing sensitive).
window.GRAVEYARD = (() => {
  const BIN_ID = "6a63195df5f4af5e29ba3b47";
  const ACCESS_KEY = "$2a$10$B7e3qwOWlelT5ySxHv4TU.exMmly0VBgd6P0bvANf/gSKV0O2dKpS";
  const BASE = "https://api.jsonbin.io/v3/b";

  // Fetch every duck that has ever been named and killed.
  async function fetchDucks() {
    try {
      const res = await fetch(`${BASE}/${BIN_ID}/latest`, {
        headers: { "X-Access-Key": ACCESS_KEY, "X-Bin-Meta": "false" },
      });
      if (!res.ok) throw new Error(`GET ${res.status}`);
      const data = await res.json();
      return Array.isArray(data.ducks) ? data.ducks : [];
    } catch (err) {
      console.warn("Graveyard: could not load ducks", err);
      return [];
    }
  }

  // Append a freshly killed duck. Read-modify-write (last write wins — fine for
  // a low-traffic portfolio). Returns the full list on success, or null on error.
  async function recordDuck(duck) {
    try {
      const ducks = await fetchDucks();
      ducks.push(duck);
      const res = await fetch(`${BASE}/${BIN_ID}`, {
        method: "PUT",
        headers: {
          "X-Access-Key": ACCESS_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ducks }),
      });
      if (!res.ok) throw new Error(`PUT ${res.status}`);
      return ducks;
    } catch (err) {
      console.warn("Graveyard: could not record duck", err);
      return null;
    }
  }

  return { fetchDucks, recordDuck };
})();
