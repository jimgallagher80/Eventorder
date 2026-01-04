(() => {
  // Order These — daily click-to-select
  // v1.07 (Beta) — remove history list; persist order; per-button feedback; prevent duplicate attempts

  const VERSION = "1.07";
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
  const storageKey = `orderthese:${todayKey}`;

  let events = [];
  let attempts = [];      // emoji rows
  let currentPick = [];   // indices into events
  let mistakes = 0;
  let gameOver = false;

  // Track attempted full sequences so repeating doesn't cost a turn
  // signature is "idx-idx-idx-idx-idx-idx"
  let attemptedSignatures = [];

  // Per-button feedback for *most recent attempt* (maps eventIdx -> "🟩/🟧/⬜")
  let feedbackMap = {}; // { [idx]: "🟩"|"🟧"|"⬜" }
  // For greens: show correct position number (1..6) in badge, light grey
  let correctPosMap = {}; // { [idx]: number }

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
    if (modal) modal.hidden = false;
  }
  function closeInfo() {
    const modal = $("infoModal");
    if (modal) modal.hidden = true;
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
        gameOver,
        attemptedSignatures,
        feedbackMap,
        correctPosMap
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

      attemptedSignatures = Array.isArray(state.attemptedSignatures) ? state.attemptedSignatures : [];
      feedbackMap = state.feedbackMap && typeof state.feedbackMap === "object" ? state.feedbackMap : {};
      correctPosMap = state.correctPosMap && typeof state.correctPosMap === "object" ? state.correctPosMap : {};

      return true;
    } catch {
      return false;
    }
  }

  function clearSavedGame() {
    try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
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
    // On-page grid: keep it readable; share output will be compact.
    grid.textContent = attempts.map(r => r.join(" ")).join("\n");
  }

  function renderEventButtons() {
    const container = $("event-buttons");
    if (!container) return;

    container.innerHTML = "";

    events.forEach((e, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "event-btn";

      // Apply feedback style from the most recent attempt (if any)
      const fb = feedbackMap[idx];
      if (fb === "🟩") btn.classList.add("fb-green");
      else if (fb === "🟧") btn.classList.add("fb-amber");
      else if (fb === "⬜") btn.classList.add("fb-white");

      const pickedPos = currentPick.indexOf(idx);
      if (pickedPos >= 0) btn.classList.add("selected");

      const left = document.createElement("span");
      left.textContent = e.text;

      const badge = document.createElement("span");
      badge.className = "choice-badge";

      // While selecting: show 1..6 as before
      if (pickedPos >= 0) {
        badge.textContent = String(pickedPos + 1);
        badge.classList.remove("badge-correct");
      } else {
        // Not currently selected:
        // If it was green last attempt, show correct position number in light grey
        if (fb === "🟩" && typeof correctPosMap[idx] === "number") {
          badge.textContent = String(correctPosMap[idx]);
          badge.classList.add("badge-correct");
        } else {
          badge.textContent = "";
          badge.classList.remove("badge-correct");
        }
      }

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

    const sig = currentPick.join("-");
    if (attemptedSignatures.includes(sig)) {
      // Reset without using up a turn
      currentPick = [];
      saveState();
      renderEventButtons();
      updateControls();
      setMessage("Order already attempted");
      return;
    }

    attemptedSignatures.push(sig);

    const pickedEvents = currentPick.map(i => events[i]);
    const row = evaluateRow(pickedEvents);

    // Build per-button feedback from this attempt
    // idx in events -> emoji result, and correctPosMap for greens
    const newFeedback = {};
    const newCorrectPos = {};
    currentPick.forEach((eventIdx, pos) => {
      const emoji = row[pos];
      newFeedback[eventIdx] = emoji;
      if (emoji === "🟩") {
        // correct position number (1..6)
        newCorrectPos[eventIdx] = pos + 1;
      }
    });

    feedbackMap = newFeedback;
    correctPosMap = newCorrectPos;

    attempts.push(row);
    saveState();

    renderGrid();

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

    // Next attempt: keep same order, but clear selection (feedback remains visible)
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
    // No spaces between emojis
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
      attemptedSignatures = [];
      feedbackMap = {};
      correctPosMap = {};

      saveState();
      renderEventButtons();
      renderGrid();
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

    // In dev mode, allow replay by clearing today's save
    if (localStorage.getItem("orderthese:dev") === "true" || DEV_QUERY) {
      clearSavedGame();
    }

    if (loadState()) {
      setMeta();
      renderEventButtons();
      renderGrid();
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
