(() => {
  const VERSION = "3.1";
  const LAST_UPDATED = "10 Jan 2026 14:00 GMT";
  const $ = (id) => document.getElementById(id);

  // Play counter (static-site friendly) using CountAPI (public)
  const COUNTAPI_NAMESPACE = "orderthese";
  const COUNTAPI_BASE = "https://api.countapi.xyz";

  function playCountKey(dateStr) {
    return `played_${dateStr}`;
  }

  async function fetchPlayCount(dateStr) {
    try {
      const res = await fetch(`${COUNTAPI_BASE}/get/${COUNTAPI_NAMESPACE}/${playCountKey(dateStr)}`);
      const data = await res.json();
      return typeof data?.value === "number" ? data.value : 0;
    } catch {
      return null;
    }
  }

  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function daysBetween(a, b) {
    const ms = 24 * 60 * 60 * 1000;
    return Math.floor((startOfDay(b) - startOfDay(a)) / ms);
  }
  function ordinal(n) {
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
    const mod10 = n % 10;
    if (mod10 === 1) return `${n}st`;
    if (mod10 === 2) return `${n}nd`;
    if (mod10 === 3) return `${n}rd`;
    return `${n}th`;
  }
  function formatDateShortWithOrdinal(d) {
    const day = ordinal(d.getDate());
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const mon = months[d.getMonth()];
    const yr = d.getFullYear();
    return `${day} ${mon} ${yr}`;
  }

  async function loadPuzzles() {
    const msg = $("archiveMessage");
    try {
      const res = await fetch("puzzles.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load puzzles.json (${res.status})`);
      const puzzles = await res.json();
      const keys = Object.keys(puzzles).sort();
      if (!keys.length) throw new Error("No puzzles found.");

      const earliest = new Date(`${keys[0]}T00:00:00`);
      renderList(keys, earliest);

      const buildLine = $("buildLine");
      if (buildLine) buildLine.textContent = `v${VERSION} • last updated ${LAST_UPDATED}`;
      if (msg) msg.textContent = "Note: in live mode, only past games will be available here.";
    } catch (e) {
      if (msg) msg.textContent = String(e?.message || e);
    }
  }

  function renderList(keys, earliestDate) {
    const wrap = $("archiveList");
    if (!wrap) return;

    wrap.innerHTML = "";

    keys.forEach((key) => {
      const dateObj = new Date(`${key}T00:00:00`);
      const gameNo = Math.max(1, daysBetween(earliestDate, dateObj) + 1);

      const a = document.createElement("a");
      a.className = "archive-link";
      a.href = `index.html?date=${encodeURIComponent(key)}`;

      const base = `#${gameNo}, ${formatDateShortWithOrdinal(dateObj)}`;
      a.textContent = base;

      fetchPlayCount(key).then((n) => {
        if (typeof n === "number") {
          a.textContent = `${base}. Played by ${n} people.`;
        }
      });

      a.setAttribute("aria-label", `Open game ${gameNo} for ${formatDateShortWithOrdinal(dateObj)}`);

      wrap.appendChild(a);
    });
  }

  loadPuzzles();
})();
