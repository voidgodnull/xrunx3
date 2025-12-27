const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const startMsg = document.getElementById('start-msg');
const gameOverScreen = document.getElementById('game-over');
const deathReasonText = document.getElementById('death-reason');
const waveTimerEl = document.getElementById('wave-timer');
const enemyCountEl = document.getElementById('enemy-count');
const hudTop = document.getElementById('hud-top');

// UI Elements
const survivalTimeEl = document.getElementById('survival-time');
const finalTimeEl = document.getElementById('final-time');
const mobileOverlay = document.getElementById('mobile-overlay');
const fullscreenBtn = document.getElementById('fullscreen-btn');

// --- DYNAMIC GAME CONSTANTS ---
let CELL_SIZE = 60;
let PLAYER_SAFE_RADIUS = 120;

// Speeds (will scale with cell size)
let BUILDER_SPEED = 3.2; 
let HELPER_SPEED = 4.8; 
let BULLET_SPEED = 9.0;
let ARROW_SPEED = 12.0;
let SPHERE_SPEED = 14.0;
let CURSOR_MOVE_SPEED = 9.0;

const SHOOT_COOLDOWN_MAX = 100;
const WAVE_INTERVAL = 5; 

// Visual Constants
const COLORS = {
    bg: '#050508',
    wall: '#2a2a4e',
    builder: '#ff0055',    
    helper: '#00f0ff',     
    bullet: '#ffff00',     
    arrow: '#00ffaa',
    sphere: '#ff00ff',
    player: '#ffffff',
    safe: '#00ff00',
    danger: '#ff0000'
};

// State
let width, height;
let gameActive = false;
let isGameOver = false;
let mouse = { x: 0, y: 0 };
let helpers = []; 
let projectiles = [];
let particles = [];
let survivalTimer = 0;
let spawnSafe = false; // Tracks if current cursor position is valid for start

// Control State
let keyState = { up: false, down: false, left: false, right: false };

// Maze State
let cols, rows;
let grid = [];
let flowFieldTimer = 0;
let uniqueIdCounter = 0;

let waveTimer = WAVE_INTERVAL;
let lastTime = 0;

const builder = {
    id: -1,
    x: 0,
    y: 0,
    angle: 0,
    frame: 0,
    color: COLORS.builder,
    cooldown: 0,
    radius: 12,
    weapon: 'gun'
};

// Initialization
function init() {
    resize();
    generateMaze(); 
    resetGame();
    
    window.addEventListener('resize', () => { 
        resize(); 
        generateMaze(); 
        if(!gameActive && !isGameOver) {
             safeResetPositions();
        }
    });
    
    // Input Listeners - They now call handleInput which checks safety
    window.addEventListener('mousemove', handleInput);
    window.addEventListener('touchmove', handleTouch, { passive: false });
    
    // Also allow tapping/clicking to start if safe
    window.addEventListener('mousedown', (e) => {
        handleInput(e);
        if(spawnSafe) startGame();
    });
    
    // Attach buttons safely
    const resetBtn = document.getElementById('reset-btn');
    if(resetBtn) resetBtn.addEventListener('click', resetGame);
    
    const resetBtnCorner = document.getElementById('reset-btn-corner');
    if(resetBtnCorner) resetBtnCorner.addEventListener('click', resetGame);
    
    if(fullscreenBtn) {
        fullscreenBtn.addEventListener('click', () => {
            enterFullscreen();
        });
    }

    // D-Pad Listeners
    setupDPad();

    requestAnimationFrame(loop);
}

function enterFullscreen() {
    const elem = document.documentElement;
    if (elem.requestFullscreen) {
        elem.requestFullscreen().catch(err => console.log(err));
    } else if (elem.webkitRequestFullscreen) {
        elem.webkitRequestFullscreen();
    } else if (elem.msRequestFullscreen) {
        elem.msRequestFullscreen();
    }

    if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(err => {
            console.log("Orientation lock not supported or failed:", err);
        });
    }

    if(mobileOverlay) mobileOverlay.style.display = 'none';
    
    setTimeout(() => {
        resize();
        generateMaze();
        resetGame();
    }, 300);
}

function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;

    // --- DYNAMIC SCALING LOGIC ---
    if (width < 1000) {
        CELL_SIZE = 30; 
    } else {
        CELL_SIZE = 60; 
    }

    const ratio = CELL_SIZE / 60.0;
    PLAYER_SAFE_RADIUS = CELL_SIZE * 2;
    
    BUILDER_SPEED = 3.2 * ratio;
    HELPER_SPEED = 4.8 * ratio;
    BULLET_SPEED = 9.0 * ratio;
    ARROW_SPEED = 12.0 * ratio;
    SPHERE_SPEED = 14.0 * ratio;
    CURSOR_MOVE_SPEED = 9.0 * ratio;

    builder.radius = 12 * ratio;

    cols = Math.floor(width / CELL_SIZE);
    rows = Math.floor(height / CELL_SIZE);
}

// --- CONTROL LOGIC ---
function setupDPad() {
    const btns = document.querySelectorAll('.d-btn');
    
    const handleBtnStart = (e) => {
        e.preventDefault();
        const dir = e.target.dataset.dir;
        if(dir) keyState[dir] = true;
        e.target.classList.add('active');
        // Check safety before starting
        if(spawnSafe) startGame();
    };

    const handleBtnEnd = (e) => {
        e.preventDefault();
        const dir = e.target.dataset.dir;
        if(dir) keyState[dir] = false;
        e.target.classList.remove('active');
    };

    btns.forEach(btn => {
        btn.addEventListener('mousedown', handleBtnStart);
        btn.addEventListener('touchstart', handleBtnStart);
        btn.addEventListener('mouseup', handleBtnEnd);
        btn.addEventListener('touchend', handleBtnEnd);
        btn.addEventListener('mouseleave', handleBtnEnd);
    });
    
    window.addEventListener('keydown', (e) => {
        if(e.key === 'ArrowUp' || e.key === 'w') keyState.up = true;
        if(e.key === 'ArrowDown' || e.key === 's') keyState.down = true;
        if(e.key === 'ArrowLeft' || e.key === 'a') keyState.left = true;
        if(e.key === 'ArrowRight' || e.key === 'd') keyState.right = true;
        
        if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d'].includes(e.key)) {
            if(spawnSafe) startGame();
        }
    });
    
    window.addEventListener('keyup', (e) => {
        if(e.key === 'ArrowUp' || e.key === 'w') keyState.up = false;
        if(e.key === 'ArrowDown' || e.key === 's') keyState.down = false;
        if(e.key === 'ArrowLeft' || e.key === 'a') keyState.left = false;
        if(e.key === 'ArrowRight' || e.key === 'd') keyState.right = false;
    });
}

function updateCursor() {
    if (keyState.up) mouse.y -= CURSOR_MOVE_SPEED;
    if (keyState.down) mouse.y += CURSOR_MOVE_SPEED;
    if (keyState.left) mouse.x -= CURSOR_MOVE_SPEED;
    if (keyState.right) mouse.x += CURSOR_MOVE_SPEED;

    mouse.x = Math.max(0, Math.min(width, mouse.x));
    mouse.y = Math.max(0, Math.min(height, mouse.y));
}

function handleInput(e) {
    if(isGameOver) return;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    
    // Only auto-start if we are already active OR if the spawn is safe
    if (gameActive) {
        // Game running, normal input
    } else {
        // Game waiting to start: Update spawn safety check
        checkSpawnSafety();
        if (spawnSafe) startGame();
    }
}

function handleTouch(e) {
    if(isGameOver) return;
    if (e.target.classList.contains('d-btn') || e.target.tagName === 'BUTTON') {
        return;
    }
    e.preventDefault(); 
    mouse.x = e.touches[0].clientX;
    mouse.y = e.touches[0].clientY;
    
    if (gameActive) {
        
    } else {
        checkSpawnSafety();
        // On touch move, if we slide into a safe zone, start?
        // Yes, this feels fluid.
        if (spawnSafe) startGame();
    }
}

// --- SAFETY CHECK LOGIC ---
function checkSpawnSafety() {
    // 1. Check distance to Main Builder
    const dBuilder = Math.hypot(mouse.x - builder.x, mouse.y - builder.y);
    const minSafeDist = CELL_SIZE * 5; // Must be 5 cells away

    if (dBuilder < minSafeDist) {
        spawnSafe = false;
        return;
    }

    // 2. Check distance to Helpers
    for (let h of helpers) {
        const dHelper = Math.hypot(mouse.x - h.x, mouse.y - h.y);
        if (dHelper < minSafeDist) {
            spawnSafe = false;
            return;
        }
    }

    spawnSafe = true;
}

// --- MAZE & PATHFINDING ---
function generateMaze() {
    grid = [];
    for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
            grid.push({
                i, j,
                walls: [true, true, true, true],
                visited: false,
                distance: Infinity 
            });
        }
    }

    if(grid.length === 0) return;

    let current = grid[0];
    let stack = [];
    current.visited = true;

    while (true) {
        let next = getUnvisitedNeighbor(current);
        if (next) {
            next.visited = true;
            stack.push(current);
            removeWalls(current, next);
            current = next;
        } else if (stack.length > 0) {
            current = stack.pop();
        } else {
            break;
        }
    }
}

function updateFlowField() {
    for(let c of grid) c.distance = Infinity;

    const pCol = Math.floor(mouse.x / CELL_SIZE);
    const pRow = Math.floor(mouse.y / CELL_SIZE);
    
    if (pCol < 0 || pCol >= cols || pRow < 0 || pRow >= rows) return;

    const startCell = grid[index(pCol, pRow)];
    if(!startCell) return;

    startCell.distance = 0;
    let queue = [startCell];
    
    while(queue.length > 0) {
        let current = queue.shift();
        let neighbors = getConnectedNeighbors(current);
        for(let n of neighbors) {
            if(n.distance === Infinity) {
                n.distance = current.distance + 1;
                queue.push(n);
            }
        }
    }
}

function getConnectedNeighbors(cell) {
    let list = [];
    if (!cell.walls[0]) { let top = grid[index(cell.i, cell.j - 1)]; if(top) list.push(top); }
    if (!cell.walls[1]) { let right = grid[index(cell.i + 1, cell.j)]; if(right) list.push(right); }
    if (!cell.walls[2]) { let bottom = grid[index(cell.i, cell.j + 1)]; if(bottom) list.push(bottom); }
    if (!cell.walls[3]) { let left = grid[index(cell.i - 1, cell.j)]; if(left) list.push(left); }
    return list;
}

function index(i, j) {
    if (i < 0 || j < 0 || i >= cols || j >= rows) return -1;
    return i + j * cols;
}

function getUnvisitedNeighbor(cell) {
    let neighbors = [];
    let top = grid[index(cell.i, cell.j - 1)];
    let right = grid[index(cell.i + 1, cell.j)];
    let bottom = grid[index(cell.i, cell.j + 1)];
    let left = grid[index(cell.i - 1, cell.j)];

    if (top && !top.visited) neighbors.push(top);
    if (right && !right.visited) neighbors.push(right);
    if (bottom && !bottom.visited) neighbors.push(bottom);
    if (left && !left.visited) neighbors.push(left);

    if (neighbors.length > 0) {
        let r = Math.floor(Math.random() * neighbors.length);
        return neighbors[r];
    }
    return undefined;
}

function removeWalls(a, b) {
    let x = a.i - b.i;
    if (x === 1) { a.walls[3] = false; b.walls[1] = false; }
    else if (x === -1) { a.walls[1] = false; b.walls[3] = false; }
    
    let y = a.j - b.j;
    if (y === 1) { a.walls[0] = false; b.walls[2] = false; }
    else if (y === -1) { a.walls[2] = false; b.walls[0] = false; }
}

function hasLineOfSight(x1, y1, x2, y2) {
    const dist = Math.hypot(x2 - x1, y2 - y1);
    return dist < (CELL_SIZE * 3.3); 
}

function safeResetPositions() {
    if(grid.length === 0) return;

    // 1. Initialize Player at CENTER (Visual only, until they move)
    let startCell = grid[Math.floor(grid.length / 2)];
    if(!startCell) startCell = grid[0];
    
    mouse.x = startCell.i * CELL_SIZE + CELL_SIZE/2;
    mouse.y = startCell.j * CELL_SIZE + CELL_SIZE/2;
    
    // 2. Initialize Builder at Top-Left (Farthest from center)
    let enemyCell = grid[0];
    if(startCell === enemyCell && grid.length > 1) {
        enemyCell = grid[grid.length - 1]; 
    }

    builder.x = enemyCell.i * CELL_SIZE + CELL_SIZE/2;
    builder.y = enemyCell.j * CELL_SIZE + CELL_SIZE/2;
    builder.cooldown = 0;
}

function resetGame() {
    helpers = [];
    projectiles = [];
    particles = [];
    isGameOver = false;
    gameActive = false;
    spawnSafe = false;
    waveTimer = WAVE_INTERVAL;
    uniqueIdCounter = 0;
    survivalTimer = 0;
    
    hudTop.style.display = 'none';
    
    safeResetPositions(); 
    spawnHelperRandomly();
    updateFlowField();
    checkSpawnSafety(); // Check initial position

    // Update Message to Instructions
    if(startMsg) {
        startMsg.innerHTML = "<div>CHOOSE DEPLOYMENT ZONE</div><div style='font-size: 0.8em; color: #fff; margin-top: 10px;'>TOUCH SAFE AREA TO START</div>";
        startMsg.style.display = 'block';
        startMsg.style.opacity = '1';
    }

    gameOverScreen.style.display = 'none';
    
    waveTimerEl.innerText = WAVE_INTERVAL.toFixed(1);
    enemyCountEl.innerText = '1';
    if(survivalTimeEl) survivalTimeEl.innerText = '0.0s';
}

function startGame() {
    if (!gameActive && !isGameOver) {
        // Double check safety in case called directly
        checkSpawnSafety();
        
        if (spawnSafe) {
            gameActive = true;
            hudTop.style.display = 'flex';
            startMsg.style.opacity = '0';
            setTimeout(() => startMsg.style.display = 'none', 500);
            lastTime = performance.now();
        } else {
            // Provide feedback if user tries to start in unsafe zone
            if(startMsg) {
                startMsg.innerHTML = "<div style='color: #ff0055'>UNSAFE ZONE!</div><div style='font-size: 0.8em; color: #fff; margin-top: 10px;'>MOVE AWAY FROM ENEMIES</div>";
                startMsg.style.opacity = '1';
            }
        }
    }
}

function triggerGameOver(reason) {
    if(isGameOver) return;
    isGameOver = true;
    gameActive = false;
    deathReasonText.innerText = reason;
    if(finalTimeEl) finalTimeEl.innerText = survivalTimer.toFixed(1) + 's';
    
    gameOverScreen.style.display = 'block';
    hudTop.style.display = 'none';
    
    for(let i=0; i<30; i++) {
        createParticle(mouse.x, mouse.y, COLORS.player, 5);
    }
}

// --- LOGIC ---
function resolveMazeCollision(entity, radius) {
    const col = Math.floor(entity.x / CELL_SIZE);
    const row = Math.floor(entity.y / CELL_SIZE);
    if (col < 0 || col >= cols || row < 0 || row >= rows) return; 

    const cell = grid[index(col, row)];
    if (!cell) return;

    const checkWall = (x1, y1, x2, y2) => {
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const distToPlayer = Math.hypot(mx - mouse.x, my - mouse.y);
        
        // Only dissolve walls if game is ACTIVE
        if (gameActive && distToPlayer < PLAYER_SAFE_RADIUS) return; 

        if (y1 === y2) { // Horizontal
            if (Math.abs(entity.y - y1) < radius) {
                if (entity.y < y1) entity.y = y1 - radius;
                else entity.y = y1 + radius;
            }
        } else if (x1 === x2) { // Vertical
            if (Math.abs(entity.x - x1) < radius) {
                if (entity.x < x1) entity.x = x1 - radius;
                else entity.x = x1 + radius;
            }
        }
    };
    const x = cell.i * CELL_SIZE;
    const y = cell.j * CELL_SIZE;
    if (cell.walls[0]) checkWall(x, y, x + CELL_SIZE, y); 
    if (cell.walls[1]) checkWall(x + CELL_SIZE, y, x + CELL_SIZE, y + CELL_SIZE); 
    if (cell.walls[2]) checkWall(x, y + CELL_SIZE, x + CELL_SIZE, y + CELL_SIZE); 
    if (cell.walls[3]) checkWall(x, y, x, y + CELL_SIZE); 
}

function moveEntitySmart(entity, speed, targetOverride = null) {
    let targetX = mouse.x;
    let targetY = mouse.y;

    if (targetOverride) {
        targetX = targetOverride.x;
        targetY = targetOverride.y;
    } else {
        const col = Math.floor(entity.x / CELL_SIZE);
        const row = Math.floor(entity.y / CELL_SIZE);
        const currentCell = grid[index(col, row)];
        const distToTarget = Math.hypot(entity.x - targetX, entity.y - targetY);

        if (currentCell && distToTarget > PLAYER_SAFE_RADIUS) {
             let best = currentCell;
             let minD = currentCell.distance;
             const neighbors = getConnectedNeighbors(currentCell);
             for (let n of neighbors) {
                if (n.distance < minD) {
                    minD = n.distance;
                    best = n;
                }
             }
             targetX = best.i * CELL_SIZE + CELL_SIZE/2;
             targetY = best.j * CELL_SIZE + CELL_SIZE/2;
        }
    }

    const dx = targetX - entity.x;
    const dy = targetY - entity.y;
    const dist = Math.hypot(dx, dy);
    let angle = Math.atan2(dy, dx);
    
    if (dist > 1) {
        entity.x += Math.cos(angle) * speed;
        entity.y += Math.sin(angle) * speed;
    }
    
    let diff = angle - entity.angle;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    entity.angle += diff * 0.2;
    
    return angle;
}

function update(dt) {
    if (!gameActive) {
        updateCursor();
        checkSpawnSafety(); // Continually check if cursor is in safe spot
        return;
    }
    if (isGameOver) return;
    
    updateCursor();

    flowFieldTimer++;
    if (flowFieldTimer % 15 === 0) {
        updateFlowField();
    }

    if (dt) {
        waveTimer -= dt / 1000;
        if (waveTimer <= 0) {
            waveTimer = WAVE_INTERVAL;
            spawnHelperRandomly();
        }
        waveTimerEl.innerText = Math.max(0, waveTimer).toFixed(1);
        enemyCountEl.innerText = helpers.length + 1; 

        survivalTimer += dt / 1000;
        if(survivalTimeEl) survivalTimeEl.innerText = survivalTimer.toFixed(1) + 's';
    }

    // 1. Builder Logic
    const dToP = Math.hypot(mouse.x - builder.x, mouse.y - builder.y);
    if (dToP < (CELL_SIZE * 0.33)) { triggerGameOver("CAPTURED"); return; }

    if (dToP > 10) {
        moveEntitySmart(builder, BUILDER_SPEED);
        resolveMazeCollision(builder, builder.radius);
        builder.frame += 0.2;
        if(Math.floor(builder.frame) % 8 === 0) createParticle(builder.x, builder.y + 20, '#550022', 0.5);
    }

    if (dToP > (CELL_SIZE * 1.3) && dToP < (CELL_SIZE * 7.5)) {
        if (builder.cooldown <= 0) {
            const aim = Math.atan2(mouse.y - builder.y, mouse.x - builder.x);
            shootProjectile(builder.x, builder.y, aim, 'bullet', -1);
            builder.cooldown = SHOOT_COOLDOWN_MAX;
        }
    }
    if (builder.cooldown > 0) builder.cooldown--;

    // 2. Helpers Logic
    helpers.forEach(h => {
        const hDist = Math.hypot(mouse.x - h.x, mouse.y - h.y);
        if (hDist < (CELL_SIZE * 0.25)) { triggerGameOver("SWARMED"); return; }

        let moveSpeed = h.speed;
        let targetPoint = null;

        if (h.weapon === 'staff') {
            if (!h.hasSphere) {
                const mySphere = projectiles.find(p => p.type === 'sphere' && p.ownerId === h.id);
                if (mySphere) {
                    targetPoint = { x: mySphere.x, y: mySphere.y };
                    const dSphere = Math.hypot(mySphere.x - h.x, mySphere.y - h.y);
                    if (dSphere < 20) {
                        mySphere.life = 0; 
                        h.hasSphere = true;
                        h.cooldown = 30; 
                    }
                } else {
                    h.hasSphere = true;
                }
            } else {
                if (hDist < (CELL_SIZE * 5) && h.cooldown <= 0) {
                    const aim = Math.atan2(mouse.y - h.y, mouse.x - h.x);
                    shootProjectile(h.x, h.y, aim, 'sphere', h.id);
                    h.hasSphere = false;
                    h.cooldown = 20; 
                }
            }
        }
        
        if (h.weapon === 'bow') {
            if (hDist < (CELL_SIZE * 5.8) && h.cooldown <= 0) {
                if (hasLineOfSight(h.x, h.y, mouse.x, mouse.y)) {
                    const aim = Math.atan2(mouse.y - h.y, mouse.x - h.x);
                    shootProjectile(h.x, h.y, aim, 'arrow', h.id);
                    h.cooldown = 120; 
                    moveSpeed = 0; 
                }
            }
            if (h.cooldown > 80) moveSpeed *= 0.2; 
        }

        if (moveSpeed > 0) {
            moveEntitySmart(h, moveSpeed, targetPoint);
            resolveMazeCollision(h, CELL_SIZE * 0.16);
        } else {
            const angle = Math.atan2(mouse.y - h.y, mouse.x - h.x);
            h.angle += (angle - h.angle) * 0.1;
        }

        helpers.forEach(other => {
            if (other !== h) {
                let d = Math.hypot(h.x - other.x, h.y - other.y);
                if (d < (CELL_SIZE * 0.4) && d > 0) {
                    h.x += (h.x - other.x) / d * 0.5;
                    h.y += (h.y - other.y) / d * 0.5;
                }
            }
        });

        if (h.cooldown > 0) h.cooldown--;
        h.frame += 0.4 * (moveSpeed / h.speed);
        if(Math.random() < 0.02) createParticle(h.x, h.y, h.color, 0.2);
    });

    // 3. Projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
        let p = projectiles[i];
        
        if (p.type === 'sphere') {
            p.x += p.vx;
            p.y += p.vy;
            p.vx *= 0.96; 
            p.vy *= 0.96;
        } else {
            p.x += p.vx;
            p.y += p.vy;
            if(Math.random() > 0.5) createParticle(p.x, p.y, p.color, 0.1);
        }

        const pDist = Math.hypot(p.x - mouse.x, p.y - mouse.y);
        const hitRadius = p.type === 'sphere' ? (CELL_SIZE * 0.25) : (CELL_SIZE * 0.16);
        if (pDist < hitRadius) { 
            triggerGameOver(p.type === 'arrow' ? "SKEWERED" : (p.type === 'sphere' ? "OBLITERATED" : "SHOT DOWN"));
            return;
        }
        
        if (p.type !== 'sphere') {
            if (p.x < 0 || p.x > width || p.y < 0 || p.y > height) p.life = 0;
        }
    }
    
    for (let i = projectiles.length - 1; i >= 0; i--) {
        let p = projectiles[i];
        if (p.type !== 'sphere') {
             const offScreen = p.x < -50 || p.x > width+50 || p.y < -50 || p.y > height+50;
             if(offScreen) projectiles.splice(i, 1);
        } else {
            if(p.life <= 0) projectiles.splice(i, 1);
        }
    }

    updateParticles();
}

function spawnHelperRandomly() {
    let attempt = 0;
    let cell;
    do {
        cell = grid[Math.floor(Math.random() * grid.length)];
        attempt++;
        if(!cell) continue; 
        const cx = cell.i * CELL_SIZE + CELL_SIZE/2;
        const cy = cell.j * CELL_SIZE + CELL_SIZE/2;
        const d = Math.hypot(cx - mouse.x, cy - mouse.y);
        if (d > (CELL_SIZE * 6.6) || attempt > 50) {
            spawnHelper(cx, cy);
            break;
        }
    } while (attempt < 100);
}

function spawnHelper(x, y) {
    for(let k=0; k<10; k++) createParticle(x, y, COLORS.helper, 2);
    
    const weapons = ['sword', 'bow', 'staff'];
    const weapon = weapons[Math.floor(Math.random() * weapons.length)];

    uniqueIdCounter++;
    helpers.push({
        id: uniqueIdCounter,
        x: x,
        y: y,
        speed: HELPER_SPEED + (Math.random() * 1.0),
        color: COLORS.helper,
        frame: 0,
        angle: 0,
        weapon: weapon,
        cooldown: 0,
        hasSphere: true 
    });
}

function shootProjectile(x, y, angle, type, ownerId) {
    let speed = BULLET_SPEED;
    let color = COLORS.bullet;
    let vx, vy;

    if (type === 'arrow') {
        speed = ARROW_SPEED;
        color = COLORS.arrow;
    } else if (type === 'sphere') {
        speed = SPHERE_SPEED;
        color = COLORS.sphere;
    }

    const handDist = CELL_SIZE * 0.33; 
    const gunX = x + Math.cos(angle) * handDist;
    const gunY = y + Math.sin(angle) * handDist;
    for(let k=0; k<5; k++) createParticle(gunX, gunY, '#fff', 2);

    projectiles.push({
        type: type,
        ownerId: ownerId,
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: color,
        life: 1
    });
}

// --- PARTICLE SYSTEM ---
function createParticle(x, y, color, speedMulti = 1) {
    if (particles.length > 100) return; 
    particles.push({
        x: x,
        y: y,
        vx: (Math.random() - 0.5) * 4 * speedMulti,
        vy: (Math.random() - 0.5) * 4 * speedMulti,
        life: 1.0,
        decay: 0.05 + Math.random() * 0.05, 
        color: color
    });
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= p.decay;
        if (p.life <= 0) particles.splice(i, 1);
    }
}

function drawParticles(ctx) {
    ctx.globalCompositeOperation = 'lighter'; 
    particles.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2 * p.life, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';
}

// --- DRAWING ---

function draw() {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, width, height);

    const ratio = CELL_SIZE / 60.0;
    const wallWidth = Math.max(1, 2 * ratio);

    // Maze
    ctx.strokeStyle = COLORS.wall;
    ctx.lineWidth = wallWidth;
    ctx.shadowBlur = 5 * ratio;
    ctx.shadowColor = COLORS.wall;
    ctx.beginPath();
    for (let i = 0; i < grid.length; i++) {
        let cell = grid[i];
        let x = cell.i * CELL_SIZE;
        let y = cell.j * CELL_SIZE;
        let cx = x + CELL_SIZE/2;
        let cy = y + CELL_SIZE/2;
        let dist = Math.hypot(cx - mouse.x, cy - mouse.y);
        
        // Only show dissolve effect if game is ACTIVE
        if (gameActive && dist < PLAYER_SAFE_RADIUS) {
            if (dist < PLAYER_SAFE_RADIUS * 0.7) continue;
            ctx.globalAlpha = (dist - PLAYER_SAFE_RADIUS * 0.7) / (PLAYER_SAFE_RADIUS * 0.3);
        }
        if (cell.walls[0]) { ctx.moveTo(x, y); ctx.lineTo(x + CELL_SIZE, y); }
        if (cell.walls[1]) { ctx.moveTo(x + CELL_SIZE, y); ctx.lineTo(x + CELL_SIZE, y + CELL_SIZE); }
        if (cell.walls[2]) { ctx.moveTo(x + CELL_SIZE, y + CELL_SIZE); ctx.lineTo(x, y + CELL_SIZE); }
        if (cell.walls[3]) { ctx.moveTo(x, y + CELL_SIZE); ctx.lineTo(x, y); }
        ctx.globalAlpha = 1.0;
    }
    ctx.stroke();

    drawParticles(ctx);

    // Projectiles
    projectiles.forEach(p => {
        ctx.shadowBlur = 15 * ratio;
        ctx.shadowColor = p.color;
        ctx.fillStyle = p.color;
        ctx.strokeStyle = p.color;
        
        if (p.type === 'sphere') {
            const r = 8 * ratio;
            ctx.beginPath();
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(p.x, p.y, (12 * ratio) + Math.sin(Date.now()/50)*2, 0, Math.PI * 2);
            ctx.stroke();
        } else if (p.type === 'arrow') {
            const angle = Math.atan2(p.vy, p.vx);
            const scale = ratio;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(angle);
            ctx.lineWidth = 2 * scale;
            ctx.beginPath();
            ctx.moveTo(-10*scale, 0); ctx.lineTo(10*scale, 0); 
            ctx.moveTo(5*scale, -3*scale); ctx.lineTo(10*scale, 0);
            ctx.lineTo(5*scale, 3*scale); 
            ctx.moveTo(-10*scale, 0); ctx.lineTo(-15*scale, -3*scale); 
            ctx.moveTo(-10*scale, 0); ctx.lineTo(-15*scale, 3*scale);
            ctx.stroke();
            ctx.restore();
        } else {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4 * ratio, 0, Math.PI * 2);
            ctx.fill();
        }
    });

    helpers.forEach(h => drawStickFigure(h, 0.8));
    drawStickFigure(builder, 1.2);
    
    // Player / Cursor Logic
    if(gameActive) {
        ctx.shadowBlur = 20 * ratio;
        ctx.shadowColor = COLORS.player;
        ctx.fillStyle = COLORS.player;
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 6 * ratio, 0, Math.PI*2);
        ctx.fill();
    } else if (!isGameOver) {
        // --- SPAWN PREVIEW MODE ---
        // Visual indicator of spawn safety
        ctx.shadowBlur = 10 * ratio;
        ctx.shadowColor = spawnSafe ? COLORS.safe : COLORS.danger;
        ctx.strokeStyle = spawnSafe ? COLORS.safe : COLORS.danger;
        ctx.lineWidth = 2;
        
        // Draw Ring
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 20 * ratio, 0, Math.PI*2);
        ctx.stroke();
        
        // Draw Text
        ctx.font = `bold ${12 * ratio}px 'Orbitron'`;
        ctx.fillStyle = spawnSafe ? COLORS.safe : COLORS.danger;
        ctx.textAlign = 'center';
        ctx.fillText(spawnSafe ? "DEPLOY" : "UNSAFE", mouse.x, mouse.y - (30 * ratio));
    }
}

function drawStickFigure(char, scale) {
    const size = (CELL_SIZE / 3.0) * scale;
    const ratio = CELL_SIZE / 60.0;

    const x = char.x;
    const y = char.y;
    
    ctx.shadowBlur = 20 * ratio;
    ctx.shadowColor = char.color;
    ctx.strokeStyle = char.color;
    ctx.lineWidth = Math.max(1, 3 * ratio);
    ctx.beginPath();

    const headBob = Math.sin(char.frame * 2) * (2 * ratio);
    ctx.arc(x, y - size + headBob, size * 0.4, 0, Math.PI * 2);

    ctx.moveTo(x, y - (size * 0.6) + headBob);
    ctx.lineTo(x, y + (size * 0.5));

    const swing = Math.sin(char.frame);
    
    ctx.moveTo(x, y + (size * 0.5));
    ctx.lineTo(x - (size * 0.5), y + size + (-swing * size * 0.5)); 
    ctx.moveTo(x, y + (size * 0.5));
    ctx.lineTo(x + (size * 0.5), y + size + (swing * size * 0.5)); 

    ctx.stroke();

    ctx.beginPath();
    if (char.weapon && !isGameOver && (gameActive || !spawnSafe)) { // Show weapon if active OR if in preview (to show danger)
        const shoulderY = y - (size * 0.2) + headBob;
        ctx.moveTo(x, shoulderY);
        
        const aimAngle = char.angle; 
        
        const handDist = size * 1.0;
        const handX = x + Math.cos(aimAngle) * handDist;
        const handY = shoulderY + Math.sin(aimAngle) * handDist;
        
        ctx.lineTo(handX, handY);
        ctx.stroke();

        ctx.save();
        ctx.translate(handX, handY);
        ctx.rotate(aimAngle);

        if (char.weapon === 'gun') {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 4 * ratio;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(size * 0.7, 0);
            ctx.stroke();
        } else if (char.weapon === 'sword') {
            ctx.shadowColor = '#00f0ff';
            ctx.strokeStyle = '#00f0ff';
            ctx.lineWidth = 3 * ratio;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(size * 1.5, 0);
            ctx.moveTo(size * 0.2, -size * 0.3);
            ctx.lineTo(size * 0.2, size * 0.3);
            ctx.stroke();
        } else if (char.weapon === 'bow') {
            ctx.strokeStyle = '#00f0ff';
            ctx.lineWidth = 2 * ratio;
            ctx.beginPath();
            ctx.arc(0, 0, size * 0.8, -Math.PI/2, Math.PI/2, false);
            ctx.moveTo(0, -size * 0.8);
            ctx.lineTo(0, size * 0.8);
            ctx.stroke();
        } else if (char.weapon === 'staff') {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2 * ratio;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(size * 1.2, 0);
            ctx.stroke();
            if (char.hasSphere) {
                ctx.shadowBlur = 25 * ratio;
                ctx.shadowColor = '#ff00ff';
                ctx.fillStyle = '#ff00ff';
                ctx.beginPath();
                ctx.arc(size * 1.2, 0, size * 0.3, 0, Math.PI*2);
                ctx.fill();
            }
        }
        ctx.restore();

    } else {
        const shoulderY = y - (size * 0.2) + headBob;
        ctx.moveTo(x, shoulderY);
        ctx.lineTo(x - (size * 0.6), shoulderY + (size * 0.5) + (swing * size * 0.6));
        ctx.moveTo(x, shoulderY);
        ctx.lineTo(x + (size * 0.6), shoulderY + (size * 0.5) - (swing * size * 0.6));
        ctx.stroke();
    }
}

function loop(timestamp) {
    const dt = timestamp - lastTime;
    lastTime = timestamp;
    update(dt);
    draw();
    requestAnimationFrame(loop);
}

init();