const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const bestScoreEl = document.getElementById("bestScore");
const finalScoreEl = document.getElementById("finalScore");

const startOverlay = document.getElementById("startOverlay");
const gameOverOverlay = document.getElementById("gameOverOverlay");
const startButton = document.getElementById("startButton");
const restartButton = document.getElementById("restartButton");

const CANVAS_WIDTH = canvas.width;
const CANVAS_HEIGHT = canvas.height;
const BASE_Y = CANVAS_HEIGHT - 80;
const BLOCK_HEIGHT = 34;
const INITIAL_BLOCK_WIDTH = 180;
const MOVE_SPEED_BASE = 3.4;
const CAMERA_SCROLL_THRESHOLD = 220;

let animationId = null;
let gameRunning = false;
let score = 0;
let bestScore = Number(localStorage.getItem("perfectDropBestScore") || 0);

let cameraOffsetY = 0;
let blocks = [];
let currentBlock = null;
let fallingBlock = null;
let particles = [];

bestScoreEl.textContent = bestScore;

function randomColour() {
  const palette = [
    "#f94144",
    "#f3722c",
    "#f8961e",
    "#f9c74f",
    "#90be6d",
    "#43aa8b",
    "#577590",
    "#7b6cf6",
    "#ff6fae",
    "#56cfe1"
  ];
  return palette[Math.floor(Math.random() * palette.length)];
}

function makeBlock({ x, y, width, height, direction = 1, moving = false }) {
  return {
    x,
    y,
    width,
    height,
    direction,
    moving,
    speed: MOVE_SPEED_BASE + Math.min(score * 0.08, 2.5),
    colour: randomColour(),
    scored: false
  };
}

function resetGame() {
  cancelAnimationFrame(animationId);

  gameRunning = false;
  score = 0;
  cameraOffsetY = 0;
  blocks = [];
  particles = [];
  fallingBlock = null;
  currentBlock = null;

  scoreEl.textContent = "0";
  finalScoreEl.textContent = "0";

  const baseBlock = makeBlock({
    x: (CANVAS_WIDTH - INITIAL_BLOCK_WIDTH) / 2,
    y: BASE_Y,
    width: INITIAL_BLOCK_WIDTH,
    height: BLOCK_HEIGHT,
    moving: false
  });

  blocks.push(baseBlock);
  spawnNextBlock();

  draw();
}

function startGame() {
  resetGame();
  startOverlay.classList.remove("visible");
  gameOverOverlay.classList.remove("visible");
  gameRunning = true;
  loop();
}

function spawnNextBlock() {
  const topBlock = blocks[blocks.length - 1];
  const newY = topBlock.y - BLOCK_HEIGHT;
  const fromLeft = blocks.length % 2 === 0;

  currentBlock = makeBlock({
    x: fromLeft ? -topBlock.width : CANVAS_WIDTH,
    y: newY,
    width: topBlock.width,
    height: BLOCK_HEIGHT,
    direction: fromLeft ? 1 : -1,
    moving: true
  });
}

function dropCurrentBlock() {
  if (!gameRunning || !currentBlock || !currentBlock.moving) {
    return;
  }

  currentBlock.moving = false;

  const topBlock = blocks[blocks.length - 1];
  const leftEdge = Math.max(currentBlock.x, topBlock.x);
  const rightEdge = Math.min(
    currentBlock.x + currentBlock.width,
    topBlock.x + topBlock.width
  );
  const overlap = rightEdge - leftEdge;

  if (overlap <= 0) {
    fallingBlock = {
      ...currentBlock,
      vy: 4,
      rotation: 0,
      rotationSpeed: currentBlock.direction * 0.08
    };
    currentBlock = null;
    endGame();
    return;
  }

  const choppedLeft = currentBlock.x < topBlock.x;
  const choppedSize = currentBlock.width - overlap;

  if (choppedSize > 0) {
    const choppedX = choppedLeft ? currentBlock.x : leftEdge + overlap;

    fallingBlock = {
      x: choppedX,
      y: currentBlock.y,
      width: choppedSize,
      height: currentBlock.height,
      colour: currentBlock.colour,
      vy: 4,
      rotation: 0,
      rotationSpeed: currentBlock.direction * 0.08
    };

    createChopParticles(choppedX, currentBlock.y, choppedSize, currentBlock.height, currentBlock.colour);
  } else {
    fallingBlock = null;
  }

  currentBlock.x = leftEdge;
  currentBlock.width = overlap;
  currentBlock.scored = true;
  blocks.push({ ...currentBlock });

  score += 1;
  scoreEl.textContent = String(score);

  if (score > bestScore) {
    bestScore = score;
    localStorage.setItem("perfectDropBestScore", String(bestScore));
    bestScoreEl.textContent = String(bestScore);
  }

  currentBlock = null;

  updateCamera();
  spawnNextBlock();
}

function updateCamera() {
  const topBlock = blocks[blocks.length - 1];
  const screenY = topBlock.y - cameraOffsetY;

  if (screenY < CAMERA_SCROLL_THRESHOLD) {
    cameraOffsetY = topBlock.y - CAMERA_SCROLL_THRESHOLD;
  }
}

function createChopParticles(x, y, width, height, colour) {
  const count = Math.max(4, Math.min(12, Math.floor(width / 12)));

  for (let i = 0; i < count; i += 1) {
    particles.push({
      x: x + Math.random() * width,
      y: y + Math.random() * height,
      vx: (Math.random() - 0.5) * 2.8,
      vy: Math.random() * -1.5 - 0.5,
      size: Math.random() * 4 + 2,
      alpha: 1,
      colour
    });
  }
}

function endGame() {
  gameRunning = false;
  finalScoreEl.textContent = String(score);
  setTimeout(() => {
    gameOverOverlay.classList.add("visible");
  }, 500);
}

function update() {
  if (currentBlock && currentBlock.moving) {
    currentBlock.x += currentBlock.speed * currentBlock.direction;

    if (currentBlock.direction === 1 && currentBlock.x + currentBlock.width >= CANVAS_WIDTH) {
      currentBlock.x = CANVAS_WIDTH - currentBlock.width;
      currentBlock.direction = -1;
    } else if (currentBlock.direction === -1 && currentBlock.x <= 0) {
      currentBlock.x = 0;
      currentBlock.direction = 1;
    }
  }

  if (fallingBlock) {
    fallingBlock.y += fallingBlock.vy;
    fallingBlock.vy += 0.28;
    fallingBlock.rotation += fallingBlock.rotationSpeed;

    if (fallingBlock.y - cameraOffsetY > CANVAS_HEIGHT + 120) {
      fallingBlock = null;
    }
  }

  particles = particles.filter((p) => p.alpha > 0);

  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.08;
    p.alpha -= 0.02;
  }
}

function drawBackground() {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  gradient.addColorStop(0, "#1f2735");
  gradient.addColorStop(1, "#161a21");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.fillStyle = "rgba(255,255,255,0.04)";
  for (let i = 0; i < 8; i += 1) {
    const y = 80 + i * 80 - (cameraOffsetY * 0.15 % 80);
    ctx.fillRect(0, y, CANVAS_WIDTH, 1);
  }

  ctx.fillStyle = "#0f1218";
  ctx.fillRect(0, BASE_Y + BLOCK_HEIGHT - cameraOffsetY, CANVAS_WIDTH, CANVAS_HEIGHT);
}

function drawBlock(block) {
  const drawY = block.y - cameraOffsetY;

  ctx.fillStyle = block.colour;
  ctx.fillRect(block.x, drawY, block.width, block.height);

  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.fillRect(block.x, drawY, block.width, 5);

  ctx.fillStyle = "rgba(0,0,0,0.14)";
  ctx.fillRect(block.x, drawY + block.height - 4, block.width, 4);
}

function drawFallingBlock() {
  if (!fallingBlock) return;

  const cx = fallingBlock.x + fallingBlock.width / 2;
  const cy = fallingBlock.y - cameraOffsetY + fallingBlock.height / 2;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(fallingBlock.rotation);
  ctx.fillStyle = fallingBlock.colour;
  ctx.fillRect(
    -fallingBlock.width / 2,
    -fallingBlock.height / 2,
    fallingBlock.width,
    fallingBlock.height
  );
  ctx.restore();
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.colour;
    ctx.fillRect(p.x, p.y - cameraOffsetY, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

function drawGuide() {
  if (!currentBlock || !gameRunning) return;

  const target = blocks[blocks.length - 1];
  const drawY = currentBlock.y - cameraOffsetY + currentBlock.height + 10;

  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(target.x, drawY, target.width, 4);
}

function draw() {
  drawBackground();

  for (const block of blocks) {
    drawBlock(block);
  }

  if (currentBlock) {
    drawBlock(currentBlock);
  }

  drawFallingBlock();
  drawParticles();
  drawGuide();
}

function loop() {
  update();
  draw();

  if (gameRunning || fallingBlock || particles.length > 0) {
    animationId = requestAnimationFrame(loop);
  }
}

function handleGameInput(event) {
  event.preventDefault();

  if (!gameRunning) return;
  dropCurrentBlock();
}

startButton.addEventListener("click", startGame);
restartButton.addEventListener("click", startGame);

canvas.addEventListener("click", handleGameInput);
canvas.addEventListener("touchstart", handleGameInput, { passive: false });

window.addEventListener("keydown", (event) => {
  if (event.code === "Space" || event.code === "Enter") {
    event.preventDefault();

    if (startOverlay.classList.contains("visible")) {
      startGame();
      return;
    }

    if (gameOverOverlay.classList.contains("visible")) {
      startGame();
      return;
    }

    handleGameInput(event);
  }
});

resetGame();
