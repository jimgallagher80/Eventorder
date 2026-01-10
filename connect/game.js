/* Connections-style "groups of four" game (vanilla JS).
   - 16 tiles
   - Select up to 4
   - Submit checks if they match any unsolved group
   - Limited mistakes
   - Shuffle remaining
*/

const DEFAULT_MISTAKES = 4;

// Example puzzle. Swap this object out daily (or load from JSON).
const PUZZLE = {
  id: "demo-001",
  // groups: { title, answers: [4 strings], difficulty(optional) }
  groups: [
    { title: "Planets", answers: ["Mercury", "Venus", "Earth", "Mars"] },
    { title: "Primary colours (additive)", answers: ["Red", "Green", "Blue", "White"] },
    { title: "Dog breeds", answers: ["Beagle", "Pug", "Collie", "Boxer"] },
    { title: "Things you can click", answers: ["Link", "Button", "Tab", "Checkbox"] },
  ]
};

const els = {
  grid: document.getElementById("grid"),
  mistakes: document.getElementById("mistakes"),
  selectedCount: document.getElementById("selectedCount"),
  btnShuffle: document.getElementById("btnShuffle"),
  btnDeselect: document.getElementById("btnDeselect"),
  btnSubmit: document.getElementById("btnSubmit"),
  msg: document.getElementById("message"),
  solvedList: document.getElementById("solvedList"),
  btnNew: document.getElementById("btnNew"),
  btnHow: document.getElementById("btnHow"),
  howDialog: document.getElementById("howDialog"),
  btnCloseHow: document.getElementById("btnCloseHow"),
};

let state;

function normalise(s){ return s.trim().toLowerCase(); }

function buildState(puzzle){
  const allTiles = puzzle.groups.flatMap(g => g.answers);
  // Build fast lookup: tile -> groupIndex
  const tileToGroup = new Map();
  puzzle.groups.forEach((g, i) => g.answers.forEach(a => tileToGroup.set(normalise(a), i)));

  return {
    puzzle,
    mistakesLeft: DEFAULT_MISTAKES,
    tiles: shuffle([...allTiles]).map((label, idx) => ({
      id: `${idx}-${label}`,
      label,
      norm: normalise(label),
      selected: false,
      solved: false, // removed from grid once solved
    })),
    solvedGroups: [], // {title, answers}
    tileToGroup,
    gameOver: false,
  };
}

function setMessage(text, kind=""){
  els.msg.textContent = text || "";
  els.msg.className = "message" + (kind ? ` ${kind}` : "");
}

function updateHeader(){
  els.mistakes.textContent = String(state.mistakesLeft);
  const selected = state.tiles.filter(t => t.selected && !t.solved).length;
  els.selectedCount.textContent = `${selected} / 4`;
  els.btnSubmit.disabled = state.gameOver || selected !== 4;
}

function renderSolved(){
  els.solvedList.innerHTML = "";
  state.solvedGroups.forEach(g => {
    const card = document.createElement("div");
    card.className = "groupCard";
    const title = document.createElement("div");
    title.className = "groupTitle";
    title.textContent = g.title;
    const items = document.createElement("div");
    items.className = "groupItems";
    items.textContent = g.answers.join(" • ");
    card.appendChild(title);
    card.appendChild(items);
    els.solvedList.appendChild(card);
  });
}

function renderGrid(){
  els.grid.innerHTML = "";

  const remaining = state.tiles.filter(t => !t.solved);

  remaining.forEach(tile => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tile" + (tile.selected ? " selected" : "");
    btn.textContent = tile.label;
    btn.setAttribute("role", "listitem");
    btn.setAttribute("aria-pressed", tile.selected ? "true" : "false");
    btn.dataset.id = tile.id;

    btn.addEventListener("click", () => toggleSelect(tile.id));
    btn.addEventListener("keydown", (e) => {
      // Space/Enter toggles
      if (e.key === " " || e.key === "Enter"){
        e.preventDefault();
        toggleSelect(tile.id);
      }
    });

    els.grid.appendChild(btn);
  });
}

function findTile(id){
  return state.tiles.find(t => t.id === id);
}

function toggleSelect(id){
  if (state.gameOver) return;

  const tile = findTile(id);
  if (!tile || tile.solved) return;

  const selectedCount = state.tiles.filter(t => t.selected && !t.solved).length;

  if (!tile.selected && selectedCount >= 4){
    setMessage("You can only select 4 tiles.", "error");
    return;
  }

  tile.selected = !tile.selected;
  setMessage("");
  updateHeader();
  renderGrid();
}

function deselectAll(){
  state.tiles.forEach(t => { if (!t.solved) t.selected = false; });
  setMessage("");
  updateHeader();
  renderGrid();
}

function submitSelection(){
  if (state.gameOver) return;

  const selected = state.tiles.filter(t => t.selected && !t.solved);
  if (selected.length !== 4) return;

  // Check if all 4 belong to the same group
  const groupIndices = selected.map(t => state.tileToGroup.get(t.norm));
  const allSame = groupIndices.every(g => g === groupIndices[0]);

  if (!allSame){
    state.mistakesLeft -= 1;
    setMessage("Not a group. Try again.", "error");
    // Keep selection (some games clear; your choice). Here: keep it to let people adjust.
    if (state.mistakesLeft <= 0){
      endGame(false);
    }
    updateHeader();
    return;
  }

  const groupIndex = groupIndices[0];
  const group = state.puzzle.groups[groupIndex];

  // Prevent solving same group twice (edge case)
  const alreadySolved = state.solvedGroups.some(g => normalise(g.title) === normalise(group.title));
  if (alreadySolved){
    setMessage("That group is already solved.", "error");
    return;
  }

  // Mark tiles solved & clear selection
  selected.forEach(t => { t.solved = true; t.selected = false; });

  state.solvedGroups.push({ title: group.title, answers: [...group.answers] });
  setMessage("Correct!", "ok");

  renderSolved();
  updateHeader();
  renderGrid();

  if (state.solvedGroups.length === 4){
    endGame(true);
  }
}

function endGame(won){
  state.gameOver = true;
  updateHeader();

  if (won){
    setMessage("You solved all four groups. Nice one.", "ok");
  } else {
    setMessage("No mistakes left. Game over.", "error");
    // Optionally reveal remaining groups:
    revealAllGroups();
  }
}

function revealAllGroups(){
  // Add any unsolved groups to the solved panel as a reveal (without awarding a win)
  const solvedTitles = new Set(state.solvedGroups.map(g => normalise(g.title)));
  state.puzzle.groups.forEach(g => {
    if (!solvedTitles.has(normalise(g.title))){
      state.solvedGroups.push({ title: g.title, answers: [...g.answers] });
    }
  });
  // Remove remaining tiles from grid
  state.tiles.forEach(t => { t.solved = true; t.selected = false; });
  renderSolved();
  renderGrid();
}

function shuffleTiles(){
  if (state.gameOver) return;
  const remaining = state.tiles.filter(t => !t.solved);
  const solved = state.tiles.filter(t => t.solved);

  const shuffled = shuffle([...remaining]);
  state.tiles = [...shuffled, ...solved];
  setMessage("");
  renderGrid();
}

function shuffle(arr){
  // Fisher–Yates
  for (let i = arr.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function newGame(){
  state = buildState(PUZZLE);
  setMessage("");
  updateHeader();
  renderSolved();
  renderGrid();
}

function wireUI(){
  els.btnShuffle.addEventListener("click", shuffleTiles);
  els.btnDeselect.addEventListener("click", deselectAll);
  els.btnSubmit.addEventListener("click", submitSelection);
  els.btnNew.addEventListener("click", newGame);

  els.btnHow.addEventListener("click", () => els.howDialog.showModal());
  els.btnCloseHow.addEventListener("click", () => els.howDialog.close());
}

wireUI();
newGame();
