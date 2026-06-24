const express = require('express');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 8080;

// Godot 4 Web exports require COOP and COEP headers for SharedArrayBuffer support.
app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    next();
});

// Serve the Godot web export from this directory (Godot exports directly
// here per export_presets.cfg: export_path="web_host/index.html").
app.use(express.static(__dirname));

app.listen(PORT, () => {
    console.log(`Godot Web Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser.`);
});
