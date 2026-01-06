/* Squared — vanilla JS memory game */

(() => {
  const GRID_SIZE = 16;
  const LEVELS_MAX = 16;
  const START_LENGTH = 4;

  const LIGHT_ON_MS = 320;
  const GAP_MS = 140;
  const BETWEEN_STEPS_MS = LIGHT_ON_MS + GAP_MS;

  const playBtn = document.getElementById("playBtn");
  const resetBtn = document.getElementById("resetBtn");
  const gridEl = document.getElementById("grid");
  const msgEl = document.getElementById("message");
  const levelEl = document.getElementById("level");
  const bestEl = document.getElementById("best");
  const soundToggle = document.getElementById("soundToggle");

  const BEST_KEY = "squared_best_level";
  const SOUND_KEY = "squared_sound_on";

  /** @type {HTMLButtonElement[]} */
  let squares = [];

  // Game state
  let phase = "idle"; // idle | showing | input | over
  let fullOrder = []; // permutation of 0..15
  let level = 1;
  let expectedIndex = 0;

  // Audio (optional)
  let audioCtx = null;

  function setMessage(text, tone = "neutral") {
    msgEl.textContent = text;
    msgEl.style.color =
      tone === "ok" ? "rgba(53,208,127,0.95)" :
      tone === "bad" ? "rgba(255,77,77,0.95)" :
      "rgba(255,255,255,0.65)";
  }

  function loadPrefs() {
    const best = Number(localStorage.getItem(BEST_KEY) || "0");
    bestEl.textContent = best > 0 ? String(best) : "—";

    const soundOn = localStorage.getItem(SOUND_KEY) === "1";
    soundToggle.checked = soundOn;
  }

  function saveBestIfNeeded() {
    const best = Number(localStorage.getItem(BEST_KEY) || "0");
    if (level > best) {
      localStorage.setItem(BEST_KEY, String(level));
      bestEl.textContent = String(level);
    }
  }

  function setControls({ playDisabled, resetDisabled }) {
    playBtn.disabled = !!playDisabled;
    resetBtn.disabled = !!resetDisabled;
  }

  function setSquaresDisabled(disabled) {
    for (const sq of squares) {
      sq.classList.toggle("disabled", disabled);
      sq.disabled = disabled; // button element behaviour
    }
  }

  function shuffle(arr) {
    // Fisher–Yates
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function makePalette16() {
    // 16 distinct-ish hues, same vibe each run
    const colours = [];
    for (let i = 0; i < GRID_SIZE; i++) {
      const hue = Math.round((i * (360 / GRID_SIZE)) % 360);
      colours.push(`hsl(${hue} 80% 50%)`);
    }
    return colours;
  }

  function initGrid() {
    gridEl.innerHTML = "";
    squares = [];

    const colours = shuffle(makePalette16());

    for (let i = 0; i < GRID_SIZE; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "square";
      btn.setAttribute("aria-label", `Square ${i + 1}`);
      btn.dataset.idx = String(i);

      // Base colour
      btn.style.background = `
        linear-gradient(180deg, rgba(255,255,255,0.14), rgba(255,255,255,0.06)),
        ${colours[i]}
      `;

      btn.addEventListener("click", () => onSquareClick(i));
      gridEl.appendChild(btn);
      squares.push(btn);
    }

    setSquaresDisabled(true);
  }

  function ensureAudio() {
    if (!audioCtx) {
      // Create on first interaction (mobile-friendly)
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  function playTone(index) {
    if (!soundToggle.checked) return;

    ensureAudio();
    if (!audioCtx) return;

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    // Spread notes across a pleasing range
    const base = 220; // A3-ish
    const freq = base * Math.pow(2, (index % 12) / 12);

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + 0.22);
  }

  function setSoundPref() {
    localStorage.setItem(SOUND_KEY, soundToggle.checked ? "1" : "0");
  }

  function clearMarks() {
    for (const sq of squares) {
      sq.classList.remove("correct", "wrong");
    }
  }

  function flashSquare(i) {
    const sq = squares[i];
    sq.classList.add("lit");
    playTone(i);
    setTimeout(() => sq.classList.remove("lit"), LIGHT_ON_MS);
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function currentSequenceLength() {
    return Math.min(START_LENGTH + (level - 1), LEVELS_MAX);
  }

  async function showSequence() {
    phase = "showing";
    clearMarks();
    setSquaresDisabled(true);
    setControls({ playDisabled: true, resetDisabled: false });

    const len = currentSequenceLength();
    setMessage(`Watch closely… (${len} squares)`);
    await sleep(350);

    for (let step = 0; step < len; step++) {
      const idx = fullOrder[step];
      flashSquare(idx);
      await sleep(BETWEEN_STEPS_MS);
    }

    // Input phase
    expectedIndex = 0;
    phase = "input";
    setSquaresDisabled(false);
    setControls({ playDisabled: true, resetDisabled: false });
    setMessage("Your turn.");
  }

  function startNewGame() {
    // Fresh permutation for the whole run; levels reveal more of it
    fullOrder = shuffle([...Array(GRID_SIZE)].map((_, i) => i));
    level = 1;
    levelEl.textContent = String(level);
    expectedIndex = 0;
    phase = "idle";

    clearMarks();
    setSquaresDisabled(true);
    setControls({ playDisabled: false, resetDisabled: false });
    setMessage("Press Play to begin.");
  }

  async function startRound() {
    levelEl.textContent = String(level);
    await showSequence();
  }

  async function onPlay() {
    // iOS: ensure audio context can start after a user gesture
    if (soundToggle.checked) ensureAudio();
    await startRound();
  }

  async function onSuccessRound() {
    saveBestIfNeeded();

    const len = currentSequenceLength();
    if (len >= LEVELS_MAX) {
      phase = "over";
      setSquaresDisabled(true);
      setControls({ playDisabled: false, resetDisabled: false });
      setMessage("Perfect! You completed all 16. Press Play to go again.", "ok");
      // New run next time
      fullOrder = shuffle([...Array(GRID_SIZE)].map((_, i) => i));
      level = 1;
      levelEl.textContent = String(level);
      return;
    }

    phase = "idle";
    setSquaresDisabled(true);
    setControls({ playDisabled: true, resetDisabled: false });
    setMessage("Nice. Next level…", "ok");

    await sleep(650);

    level += 1;
    levelEl.textContent = String(level);
    await startRound();
  }

  function onFail(expected, got) {
    phase = "over";
    setSquaresDisabled(true);
    setControls({ playDisabled: false, resetDisabled: false });

    squares[got]?.classList.add("wrong");
    squares[expected]?.classList.add("correct");

    const reached = currentSequenceLength();
    setMessage(`Wrong square. You reached level ${level} (${reached} squares). Press Play to try again.`, "bad");

    // Reset run for next Play
    fullOrder = shuffle([...Array(GRID_SIZE)].map((_, i) => i));
    level = 1;
    levelEl.textContent = String(level);
  }

  function onSquareClick(squareIndex) {
    if (phase !== "input") return;

    const expectedSquare = fullOrder[expectedIndex];

    // Tiny feedback on tap
    squares[squareIndex].classList.add("lit");
    playTone(squareIndex);
    setTimeout(() => squares[squareIndex].classList.remove("lit"), 160);

    if (squareIndex !== expectedSquare) {
      onFail(expectedSquare, squareIndex);
      return;
    }

    squares[squareIndex].classList.add("correct");
    expectedIndex += 1;

    if (expectedIndex >= currentSequenceLength()) {
      // Round complete
      setSquaresDisabled(true);
      onSuccessRound();
    }
  }

  // Events
  playBtn.addEventListener("click", onPlay);
  resetBtn.addEventListener("click", startNewGame);
  soundToggle.addEventListener("change", setSoundPref);

  // Boot
  initGrid();
  loadPrefs();
  startNewGame();
})();
