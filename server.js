const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '15mb' }));

// TWO-WAY FRONTEND DRAWING CANVAS (FAIRY BLOSSOM THEME)
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
            background-image: radial-gradient(rgba(223, 183, 108, 0.08) 1px, transparent 0);
            background-size: 24px 24px;
        }
        h2 { 
            margin: 15px 0 5px 0; 
            font-weight: normal; 
            font-size: 26px; 
            letter-spacing: 1px;
            color: #f3c1dc;
            text-shadow: 0px 2px 10px rgba(243, 193, 220, 0.3);
        }
        .sub-header { 
            color: #bfa5cc; 
            font-size: 14px; 
            margin-bottom: 20px;
            font-style: italic;
        }
        canvas { 
            border: 6px double #dfb76c; 
            background: #ffffff; 
            touch-action: none; 
            cursor: crosshair; 
            box-shadow: 0px 15px 35px rgba(0,0,0,0.6), 0px 0px 15px rgba(223, 183, 108, 0.2); 
            border-radius: 8px; 
            max-width: 95vw; 
        }
        .control-box { 
            margin-top: 20px; 
            display: flex; 
            justify-content: center; 
            gap: 20px; 
        }
        button { 
            padding: 14px 32px; 
            font-size: 15px; 
            font-family: "Georgia", serif;
            border-radius: 25px; 
            border: 1px solid rgba(223, 183, 108, 0.4); 
            font-weight: bold; 
            cursor: pointer; 
            box-shadow: 0px 5px 15px rgba(0,0,0,0.3);
            transition: all 0.2s ease; 
        }
        button:active { 
            transform: scale(0.95); 
        }
        .clear-btn { 
            background: #463352; 
            color: #dfb76c; 
        }
        .clear-btn:hover {
            background: #563f64;
            border-color: #dfb76c;
        }
        .send-btn { 
            background: #e2849e; 
            color: #fff; 
        }
        .send-btn:hover {
            background: #ea9cb2;
            box-shadow: 0px 5px 20px rgba(226, 132, 158, 0.5);
        }
    </style>
</head>
<body>
    <h2>🌸 Pixie Canvas ${activeUser} 🌸</h2>
    <div class="sub-header">Whisper a drawing through the air...</div>
    
    <canvas id="canvas" width="480" height="320"></canvas>
    
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
        ctx.strokeStyle = "#463352"; // Delicate deep berry-purple ink line
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
            .then(res => { if(res.ok) alert("✨ Your sketch has vanished into the air and landed in the frame!"); })
            .catch(err => alert("Magical link error: " + err));
        }
    </script>
</body>
</html>
    `);
});

// TWO-WAY DATA ROUTING API
app.post('/upload', (req, res) => {
    const sender = req.body.user;
    if (!req.body.data || !sender) return res.status(400).send("Invalid packet.");
    
    const targetFilename = (sender === 'A') ? "frame_B.jpg" : "frame_A.jpg";
    const base64Image = req.body.data.replace(/^data:image\/jpeg;base64,/, "");
    
    fs.writeFile(path.join(__dirname, targetFilename), base64Image, 'base64', (err) => {
        if (err) return res.status(500).send(err);
        res.send("Successfully Transmitted.");
    });
});

app.get('/frame_A.jpg', (req, res) => { res.sendFile(path.join(__dirname, 'frame_A.jpg')); });
app.get('/frame_B.jpg', (req, res) => { res.sendFile(path.join(__dirname, 'frame_B.jpg')); });

app.listen(PORT, () => console.log(`[SERVER] Magical routing system active on Port ${PORT}`));
