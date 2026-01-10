(() => {
  // Order These — daily click-to-select
  // v3.1 — play counter + feedback form + image tiles + adjacency yellow
  const VERSION = "3.1";

  // Fixed "last updated" (Europe/London)
  const LAST_UPDATED = "10 Jan 2026 14:00 GMT";

  // Simple play counter (static-site friendly) using CountAPI (public)
  // Counts a "play" on the first selection per device per date.
  const COUNTAPI_NAMESPACE = "orderthese";
  const COUNTAPI_BASE = "https://api.countapi.xyz";

  function playCountKey(dateStr) {
    return `played_${dateStr}`;
  }

  async function fetchPlayCount(dateStr) {
    try {
      const res = await fetch(`${COUNTAPI_BASE}/get/${COUNTAPI_NAMESPACE}/${playCountKey(dateStr)}`);
      const data = await res.json();
      return typeof data?.value === "number" ? data.value : 0;
    } catch {
      return null; // unknown
    }
  }

  async function incrementPlayCountOnce(dateStr) {
    const flagKey = `ot_playCounted_${dateStr}`;
    if (localStorage.getItem(flagKey) === "1") return;
    try {
      await fetch(`${COUNTAPI_BASE}/hit/${COUNTAPI_NAMESPACE}/${playCountKey(dateStr)}`);
      localStorage.setItem(flagKey, "1");
    } catch {
      // ignore
    }
  }

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

  // --- date helpers (Europe/London) ---
  function londonNowKey() {
    const now = new Date();
    // Approx London date key by using local date components.
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function daysBetween(a, b) {
    const ms = 24 * 60 * 60 * 1000;
    return Math.floor((startOfDay(b) - startOfDay(a)) / ms);
  }

  function ordinal(n) {
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
    const mod10 = n % 10;
    if (mod10 === 1) return `${n}st`;
    if (mod10 === 2) return `${n}nd`;
    if (mod10 === 3) return `${n}rd`;
    return `${n}th`;
  }

  function formatDateShortWithOrdinal(d) {
    const day = ordinal(d.getDate());
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const mon = months[d.getMonth()];
    const yr = d.getFullYear();
    return `${day} ${mon} ${yr}`;
  }

  // --- state ---
  let puzzles = null;
  let earliestDateObj = null;

  let activeDateKey = null;
  let activeDateObj = null;
  let gameNumber = 1;

  let rule = "";
  let events = []; // each: { text, order, value, image? }

  let attempts = [];          // array of rows of "G"|"Y"|"B"
  let currentPick = [];       // [eventIdx..]
  let gameOver = false;
  let win = false;

  let attemptedSignatures = []; // "idx-idx-idx-idx-idx-idx"

  let feedbackMap = {};        // { [eventIdx]: "G"|"Y"|"B" }
  let correctPosMap = {};      // { [eventIdx]: number } (compat)
  let placedMap = {};          // { [eventIdx]: number } 1..6 (grey correct-position badges)

  // displayOrder drives in-play ordering
  let displayOrder = [];       // visual order [eventIdx..]

  const btnEls = new Map();    // key => button element

  // URL date override (testing)
  const url = new URL(location.href);
  const requestedDateKey = url.searchParams.get("date");

  // Initial date selection
  const todayKey = londonNowKey();
  activeDateKey = requestedDateKey || todayKey;
  activeDateObj = new Date(`${activeDateKey}T00:00:00`);

  let storageKey = `orderthese:${activeDateKey}`;

  // FLIP animation helpers
  function recordPositions(container) {
    const first = new Map();
    Array.from(container.children).forEach((el) => {
      first.set(el, el.getBoundingClientRect());
    });
    return first;
  }

  function playFlip(container, first) {
    Array.from(container.children).forEach((el) => {
      const last = el.getBoundingClientRect();
      const f = first.get(el);
      if (!f) return;
      const dx = f.left - last.left;
      const dy = f.top - last.top;
      if (dx || dy) {
        el.animate(
          [
            { transform: `translate(${dx}px, ${dy}px)` },
            { transform: "translate(0,0)" },
          ],
          { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" }
        );
      }
    });
  }

  // --- load puzzles.json ---
  async function loadPuzzles() {
    const res = await fetch("puzzles.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load puzzles.json (${res.status})`);
    puzzles = await res.json();

    // determine earliest date
    const keys = Object.keys(puzzles).sort();
    if (!keys.length) throw new Error("puzzles.json is empty");
    earliestDateObj = new Date(`${keys[0]}T00:00:00`);

    // compute game number
    gameNumber = Math.max(1, daysBetween(earliestDateObj, activeDateObj) + 1);

    // if requested key missing, fall back to today or earliest available
    if (!puzzles[activeDateKey]) {
      const fallbackKey = puzzles[todayKey] ? todayKey : keys[0];
      activeDateKey = fallbackKey;
      activeDateObj = new Date(`${activeDateKey}T00:00:00`);
      storageKey = `orderthese:${activeDateKey}`;
      gameNumber = Math.max(1, daysBetween(earliestDateObj, activeDateObj) + 1);
    }

    // Load puzzle
    const p = puzzles[activeDateKey];
    rule = p.rule || "Put these in order.";
    events = (p.events || []).slice().sort((a, b) => a.order - b.order);

    // Build display order as original randomised order (by input order)
    // Here the puzzle file already gives the six items; we store by index.
    // We keep a stable "eventsByIdx" array for use in picks.
    // events in file are assumed to be in arbitrary order; we rebuild a base list.
    const byIdx = (p.events || []).map((e, i) => ({
      text: e.text,
      order: Number(e.order),
      value: e.value,
      image: e.image
    }));

    // Replace events with byIdx (so "idx" refers to file order)
    events = byIdx;

    // initial visual order: 0..5
    displayOrder = [0, 1, 2, 3, 4, 5];

    loadState();
    setMeta();
    setSubtitle();
    setBuildLine();

    updateButtonsAndOrder();
  }

  function setMeta() {
    const el = $("meta");
    if (!el) return;

    const base = `#${gameNumber}, ${formatDateShortWithOrdinal(activeDateObj)}`;
    el.textContent = base;

    // Fetch play count (best-effort)
    fetchPlayCount(activeDateKey).then((n) => {
      if (typeof n === "number") {
        el.textContent = `${base}. Played by ${n} people.`;
      }
    });
  }

  function setSubtitle() {
    const el = $("subtitle");
    if (!el) return;
    el.innerHTML = `<strong>${escapeHtml(rule)}</strong>`;
  }

  function setBuildLine() {
    const el = $("buildLine");
    if (!el) return;
    el.textContent = `v${VERSION} • last updated ${LAST_UPDATED}`;
  }

  function setMessage(msg) {
    const el = $("message");
    if (!el) return;
    el.textContent = msg || "";
  }

  function escapeHtml(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function signatureFromPick(pickIdxs) {
    return pickIdxs.join("-");
  }

  function evaluateRow(pick) {
    // G: correct final position
    // Y: adjacent to an item it should be next to (regardless of that neighbour’s position)
    // B: otherwise
    return pick.map((e, i) => {
      if (e.order === i + 1) return "G";

      const left = pick[i - 1];
      const right = pick[i + 1];

      const shouldBeNextTo = new Set([e.order - 1, e.order + 1]);
      if ((left && shouldBeNextTo.has(left.order)) || (right && shouldBeNextTo.has(right.order))) return "Y";

      return "B";
    });
  }

  function buildShareText() {
    const map = { G: "🟩", Y: "🟨", B: "🟦" };
    const gridLines = attempts.map(r => r.map(c => map[c] || "⬜").join("")).join("\n");
    return `orderthese.com\nGame #${gameNumber}\n${gridLines}`;
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
      setMessage("Results copied — paste anywhere.");
    } catch {
      setMessage("Couldn’t copy automatically — select and copy from the Share preview.");
      alert(text);
    }
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

        // Count a "play" on the first selection
        if (currentPick.length === 0) {
          incrementPlayCountOnce(activeDateKey);
        }

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

  function normaliseDisplayOrder(orderArr) {
    const cleaned = [];
    const seen = new Set();
    for (const x of orderArr) {
      const n = Number(x);
      if (Number.isNaN(n)) continue;
      if (n < 0 || n > 5) continue;
      if (seen.has(n)) continue;
      cleaned.push(n);
      seen.add(n);
    }
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

    // reorder DOM to match displayOrder
    displayOrder = normaliseDisplayOrder(displayOrder);
    displayOrder.forEach((idx) => {
      const btn = btnEls.get(String(idx));
      if (btn) container.appendChild(btn);
    });

    playFlip(container, first);

    // Update each button text, feedback border, selected state, badge
    const idxToPickPos = new Map();
    currentPick.forEach((idx, pos) => idxToPickPos.set(idx, pos));

    for (let i = 0; i < 6; i++) {
      const idx = i;
      const btn = btnEls.get(String(idx));
      if (!btn) continue;

      const e = events[idx];

      const pickedPos = idxToPickPos.has(idx) ? idxToPickPos.get(idx) : -1;

      btn.classList.toggle("selected", pickedPos >= 0);

      // Reset feedback borders each render
      btn.classList.remove("fb-blue", "fb-yellow", "fb-green");

      const fb = feedbackMap[idx];
      if (fb) {
        if (fb === "G") btn.classList.add("fb-green");
        else if (fb === "Y") btn.classList.add("fb-yellow");
        else btn.classList.add("fb-blue");
      }

      const leftWrap = btn.querySelector(".event-left");
      const title = leftWrap ? leftWrap.querySelector(".event-title") : null;
      const val = leftWrap ? leftWrap.querySelector(".event-value") : null;
      const badge = btn.querySelector(".choice-badge");

      if (title) {
        if (e.image) {
          title.classList.add("is-image");
          title.textContent = "";
          const img = document.createElement("img");
          img.className = "tile-img";
          img.alt = e.text || "";
          img.src = e.image;
          title.appendChild(img);
        } else {
          title.classList.remove("is-image");
          title.textContent = e.text;
        }
      }

      if (val) {
        if (gameOver) {
          val.style.display = "block";
          val.textContent = e.value ? String(e.value) : "";
        } else {
          val.style.display = "none";
          val.textContent = "";
        }
      }

      if (badge) {
        if (gameOver) {
          badge.textContent = "";
          badge.classList.remove("badge-correct");
        } else if (pickedPos >= 0) {
          badge.textContent = String(pickedPos + 1);
          badge.classList.remove("badge-correct");
        } else {
          // Hide "correct position" hint numbers until the player starts a new attempt
          const placed = (currentPick.length > 0) ? placedMap[idx] : undefined;
          if (typeof placed === "number" && placed >= 1 && placed <= 6) {
            badge.textContent = String(placed);
            badge.classList.add("badge-correct");
          } else {
            badge.textContent = "";
            badge.classList.remove("badge-correct");
          }
        }
      }

      btn.disabled = gameOver || pickedPos >= 0 && currentPick.length === 6;
    }

    // Controls
    const undoBtn = $("undo");
    const clearBtn = $("clear");
    const shareBtn = $("share");
    const controlsRow = $("controlsRow");

    if (controlsRow) controlsRow.hidden = false;

    if (undoBtn) undoBtn.disabled = gameOver || currentPick.length === 0;
    if (clearBtn) clearBtn.disabled = gameOver || currentPick.length === 0;

    if (shareBtn) {
      shareBtn.hidden = !gameOver;
      shareBtn.onclick = shareResults;
    }
  }

  function clearPick() {
    currentPick = [];
    displayOrder = normaliseDisplayOrder(displayOrder);
    saveState();
    updateButtonsAndOrder();
  }

  function undoPick() {
    if (!currentPick.length) return;
    currentPick.pop();
    if (currentPick.length < 6) {
      displayOrder = normaliseDisplayOrder(displayOrder);
    }
    saveState();
    updateButtonsAndOrder();
  }

  async function submitAttempt() {
    if (gameOver) return;
    if (currentPick.length !== 6) return;

    const sig = signatureFromPick(currentPick);
    if (attemptedSignatures.includes(sig)) {
      setMessage("Order already attempted");
      // Do not consume a turn
      currentPick = [];
      displayOrder = [0, 1, 2, 3, 4, 5];
      saveState();
      updateButtonsAndOrder();
      return;
    }

    attemptedSignatures.push(sig);

    const pickedEvents = currentPick.map((idx) => events[idx]);
    const row = evaluateRow(pickedEvents);
    attempts.push(row);

    // Feedback map for borders and hint numbers (placedMap)
    feedbackMap = {};
    placedMap = {};
    correctPosMap = {};

    // Map picked index -> position
    currentPick.forEach((idx, pos) => {
      const fb = row[pos];
      feedbackMap[idx] = fb;

      // If correct, set its correct position number (for hinting later)
      if (fb === "G") {
        const correctPos = pos + 1;
        placedMap[idx] = correctPos;
        correctPosMap[idx] = correctPos;
      }
    });

    const greens = row.filter(x => x === "G").length;
    if (greens === 6) {
      win = true;
      endGame(true);
      return;
    }

    if (attempts.length >= 3) {
      win = false;
      endGame(false);
      return;
    }

    // Prepare for next attempt
    currentPick = [];
    displayOrder = [0, 1, 2, 3, 4, 5];

    saveState();
    setMessage(`Attempt ${attempts.length}/3`);
    updateButtonsAndOrder();
  }

  function endGame(didWin) {
    gameOver = true;

    // Reorder into correct final order
    const correctOrderIdxs = events
      .map((e, idx) => ({ idx, order: e.order }))
      .sort((a, b) => a.order - b.order)
      .map(x => x.idx);

    displayOrder = correctOrderIdxs;

    // All tiles green at end, as per spec
    feedbackMap = {};
    for (let i = 0; i < 6; i++) feedbackMap[i] = "G";

    // Hide badges and values show at end
    currentPick = [];

    saveState();

    setMessage(didWin ? "Solved!" : "Out of attempts.");
    updateButtonsAndOrder();
  }

  // --- persistence ---
  function loadState() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const s = JSON.parse(raw);

      attempts = Array.isArray(s.attempts) ? s.attempts : [];
      currentPick = Array.isArray(s.currentPick) ? s.currentPick : [];
      gameOver = !!s.gameOver;
      win = !!s.win;

      attemptedSignatures = Array.isArray(s.attemptedSignatures) ? s.attemptedSignatures : [];

      feedbackMap = s.feedbackMap || {};
      correctPosMap = s.correctPosMap || {};
      placedMap = s.placedMap || {};

      displayOrder = Array.isArray(s.displayOrder) ? s.displayOrder : [0, 1, 2, 3, 4, 5];

      // If game was over, ensure display is correct order and green
      if (gameOver) {
        const correctOrderIdxs = events
          .map((e, idx) => ({ idx, order: e.order }))
          .sort((a, b) => a.order - b.order)
          .map(x => x.idx);
        displayOrder = correctOrderIdxs;
      }
    } catch {
      // ignore
    }
  }

  function saveState() {
    const s = {
      attempts,
      currentPick,
      gameOver,
      win,
      attemptedSignatures,
      feedbackMap,
      correctPosMap,
      placedMap,
      displayOrder
    };
    try {
      localStorage.setItem(storageKey, JSON.stringify(s));
    } catch {
      // ignore
    }
  }

  // --- controls + menu + modal ---
  function wireUI() {
    const undoBtn = $("undo");
    const clearBtn = $("clear");
    const infoBtn = $("infoBtn");
    const menuBtn = $("menuBtn");
    const menuDropdown = $("menuDropdown");

    const infoModal = $("infoModal");
    const closeInfoBtn = $("closeInfoBtn");
    const backdrop = $("modalBackdrop");

    if (undoBtn) undoBtn.addEventListener("click", undoPick);
    if (clearBtn) clearBtn.addEventListener("click", clearPick);

    function closeMenu() {
      if (!menuDropdown) return;
      menuDropdown.hidden = true;
      if (menuBtn) menuBtn.setAttribute("aria-expanded", "false");
    }

    if (menuBtn && menuDropdown) {
      menuBtn.addEventListener("click", () => {
        const open = !menuDropdown.hidden;
        menuDropdown.hidden = open;
        menuBtn.setAttribute("aria-expanded", String(!open));
      });

      document.addEventListener("click", (e) => {
        const t = e.target;
        if (!t) return;
        if (menuDropdown.contains(t) || menuBtn.contains(t)) return;
        closeMenu();
      });
    }

    function openInfo() {
      if (infoModal) infoModal.hidden = false;
      closeMenu();
    }
    function closeInfo() {
      if (infoModal) infoModal.hidden = true;
    }

    if (infoBtn) infoBtn.addEventListener("click", openInfo);
    if (closeInfoBtn) closeInfoBtn.addEventListener("click", closeInfo);
    if (backdrop) backdrop.addEventListener("click", closeInfo);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeInfo();
        closeMenu();
      }
    });
  }

  // --- boot ---
  wireUI();
  loadPuzzles().catch((e) => {
    setMessage(String(e?.message || e));
  });
})();
