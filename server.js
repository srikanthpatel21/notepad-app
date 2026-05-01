const express = require("express");
const path = require("path");

const app = express();
const port = process.env.PORT || 3000;
const rootDir = __dirname;

// Serve static files
app.use(express.static(rootDir));

// Catch-all handler (FIXED)
app.use((req, res) => {
    res.sendFile(path.join(rootDir, "index.html"));
});

app.listen(port, () => {
    console.log(`Personal site running on port ${port}`);
});