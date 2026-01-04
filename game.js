let events = [];
let attempts = [];
const maxMistakes = 3;

let currentPick = [];   // array of event objects in chosen order
let mistakes = 0;
let gameOver = false;

fetch("puzzles.json")
  .then(r => r.json())
  .then(data => {
    events = shuffle([...data.events]);
    renderAll();
    setMessage("Tap 6 events in order, then submit.");
  });

function renderAll() {
  renderPickList();
  renderEventButtons();
  renderGrid();
}

function renderPickList() {
  const ol = document.getElementById("pick-list");
  ol.innerHTML = "";

  for (let i = 0; i < 6; i++) {
    const li = document.createElement("li");
    li.textContent = currentPick[i]?.text ?? "—";
    ol.appendChild(li);
  }
}

function renderEventButtons() {
  const container = document.getElementById("event-buttons");
  container.innerHTML = "";

  events.forEach((e) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "event-btn";
    btn.textContent = e.text;

    const alreadyPicked = currentPick.includes(e);
    btn.disabled = gameOver || alreadyPicked;

    btn.onclick = () => {
      if (gameOver) return;
      if (currentPick.length >= 6) return;

      currentPick.push(e);
      renderAll();

      // Optional: auto-submit when 6 picked
      // if (currentPick.length === 6) submitAttempt();
    };

    container.appendChild(btn);
  });
}

document.getElementById("clear").onclick = () => {
  if (gameOver) return;
  currentPick = [];
  setMessage("Cleared. Tap 6 events in order, then submit.");
  renderAll();
};

document.getElementById("submit").onclick = () => {
  submitAttempt();
};

function submitAttempt() {
  if (gameOver) return;

  if (currentPick.length !== 6) {
    setMessage("Pick all 6 events before submitting.");
    return;
  }

  const row = evaluateRow(currentPick);
  attempts.push(row);
  renderGrid();

  const solved = row.every(cell => cell === "🟩");

  if (solved) {
    gameOver = true;
    setMessage("Congratulations — you solved today’s Event Order.");
    renderAll();
    return;
  }

  mistakes += 1;

  if (mistakes >= maxMistakes) {
    gameOver = true;
    setMessage("Try again tomorrow.");
    renderAll();
    return;
  }

  // Next attempt: clear picks
  currentPick = [];
  setMessage(`Not quite. Attempts remaining: ${maxMistakes - mistakes}.`);
  renderAll();
}

function evaluateRow(pick) {
  // Green: correct absolute position
  // Amber: correctly ordered relative to at least one neighbour
  return pick.map((e, i) => {
    if (e.order === i + 1) return "🟩";

    const left = pick[i - 1];
    const right = pick[i + 1];

    // Amber if correct relative order with left or right neighbour
    if ((left && left.order < e.order) || (right && right.order > e.order)) {
      return "🟧";
    }
    return "⬜";
  });
}

function renderGrid() {
  const grid = document.getElementById("grid");
  if (attempts.length === 0) {
    grid.textContent = "";
    return;
  }
  grid.textContent =
    "Event Order\n" +
    attempts.map(r => r.join(" ")).join("\n");
}

function setMessage(text) {
  document.getElementById("message").textContent = text;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
