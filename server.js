const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '15mb' }));

app.get('/', (req, res) => {
    const activeUser = req.query.user === 'B' ? 'UNIT_B' : 'UNIT_A';

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
    
    <div class="control-box">
        <button onclick="clearCanvas()">[ PURGE ]</button>
        <button onclick="sendDrawing()">[ TRANSMIT ]</button>
    </div>

    <div id="log-output">> READY FOR VECTOR INPUT...</div>

    <script>
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        const currentUser = "${activeUser}";
        const log = document.getElementById('log-output');
        let isDrawing = false;

        // Black canvas background, phosphor green high-contrast drawing lines
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = "#1aff55";
        ctx.lineWidth = 3;
        ctx.lineCap = "square";

        function getCoordinates(e) {
            const rect = canvas.getBoundingClientRect();
            const clientX = e.touches ? e.touches.clientX : e.clientX;
            const clientY = e.touches ? e.touches.clientY : e.clientY;
            return {
                x: (clientX - rect.left) * (canvas.width / rect.width),
                y: (clientY - rect.top) * (canvas.height / rect.height)
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
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('touchstart', startDrawing, {passive: false});
        canvas.addEventListener('touchend', stopDrawing);
        canvas.addEventListener('touchmove', draw, {passive: false});

        function clearCanvas() {
            ctx.fillStyle = "#000000";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            log.innerText = "> BUFFER PURGED.";
        }

        function sendDrawing() {
            log.innerText = "> ENCODING PACKET...";
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            
            fetch('/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user: currentUser === 'UNIT_B' ? 'B' : 'A', data: dataUrl })
            })
            .then(res => { 
                if(res.ok) log.innerText = "> TRANSMISSION SUCCESSFUL.";
                else log.innerText = "> ERR: ROUTE REJECTED.";
            })
            .catch(err => { log.innerText = "> ERR: SIGNAL LOST."; });
        }
    </script>
</body>
</html>
    `);
});

app.post('/upload', (req, res) => {
    const sender = req.body.user;
    if (!req.body.data || !sender) return res.status(400).send("ERR_BAD_PACKET");
    
    const targetFilename = (sender === 'A') ? "frame_B.jpg" : "frame_A.jpg";
    const base64Image = req.body.data.replace(/^data:image\/jpeg;base64,/, "");
    
    fs.writeFile(path.join(__dirname, targetFilename), base64Image, 'base64', (err) => {
        if (err) return res.status(500).send("ERR_DISK_WRITE");
        res.send("TRANSMITTED");
    });
});

app.get('/frame_A.jpg', (req, res) => { res.sendFile(path.join(__dirname, 'frame_A.jpg')); });
app.get('/frame_B.jpg', (req, res) => { res.sendFile(path.join(__dirname, 'frame_B.jpg')); });

app.listen(PORT, () => console.log(`[SYS_INIT] TERMINAL ROUTER OPERATIONAL ON PORT ${PORT}`));