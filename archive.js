(() => {
  const VERSION = "1.13";
  const LAST_UPDATED = "05 Jan 2026 00:40";
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
  function formatIsoKeyNice(key) {
    const d = new Date(`${key}T00:00:00`);
    const day = d.getDate();
    const month = d.toLocaleString("en-GB", { month: "long" });
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

    const todayKey = isoDateKey(startOfDay(new Date()));

    wrap.innerHTML = "";
    keys.forEach((key) => {
      const dateObj = new Date(`${key}T00:00:00`);
      const gameNo = Math.max(1, daysBetween(earliestDate, dateObj) + 1);

      const row = document.createElement("div");
      row.className = "archive-item";

      const left = document.createElement("div");
      left.className = "archive-left";

      const title = document.createElement("div");
      title.className = "archive-date";
      title.textContent = `${formatIsoKeyNice(key)} · Game ${gameNo}${key === todayKey ? " (Today)" : ""}`;
      left.appendChild(title);

      const link = document.createElement("a");
      link.className = "archive-play";
      link.href = `index.html?date=${encodeURIComponent(key)}`;
      link.textContent = "Play";
      link.setAttribute("aria-label", `Play puzzle for ${formatIsoKeyNice(key)}`);

      row.appendChild(left);
      row.appendChild(link);
      wrap.appendChild(row);
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
