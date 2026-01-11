(() => {
  // Order These — daily click-to-select
  // v3.2 — share button shown on game over; undo/clear hidden on game over
  const VERSION = "3.2";

  // Fixed "last updated" (Europe/London)
  const LAST_UPDATED = "11 Jan 2026 17:15 GMT";

  const $ = (id) => document.getElementById(id);

  // TEMP DEBUG: show any JS errors on-screen (iOS Safari friendly)
  window.addEventListener("error", (e) => {
    const msg = `JS error: ${e.message} @ ${e.filename?.split("/").pop()}:${e.lineno}`;
    const el = document.getElementById("message");
    if (el) el.textContent = msg;
    else alert(msg);
  });

  window.addEventListener("unhandledrejection", (e) => {
    const msg = `Promise error: ${String(e.reason)}`;
    const el = document.getElementById("message");
    if (el) el.textContent = msg;
    else alert(msg);
  });

  // Dev mode:
  // - one-off: ?dev=1
  // - persistent: localStorage "orderthese:dev" === "true"
  const DEV_QUERY = new URLSearchParams(window.location.search).get("dev") === "1";
  const DEV_PERSIST = localStorage.getItem("orderthese:dev") === "true";

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
  function formatDateShortWithOrdinal(d) {
    const day = d.getDate();
    const month = d.toLocaleString("en-GB", { month: "short" });
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

  // Active date support via ?date=YYYY-MM-DD
  const today = startOfDay(new Date());
  const todayKey = isoDateKey(today);

  const requestedDateParam = new URLSearchParams(window.location.search).get("date");
  const requestedDateKey =
    (requestedDateParam && /^\d{4}-\d{2}-\d{2}$/.test(requestedDateParam)) ? requestedDateParam : null;

  let activeDateKey = requestedDateKey || todayKey;
  let activeDateObj = new Date(`${activeDateKey}T00:00:00`);

  let storageKey = `orderthese:${activeDateKey}`;

  // FLIP animation helpers
  function prefersReducedMotion() {
    try {
      return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return false;
    }
  }

  function recordPositions(container) {
    const map = new Map();
    if (!container) return map;
    container.querySelectorAll(".event-btn[data-key]").forEach(el => {
      map.set(el.dataset.key, el.getBoundingClientRect());
    });
    return map;
  }

  function playFlip(container, firstPositions) {
    if (!container) return;
    if (prefersReducedMotion()) return;

    const lastPositions = new Map();
    container.querySelectorAll(".event-btn[data-key]").forEach(el => {
      lastPositions.set(el.dataset.key, el.getBoundingClientRect());
    });

    container.querySelectorAll(".event-btn[data-key]").forEach(el => {
      const key = el.dataset.key;
      const first = firstPositions.get(key);
      const last = lastPositions.get(key);
      if (!first || !last) return;

      const dx = first.left - last.left;
      const dy = first.top - last.top;
      if (dx === 0 && dy === 0) return;

      el.style.transition = "none";
      el.style.transform = `translate(${dx}px, ${dy}px)`;

      requestAnimationFrame(() => {
        el.style.transition = "";
        el.style.transform = "";
      });
    });
  }

  // State
  let events = [];             // { text, order, value? }
  let attempts = [];           // rows (share only)
  let currentPick = [];        // indices into events
  let mistakes = 0;
  let gameOver = false;

  let attemptedSignatures = []; // "idx-idx-idx-idx-idx-idx"

  let feedbackMap = {};        // { [eventIdx]: "G"|"Y"|"B" }
  let correctPosMap = {};      // { [eventIdx]: number } (compat)
  let placedMap = {};          // { [eventIdx]: number } 1..6 (grey correct-position badges)

  // displayOrder drives in-play ordering
  let displayOrder = [];       // visual order [eventIdx..]

  const btnEls = new Map();    // key=eventIdx string -> button element

  const maxMistakes = 3;

  let gameNumber = 1;
  let puzzleDateKey = activeDateKey;

  // per-day rule sentence
  let puzzleRule = "Put these in order.";

  // UI helpers
  function setMessage(text) {
    const el = $("message");
    if (el) el.textContent = text || "";
  }

  function setSubtitle(text) {
    const el = $("subtitle");
    if (!el) return;
    const t = (text && String(text).trim()) ? String(text).trim() : "Put these in order.";
    el.textContent = t;
  }

  function setBuildLine() {
    const el = $("buildLine");
    if (!el) return;
    el.textContent = `Beta v${VERSION} · last updated ${LAST_UPDATED}`;
  }

  // meta format matches archive: "#1, 5th Jan 2026"
  function setMeta() {
    const el = $("meta");
    if (!el) return;
    el.textContent = `#${gameNumber}, ${formatDateShortWithOrdinal(activeDateObj)}`;
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
        puzzleRule,
        events,
        attempts,
        currentPick,
        mistakes,
        gameOver,
        attemptedSignatures,
        feedbackMap,
        correctPosMap,
        placedMap,
        displayOrder
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

      puzzleDateKey = state.puzzleDateKey || activeDateKey;
      gameNumber = typeof state.gameNumber === "number" ? state.gameNumber : 1;
      puzzleRule = typeof state.puzzleRule === "string" ? state.puzzleRule : "Put these in order.";

      events = state.events;
      attempts = Array.isArray(state.attempts) ? state.attempts : [];
      currentPick = Array.isArray(state.currentPick) ? state.currentPick : [];
      mistakes = typeof state.mistakes === "number" ? state.mistakes : 0;
      gameOver = !!state.gameOver;

      attemptedSignatures = Array.isArray(state.attemptedSignatures) ? state.attemptedSignatures : [];
      feedbackMap = state.feedbackMap && typeof state.feedbackMap === "object" ? state.feedbackMap : {};
      correctPosMap = state.correctPosMap && typeof state.correctPosMap === "object" ? state.correctPosMap : {};
      placedMap = state.placedMap && typeof state.placedMap === "object" ? state.placedMap : {};

      displayOrder = Array.isArray(state.displayOrder) && state.displayOrder.length === 6
        ? state.displayOrder
        : (events.map((_, i) => i));

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

    // Keep the row visible so Share can appear after game over
    if (controlsRow) controlsRow.style.display = "flex";

    // Undo/Clear: only relevant during play
    if (undoBtn) {
      undoBtn.hidden = gameOver;
      undoBtn.disabled = !canEdit || currentPick.length === 0;
    }

    if (clearBtn) {
      clearBtn.hidden = gameOver;
      clearBtn.disabled = !canEdit || currentPick.length === 0;
    }

    // Share: only relevant after completion
    if (shareBtn) {
      shareBtn.hidden = !gameOver;
      shareBtn.disabled = !gameOver;
    }
  }

  function evaluateRow(pick) {
    return pick.map((e, i) => {
      if (e.order === i + 1) return "G";
      const left = pick[i - 1];
      const right = pick[i + 1];
      if ((left && left.order < e.order) || (right && right.order > e.order)) return "Y";
      return "B";
    });
  }

  function buildShareText() {
  const map = { G: "🟩", Y: "🟨", B: "🟦" };
  const gridLines = attempts.map(r => r.map(c => map[c] || "⬜").join("")).join("\n");
  return `orderthese.com\nGame #${gameNumber}\n${gridLines}`;
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
      setMessage("Couldn’t copy automatically.");
    }
  }

  function getOptionalValueText(eventObj) {
    if (!eventObj) return null;
    if (typeof eventObj.value === "string" && eventObj.value.trim()) return eventObj.value.trim();
    if (typeof eventObj.value === "number") return String(eventObj.value);
    return null;
  }

  function ensureButtonsExist() {
    const container = $("event-buttons");
    if (!container) return;

    for (let i = 0; i < events.length; i++) {
      const key = String(i);
      if (btnEls.has(key)) continue;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "event-btn";
      btn.dataset.key = key;

      const leftWrap = document.createElement("div");
      leftWrap.className = "event-left";

      const title = document.createElement("div");
      title.className = "event-title";
      leftWrap.appendChild(title);

      const val = document.createElement("div");
      val.className = "event-value";
      val.style.display = "none";
      leftWrap.appendChild(val);

      const badge = document.createElement("span");
      badge.className = "choice-badge";

      btn.appendChild(leftWrap);
      btn.appendChild(badge);

      btn.addEventListener("click", () => {
        if (gameOver) return;

        const idx = Number(btn.dataset.key);
        if (Number.isNaN(idx)) return;
        if (currentPick.length >= 6) return;
        if (currentPick.includes(idx)) return;

        currentPick.push(idx);

        // On the 6th pick, reorder into the player’s chosen order immediately
        if (currentPick.length === 6) {
          displayOrder = currentPick.slice();
        }

        saveState();
        updateButtonsAndOrder();

        if (currentPick.length === 6) {
          queueMicrotask(submitAttempt);
        }
      });

      btnEls.set(key, btn);
      container.appendChild(btn);
    }
  }

  function computeVisualOrder() {
    if (gameOver) {
      return events
        .map((e, idx) => ({ idx, ord: e.order }))
        .sort((a, b) => a.ord - b.ord)
        .map(x => x.idx);
    }

    const base = (Array.isArray(displayOrder) && displayOrder.length === 6)
      ? displayOrder.slice()
      : events.map((_, i) => i);

    const seen = new Set();
    const cleaned = [];
    base.forEach(i => {
      if (Number.isInteger(i) && i >= 0 && i < 6 && !seen.has(i)) {
        seen.add(i);
        cleaned.push(i);
      }
    });
    for (let i = 0; i < 6; i++) {
      if (!seen.has(i)) cleaned.push(i);
    }
    return cleaned;
  }

  function updateButtonsAndOrder() {
    const container = $("event-buttons");
    if (!container) return;

    ensureButtonsExist();

    const first = recordPositions(container);

    const newOrder = computeVisualOrder();
    displayOrder = newOrder.slice();

    newOrder.forEach(idx => {
      const el = btnEls.get(String(idx));
      if (el) container.appendChild(el);
    });

    newOrder.forEach(idx => {
      const btn = btnEls.get(String(idx));
      if (!btn) return;

      const e = events[idx];

      const leftWrap = btn.querySelector(".event-left");
      const title = leftWrap ? leftWrap.querySelector(".event-title") : null;
      const val = leftWrap ? leftWrap.querySelector(".event-value") : null;
      const badge = btn.querySelector(".choice-badge");

      if (title) title.textContent = e.text;

      if (val) {
        if (gameOver) {
          const v = getOptionalValueText(e);
          if (v) {
            val.textContent = v;
            val.style.display = "block";
          } else {
            val.textContent = "";
            val.style.display = "none";
          }
        } else {
          val.textContent = "";
          val.style.display = "none";
        }
      }

      btn.classList.remove("fb-blue", "fb-yellow", "fb-green", "final-reveal", "selected");

      const pickedPos = currentPick.indexOf(idx);
      if (pickedPos >= 0) btn.classList.add("selected");

      if (gameOver) {
        btn.classList.add("final-reveal");
      } else {
        const fb = feedbackMap[idx];
        if (fb === "G") btn.classList.add("fb-green");
        else if (fb === "Y") btn.classList.add("fb-yellow");
        else btn.classList.add("fb-blue");
      }

      if (badge) {
  if (gameOver) {
    badge.textContent = "";
    badge.classList.remove("badge-correct");
  } else if (pickedPos >= 0) {
    badge.textContent = String(pickedPos + 1);
    badge.classList.remove("badge-correct");
  } else {
    badge.textContent = "";
    badge.classList.remove("badge-correct");
  }
}


      btn.disabled = gameOver || pickedPos >= 0 || currentPick.length >= 6;
    });

    requestAnimationFrame(() => {
      playFlip(container, first);
    });

    saveState();
    updateControls();
  }

  function submitAttempt() {
    if (gameOver) return;
    if (currentPick.length !== 6) return;

    const sig = currentPick.join("-");
    if (attemptedSignatures.includes(sig)) {
      currentPick = [];
      saveState();
      updateButtonsAndOrder();
      setMessage("Order already attempted");
      return;
    }

    attemptedSignatures.push(sig);

    const pickedEvents = currentPick.map(i => events[i]);
    const row = evaluateRow(pickedEvents);

    const newFeedback = {};
    const newCorrect = {};

    
    feedbackMap = newFeedback;
    correctPosMap = newCorrect;

    currentPick.forEach((eventIdx, pos) => {
      if (row[pos] === "G") {
        placedMap[eventIdx] = pos + 1;
      }
    });

    attempts.push(row);
    saveState();

    const solved = row.every(c => c === "G");
    if (solved) {
      gameOver = true;
      saveState();
      setMessage("Nice — you solved today’s Order These.");
      updateButtonsAndOrder();
      return;
    }

    mistakes += 1;
    saveState();

    if (mistakes >= maxMistakes) {
      gameOver = true;
      saveState();
      setMessage("Unlucky — try again tomorrow.");
      updateButtonsAndOrder();
      return;
    }

    currentPick = [];
    saveState();
    updateButtonsAndOrder();
    setMessage(`Not quite. Attempts remaining: ${maxMistakes - mistakes}.`);
  }

  function undo() {
    if (gameOver) return;
    if (currentPick.length === 0) return;

    currentPick.pop();
    saveState();
    updateButtonsAndOrder();
    setMessage("");
  }

  function clearAll() {
    if (gameOver) return;
    currentPick = [];
    saveState();
    updateButtonsAndOrder();
    setMessage("");
  }

  async function loadPuzzleForActiveDate() {
    try {
      setMessage("Loading…");
      setSubtitle("Put these in order.");

      const res = await fetch("puzzles.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`puzzles.json fetch failed (${res.status})`);
      const data = await res.json();

      const keys = Object.keys(data || {}).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
      if (keys.length === 0) throw new Error("No date keys found in puzzles.json");

      const earliestKey = keys[0];
      const earliestDate = new Date(`${earliestKey}T00:00:00`);

      puzzleDateKey = activeDateKey;

      const puzzle = data[puzzleDateKey];
      gameNumber = Math.max(1, daysBetween(earliestDate, activeDateObj) + 1);
      setBuildLine();
      setMeta();

      if (!puzzle || !Array.isArray(puzzle.events) || puzzle.events.length !== 6) {
        puzzleRule = "Put these in order.";
        setSubtitle(puzzleRule);
        setMessage("No puzzle published for this date.");
        updateControls();
        return;
      }

      puzzleRule = puzzle.rule || "Put these in order.";
      setSubtitle(puzzleRule);

      events = shuffle([...puzzle.events]);

      attempts = [];
      currentPick = [];
      mistakes = 0;
      gameOver = false;
      attemptedSignatures = [];
      feedbackMap = {};
      correctPosMap = {};
      placedMap = {};

      displayOrder = events.map((_, i) => i);

      saveState();
      updateButtonsAndOrder();
      setMessage("");
    } catch (err) {
      console.error(err);
      setMessage("Couldn’t load this puzzle. Please refresh and try again.");
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

    document.addEventListener("click", (e) => {
      if (!dropdown || dropdown.hidden) return;
      const withinMenu = dropdown.contains(e.target);
      const withinBtn = menuBtn && menuBtn.contains(e.target);
      if (!withinMenu && !withinBtn) closeMenu();
    });

    const devToggle = $("devToggle");
    if (devToggle) {
      devToggle.checked = DEV_PERSIST;
      devToggle.addEventListener("change", () => {
        const on = devToggle.checked;
        localStorage.setItem("orderthese:dev", on ? "true" : "false");
        if (on) clearSavedGame();
        setMessage(on ? "Developer mode enabled." : "Developer mode disabled.");
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

    if (localStorage.getItem("orderthese:dev") === "true" || DEV_QUERY) {
      clearSavedGame();
    }

    if (loadState()) {
      setMeta();
      setSubtitle(puzzleRule);
      updateButtonsAndOrder();
      setMessage(gameOver ? "Completed." : "");
      return;
    }

    loadPuzzleForActiveDate();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
