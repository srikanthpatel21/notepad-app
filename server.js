const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(".")); // serve HTML

const LEGACY_FILE = "notes.txt";
const DATA_FILE = path.join(__dirname, "pages.json");

function createId() {
    return "p_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function createDefaultState() {
    const now = new Date().toISOString();
    return {
        rootIds: [],
        pagesById: {},
        meta: {
            selectedPageId: null
        },
        updatedAt: now
    };
}

function ensurePageStructure(state) {
    if (!state || typeof state !== "object") return createDefaultState();
    if (!Array.isArray(state.rootIds)) state.rootIds = [];
    if (!state.pagesById || typeof state.pagesById !== "object") state.pagesById = {};
    if (!state.meta || typeof state.meta !== "object") state.meta = {};
    if (!state.meta.selectedPageId) state.meta.selectedPageId = null;
    return state;
}

function migrateLegacyNotes(state) {
    if (!fs.existsSync(LEGACY_FILE) || Object.keys(state.pagesById).length > 0) {
        return state;
    }

    const legacyContent = fs.readFileSync(LEGACY_FILE, "utf-8");
    const id = createId();
    const now = new Date().toISOString();

    state.pagesById[id] = {
        id,
        title: "Home",
        content: legacyContent,
        parentId: null,
        childIds: [],
        createdAt: now,
        updatedAt: now
    };
    state.rootIds.push(id);
    state.meta.selectedPageId = id;
    state.updatedAt = now;
    return state;
}

function loadData() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            return migrateLegacyNotes(createDefaultState());
        }
        const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
        return migrateLegacyNotes(ensurePageStructure(parsed));
    } catch (error) {
        return migrateLegacyNotes(createDefaultState());
    }
}

function saveData(state) {
    state.updatedAt = new Date().toISOString();
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
}

function buildTree(state, pageId) {
    const page = state.pagesById[pageId];
    if (!page) return null;
    return {
        id: page.id,
        title: page.title,
        parentId: page.parentId,
        childIds: page.childIds,
        updatedAt: page.updatedAt,
        children: page.childIds.map((childId) => buildTree(state, childId)).filter(Boolean)
    };
}

function snapshot(state) {
    return {
        tree: state.rootIds.map((id) => buildTree(state, id)).filter(Boolean),
        pagesById: state.pagesById,
        selectedPageId: state.meta.selectedPageId
    };
}

function ensurePageExists(state, id, res) {
    if (!id || !state.pagesById[id]) {
        res.status(404).json({ error: "Page not found" });
        return false;
    }
    return true;
}

// Full workspace tree and page map
app.get("/api/pages", (req, res) => {
    const state = loadData();
    res.json(snapshot(state));
});

// Create page (root or child)
app.post("/api/pages", (req, res) => {
    const state = loadData();
    const parentId = req.body.parentId || null;
    const title = (req.body.title || "").trim() || "Untitled Page";

    if (parentId && !state.pagesById[parentId]) {
        return res.status(404).json({ error: "Parent page not found" });
    }

    const id = createId();
    const now = new Date().toISOString();
    state.pagesById[id] = {
        id,
        title,
        content: "",
        parentId,
        childIds: [],
        createdAt: now,
        updatedAt: now
    };

    if (parentId) {
        state.pagesById[parentId].childIds.push(id);
        state.pagesById[parentId].updatedAt = now;
    } else {
        state.rootIds.push(id);
    }

    state.meta.selectedPageId = id;
    saveData(state);
    res.status(201).json({ page: state.pagesById[id], snapshot: snapshot(state) });
});

// Rename page
app.patch("/api/pages/:id/title", (req, res) => {
    const state = loadData();
    const pageId = req.params.id;
    if (!ensurePageExists(state, pageId, res)) return;

    const title = (req.body.title || "").trim();
    if (!title) return res.status(400).json({ error: "Title cannot be empty" });

    state.pagesById[pageId].title = title;
    state.pagesById[pageId].updatedAt = new Date().toISOString();
    saveData(state);
    res.json({ page: state.pagesById[pageId], snapshot: snapshot(state) });
});

// Save page content
app.put("/api/pages/:id/content", (req, res) => {
    const state = loadData();
    const pageId = req.params.id;
    if (!ensurePageExists(state, pageId, res)) return;

    const content = typeof req.body.content === "string" ? req.body.content : "";
    state.pagesById[pageId].content = content;
    state.pagesById[pageId].updatedAt = new Date().toISOString();
    saveData(state);
    res.json({ page: state.pagesById[pageId], snapshot: snapshot(state) });
});

function collectDescendants(state, id) {
    const page = state.pagesById[id];
    if (!page) return [];
    const collected = [id];
    for (const childId of page.childIds) {
        collected.push(...collectDescendants(state, childId));
    }
    return collected;
}

// Delete page and its descendants
app.delete("/api/pages/:id", (req, res) => {
    const state = loadData();
    const pageId = req.params.id;
    if (!ensurePageExists(state, pageId, res)) return;

    const target = state.pagesById[pageId];
    if (target.parentId && state.pagesById[target.parentId]) {
        state.pagesById[target.parentId].childIds =
            state.pagesById[target.parentId].childIds.filter((id) => id !== pageId);
        state.pagesById[target.parentId].updatedAt = new Date().toISOString();
    } else {
        state.rootIds = state.rootIds.filter((id) => id !== pageId);
    }

    const idsToDelete = collectDescendants(state, pageId);
    for (const id of idsToDelete) delete state.pagesById[id];

    if (state.meta.selectedPageId && !state.pagesById[state.meta.selectedPageId]) {
        state.meta.selectedPageId = state.rootIds[0] || null;
    }

    saveData(state);
    res.json({ deletedIds: idsToDelete, snapshot: snapshot(state) });
});

app.listen(3000, () => {
    console.log("Notepad server running on port 3000");
});
