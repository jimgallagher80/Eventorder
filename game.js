let events = [];
let attempts = [];
const maxAttempts = 4;

fetch("puzzles.json")
  .then(r => r.json())
  .then(data => {
    events = shuffle([...data.events]);
    render();
  });

function render() {
  const list = document.getElementById("event-list");
  list.innerHTML = "";

  events.forEach((e, i) => {
    const li = document.createElement("li");

    const text = document.createElement("div");
    text.className = "event-text";
    text.textContent = e.text;

    const controls = document.createElement("div");
    controls.className = "controls";

    const up = document.createElement("button");
    up.className = "ctrl-btn";
    up.type = "button";
    up.textContent = "↑";
    up.disabled = i === 0;
    up.onclick = () => {
      if (i === 0) return;
      swap(i, i - 1);
    };

    const down = document.createElement("button");
    down.className = "ctrl-btn";
    down.type = "button";
    down.textContent = "↓";
    down.disabled = i === events.length - 1;
    down.onclick = () => {
      if (i === events.length - 1) return;
      swap(i, i + 1);
    };

    controls.appendChild(up);
    controls.appendChild(down);

    li.appendChild(text);
    li.appendChild(controls);

    list.appendChild(li);
  });
}

function swap(a, b) {
  const temp = events[a];
  events[a] = events[b];
  events[b] = temp;
  render();
}

document.getElementById("submit").onclick = () => {
  if (attempts.length >= maxAttempts) return;

  const row = events.map((e, i) => {
    // Green: correct absolute position
    if (e.order === i + 1) return "🟩";

    // Amber: correct relative order with a neighbour
    const left = events[i - 1];
    const right = events[i + 1];

    if (
      (left && left.order < e.order) ||
      (right && right.order > e.order)
    ) {
      return "🟨";
    }

    return "🟦";
  });

  attempts.push(row);

  document.getElementById("grid").textContent =
    "Event Order\n" +
    attempts.map(r => r.join(" ")).join("\n");
};

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
