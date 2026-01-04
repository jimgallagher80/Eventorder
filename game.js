(() => {
  const BASE_GAME_DATE = new Date(); // Game 1 = today (your local date)


  let events = [];
  let attempts = [];
  const maxMistakes = 3;

  let currentPick = []; // indices
  let mistakes = 0;
  let gameOver = false;

  const $ = (id) => document.getElementById(id);

  const today = startOfDay(new Date());
  const gameNumber = Math.max(1, daysBetween(startOfDay(BASE_GAME_DATE), today) + 1);

  // --- robust init (works whether DOM is ready or not) ---
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  function init() {
    // Set meta line (date + game number)
    const metaEl = $("meta");
    if (metaEl) metaEl.textContent = `${formatDateWithOrdinal(today)} - Game ${gameNumber}`;

    // Wire buttons safely (in case you tweak HTML later)
    const undoBtn = $("undo");
    const clearBtn = $("clear");
    const shareBtn = $("share");

    if (undoBtn) undoBtn.addEventListener("click", undo);
    if (clearBtn) clearBtn.addEventListener("click", clearAll);
    if (shareBtn) shareBtn.addEventListener("click", shareResults);

    loadPuzzle();
  }

  async function loadPuzzle() {
    try {
      setMessage("Loading today’s events…");

      const res = await fetch("puzzles.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`puzzles.json fetch failed (${res.status})`);

      const data = await res.json();
      if (!data?.events?.length) throw new Error("No events found in puzzles.json");

      events = shuffle([...data.events]);
      renderAll();
      setMessage("Tap 6 events in order.");
    } catch (err) {
      console.error(err);
      setMessage("Couldn’t load today’s events. Please refresh and try again.");
    }
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
        renderEventButtons();
        updateControls();

        if (currentPick.length === 6) {
          // Ensure submit runs reliably after the state update
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
    renderEventButtons();
    updateControls();
    setMessage("Undone.");
  }

  function clearAll() {
    if (gameOver) return;
    currentPick = [];
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
    renderGrid();

    const solved = row.every(c => c === "🟩");

    if (solved) {
      gameOver = true;
      setMessage("Congratulations — you solved today’s Event Order.");
      finishGame();
      return;
    }

    mistakes += 1;

    if (mistakes >= maxMistakes) {
      gameOver = true;
      setMessage("Try again tomorrow.");
      finishGame();
      return;
    }

    currentPick = [];
    renderEventButtons();
    updateControls();
    setMessage(`Not quite. Attempts remaining: ${maxMistakes - mistakes}.`);
  }

  function finishGame() {
    renderEventButtons();
    updateControls();

    const shareBtn = $("share");
    if (shareBtn) {
      shareBtn.style.display = "inline-block";
      shareBtn.disabled = false;
    }
  }

  function evaluateRow(pick) {
    return pick.map((e, i) => {
      if (e.order === i + 1) return "🟩";
      const left = pick[i - 1];
      const right = pick[i + 1];
      if ((left && left.order < e.order) || (right && right.order > e.order)) return "🟨";
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
    grid.textContent = buildShareText();
  }

  function buildShareText() {
    return `Event Order\nGame #${gameNumber}\n` + attempts.map(r => r.join(" ")).join("\n");
  }

  async function shareResults() {
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
      setMessage("Results copied — you can paste them anywhere.");
    } catch {
      setMessage("Couldn’t share automatically. Select and copy the results below.");
    }
  }

  function updateControls() {
    const undoBtn = $("undo");
    const clearBtn = $("clear");
    if (undoBtn) undoBtn.disabled = gameOver || currentPick.length === 0;
    if (clearBtn) clearBtn.disabled = gameOver || currentPick.length === 0;
  }

  function setMessage(text) {
    const msg = $("message");
    if (msg) msg.textContent = text;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function daysBetween(a, b) {
    const ms = 24 * 60 * 60 * 1000;
    return Math.floor((b - a) / ms);
  }

  function formatDateWithOrdinal(d) {
    const day = d.getDate();
    const month = d.toLocaleString("en-GB", { month: "long" });
    const year = d.getFullYear();
    return `${day}${ordinal(day)} ${month} ${year}`;
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
})();
