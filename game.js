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
    li.textContent = e.text;
    li.draggable = true;

    li.ondragstart = ev => {
      ev.dataTransfer.setData("from", i);
    };

    li.ondragover = ev => ev.preventDefault();

    li.ondrop = ev => {
      const from = ev.dataTransfer.getData("from");
      const to = i;
      events.splice(to, 0, events.splice(from, 1)[0]);
      render();
    };

    list.appendChild(li);
  });
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
      return "🟧";
    }

    return "⬜";
  });

  attempts.push(row);

  document.getElementById("grid").textContent =
    "Event Order\n" +
    attempts.map(r => r.join(" ")).join("\n");
};

function shuffle(arr) {
  return arr.sort(() => Math.random() - 0.5);
}
