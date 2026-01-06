// /flipfive/archive.js (REPLACE WHOLE FILE)
(() => {
  const STORAGE_PREFIX = "flipfive:";
  const listEl = document.getElementById("list");
  const msgEl = document.getElementById("archiveMsg");
  const btn30 = document.getElementById("range30");
  const btn90 = document.getElementById("range90");

  let rangeDays = 30;

  function pad2(n){ return String(n).padStart(2,"0"); }

  function todayUTC() {
    const d = new Date();
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth()+1)}-${pad2(d.getUTCDate())}`;
  }

  function addDays(dateStr, delta) {
    const [y,m,d] = dateStr.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m-1, d));
    dt.setUTCDate(dt.getUTCDate() + delta);
    return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth()+1)}-${pad2(dt.getUTCDate())}`;
  }

  function dateToLabel(dateStr) {
    const [y,m,d] = dateStr.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m-1, d));
    const wk = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dt.getUTCDay()];
    const mon = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][dt.getUTCMonth()];
    return `${wk} ${d} ${mon} ${y}`;
  }

  function loadSaved(dateStr) {
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${dateStr}`);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return null;
      return obj;
    } catch {
      return null;
    }
  }

  function render() {
    listEl.innerHTML = "";
    const t = todayUTC();

    let solvedCount = 0;
    let playedCount = 0;

    for (let i = 0; i < rangeDays; i++) {
      const d = addDays(t, -i);
      const saved = loadSaved(d);

      const a = document.createElement("a");
      a.className = "day";
      a.href = `./index.html?d=${encodeURIComponent(d)}`;

      const dot = document.createElement("div");
      dot.className = "dotbox";
      if (saved) {
        playedCount++;
        if (saved.solved) {
          solvedCount++;
          dot.classList.add("solved");
        }
      }

      const meta = document.createElement("div");
      meta.className = "meta";

      const dd = document.createElement("div");
      dd.className = "d";
      dd.textContent = (i === 0) ? `Today — ${dateToLabel(d)}` : dateToLabel(d);

      const ss = document.createElement("div");
      ss.className = "s";
      if (!saved) {
        ss.textContent = "Not played yet";
      } else if (saved.solved && typeof saved.bestMoves === "number") {
        ss.textContent = `Solved · Best ${saved.bestMoves} moves`;
      } else if (saved.solved) {
        ss.textContent = "Solved";
      } else {
        ss.textContent = `In progress · Moves ${typeof saved.moves === "number" ? saved.moves : 0}`;
      }

      meta.appendChild(dd);
      meta.appendChild(ss);

      const right = document.createElement("div");
      right.className = "pill";
      right.textContent = saved && saved.solved ? "✓" : "Play";

      a.appendChild(dot);
      a.appendChild(meta);
      a.appendChild(right);

      listEl.appendChild(a);
    }

    msgEl.textContent = `Showing last ${rangeDays} days · Played ${playedCount} · Solved ${solvedCount}`;
  }

  function setRange(days) {
    rangeDays = days;
    btn30.classList.toggle("share", days === 30);
    btn90.classList.toggle("share", days === 90);
    if (days === 30) { btn30.classList.add("share"); btn90.classList.remove("share"); }
    if (days === 90) { btn90.classList.add("share"); btn30.classList.remove("share"); }
    render();
  }

  btn30.addEventListener("click", () => setRange(30));
  btn90.addEventListener("click", () => setRange(90));

  setRange(30);
})();
