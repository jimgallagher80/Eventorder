(() => {
  // Order These — daily click-to-select
  // v1.06 (Beta) — clean rebuild to avoid early JS errors + ensure header buttons work

  const VERSION = "1.06";
  const LAST_UPDATED = new Date().toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const $ = (id) => document.getElementById(id);

  // Dev mode:
  // - one-off: ?dev=1
  // - persistent: localStorage "orderthese:dev" === "true"
  const DEV_QUERY = new URLSearchParams(window.location.search).get("dev") === "1";
  const DEV_PERSIST = localStorage.getItem("orderthese:dev") === "true";
  const DEV = DEV_QUERY || DEV_PERSIST;

  // Date helpers
  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
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
  function formatDateWithOrdinal(d) {
    const day = d.getDate();
    const month = d.toLocaleString("en-GB", { month: "long" });
    const year = d.getFullYear();
    return `${day}${ordinal(day)} ${month} ${year}`;
  }
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // State
  const today = startOfDay(new Date());
  const todayKey = isoDateKey(today);

  // We store by date, but in DEV mode we allow replay, so we don't block load.
  const storageKey = `orderthese:${todayKey}`;

  let events = [];
  let attempts = [];      // emoji rows
  let currentPick = [];   // indices into events
  let mistakes = 0;
  let gameOver = false;

  const maxMistakes = 3;

  let gameNumber = 1;
  let puzzleDateKey = todayKey;

  // UI helpers
  function setMessage(text) {
    const el = $("message");
    if (el) el.textContent = text;
  }

  function setBuildLine() {
    const el = $("buildLine");
    if (!el) return;
    el.textContent = `Beta v${VERSION} · last updated ${LAST_UPDATED}`;
  }

  function setMeta() {
    const el = $("meta");
    if (!el) return;
    el.textContent = `${formatDateWithOrdinal(today)} - Game ${gameNumber}`;
  }

  // Modal & menu wiring
  function openInfo() {
    const modal = $("infoModal");
    if (!modal) return;
    modal.hidden = false;
  }
  function closeInfo() {
    const modal = $("infoModal");
    if (!modal) return;
    modal.hidden = true;
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

  // Persistence
  function saveState() {
    try {
      const state = {
        puzzleDateKey,
        gameNumber,
        events,
        attempts,
        currentPick,
        mistakes,
        gameOver
      };
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // ignore
    }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return false;
      const state = JSON.parse(raw);
      if (!state || !Array.isArray(state.events) || state.events.length !== 6) return false;

      puzzleDateKey = state.puzzleDateKey || todayKey;
      gameNumber = typeof state.gameNumber === "number" ? state.gameNumber : 1;

      events = state.events;
      attempts = Array.isArray(state.attempts) ? state.attempts : [];
      currentPick = Array.isArray(state.currentPick) ? state.currentPick : [];
      mistakes = typeof state.mistakes === "number" ? state.mistakes : 0;
      gameOver = !!state.gameOver;

      return true;
    } catch {
      return false;
    }
  }

  function clearSavedGame() {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  }

  // Game logic
  function updateControls() {
    const undoBtn = $("undo");
    const clearBtn = $("clear");
    const shareBtn = $("share");
    const controlsRow = $("controlsRow");

    const canEdit = !gameOver;

    if (undoBtn) undoBtn.disabled = !canEdit || currentPick.length === 0;
    if (clearBtn) clearBtn.disabled = !canEdit || currentPick.length === 0;

    // After completion: hide Undo/Clear row entirely, show Share
    if (controlsRow) controlsRow.style.display = gameOver ? "none" : "flex";

    if (shareBtn) {
      shareBtn.style.display = gameOver ? "inline-flex" : "none";
      shareBtn.disabled = !gameOver;
    }
  }

  function renderGrid() {
    const grid = $("grid");
    if (!grid) return;
    if (attempts.length === 0) {
      grid.textContent = "";
      return;
    }
    // On-page grid can have spaces for readability (optional).
    // We'll keep spaces on-screen, but not in share output.
    grid.textContent = attempts.map(r => r.join(" ")).join("\n");
  }

  function renderHistory() {
    const hist = $("history");
    if (!hist) return;

    hist.innerHTML = "";

    if (attempts.length === 0) return;

    const title = document.createElement("div");
    title.className = "history-title";
    title.textContent = "Previous attempts";
    hist.appendChild(title);

    attempts.forEach((row, idx) => {
      const line = document.createElement("div");
      line.className = "history-row";

      const label = document.createElement("div");
      label.className = "history-attempt";
      label.textContent = `Attempt ${idx + 1}`;

      const boxes = document.createElement("div");
      boxes.className = "history-boxes";

      // We don’t have the actual selected texts stored in v1.06 state,
      // so we show the coloured indicators + position numbers lightly.
      // (If you want the exact texts stored, we can add that next.)
      row.forEach((emoji, pos) => {
        const b = document.createElement("div");
        b.className = "history-box";
        b.dataset.colour = emoji; // for CSS mapping
        b.textContent = String(pos + 1);
        boxes.appendChild(b);
      });

      line.appendChild(label);
      line.appendChild(boxes);
      hist.appendChild(line);
    });
  }

  function renderEventButtons() {
    const container = $("event-buttons");
    if (!container) return;

    container.innerHTML = "";

    events.forEach((e, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "event-btn";

      const pickedPos = currentPick.indexOf(idx);
      if (pickedPos >= 0) btn.classList.add("selected");

      const left = document.createElement("span");
      left.textContent = e.text;

      const badge = document.createElement("span");
      badge.className = "choice-badge";
      badge.textContent = pickedPos >= 0 ? String(pickedPos + 1) : "";

      btn.appendChild(left);
      btn.appendChild(badge);

      btn.disabled = gameOver || pickedPos >= 0 || currentPick.length >= 6;

      btn.addEventListener("click", () => {
        if (gameOver) return;
        if (currentPick.length >= 6) return;
        if (currentPick.includes(idx)) return;

        currentPick.push(idx);
        saveState();

        renderEventButtons();
        updateControls();

        if (currentPick.length === 6) {
          queueMicrotask(submitAttempt);
        }
      });

      container.appendChild(btn);
    });
  }

  function evaluateRow(pick) {
    return pick.map((e, i) => {
      if (e.order === i + 1) return "🟩";

      const left = pick[i - 1];
      const right = pick[i + 1];

      if ((left && left.order < e.order) || (right && right.order > e.order)) return "🟧";
      return "⬜";
    });
  }

  function submitAttempt() {
    if (gameOver) return;
    if (currentPick.length !== 6) return;

    const pickedEvents = currentPick.map(i => events[i]);
    const row = evaluateRow(pickedEvents);

    attempts.push(row);
    saveState();

    renderGrid();
    renderHistory();

    const solved = row.every(c => c === "🟩");
    if (solved) {
      gameOver = true;
      saveState();
      setMessage("Nice — you solved today’s Order These.");
      renderEventButtons();
      updateControls();
      return;
    }

    mistakes += 1;
    saveState();

    if (mistakes >= maxMistakes) {
      gameOver = true;
      saveState();
      setMessage("Unlucky — try again tomorrow.");
      renderEventButtons();
      updateControls();
      return;
    }

    currentPick = [];
    saveState();

    renderEventButtons();
    updateControls();
    setMessage(`Not quite. Attempts remaining: ${maxMistakes - mistakes}.`);
  }

  function undo() {
    if (gameOver) return;
    if (currentPick.length === 0) return;
    currentPick.pop();
    saveState();
    renderEventButtons();
    updateControls();
    setMessage("Undone.");
  }

  function clearAll() {
    if (gameOver) return;
    currentPick = [];
    saveState();
    renderEventButtons();
    updateControls();
    setMessage("Cleared. Tap 6 items in order.");
  }

  function buildShareText() {
    // No spaces between emojis per your requirement
    const gridLines = attempts.map(r => r.join("")).join("\n");
    return `Order These\nGame #${gameNumber}\n${gridLines}`;
  }

  async function shareResults() {
    if (!gameOver) return;

    const text = buildShareText();

    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // fall back
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      setMessage("Results copied — paste anywhere.");
    } catch {
      setMessage("Couldn’t copy automatically. Select and copy the grid.");
    }
  }

  async function loadPuzzleForToday() {
    try {
      setMessage("Loading today’s items…");

      const res = await fetch("puzzles.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`puzzles.json fetch failed (${res.status})`);
      const data = await res.json();

      const keys = Object.keys(data || {}).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
      if (keys.length === 0) throw new Error("No date keys found in puzzles.json");

      const earliestKey = keys[0];
      const earliestDate = new Date(`${earliestKey}T00:00:00`);

      puzzleDateKey = todayKey;

      const puzzle = data[puzzleDateKey];
      if (!puzzle || !Array.isArray(puzzle.events) || puzzle.events.length !== 6) {
        gameNumber = Math.max(1, daysBetween(earliestDate, today) + 1);
        setBuildLine();
        setMeta();
        setMessage("No puzzle published for today yet.");
        renderGrid();
        renderHistory();
        updateControls();
        return;
      }

      gameNumber = Math.max(1, daysBetween(earliestDate, today) + 1);
      setBuildLine();
      setMeta();

      events = shuffle([...puzzle.events]);
      attempts = [];
      currentPick = [];
      mistakes = 0;
      gameOver = false;

      saveState();
      renderEventButtons();
      renderGrid();
      renderHistory();
      updateControls();
      setMessage("Tap 6 items in order.");
    } catch (err) {
      console.error(err);
      setMessage("Couldn’t load today’s items. Please refresh and try again.");
    }
  }

  function wireHeaderUI() {
    const infoBtn = $("infoBtn");
    const closeInfoBtn = $("closeInfoBtn");
    const backdrop = $("modalBackdrop");

    if (infoBtn) infoBtn.addEventListener("click", () => {
      closeMenu();
      openInfo();
    });
    if (closeInfoBtn) closeInfoBtn.addEventListener("click", closeInfo);
    if (backdrop) backdrop.addEventListener("click", closeInfo);

    const menuBtn = $("menuBtn");
    const dropdown = $("menuDropdown");

    if (menuBtn) menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleMenu();
    });

    // close dropdown when tapping elsewhere
    document.addEventListener("click", (e) => {
      if (!dropdown || dropdown.hidden) return;
      const withinMenu = dropdown.contains(e.target);
      const withinBtn = menuBtn && menuBtn.contains(e.target);
      if (!withinMenu && !withinBtn) closeMenu();
    });

    // Dev toggle
    const devToggle = $("devToggle");
    if (devToggle) {
      devToggle.checked = DEV_PERSIST;
      devToggle.addEventListener("change", () => {
        const on = devToggle.checked;
        localStorage.setItem("orderthese:dev", on ? "true" : "false");
        // For immediate testing convenience, clear saved game when turning dev on
        if (on) clearSavedGame();
        setMessage(on ? "Developer mode enabled (replay allowed)." : "Developer mode disabled.");
      });
    }
  }

  function wireGameUI() {
    const undoBtn = $("undo");
    const clearBtn = $("clear");
    const shareBtn = $("share");

    if (undoBtn) undoBtn.addEventListener("click", undo);
    if (clearBtn) clearBtn.addEventListener("click", clearAll);
    if (shareBtn) shareBtn.addEventListener("click", shareResults);
  }

  function init() {
    setBuildLine();
    wireHeaderUI();
    wireGameUI();

    // In dev mode, we allow replay: ignore saved game-over lock by clearing it
    if (localStorage.getItem("orderthese:dev") === "true" || DEV_QUERY) {
      clearSavedGame();
    }

    // Try to restore saved game
    if (loadState()) {
      setMeta();
      renderEventButtons();
      renderGrid();
      renderHistory();
      updateControls();
      setMessage(gameOver ? "Completed (replay allowed while in Developer mode)." : "Welcome back — continue.");
      return;
    }

    loadPuzzleForToday();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
