(() => {
  // Base date for "Game #"
  // Set this to the date you want Game 1 to be.
  const BASE_GAME_DATE = new Date("2025-01-04T00:00:00");

  let events = [];
  let attempts = [];
  const maxMistakes = 3;

  let currentPick = []; // stores event indices in the order tapped
  let mistakes = 0;
  let gameOver = false;

  // DOM
  const $ = (id) => document.getElementById(id);

  const today = startOfDay(new Date());
  const gameNumber = Math.max(1, daysBetween(startOfDay(BASE_GAME_DATE), today) + 1);

  document.addEventListener("DOMContentLoaded", () => {
    // Set meta line under title
    $("meta").textContent = `${formatDateWithOrdinal(today)} - Game ${gameNumber}`;

    // Wire buttons
    $("undo").addEventListener("click", undo);
    $("clear").addEventListener("click", clearAll);
    $("share").addEventListener("click", shareResults);

    // Load puzzle data
    loadPuzzle();
  });

  async function loadPuzzle() {
    try {
      setMessage("Loading today’s events…");

      const res = await fetch("puzzles.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`Could not load puzzles.json (${res.status})`);

      const data = await res.json();
      if (!data?.events?.length) throw new Error("puzzles.json has no events");

      events = shuffle([...data.events]);
      renderAll();
      setMessage("Tap 6 events in order.");
    } catch (err) {
      setMessage("Couldn’t load today’s events. Please refresh and try again.");
      // Helpful debug in console if needed
      console.error(err);
    }
  }

  function renderAll() {
    renderEventButtons();
    renderGrid();
    updateControls();
  }

  function renderEventButtons() {
    const container = $("event-buttons");
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

        if (currentPick.length === 6) submitAttempt(); // auto-submit on 6th tap
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

    // Next attempt
    currentPick = [];
    renderEventButtons();
    updateControls();
    setMessage(`Not quite. Attempts remaining: ${maxMistakes - mistakes}.`);
  }

  function finishGame() {
    // Disable all event selections + undo/clear
    renderEventButtons();
    updateControls();

    // Show Share button only once game is completed
    $("share").style.display = "inline-block";
    $("share").disabled = false;
  }

  function evaluateRow(pick) {
    return pick.map((e, i) => {
      // Green: correct absolute position
      if (e.order === i + 1) return "🟩";

      // Amber: correct relative order with a neighbour
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

    // Prefer native share sheet on mobile
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // User cancelled or share failed; fall back to clipboard below
      }
    }

    // Clipboard fallback
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Results copied — you can paste them anywhere.");
    } catch {
      setMessage("Couldn’t share automatically. Select and copy the results below.");
    }
  }

  function updateControls() {
    $("undo").disabled = gameOver || currentPick.length === 0;
    $("clear").disabled = gameOver || currentPick.length === 0;

    // Share is only visible after completion
    // (kept hidden via inline style until finishGame())
  }

  function setMessage(text) {
    $("message").textContent = text;
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
