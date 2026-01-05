(() => {
  const VERSION = "2.01";
  const LAST_UPDATED = "05 Jan 2026 01:05";
  const $ = (id) => document.getElementById(id);

  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function isoDateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  function daysBetween(a, b) {
    const ms = 24 * 60 * 60 * 1000;
    return Math.floor((startOfDay(b) - startOfDay(a)) / ms);
  }
  function ordinal(n) {
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 13) return "th";
    switch (n % 10) {
      case 1: return "st";
      case 2: return "nd";
      case 3: return "rd";
      default: return "th";
    }
  }
  function formatDateShortWithOrdinal(d) {
    const day = d.getDate();
    const month = d.toLocaleString("en-GB", { month: "short" });
    const year = d.getFullYear();
    return `${day}${ordinal(day)} ${month} ${year}`;
  }

  function setBuildLine() {
    const el = $("buildLine");
    if (!el) return;
    el.textContent = `Beta v${VERSION} · last updated ${LAST_UPDATED}`;
  }

  function closeMenu() {
    const dd = $("menuDropdown");
    const btn = $("menuBtn");
    if (dd) dd.hidden = true;
    if (btn) btn.setAttribute("aria-expanded", "false");
  }
  function toggleMenu() {
    const dd = $("menuDropdown");
    const btn = $("menuBtn");
    if (!dd) return;
    const willOpen = dd.hidden === true;
    dd.hidden = !willOpen;
    if (btn) btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
  }

  function wireMenu() {
    const menuBtn = $("menuBtn");
    const dropdown = $("menuDropdown");

    if (menuBtn) menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleMenu();
    });

    document.addEventListener("click", (e) => {
      if (!dropdown || dropdown.hidden) return;
      const withinMenu = dropdown.contains(e.target);
      const withinBtn = menuBtn && menuBtn.contains(e.target);
      if (!withinMenu && !withinBtn) closeMenu();
    });
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
      a.textContent = `#${gameNo}, ${formatDateShortWithOrdinal(dateObj)}`;
      a.setAttribute("aria-label", `Open game ${gameNo} for ${formatDateShortWithOrdinal(dateObj)}`);

      wrap.appendChild(a);
    });
  }

  async function init() {
    setBuildLine();
    wireMenu();

    const msg = $("archiveMessage");
    try {
      if (msg) msg.textContent = "Loading…";

      const res = await fetch("puzzles.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`puzzles.json fetch failed (${res.status})`);
      const data = await res.json();

      const keys = Object.keys(data || {})
        .filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k))
        .sort();

      if (keys.length === 0) {
        if (msg) msg.textContent = "No puzzle dates found.";
        return;
      }

      const earliestKey = keys[0];
      const earliestDate = new Date(`${earliestKey}T00:00:00`);

      // newest first
      const newestFirst = keys.slice().reverse();

      if (msg) msg.textContent = "";
      renderList(newestFirst, earliestDate);
    } catch (e) {
      console.error(e);
      if (msg) msg.textContent = "Couldn’t load the archive. Please refresh and try again.";
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
