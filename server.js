const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Persistence -------------------------------------------------------------
// Frames are kept in memory (fast, no disk reads on every ESP32 poll) and copied to
// durable storage so they survive restarts/redeploys. Pick ONE:
//   1) Upstash Redis (works on Render's FREE tier):
//        UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
//   2) A persistent disk (paid Render services only): DATA_DIR=/var/data (your disk's mount path)
// With neither, frames live on the local disk, which Render wipes on every restart.
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || '';
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const USE_REDIS = Boolean(REDIS_URL && REDIS_TOKEN);
const DATA_DIR = process.env.DATA_DIR || __dirname;
if (!USE_REDIS) fs.mkdirSync(DATA_DIR, { recursive: true });

// Shared secret required for the drawing page, uploads, and the ESP32's GETs.
// Generate one:  node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
// Drawing page:  /?user=A&key=YOURSECRET      ESP32 sends it as an X-Upload-Key header.
const UPLOAD_KEY = process.env.UPLOAD_KEY || '';
if (!UPLOAD_KEY) {
    console.error('[SYS_HALT] UPLOAD_KEY env var is not set. Refusing to start without one.');
    process.exit(1);
}

const MAX_JPEG_BYTES = 300 * 1024;        // a 320x240 JPEG is ~10-30 KB
const MIN_UPLOAD_INTERVAL_MS = 2000;      // per-sender rate limit
const lastUpload = { A: 0, B: 0 };

app.disable('x-powered-by');
// base64 inflates by ~33%, plus the data-URL prefix and JSON wrapper
app.use(express.json({ limit: '500kb' }));

function keyMatches(provided) {
    const a = crypto.createHash('sha256').update(String(provided || '')).digest();
    const b = crypto.createHash('sha256').update(UPLOAD_KEY).digest();
    return crypto.timingSafeEqual(a, b);
}

function requireKey(req, res, next) {
    const provided = req.get('x-upload-key') || req.query.key || '';
    if (keyMatches(provided)) return next();
    res.status(401).send("ERR_UNAUTHORIZED");
}

app.get('/', requireKey, (req, res) => {
    const activeUser = req.query.user === 'B' ? 'UNIT_B' : 'UNIT_A';
    // Safe to embed in a <script>: JSON-encode and neutralize "<"
    const clientKey = JSON.stringify(String(req.query.key || '')).replace(/</g, '\\u003c');

    res.set('Cache-Control', 'no-store');
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>TERMINAL // OPTICAL ROUTER</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=VT323&display=swap');

        * { box-sizing: border-box; user-select: none; }
        body { 
            background-color: #050705; 
            color: #1aff55; 
            font-family: 'VT323', monospace; 
            margin: 0; 
            padding: 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            text-shadow: 0 0 4px rgba(26, 255, 85, 0.6);
        }

        /* CRT Overlay Effect */
        body::before {
            content: " ";
            display: block;
            position: fixed;
            top: 0; left: 0; bottom: 0; right: 0;
            background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.03), rgba(0, 255, 0, 0.01), rgba(0, 0, 255, 0.03));
            z-index: 10;
            background-size: 100% 3px, 6px 100%;
            pointer-events: none;
        }

        .header-box { text-align: left; width: 320px; margin-bottom: 8px; font-size: 18px; }
        .sys-stat { color: #00aa33; font-size: 14px; margin-bottom: 4px; }
        
        canvas { 
            border: 2px solid #1aff55; 
            background: #000; 
            touch-action: none; 
            cursor: crosshair; 
            box-shadow: 0 0 12px rgba(26, 255, 85, 0.2);
        }

        .control-box { 
            width: 320px; 
            margin-top: 12px; 
            display: flex; 
            justify-content: space-between; 
            gap: 10px; 
        }

        button { 
            flex: 1;
            padding: 10px 0; 
            font-family: 'VT323', monospace;
            font-size: 18px;
            background: #050705;
            color: #1aff55;
            border: 1px solid #1aff55;
            cursor: pointer; 
            transition: all 0.1s ease;
        }

        button:hover { background: #1aff55; color: #050705; }
        button:active { background: #00aa33; color: #050705; }
        button:disabled { opacity: 0.4; cursor: default; }

        .tool-row { width: 320px; margin-top: 10px; display: flex; gap: 6px; }
        .swatch { flex: none; width: 28px; height: 28px; padding: 0; }
        .swatch.active { outline: 2px solid #ffffff; outline-offset: 1px; }
        .size-btn { padding: 4px 0; font-size: 16px; }
        .size-btn.active { background: #1aff55; color: #050705; }

        #log-output {
            width: 320px;
            text-align: left;
            font-size: 14px;
            color: #00aa33;
            margin-top: 10px;
            height: 1.2em;
            overflow: hidden;
        }
    </style>
</head>
<body>
    <div class="header-box">
        <div>[NODE_ID: ${activeUser}]</div>
        <div class="sys-stat">LINK STATUS: ACTIVE // FREQ 2.4GHZ</div>
    </div>
    
    <canvas id="canvas" width="320" height="240"></canvas>
    
    <div class="tool-row" id="palette"></div>
    <div class="tool-row" id="sizes"></div>

    <div class="control-box">
        <button onclick="clearCanvas()">[ PURGE ]</button>
        <button id="send-btn" onclick="sendDrawing()">[ TRANSMIT ]</button>
    </div>

    <div id="log-output">> READY FOR VECTOR INPUT...</div>

    <script>
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        const currentUser = "${activeUser}";
        const uploadKey = ${clientKey};
        const log = document.getElementById('log-output');
        const sendBtn = document.getElementById('send-btn');
        let isDrawing = false;

        // Black canvas background, phosphor green high-contrast drawing lines
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = "#1aff55";
        ctx.lineWidth = 3;
        ctx.lineCap = "square";

        function getCoordinates(e) {
            const rect = canvas.getBoundingClientRect();
            const point = (e.touches && e.touches[0]) ? e.touches[0] : e;
            return {
                x: (point.clientX - rect.left) * (canvas.width / rect.width),
                y: (point.clientY - rect.top) * (canvas.height / rect.height)
            };
        }

        function startDrawing(e) { isDrawing = true; draw(e); }
        function stopDrawing() { isDrawing = false; ctx.beginPath(); }
        
        function draw(e) {
            if (!isDrawing) return;
            e.preventDefault();
            const pos = getCoordinates(e);
            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y);
        }

        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mouseup', stopDrawing);
        canvas.addEventListener('mouseleave', stopDrawing);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('touchstart', startDrawing, {passive: false});
        canvas.addEventListener('touchend', stopDrawing);
        canvas.addEventListener('touchcancel', stopDrawing);
        canvas.addEventListener('touchmove', draw, {passive: false});

        // --- Colour + brush controls (last swatch is black = eraser) ---
        const COLORS = ['#1aff55', '#ffffff', '#ff3131', '#ff9d00', '#ffe600', '#00e5ff', '#3d5afe', '#ff2bd6', '#000000'];
        const SIZES = [['S', 2], ['M', 4], ['L', 8]];

        function pick(rowId, el) {
            document.querySelectorAll('#' + rowId + ' button').forEach(b => b.classList.toggle('active', b === el));
        }

        COLORS.forEach((c, i) => {
            const b = document.createElement('button');
            b.className = 'swatch';
            b.style.background = c;
            b.title = (c === '#000000') ? 'ERASE' : c;
            b.onclick = () => { ctx.strokeStyle = c; pick('palette', b); };
            document.getElementById('palette').appendChild(b);
            if (i === 0) b.onclick();
        });

        SIZES.forEach(([label, px], i) => {
            const b = document.createElement('button');
            b.className = 'size-btn';
            b.innerText = '[ ' + label + ' ]';
            b.onclick = () => { ctx.lineWidth = px; pick('sizes', b); };
            document.getElementById('sizes').appendChild(b);
            if (i === 0) b.onclick();
        });

        function clearCanvas() {
            ctx.fillStyle = "#000000";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            log.innerText = "> BUFFER PURGED.";
        }

        function sendDrawing() {
            log.innerText = "> ENCODING PACKET...";
            sendBtn.disabled = true;
            const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
            
            fetch('/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Upload-Key': uploadKey },
                body: JSON.stringify({ user: currentUser === 'UNIT_B' ? 'B' : 'A', data: dataUrl })
            })
            .then(res => {
                if (res.ok) log.innerText = "> TRANSMISSION SUCCESSFUL.";
                else if (res.status === 401) log.innerText = "> ERR: ACCESS DENIED.";
                else if (res.status === 429) log.innerText = "> ERR: SLOW DOWN.";
                else log.innerText = "> ERR: ROUTE REJECTED.";
            })
            .catch(() => { log.innerText = "> ERR: SIGNAL LOST."; })
            .finally(() => { sendBtn.disabled = false; });
        }
    </script>
</body>
</html>
    `);
});

const frames = { A: null, B: null };   // { buf: Buffer, version: string } - what each apartment's frame shows

async function redis(command) {
    const r = await fetch(REDIS_URL, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + REDIS_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify(command)
    });
    if (!r.ok) throw new Error('Redis HTTP ' + r.status);
    return (await r.json()).result;
}

async function persistFrame(id, frame) {
    if (USE_REDIS) {
        await redis(['SET', 'frame:' + id, JSON.stringify({ v: frame.version, d: frame.buf.toString('base64') })]);
        return;
    }
    // Disk: write to a temp file then rename, so a reader never sees a half-written JPEG
    const finalPath = path.join(DATA_DIR, 'frame_' + id + '.jpg');
    const tmpPath = finalPath + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
    try {
        await fs.promises.writeFile(tmpPath, frame.buf);
        await fs.promises.rename(tmpPath, finalPath);
        // Use the file's own timestamp as the version so it's identical after a restart
        frame.version = String(Math.floor((await fs.promises.stat(finalPath)).mtimeMs));
    } catch (err) {
        fs.promises.unlink(tmpPath).catch(() => {});
        throw err;
    }
}

async function loadFrames() {
    for (const id of ['A', 'B']) {
        try {
            if (USE_REDIS) {
                const raw = await redis(['GET', 'frame:' + id]);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    frames[id] = { buf: Buffer.from(parsed.d, 'base64'), version: String(parsed.v) };
                }
            } else {
                const file = path.join(DATA_DIR, 'frame_' + id + '.jpg');
                const [buf, st] = await Promise.all([fs.promises.readFile(file), fs.promises.stat(file)]);
                frames[id] = { buf, version: String(Math.floor(st.mtimeMs)) };
            }
        } catch (err) {
            if (err.code !== 'ENOENT') console.error('[STORE] could not load frame ' + id + ':', err.message);
        }
    }
}

app.post('/upload', async (req, res) => {
    if (!keyMatches(req.get('x-upload-key'))) return res.status(401).send("ERR_UNAUTHORIZED");

    const sender = req.body && req.body.user;
    const data = req.body && req.body.data;
    if ((sender !== 'A' && sender !== 'B') || typeof data !== 'string') {
        return res.status(400).send("ERR_BAD_PACKET");
    }

    const now = Date.now();
    if (now - lastUpload[sender] < MIN_UPLOAD_INTERVAL_MS) {
        return res.status(429).send("ERR_RATE_LIMIT");
    }

    const match = data.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
    if (!match) return res.status(400).send("ERR_NOT_JPEG");

    const buf = Buffer.from(match[1], 'base64');
    if (buf.length < 4 || buf.length > MAX_JPEG_BYTES) return res.status(413).send("ERR_SIZE");
    // JPEG magic bytes (SOI) at the start, EOI at the end
    if (buf[0] !== 0xFF || buf[1] !== 0xD8 || buf[buf.length - 2] !== 0xFF || buf[buf.length - 1] !== 0xD9) {
        return res.status(400).send("ERR_NOT_JPEG");
    }

    lastUpload[sender] = now;

    // Each user's upload goes to the OTHER unit's frame
    const target = (sender === 'A') ? 'B' : 'A';
    const frame = { buf, version: String(now) };
    try {
        await persistFrame(target, frame);
    } catch (err) {
        // The frame is still delivered from memory, but it won't survive a restart
        console.error('[STORE] persist failed for frame ' + target + ':', err.message);
    }
    frames[target] = frame;   // live: the ESP32 picks it up on its next poll
    res.send("TRANSMITTED");
});

function serveFrame(id) {
    return (req, res) => {
        const f = frames[id];
        if (!f) return res.status(404).send("NO_FRAME");
        res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' }).send(f.buf);
    };
}

app.get('/frame_A.jpg', requireKey, serveFrame('A'));
app.get('/frame_B.jpg', requireKey, serveFrame('B'));

// Tiny "did anything change?" endpoint for the ESP32: the frame's version, or "0" if none yet.
app.get('/status/:id', requireKey, (req, res) => {
    const id = req.params.id;
    if (id !== 'A' && id !== 'B') return res.status(404).send("NO_SUCH_UNIT");
    res.set({ 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }).send(frames[id] ? frames[id].version : '0');
});

// Body-parser errors (oversized or malformed JSON) -> clean 4xx instead of an HTML stack trace
app.use((err, req, res, next) => {
    if (err && err.type === 'entity.too.large') return res.status(413).send("ERR_SIZE");
    if (err && err.type === 'entity.parse.failed') return res.status(400).send("ERR_BAD_PACKET");
    console.error(err);
    res.status(500).send("ERR_INTERNAL");
});

if (!USE_REDIS && process.env.RENDER && !process.env.DATA_DIR) {
    console.warn('[STORE] WARNING: no Redis or persistent disk configured - frames will be lost on every restart/redeploy.');
}

loadFrames().then(() => {
    console.log('[STORE] backend: ' + (USE_REDIS ? 'upstash redis' : 'disk (' + DATA_DIR + ')') +
        ' | frames restored: ' + ['A', 'B'].filter(id => frames[id]).join(',') );
    app.listen(PORT, () => console.log(`[SYS_INIT] TERMINAL ROUTER OPERATIONAL ON PORT ${PORT}`));
});
