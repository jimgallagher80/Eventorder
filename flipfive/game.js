// /flipfive/game.js
(() => {
  const N = 5;
  const TOTAL = N * N;

  const elGrid = document.getElementById("grid");
  const elMsg = document.getElementById("message");
  const elMoves = document.getElementById("moves");
  const elBest = document.getElementById("best");
  const elTime = document.getElementById("time");
  const elDate = document.getElementById("dateLabel");
  const elTag = document.getElementById("tagLabel");

  const btnReset = document.getElementById("resetBtn");
  const btnRestart = document.getElementById("restartBtn");
  const btnShare = document.getElementById("shareBtn");
  const btnPrev = document.getElementById("prevDay");
  const btnNext = document.getElementById("nextDay");

  const STORAGE_PREFIX = "flipfive:";
  const MAX_ARCHIVE_DAYS = 90;

  let tiles = [];
  let locked = false;

  let puzzleDate = null;        // YYYY-MM-DD
  let seedStr = null;
  let startState = null;        // boolean[25]
  let state = null;             // boolean[25]
  let moves = 0;

  let timerId = null;
  let t0 = 0;

  function setMessage(text, tone = "neutral") {
    elMsg.textContent = text;
    elMsg.style.color =
      tone === "ok" ? "rgba(53,208,127,0.95)" :
      tone === "bad" ? "rgba(255,77,77,0.95)" :
      "rgba(255,255,255,0.65)";
  }

  function pad2(n){ return String(n).padStart(2,"0"); }

  function todayUTC() {
    const d = new Date();
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth()+1)}-${pad2(d.getUTCDate())}`;
  }

  function parseDateParam() {
    const u = new URL(window.location.href);
    const d = u.searchParams.get("d");
    if (!d) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
    return d;
  }

  function clampToToday(dateStr) {
    const t = todayUTC();
    return (dateStr > t) ? t : dateStr;
  }

  function dateToLabel(dateStr) {
    const [y,m,d] = dateStr.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m-1, d));
    const wk = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dt.getUTCDay()];
    const mon = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][dt.getUTCMonth()];
    return `${wk} ${d} ${mon} ${y}`;
  }

  function addDays(dateStr, delta) {
    const [y,m,d] = dateStr.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m-1, d));
    dt.setUTCDate(dt.getUTCDate() + delta);
    return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth()+1)}-${pad2(dt.getUTCDate())}`;
  }

  function hashSeed(str) {
    // FNV-1a 32-bit
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function() {
      let t = (a += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function idx(r,c){ return r*N + c; }

  function neighbours(i) {
    const r = Math.floor(i / N);
    const c = i % N;
    const out = [i];
    if (r > 0) out.push(idx(r-1,c));
    if (r < N-1) out.push(idx(r+1,c));
    if (c > 0) out.push(idx(r,c-1));
    if (c < N-1) out.push(idx(r,c+1));
    return out;
  }

  function toggleAt(s, i) {
    const ns = s.slice();
    for (const j of neighbours(i)) ns[j] = !ns[j];
    return ns;
  }

  function stateToBits(s) {
    let bits = 0;
    for (let i = 0; i < TOTAL; i++) if (s[i]) bits |= (1 << i);
    return bits >>> 0;
  }

  function bitsToState(bits) {
    const s = new Array(TOTAL).fill(false);
    for (let i = 0; i < TOTAL; i++) s[i] = !!(bits & (1 << i));
    return s;
  }

  function saveKey(dateStr){ return `${STORAGE_PREFIX}${dateStr}`; }

  function loadSaved(dateStr) {
    try {
      const raw = localStorage.getItem(saveKey(dateStr));
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return null;
      return obj;
    } catch {
      return null;
    }
  }

  function saveProgress(dateStr, payload) {
    localStorage.setItem(saveKey(dateStr), JSON.stringify(payload));
  }

  function clearProgress(dateStr) {
    localStorage.removeItem(saveKey(dateStr));
  }

  function bestFor(dateStr) {
    const o = loadSaved(dateStr);
    if (!o || typeof o.bestMoves !== "number") return null;
    return o.bestMoves;
  }

  function stopTimer() {
    if (timerId) clearInterval(timerId);
    timerId = null;
  }

  function startTimer() {
    stopTimer();
    t0 = Date.now();
    timerId = setInterval(() => {
      elTime.textContent = formatTime(Date.now() - t0);
    }, 250);
  }

  function formatTime(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${pad2(m)}:${pad2(s)}`;
  }

  function isSolved(s) {
    for (let i = 0; i < TOTAL; i++) if (s[i]) return false;
    return true;
  }

  function buildGrid() {
    elGrid.innerHTML = "";
    tiles = [];
    for (let i = 0; i < TOTAL; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tile";
      b.setAttribute("role", "gridcell");
      b.setAttribute("aria-label", `Tile ${i+1}`);
      b.dataset.i = String(i);
      b.addEventListener("click", () => onTile(i));
      elGrid.appendChild(b);
      tiles.push(b);
    }
  }

  function render() {
    for (let i = 0; i < TOTAL; i++) {
      tiles[i].classList.toggle("on", !!state[i]);
    }
    elMoves.textContent = String(moves);

    const b = bestFor(puzzleDate);
    elBest.textContent = (b === null) ? "—" : String(b);
  }

  function pop(i) {
    const t = tiles[i];
    t.classList.add("pop");
    setTimeout(() => t.classList.remove("pop"), 130);
  }

  function snapshotPayload(extra = {}) {
    const nowSolved = isSolved(state);
    const stored = loadSaved(puzzleDate) || {};
    const bestMovesPrev = (typeof stored.bestMoves === "number") ? stored.bestMoves : null;

    let bestMoves = bestMovesPrev;
    if (nowSolved) {
      if (bestMovesPrev === null || moves < bestMovesPrev) bestMoves = moves;
    }

    const payload = {
      date: puzzleDate,
      seed: seedStr,
      startBits: stateToBits(startState),
      stateBits: stateToBits(state),
      moves,
      seconds: Math.floor((Date.now() - t0)/1000),
      solved: !!nowSolved,
      bestMoves: bestMoves === null ? undefined : bestMoves,
      plays: (typeof stored.plays === "number" ? stored.plays : 0),
      ...extra
    };

    // drop undefined keys cleanly
    for (const k of Object.keys(payload)) if (payload[k] === undefined) delete payload[k];
    return payload;
  }

  function updateNavButtons() {
    const t = todayUTC();
    btnNext.disabled = (puzzleDate >= t);
  }

  function setURLDate(dateStr) {
    const u = new URL(window.location.href);
    u.searchParams.set("d", dateStr);
    window.history.replaceState({}, "", u.toString());
  }

  function generateDaily(dateStr) {
    seedStr = `flipfive:${dateStr}`;
    const rng = mulberry32(hashSeed(seedStr));

    // Start from solved (all off), then apply random moves to create a guaranteed-solvable start.
    let s = new Array(TOTAL).fill(false);

    // Difficulty curve: more scrambles as you go, but capped.
    const dayIndex = Math.min(3650, Math.max(0, Math.floor((hashSeed(dateStr) % 3650))));
    const base = 9 + Math.floor(dayIndex / 365); // slowly ramps
    const scrambles = Math.min(16, base + Math.floor(rng()*5)); // 9..16-ish

    // Avoid repeating the exact same move too often.
    let last = -1;
    for (let k = 0; k < scrambles; k++) {
      let i = Math.floor(rng() * TOTAL);
      if (i === last) i = (i + 7) % TOTAL;
      last = i;
      s = toggleAt(s, i);
    }

    startState = s.slice();
    state = s.slice();
    moves = 0;
  }

  function loadOrInit(dateStr) {
    puzzleDate = clampToToday(dateStr);
    setURLDate(puzzleDate);

    elDate.textContent = dateToLabel(puzzleDate);
    elTag.textContent = (puzzleDate === todayUTC()) ? "Daily" : "Archive";

    updateNavButtons();

    const saved = loadSaved(puzzleDate);
    if (saved && saved.seed === `flipfive:${puzzleDate}` && typeof saved.startBits === "number") {
      seedStr = saved.seed;
      startState = bitsToState(saved.startBits >>> 0);
      state = (typeof saved.stateBits === "number") ? bitsToState(saved.stateBits >>> 0) : startState.slice();
      moves = (typeof saved.moves === "number") ? saved.moves : 0;

      setMessage(isSolved(state) ? "Solved. Try to beat your best." : "Continue where you left off.");
    } else {
      generateDaily(puzzleDate);
      setMessage("Clear the grid. Good luck.");
      const payload = snapshotPayload({ plays: 1 });
      saveProgress(puzzleDate, payload);
    }

    startTimer();
    render();
  }

  function onTile(i) {
    if (locked) return;

    locked = true;
    pop(i);

    state = toggleAt(state, i);
    moves += 1;

    render();

    const solvedNow = isSolved(state);
    if (solvedNow) {
      stopTimer();
      setMessage(`Solved in ${moves} moves.`, "ok");
    } else {
      setMessage("Keep going.");
    }

    const saved = loadSaved(puzzleDate);
    const plays = (saved && typeof saved.plays === "number") ? saved.plays : 1;
    const payload = snapshotPayload({ plays });
    saveProgress(puzzleDate, payload);

    setTimeout(() => { locked = false; }, 80);
  }

  function resetToStart() {
    if (!startState) return;
    state = startState.slice();
    moves = 0;
    startTimer();
    render();
    setMessage("Reset to today’s start.");
    const saved = loadSaved(puzzleDate);
    const plays = (saved && typeof saved.plays === "number") ? saved.plays : 1;
    saveProgress(puzzleDate, snapshotPayload({ plays }));
  }

  function restartFresh() {
    clearProgress(puzzleDate);
    generateDaily(puzzleDate);
    startTimer();
    moves = 0;
    render();
    setMessage("Restarted fresh.");
    saveProgress(puzzleDate, snapshotPayload({ plays: 1 }));
  }

  function shareText() {
    const saved = loadSaved(puzzleDate) || {};
    const best = (typeof saved.bestMoves === "number") ? saved.bestMoves : null;

    const gridEmoji = (() => {
      // compact 5x5 render of current (or solved) state
      const s = isSolved(state) ? state : startState;
      let out = "";
      for (let r = 0; r < N; r++) {
        let line = "";
        for (let c = 0; c < N; c++) {
          line += s[idx(r,c)] ? "🟦" : "⬛️";
        }
        out += line + (r < N-1 ? "\n" : "");
      }
      return out;
    })();

    const headline = `Flip Five — ${puzzleDate}`;
    const score = best === null ? `Solved: ${isSolved(state) ? "Yes" : "No"}` : `Best: ${best} moves`;
    const url = (() => {
      const u = new URL(window.location.href);
      u.searchParams.set("d", puzzleDate);
      return u.toString();
    })();

    return `${headline}\n${score}\n\n${gridEmoji}\n\n${url}`;
  }

  async function onShare() {
    const text = shareText();
    try {
      if (navigator.share) {
        await navigator.share({ text });
        setMessage("Shared.", "ok");
      } else {
        await navigator.clipboard.writeText(text);
        setMessage("Copied to clipboard.", "ok");
      }
    } catch {
      try {
        await navigator.clipboard.writeText(text);
        setMessage("Copied to clipboard.", "ok");
      } catch {
        setMessage("Couldn’t share. Try copying from the page URL.", "bad");
      }
    }
  }

  function onPrev() {
    const prev = addDays(puzzleDate, -1);
    const oldest = addDays(todayUTC(), -MAX_ARCHIVE_DAYS);
    if (prev < oldest) return;
    loadOrInit(prev);
  }

  function onNext() {
    const next = addDays(puzzleDate, +1);
    if (next > todayUTC()) return;
    loadOrInit(next);
  }

  btnReset.addEventListener("click", resetToStart);
  btnRestart.addEventListener("click", restartFresh);
  btnShare.addEventListener("click", onShare);
  btnPrev.addEventListener("click", onPrev);
  btnNext.addEventListener("click", onNext);

  // Boot
  buildGrid();
  const initial = parseDateParam() || todayUTC();
  loadOrInit(initial);
})();
