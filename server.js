const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '15mb' }));

app.get('/', (req, res) => {
    const activeUser = req.query.user === 'B' ? 'B' : 'A';

    res.send(`
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>Enchanted Art Canvas</title>
    <style>
        body { 
            text-align: center; 
            font-family: "Georgia", serif; 
            background-color: #1c1424; 
            color: #f7ebd3; 
            margin: 0; 
            padding: 15px;
        }
        h2 { color: #f3c1dc; font-weight: normal; font-size: 24px; margin: 10px 0; }
        .sub-header { color: #bfa5cc; font-size: 13px; margin-bottom: 15px; font-style: italic; }
        canvas { 
            border: 4px double #dfb76c; 
            background: #ffffff; 
            touch-action: none; 
            cursor: crosshair; 
            border-radius: 6px; 
            max-width: 95vw; 
        }
        .control-box { margin-top: 15px; display: flex; justify-content: center; gap: 15px; }
        button { 
            padding: 10px 24px; 
            font-size: 14px; 
            font-family: "Georgia", serif;
            border-radius: 20px; 
            border: 1px solid rgba(223, 183, 108, 0.4); 
            font-weight: bold; 
            cursor: pointer; 
        }
        .clear-btn { background: #463352; color: #dfb76c; }
        .send-btn { background: #e2849e; color: #fff; }
    </style>
</head>
<body>
    <h2>🌸 Pixie Canvas ${activeUser} 🌸</h2>
    <div class="sub-header">Whisper a drawing through the air...</div>
    
    <canvas id="canvas" width="320" height="240"></canvas>
    
    <div class="control-box">
        <button class="clear-btn" onclick="clearCanvas()">Erase</button>
        <button class="send-btn" onclick="sendDrawing()">Send Magic</button>
    </div>

    <script>
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        const currentUser = "${activeUser}";
        let isDrawing = false;

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = "#463352";
        ctx.lineWidth = 3;
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
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            fetch('/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user: currentUser, data: dataUrl })
            })
            .then(res => { if(res.ok) alert("✨ Sketch transmitted successfully!"); })
            .catch(err => alert("Transmission error: " + err));
        }
    </script>
</body>
</html>
    `);
});

app.post('/upload', (req, res) => {
    const sender = req.body.user;
    if (!req.body.data || !sender) return res.status(400).send("Invalid payload.");
    
    const targetFilename = (sender === 'A') ? "frame_B.jpg" : "frame_A.jpg";
    const base64Image = req.body.data.replace(/^data:image\/jpeg;base64,/, "");
    
    fs.writeFile(path.join(__dirname, targetFilename), base64Image, 'base64', (err) => {
        if (err) return res.status(500).send(err);
        res.send("Successfully Transmitted.");
    });
});

app.get('/frame_A.jpg', (req, res) => { res.sendFile(path.join(__dirname, 'frame_A.jpg')); });
app.get('/frame_B.jpg', (req, res) => { res.sendFile(path.join(__dirname, 'frame_B.jpg')); });

app.listen(PORT, () => console.log(`[SERVER] Active on Port ${PORT}`));