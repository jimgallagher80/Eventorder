(() => {
  // ---------------------------
  // Puzzle bank
  // '.' means empty
  // ---------------------------
  const PUZZLES = [
    // Easy
    {
      difficulty: "easy",
      puzzle:
        "53..7...." +
        "6..195..." +
        ".98....6." +
        "8...6...3" +
        "4..8.3..1" +
        "7...2...6" +
        ".6....28." +
        "...419..5" +
        "....8..79",
    },
    {
      difficulty: "easy",
      puzzle:
        "..9748..." +
        "7........" +
        ".2.1.9..." +
        "..7...24." +
        ".64.1.59." +
        ".98...3.." +
        "...8.3.2." +
        "........6" +
        "...2759..",
    },

    // Medium
    {
      difficulty: "medium",
      puzzle:
        "1..9..7.." +
        "..3..2..8" +
        ".9..6...5" +
        "..5.3...." +
        "8..7.1..2" +
        "....4.6.." +
        "4...8..1." +
        "6..5..2.." +
        "..2..9..7",
    },
    {
      difficulty: "medium",
      puzzle:
        "..2..6.3." +
        "3...8..1." +
        ".6....7.." +
        ".8..2...6" +
        "..7...5.." +
        "5...1..8." +
        "..9....2." +
        ".4..7...9" +
        ".7.5..6..",
    },

    // Hard
    {
      difficulty: "hard",
      puzzle:
        ".....6..1" +
        "..2..9..." +
        ".7..1...." +
        "..9...3.." +
        "4...8...6" +
        "..1...5.." +
        "....2..8." +
        "...7..4.." +
        "8..5.....",
    },
    {
      difficulty: "hard",
      puzzle:
        "..1......" +
        "....7..3." +
        ".9..2...." +
        "..5..1..." +
        "....4...." +
        "...9..6.." +
        "....8..5." +
        ".2..6...." +
        "......7..",
    }
  ];

  // ---------------------------
  // DOM
  // ---------------------------
  const boardEl = document.getElementById("board");
  const msgEl = document.getElementById("message");
  const timeEl = document.getElementById("time");
  const mistakesEl = document.getElementById("mistakes");

  const difficultyEl = document.getElementById("difficulty");
  const newBtn = document.getElementById("newBtn");
  const resetBtn = document.getElementById("resetBtn");
  const notesBtn = document.getElementById("notesBtn");
  const undoBtn = document.getElementById("undoBtn");
  const checkBtn = document.getElementById("checkBtn");
  const eraseBtn = document.getElementById("eraseBtn");

  const padButtons = Array.from(document.querySelectorAll(".pad-btn[data-n]"));

  // ---------------------------
  // State
  // ---------------------------
  const SIZE = 9;

  /** @type {number[]} 0..9 (0 empty) length 81 */
  let grid = new Array(81).fill(0);

  /** @type {boolean[]} length 81 */
  let given = new Array(81).fill(false);

  /** @type {Set<number>[]} notes per cell */
  let notes = new Array(81).fill(null).map(() => new Set());

  /** selected cell index 0..80 */
  let selected = -1;

  /** solution (numbers) length 81 */
  let solution = null;

  /** notes mode */
  let notesMode = false;

  /** undo stack */
  let undoStack = [];

  /** mistakes count */
  let mistakes = 0;

  /** timer */
  let t0 = 0;
  let timerId = null;

  /** for double-tap number on keypad */
  let lastPad = { n: null, t: 0 };

  const STORAGE_KEY = "sudoku_last_difficulty";

  // ---------------------------
  // Helpers
  // ---------------------------
  function setMessage(text, tone = "neutral") {
    msgEl.textContent = text;
    msgEl.style.color =
      tone === "ok" ? "rgba(53,208,127,0.95)" :
      tone === "bad" ? "rgba(255,77,77,0.95)" :
      "rgba(255,255,255,0.65)";
  }

  function idx(r, c) { return r * SIZE + c; }

  function rc(i) { return { r: Math.floor(i / SIZE), c: i % SIZE }; }

  function formatTime(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    const mm = String(m).padStart(2, "0");
    const ss = String(s).padStart(2, "0");
    return `${mm}:${ss}`;
  }

  function startTimer() {
    stopTimer();
    t0 = Date.now();
    timerId = setInterval(() => {
      timeEl.textContent = formatTime(Date.now() - t0);
    }, 250);
  }

  function stopTimer() {
    if (timerId) clearInterval(timerId);
    timerId = null;
  }

  function cloneNotes(sets) {
    return sets.map(s => new Set([...s]));
  }

  function pushUndo(entry) {
    // entry: { grid, notes, mistakes }
    undoStack.push(entry);
    if (undoStack.length > 200) undoStack.shift();
  }

  function currentDifficulty() {
    return difficultyEl.value;
  }

  function getBankByDifficulty(diff) {
    return PUZZLES.filter(p => p.difficulty === diff);
  }

  // Seeded daily choice (stable per calendar day)
  function dailyIndex(max) {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth() + 1;
    const d = now.getUTCDate();
    const seedStr = `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;

    // Simple deterministic hash
    let h = 2166136261;
    for (let i = 0; i < seedStr.length; i++) {
      h ^= seedStr.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h >>>= 0;
    return max === 0 ? 0 : (h % max);
  }

  // ---------------------------
  // Sudoku rules / solver
  // ---------------------------
  function isValidAt(g, pos, val) {
    const { r, c } = rc(pos);

    // row
    for (let cc = 0; cc < SIZE; cc++) {
      const p = idx(r, cc);
      if (p !== pos && g[p] === val) return false;
    }

    // col
    for (let rr = 0; rr < SIZE; rr++) {
      const p = idx(rr, c);
      if (p !== pos && g[p] === val) return false;
    }

    // box
    const br = Math.floor(r / 3) * 3;
    const bc = Math.floor(c / 3) * 3;
    for (let rr = br; rr < br + 3; rr++) {
      for (let cc = bc; cc < bc + 3; cc++) {
        const p = idx(rr, cc);
        if (p !== pos && g[p] === val) return false;
      }
    }

    return true;
  }

  function findEmpty(g) {
    for (let i = 0; i < 81; i++) if (g[i] === 0) return i;
    return -1;
  }

  function candidates(g, pos) {
    const can = [];
    for (let v = 1; v <= 9; v++) if (isValidAt(g, pos, v)) can.push(v);
    return can;
  }

  // Backtracking solver (returns solved grid or null)
  function solve(g) {
    // Choose the empty with fewest candidates (MRV heuristic)
    let bestPos = -1;
    let bestCands = null;

    for (let i = 0; i < 81; i++) {
      if (g[i] !== 0) continue;
      const cands = candidates(g, i);
      if (cands.length === 0) return null;
      if (!bestCands || cands.length < bestCands.length) {
        bestCands = cands;
        bestPos = i;
        if (cands.length === 1) break;
      }
    }

    if (bestPos === -1) return g; // solved

    // Try candidates (shuffled slightly for variety)
    for (let k = 0; k < bestCands.length; k++) {
      const v = bestCands[k];
      const next = g.slice();
      next[bestPos] = v;
      const solved = solve(next);
      if (solved) return solved;
    }
    return null;
  }

  function parsePuzzle(str) {
    const out = new Array(81).fill(0);
    for (let i = 0; i < 81; i++) {
      const ch = str[i];
      if (!ch || ch === "." || ch === "0") out[i] = 0;
      else out[i] = Number(ch);
    }
    return out;
  }

  function gridToString(g) {
    return g.map(v => (v === 0 ? "." : String(v))).join("");
  }

  function isSolved() {
    for (let i = 0; i < 81; i++) {
      if (grid[i] === 0) return false;
      if (!isValidAt(grid, i, grid[i])) return false;
    }
    return true;
  }

  // ---------------------------
  // Rendering
  // ---------------------------
  function buildBoard() {
    boardEl.innerHTML = "";
    for (let i = 0; i < 81; i++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.setAttribute("role", "gridcell");
      cell.dataset.i = String(i);

      const val = document.createElement("div");
      val.className = "val";
      cell.appendChild(val);

      const notesEl = document.createElement("div");
      notesEl.className = "notes";
      // 9 slots, we show 1..9 in their position
      for (let n = 1; n <= 9; n++) {
        const span = document.createElement("div");
        span.className = "note";
        span.dataset.n = String(n);
        notesEl.appendChild(span);
      }
      cell.appendChild(notesEl);

      cell.addEventListener("click", () => selectCell(i));
      boardEl.appendChild(cell);
    }
  }

  function renderCell(i) {
    const cell = boardEl.children[i];
    const valEl = cell.querySelector(".val");
    const notesWrap = cell.querySelector(".notes");

    cell.classList.toggle("given", given[i]);
    cell.classList.toggle("filled", grid[i] !== 0 && !given[i]);

    if (grid[i] !== 0) {
      valEl.textContent = String(grid[i]);
      notesWrap.style.visibility = "hidden";
    } else {
      valEl.textContent = "";
      notesWrap.style.visibility = "visible";
      const set = notes[i];
      for (const noteEl of notesWrap.children) {
        const n = Number(noteEl.dataset.n);
        noteEl.textContent = set.has(n) ? String(n) : "";
      }
    }
  }

  function clearHighlights() {
    for (let i = 0; i < 81; i++) {
      const cell = boardEl.children[i];
      cell.classList.remove("selected", "related", "conflict");
    }
  }

  function applyHighlights() {
    clearHighlights();
    if (selected < 0) return;

    const selCell = boardEl.children[selected];
    selCell.classList.add("selected");

    const { r, c } = rc(selected);
    const br = Math.floor(r / 3) * 3;
    const bc = Math.floor(c / 3) * 3;

    // Related: row, col, box
    for (let cc = 0; cc < 9; cc++) boardEl.children[idx(r, cc)].classList.add("related");
    for (let rr = 0; rr < 9; rr++) boardEl.children[idx(rr, c)].classList.add("related");
    for (let rr = br; rr < br + 3; rr++) {
      for (let cc = bc; cc < bc + 3; cc++) {
        boardEl.children[idx(rr, cc)].classList.add("related");
      }
    }
    selCell.classList.add("selected");

    // Conflicts: if selected has a value, mark conflicts; if empty, show conflicts for duplicates across grid
    markConflicts();
  }

  function markConflicts() {
    // Clear conflict first
    for (let i = 0; i < 81; i++) boardEl.children[i].classList.remove("conflict");

    // Mark any duplicates (simple pass)
    for (let i = 0; i < 81; i++) {
      const v = grid[i];
      if (v === 0) continue;
      if (!isValidAt(grid, i, v)) {
        boardEl.children[i].classList.add("conflict");
      }
    }
  }

  function renderAll() {
    for (let i = 0; i < 81; i++) renderCell(i);
    applyHighlights();
    mistakesEl.textContent = String(mistakes);
  }

  // ---------------------------
  // Interaction
  // ---------------------------
  function selectCell(i) {
    selected = i;
    applyHighlights();
  }

  function setNotesMode(on) {
    notesMode = on;
    notesBtn.setAttribute("aria-pressed", on ? "true" : "false");
    notesBtn.classList.toggle("primary", on);
    setMessage(on ? "Notes mode on." : "Notes mode off.");
  }

  function tryPlaceNumber(n, asNote = null) {
    if (selected < 0) {
      setMessage("Tap a cell first.");
      return;
    }
    if (given[selected]) {
      setMessage("That’s a given cell.");
      return;
    }

    const useNote = asNote !== null ? asNote : notesMode;

    pushUndo({
      grid: grid.slice(),
      notes: cloneNotes(notes),
      mistakes
    });

    if (useNote) {
      if (grid[selected] !== 0) {
        // If there's a number already, switch to clearing it then note
        grid[selected] = 0;
      }
      if (n === 0) {
        notes[selected].clear();
      } else {
        if (notes[selected].has(n)) notes[selected].delete(n);
        else notes[selected].add(n);
      }
      renderCell(selected);
      applyHighlights();
      return;
    }

    // Normal number placement
    if (n === 0) {
      grid[selected] = 0;
      notes[selected].clear();
      renderCell(selected);
      applyHighlights();
      return;
    }

    grid[selected] = n;
    notes[selected].clear();

    // Immediate conflict marking
    renderCell(selected);
    applyHighlights();

    // Mistake tracking only if we have a solution
    if (solution && solution[selected] !== n) {
      mistakes += 1;
      mistakesEl.textContent = String(mistakes);
    }

    // Win check
    if (isSolved()) {
      stopTimer();
      setMessage(`Solved! Time: ${timeEl.textContent}.`, "ok");
      // little celebration pulse
      for (let i = 0; i < 81; i++) {
        boardEl.children[i].classList.add("correctflash");
        setTimeout(() => boardEl.children[i].classList.remove("correctflash"), 400);
      }
    }
  }

  function undo() {
    const last = undoStack.pop();
    if (!last) {
      setMessage("Nothing to undo.");
      return;
    }
    grid = last.grid;
    notes = last.notes;
    mistakes = last.mistakes;
    mistakesEl.textContent = String(mistakes);
    renderAll();
    setMessage("Undone.");
  }

  function resetToGivens() {
    pushUndo({ grid: grid.slice(), notes: cloneNotes(notes), mistakes });

    for (let i = 0; i < 81; i++) {
      if (!given[i]) {
        grid[i] = 0;
        notes[i].clear();
      }
    }
    mistakes = 0;
    mistakesEl.textContent = "0";
    undoStack = [];
    startTimer();
    renderAll();
    setMessage("Reset to the starting grid.");
  }

  function checkGrid() {
    markConflicts();

    const conflicts = Array.from(boardEl.querySelectorAll(".cell.conflict")).length;
    if (conflicts > 0) {
      setMessage(`Found ${conflicts} conflicting cell${conflicts === 1 ? "" : "s"}.`, "bad");
      return;
    }

    // If solved
    if (isSolved()) {
      stopTimer();
      setMessage(`Solved! Time: ${timeEl.textContent}.`, "ok");
      return;
    }

    // Otherwise, if we have a solution, we can give a gentle progress hint
    if (solution) {
      let correct = 0, filled = 0;
      for (let i = 0; i < 81; i++) {
        if (grid[i] !== 0) {
          filled++;
          if (grid[i] === solution[i]) correct++;
        }
      }
      setMessage(`No conflicts. Filled: ${filled}/81. Correct so far: ${correct}/${filled}.`);
    } else {
      setMessage("No conflicts so far. Keep going.");
    }
  }

  // ---------------------------
  // Puzzle loading
  // ---------------------------
  function pickPuzzle() {
    const diff = currentDifficulty();

    if (diff === "daily") {
      // Daily picks from the full bank (any difficulty)
      const i = dailyIndex(PUZZLES.length);
      return PUZZLES[i];
    }

    const bank = getBankByDifficulty(diff);
    const i = Math.floor(Math.random() * bank.length);
    return bank[i] || PUZZLES[0];
  }

  function loadPuzzle(p) {
    const g = parsePuzzle(p.puzzle);

    // Validate givens and solve to get solution
    for (let i = 0; i < 81; i++) {
      if (g[i] !== 0 && !isValidAt(g, i, g[i])) {
        setMessage("Puzzle error: invalid givens.", "bad");
        return;
      }
    }

    const solved = solve(g.slice());
    if (!solved) {
      setMessage("Puzzle error: couldn’t solve this one.", "bad");
      return;
    }

    grid = g.slice();
    solution = solved.slice();

    given = grid.map(v => v !== 0);
    notes = new Array(81).fill(null).map(() => new Set());
    selected = -1;
    undoStack = [];
    mistakes = 0;
    mistakesEl.textContent = "0";

    renderAll();
    startTimer();

    const label = p.difficulty === "daily" ? "Daily" : p.difficulty[0].toUpperCase() + p.difficulty.slice(1);
    const empties = grid.filter(v => v === 0).length;

    if (currentDifficulty() === "daily") {
      setMessage(`Daily puzzle loaded. Empty cells: ${empties}. Good luck.`);
    } else {
      setMessage(`${label} puzzle loaded. Empty cells: ${empties}.`);
    }
  }

  function newPuzzle() {
    const chosen = pickPuzzle();
    loadPuzzle(chosen);
  }

  // ---------------------------
  // Events
  // ---------------------------
  padButtons.forEach(btn => {
    const n = Number(btn.dataset.n);
    btn.addEventListener("click", () => {
      const now = Date.now();
      const isDouble = lastPad.n === n && (now - lastPad.t) < 420;
      lastPad = { n, t: now };
      tryPlaceNumber(n, isDouble ? true : null);
    });
  });

  eraseBtn.addEventListener("click", () => tryPlaceNumber(0));
  notesBtn.addEventListener("click", () => setNotesMode(!notesMode));
  undoBtn.addEventListener("click", undo);
  resetBtn.addEventListener("click", resetToGivens);
  checkBtn.addEventListener("click", checkGrid);

  newBtn.addEventListener("click", () => {
    newPuzzle();
  });

  difficultyEl.addEventListener("change", () => {
    localStorage.setItem(STORAGE_KEY, difficultyEl.value);
    newPuzzle();
  });

  // Keyboard support (nice on desktop)
  window.addEventListener("keydown", (e) => {
    if (e.key >= "1" && e.key <= "9") {
      tryPlaceNumber(Number(e.key));
    } else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
      tryPlaceNumber(0);
    } else if (e.key === "n" || e.key === "N") {
      setNotesMode(!notesMode);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      undo();
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
      if (selected < 0) return;
      const { r, c } = rc(selected);
      let nr = r, nc = c;
      if (e.key === "ArrowUp") nr = Math.max(0, r - 1);
      if (e.key === "ArrowDown") nr = Math.min(8, r + 1);
      if (e.key === "ArrowLeft") nc = Math.max(0, c - 1);
      if (e.key === "ArrowRight") nc = Math.min(8, c + 1);
      selectCell(idx(nr, nc));
      e.preventDefault();
    }
  });

  // ---------------------------
  // Boot
  // ---------------------------
  function boot() {
    buildBoard();

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && ["daily","easy","medium","hard"].includes(saved)) {
      difficultyEl.value = saved;
    }

    setNotesMode(false);
    setMessage("Loading puzzle…");
    newPuzzle();
  }

  boot();
})();
