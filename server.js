const express = require("express");
const fs = require("fs");

const app = express();
app.use(express.json());
app.use(express.static(".")); // serve HTML

const FILE = "notes.txt";

// Get notes
app.get("/notes", (req, res) => {
    if (!fs.existsSync(FILE)) return res.send("");
    const data = fs.readFileSync(FILE, "utf-8");
    res.send(data);
});

// Save notes
app.post("/notes", (req, res) => {
    fs.writeFileSync(FILE, req.body.text || "");
    res.send("Saved");
});

app.listen(3000, () => {
    console.log("Notepad server running on port 3000");
});
