(() => {
  // Order These — daily click-to-select
  // v1.12 (Beta) — smaller topbar/logo; hide badge circle on final reveal
  const VERSION = "1.12";

  // Fixed "last updated" (Europe/London)
  const LAST_UPDATED = "04 Jan 2026 19:25";

  const $ = (id) => document.getElementById(id);

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
  const today = startOfDay(new Date());
  const todayKey = isoDateKey(today);
  const storageKey = `orderthese:${todayKey}`;

  let events = [];             // { text, order, value? }
  let attempts = [];           // rows (share only)
  let currentPick = [];        // indices into events
  let mistakes = 0;
  let gameOver = false;

  let attemptedSignatures = []; // "idx-idx-idx-idx-idx-idx"

  let feedbackMap = {};        // { [eventIdx]: "G"|"Y"|"B" }
  let correctPosMap = {};      // { [eventIdx]: number } (kept for compatibility)

  let placedMap = {};          // { [eventIdx]: number } 1..6 (ever-green)
  let displayOrder = [];       // visual order [eventIdx..]

  const btnEls = new Map();    // key=eventIdx string -> button element

  const maxMistakes = 3;

  let gameNumber = 1;
  let puzzleDateKey = todayKey;

  // UI helpers
  function setMessage(text) {
    const el = $("message");
    if (el) el.textContent = text || "";
  }

  function setBuildLine() {
    const el = $("buildLine");
    if (!el) return;
    el.textContent = `Beta v${VERSION} · last updated ${LAST_UPDATED}`;
  }

  function setMeta() {
    const el = $("meta");
    if (!el) return;
    el.textContent = `${formatDateWithOrdinal(today)} · Game ${gameNumber}`;
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
      placedMap = state.placedMap && typeof state.placedMap === "object" ? state.placedMap : {};
      displayOrder = Array.isArray(state.displayOrder) && state.displayOrder.length === 6
        ? state.displayOrder
        : events.map((_, i) => i);

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

    if (controlsRow) controlsRow.style.display = gameOver ? "none" : "flex";

    if (shareBtn) {
      shareBtn.style.display = gameOver ? "inline-flex" : "none";
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

    const fixed = Array(6).fill(null);
    Object.keys(placedMap || {}).forEach(k => {
      const idx = Number(k);
      const pos = Number(placedMap[k]);
      if (!Number.isNaN(idx) && pos >= 1 && pos <= 6) fixed[pos - 1] = idx;
    });

    const fixedSet = new Set(fixed.filter(x => x !== null));
    const remaining = (displayOrder.length === 6 ? displayOrder : events.map((_, i) => i))
      .filter(i => !fixedSet.has(i));

    const next = [];
    let r = 0;
    for (let s = 0; s < 6; s++) {
      if (fixed[s] !== null) next.push(fixed[s]);
      else next.push(remaining[r++]);
    }
    return next;
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
        // Final reveal: hide badge circle entirely via CSS; also clear content.
        if (gameOver) {
          badge.textContent = "";
          badge.classList.remove("badge-correct");
        } else if (pickedPos >= 0) {
          badge.textContent = String(pickedPos + 1);
          badge.classList.remove("badge-correct");
        } else {
          const placed = placedMap[idx];
          if (typeof placed === "number" && placed >= 1 && placed <= 6) {
            badge.textContent = String(placed);
            badge.classList.add("badge-correct");
          } else {
            badge.textContent = "";
            badge.classList.remove("badge-correct");
          }
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

    currentPick.forEach((eventIdx, pos) => {
      const c = row[pos];
      newFeedback[eventIdx] = c;
      if (c === "G") newCorrect[eventIdx] = pos + 1;
    });

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

  async function loadPuzzleForToday() {
    try {
      setMessage("Loading…");

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
      placedMap = {};

      displayOrder = events.map((_, i) => i);

      saveState();
      updateButtonsAndOrder();
      setMessage("");
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
      updateButtonsAndOrder();
      setMessage(gameOver ? "Completed." : "");
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
