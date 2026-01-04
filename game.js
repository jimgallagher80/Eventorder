(() => {
  // Event Order — daily click-to-select game.js
  // Features:
  // - Loads puzzle for today's date from puzzles.json (date-keyed)
  // - Tap 6 events in order; each selected button shows 1–6 and changes colour
  // - Auto-submits on the 6th selection
  // - Undo (last selection) + Clear (all selections)
  // - 3 mistakes max; win or lose ends the game and locks it for the day
  // - Share button appears ONLY after completion; uses native share if available, else clipboard
  // - On-page grid shows ONLY emoji rows (no title/game #); share text includes title + Game # + grid
  // - Persists state per-day in localStorage so you can't replay that day (unless you clear storage manually)

  // DOM helper
  const $ = (id) => document.getElementById(id);

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

  // Game state
  const today = startOfDay(new Date());
  const todayKey = isoDateKey(today);
  const storageKey = `eventorder:${todayKey}`;

  let events = [];        // today's events (shuffled display order)
  let attempts = [];      // array of emoji rows
  let currentPick = [];   // indices into `events` in selection order
  let mistakes = 0;
  let gameOver = false;

  const maxMistakes = 3;

  // Puzzle / numbering
  let gameNumber = 1;             // computed from earliest puzzle date
  let puzzleDateKey = todayKey;   // usually todayKey

  // Init
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  function init() {
    // Wire controls (guarded)
    const undoBtn = $("undo");
    const clearBtn = $("clear");
    const shareBtn = $("share");

    if (undoBtn) undoBtn.addEventListener("click", undo);
    if (clearBtn) clearBtn.addEventListener("click", clearAll);
    if (shareBtn) shareBtn.addEventListener("click", shareResults);

    // Try to restore today's saved game first (prevents replay)
    if (loadState()) {
      // Ensure meta is correct even after reload
      setMeta();
      renderAll();
      if (gameOver) {
        setMessage("You’ve already completed today’s game.");
        finishGameUI();
      } else {
        setMessage("Welcome back. Continue today’s game.");
      }
      return;
    }

    // Otherwise load today's puzzle
    loadPuzzleForToday();
  }

  async function loadPuzzleForToday() {
    try {
      setMessage("Loading today’s events…");

      const res = await fetch("puzzles.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`puzzles.json fetch failed (${res.status})`);
      const data = await res.json();

      // Expect date-keyed format:
      // { "2026-01-05": { "events":[...] }, "2026-01-06": { "events":[...] }, ... }
      const keys = Object.keys(data || {}).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
      if (keys.length === 0) throw new Error("No date keys found in puzzles.json");

      const earliestKey = keys[0];
      const earliestDate = new Date(`${earliestKey}T00:00:00`);

      puzzleDateKey = todayKey;

      const puzzle = data[puzzleDateKey];
      if (!puzzle || !Array.isArray(puzzle.events) || puzzle.events.length !== 6) {
        setMeta(earliestDate);
        setMessage("No puzzle published for today yet.");
        disableAllInputs();
        return;
      }

      // Compute game number based on earliest published puzzle date
      gameNumber = Math.max(1, daysBetween(earliestDate, today) + 1);
      setMeta(earliestDate);

      // Initialise state for the day
      events = shuffle([...puzzle.events]);
      attempts = [];
      currentPick = [];
      mistakes = 0;
      gameOver = false;

      saveState();
      renderAll();
      setMessage("Tap 6 events in order.");
    } catch (err) {
      console.error(err);
      setMessage("Couldn’t load today’s events. Please refresh and try again.");
      disableAllInputs();
    }
  }

  function setMeta() {
    const metaEl = $("meta");
    if (!metaEl) return;
    metaEl.textContent = `${formatDateWithOrdinal(today)} - Game ${gameNumber}`;
  }

  function renderAll() {
    renderEventButtons();
    renderGrid();
    updateControls();
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
          // Auto-submit on the 6th tap
          queueMicrotask(submitAttempt);
        }
      });

      container.appendChild(btn);
    });
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
    setMessage("Cleared. Tap 6 events in order.");
  }

  function submitAttempt() {
    if (gameOver) return;
    if (currentPick.length !== 6) return;

    const pickedEvents = currentPick.map(i => events[i]);
    const row = evaluateRow(pickedEvents);

    attempts.push(row);
    saveState();

    renderGrid();

    const solved = row.every(c => c === "🟩");

    if (solved) {
      gameOver = true;
      saveState();
      setMessage("Congratulations — you solved today’s Event Order.");
      finishGameUI();
      return;
    }

    mistakes += 1;
    saveState();

    if (mistakes >= maxMistakes) {
      gameOver = true;
      saveState();
      setMessage("Try again tomorrow.");
      finishGameUI();
      return;
    }

    // Next attempt
    currentPick = [];
    saveState();

    renderEventButtons();
    updateControls();
    setMessage(`Not quite. Attempts remaining: ${maxMistakes - mistakes}.`);
  }

  function evaluateRow(pick) {
    // Green: correct absolute position (order 1..6)
    // Amber: correct relative order with at least one neighbour (your chosen rule)
    return pick.map((e, i) => {
      if (e.order === i + 1) return "🟩";

      const left = pick[i - 1];
      const right = pick[i + 1];

      if ((left && left.order < e.order) || (right && right.order > e.order)) {
        return "🟧";
      }
      return "⬜";
    });
  }

  function renderGrid() {
    const grid = $("grid");
    if (!grid) return;

    if (attempts.length === 0) {
      grid.textContent = "";
      return;
    }

    // On-page grid: emoji rows only
    grid.textContent = attempts.map(r => r.join(" ")).join("\n");
  }

  function buildShareText() {
    return `Event Order\nGame #${gameNumber}\n` + attempts.map(r => r.join(" ")).join("\n");
  }

  async function shareResults() {
    if (!gameOver) return;

    const text = buildShareText();

    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // fall back to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      setMessage("Results copied — you can paste them anywhere.");
    } catch {
      setMessage("Couldn’t share automatically. Select and copy the grid below.");
    }
  }

  function updateControls() {
    const undoBtn = $("undo");
    const clearBtn = $("clear");

    if (undoBtn) undoBtn.disabled = gameOver || currentPick.length === 0;
    if (clearBtn) clearBtn.disabled = gameOver || currentPick.length === 0;

    // Share button only visible after completion
    const shareBtn = $("share");
    if (shareBtn) {
      shareBtn.style.display = gameOver ? "inline-block" : "none";
      shareBtn.disabled = !gameOver;
    }
  }

  function finishGameUI() {
    renderEventButtons();
    updateControls();
  }

  function disableAllInputs() {
    gameOver = true;
    const undoBtn = $("undo");
    const clearBtn = $("clear");
    const shareBtn = $("share");
    if (undoBtn) undoBtn.disabled = true;
    if (clearBtn) clearBtn.disabled = true;
    if (shareBtn) shareBtn.style.display = "none";

    const container = $("event-buttons");
    if (container) {
      // If buttons exist, disable them
      [...container.querySelectorAll("button")].forEach(b => (b.disabled = true));
    }
  }

  function setMessage(text) {
    const msg = $("message");
    if (msg) msg.textContent = text;
  }

  // Persistence (prevents replay on same day)
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
      // If storage fails, game still works; it just won't lock/persist
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
})();
