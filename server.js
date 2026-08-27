const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '15mb' }));

// TWO-WAY FRONTEND DRAWING CANVAS
app.get('/', (req, res) => {
    // URL Query check: dictates who is drawing (defaults to User A if left blank)
    const activeUser = req.query.user === 'B' ? 'B' : 'A';
    const targetRecipient = activeUser === 'A' ? 'Person B\'s Home across the river' : 'Person A\'s Home across the river';

    res.send(`
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>Hudson River Canvas - User ${activeUser}</title>
    <style>
        body { text-align: center; font-family: -apple-system, sans-serif; background: #141414; color: #fff; margin: 0; padding: 10px; }
        h2 { margin: 5px 0 2px 0; font-weight: 400; font-size: 22px; color: #e0e0e0; }
        .sub-header { color: #888; font-size: 13px; margin-bottom: 12px; }
        canvas { border: 3px solid #333; background: #ffffff; touch-action: none; cursor: crosshair; box-shadow: 0px 10px 30px rgba(0,0,0,0.6); border-radius: 6px; max-width: 95vw; }
        .control-box { margin-top: 15px; display: flex; justify-content: center; gap: 15px; }
        button { padding: 15px 30px; font-size: 16px; border-radius: 8px; border: none; font-weight: bold; cursor: pointer; transition: transform 0.1s; }
        button:active { transform: scale(0.95); }
        .clear-btn { background: #e74c3c; color: white; }
        .send-btn { background: #2ecc71; color: white; }
    </style>
</head>
<body>
    <h2>You are Artist ${activeUser}</h2>
    <div class="sub-header">Sending drawings directly to ${targetRecipient}</div>
    
    <canvas id="canvas" width="480" height="320"></canvas>
    
    <div class="control-box">
        <button class="clear-btn" onclick="clearCanvas()">Clear</button>
        <button class="send-btn" onclick="sendDrawing()">Send to Frame</button>
    </div>

    <script>
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        const currentUser = "${activeUser}";
        let isDrawing = false;

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

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
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        function sendDrawing() {
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            fetch('/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user: currentUser, data: dataUrl })
            })
            .then(res => { if(res.ok) alert("✨ Sent across the Hudson!"); })
            .catch(err => alert("Error transmitting sketch: " + err));
        }
    </script>
</body>
</html>
    `);
});

// TWO-WAY INBOUND PROCESSING API
app.post('/upload', (req, res) => {
    const sender = req.body.user; // Who drew the photo? ('A' or 'B')
    if (!req.body.data || !sender) return res.status(400).send("Invalid packet payload.");
    
    // Cross-routing logic: If A drew it, save it as B's display target file
    const targetFilename = (sender === 'A') ? "frame_B.jpg" : "frame_A.jpg";
    const base64Image = req.body.data.replace(/^data:image\/jpeg;base64,/, "");
    
    fs.writeFile(path.join(__dirname, targetFilename), base64Image, 'base64', (err) => {
        if (err) return res.status(500).send(err);
        console.log(`[SERVER] Saved sketch data targeted for display file: ${targetFilename}`);
        res.send("Successfully Transmitted.");
    });
});

// FRAMES DOWNLOAD DATA THROUGH THESE ROUTED PATHS
app.get('/frame_A.jpg', (req, res) => { res.sendFile(path.join(__dirname, 'frame_A.jpg')); });
app.get('/frame_B.jpg', (req, res) => { res.sendFile(path.join(__dirname, 'frame_B.jpg')); });

app.listen(PORT, () => console.log(`[SERVER] Cross-River System routing active on Port ${PORT}`));
