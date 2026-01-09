const ladderEl = document.getElementById("ladder");
const inputEl = document.getElementById("wordInput");
const messageEl = document.getElementById("message");
const stepsEl = document.getElementById("steps");
const bestEl = document.getElementById("best");
const dateEl = document.getElementById("date");

const today = new Date().toISOString().slice(0,10);
dateEl.textContent = new Date().toLocaleDateString("en-GB", {
  weekday:"short", day:"2-digit", month:"short", year:"numeric"
});

const puzzles = [
  ["cold","warm"],
  ["lead","gold"],
  ["head","tail"],
  ["spin","shoe"],
  ["book","moon"]
];

const puzzle = puzzles[new Date().getDate() % puzzles.length];
const startWord = puzzle[0];
const endWord = puzzle[1];

let ladder = [startWord];

function render() {
  ladderEl.innerHTML = "";
  ladder.forEach((w,i)=>{
    const div = document.createElement("div");
    div.className = "word";
    if(i===0) div.classList.add("start");
    if(w===endWord) div.classList.add("end");
    div.textContent = w.toUpperCase();
    ladderEl.appendChild(div);
  });
  stepsEl.textContent = ladder.length - 1;
}

function differsByOne(a,b){
  let diff=0;
  for(let i=0;i<a.length;i++) if(a[i]!==b[i]) diff++;
  return diff===1;
}

function show(msg, good=false){
  messageEl.textContent = msg;
  messageEl.style.color = good ? "var(--good)" : "var(--bad)";
}

document.getElementById("addBtn").onclick = () => {
  const word = inputEl.value.toLowerCase();
  inputEl.value = "";

  const last = ladder[ladder.length-1];

  if(word.length!==4) return show("Must be 4 letters");
  if(!WORDS.includes(word)) return show("Not in word list");
  if(!differsByOne(last,word)) return show("Change exactly one letter");
  if(ladder.includes(word)) return show("Already used");

  ladder.push(word);
  render();

  if(word===endWord){
    show("Solved!", true);
    saveBest();
  } else {
    show("");
  }
};

document.getElementById("undoBtn").onclick = () => {
  if(ladder.length>1){
    ladder.pop();
    render();
    show("");
  }
};

document.getElementById("resetBtn").onclick = () => {
  ladder = [startWord];
  render();
  show("");
};

document.getElementById("shareBtn").onclick = async () => {
  const text =
`RungRush ${today}
${ladder.length-1} steps

${ladder.join(" → ").toUpperCase()}

Play: ${location.href}`;

  if(navigator.share){
    navigator.share({text});
  } else {
    await navigator.clipboard.writeText(text);
    show("Copied to clipboard", true);
  }
};

function saveBest(){
  const key = "rungrush-"+today;
  const steps = ladder.length-1;
  const best = localStorage.getItem(key);
  if(!best || steps < best){
    localStorage.setItem(key, steps);
    bestEl.textContent = steps;
  }
}

bestEl.textContent = localStorage.getItem("rungrush-"+today) ?? "—";

render();
