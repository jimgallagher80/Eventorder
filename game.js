let events = [];
let attempts = [];
const maxMistakes = 3;

let currentPick = []; // stores event indices in the order tapped (0..5)
let mistakes = 0;
let gameOver = false;

const elButtons = () => document.getElementById("event-buttons");
const elMsg = () => document.getElementById("message");
const elGrid = () => document.getElementById("grid");

const btnUndo = () => document.getElementById("undo");
const btnClear = () => document.getElementById("clear");
const btnCopy = () => document.getElementById("copy");

fetch("puzzles.json")
  .then(r => r.json())
  .then(data => {
    events = shuffle([...data.events]);
    renderAll();
    setMessage("Tap 6 events in order.");
  });

function renderAll() {
  renderEventButtons();
  renderGrid();
  updateControls();
}

function renderEventButtons() {
  const container = elButtons();
  container.innerHTML = "";

  events.forEach((e, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "event-btn";

    const pickedPos = currentPick.indexOf(idx); // -1 if not picked
    if (pickedPos >= 0) btn.classList.add("selected");

    const left = document.createElement("span");
    left.textContent = e.text;

    const badge = document.createElement("span");
    badge.className = "choice-badge";
    badge.textContent = pickedPos >= 0 ? String(pickedPos + 1) : "";

    btn.appendChild(left);
    btn.appendChild(badge);

    // Allow selection only if game not over and not already picked and fewer than 6 picks
    btn.disabled = gameOver || pickedPos >= 0 || currentPick.length >= 6;

    btn.onclick = () => {
      if (gameOver) return;
      if (currentPick.length >= 6) return;
      if (currentPick.includes(idx)) return;

      currentPick.push(idx);
      renderEventButtons();
      updateControls();

      if (currentPick.length === 6) {
        submitAttempt(); // auto-submit on 6th tap
      }
    };

    container.appendChild(btn);
  });
}

btnUndo().onclick = () => {
  if (gameOver) return;
  if (currentPick.length === 0) return;
  currentPick.pop();
  renderEventButtons();
  updateControls();
  setMessage("Undone.");
};

btnClear().onclick = () => {
  if (gameOver) return;
  currentPick = [];
  renderEventButtons();
  updateControls();
  setMessage("Cleared. Tap 6 events in order.");
};

btnCopy().onclick = async () => {
  const text = buildShareText();
  try {
    await navigator.clipboard.writeText(text);
    setMessage("Copied results to clipboard.");
  } catch {
    setMessage("Couldn’t copy automatically. Select and copy the grid below.");
  }
};

function submitAttempt() {
  if (gameOver) return;
  if (currentPick.length !== 6) return;

  const pickedEvents = currentPick.map(i => events[i]);
  const row = evaluateRow(pickedEvents);

  attempts.push(row);
  renderGrid();
  btnCopy().disabled = false;

  const solved = row.every(c => c === "🟩");

  if (solved) {
    gameOver = true;
    setMessage("Congratulations — you solved today’s Event Order.");
    updateControls();
    renderEventButtons(); // disables all
    return;
  }

  mistakes += 1;

  if (mistakes >= maxMistakes) {
    gameOver = true;
    setMessage("Try again tomorrow.");
    updateControls();
    renderEventButtons(); // disables all
    return;
  }

  // Reset picks for next attempt
  currentPick = [];
  renderEventButtons();
  updateControls();
  setMessage(`Not quite. Attempts remaining: ${maxMistakes - mistakes}.`);
}

function evaluateRow(pick) {
  return pick.map((e, i) => {
    if (e.order === i + 1) return "🟩";

    const left = pick[i - 1];
    const right = pick[i + 1];

    if ((left && left.order < e.order) || (right && right.order > e.order)) {
      return "🟨";
    }
    return "🟦";
  });
}

function renderGrid() {
  if (attempts.length === 0) {
    elGrid().textContent = "";
    return;
  }
  elGrid().textContent = buildShareText();
}

function buildShareText() {
  return "Event Order\n" + attempts.map(r => r.join(" ")).join("\n");
}

function updateControls() {
  btnUndo().disabled = gameOver || currentPick.length === 0;
  btnClear().disabled = gameOver || currentPick.length === 0;
  btnCopy().disabled = attempts.length === 0;
}

function setMessage(text) {
  elMsg().textContent = text;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
