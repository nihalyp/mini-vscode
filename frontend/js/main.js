window.addEventListener("error", (event) => {
    const el = document.getElementById("terminal-container");
    if (el && !el.querySelector(".xterm")) {
        el.innerHTML = `<pre style="color:#ff6b6b;padding:8px;white-space:pre-wrap;">JS Error: ${event.message} (${event.filename}:${event.lineno})</pre>`;
    }
});

let files = {
    "index.html": {
        language: "html",
        content: `<!DOCTYPE html>\n<html>\n<head>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <h1>Hello Mini VS Code!</h1>\n  <button onclick="sayHi()">Click Me</button>\n  <script src="script.js"></script>\n</body>\n</html>`,
        handle: null
    },
    "style.css": {
        language: "css",
        content: `body {\n  font-family: sans-serif;\n  text-align: center;\n  padding-top: 40px;\n}\nh1 {\n  color: #007acc;\n}`,
        handle: null
    },
    "script.js": {
        language: "javascript",
        content: `function sayHi() {\n  alert("Live Preview works!");\n}`,
        handle: null
    },
    "app.py": {
        language: "python",
        content: `for i in range(1, 25):\n    print(f"Line {i}: Running from Mini VS Code!")`,
        handle: null
    }
};

let folders = new Set(["src"]);
let openTabs = ["app.py"];
let activeFile = "app.py";
let editor;
let isDark = true;
let rootDirHandle = null;
let term;
let fitAddon;
let socket;

function fitTerminalSafe() {
    if (!fitAddon || !term) return;
    try {
        fitAddon.fit();
        term.scrollToBottom();
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: "resize",
                cols: term.cols,
                rows: term.rows
            }));
        }
    } catch (_) {}
}

function getLanguageFromFilename(filename) {
    const ext = filename.split(".").pop().toLowerCase();
    const langMap = {
        html: "html",
        css: "css",
        js: "javascript",
        py: "python",
        json: "json",
        md: "markdown",
        txt: "plaintext",
        c: "c",
        cpp: "cpp",
        cc: "cpp",
        cxx: "cpp",
        h: "c",
        hpp: "cpp",
        java: "java"
    };
    return langMap[ext] || "plaintext";
}

// Monaco Editor സജ്ജമാക്കുന്നു
require.config({ paths: { vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs" } });

require(["vs/editor/editor.main"], function () {
    editor = monaco.editor.create(document.getElementById("monaco-container"), {
        value: files[activeFile] ? files[activeFile].content : "",
        language: files[activeFile] ? files[activeFile].language : "plaintext",
        theme: "vs-dark",
        automaticLayout: true,
        fontSize: 14,
        minimap: { enabled: true }
    });

    editor.onDidChangeModelContent(() => {
        if (activeFile && files[activeFile]) {
            files[activeFile].content = editor.getValue();
            const statusEl = document.getElementById("status-msg");
            if (statusEl) statusEl.textContent = "Unsaved*";
            updateLivePreview();
            runGlobalSearch();
        }
    });

    editor.onDidChangeCursorPosition((e) => {
        const posEl = document.getElementById("cursor-pos");
        if (posEl) posEl.textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
    });

    renderFileList();
    renderTabs();
});

// പ്രോജക്ട് ZIP ആയി ഡൗൺലോഡ് ചെയ്യുന്നു
async function downloadProjectZip() {
    if (typeof JSZip === "undefined") {
        logConsole("JSZip library failed to load (check internet/CDN).");
        return;
    }

    const zip = new JSZip();
    folders.forEach((folderName) => {
        if (folderName) zip.folder(folderName);
    });

    Object.keys(files).forEach((filePath) => {
        zip.file(filePath, files[filePath].content ?? "");
    });

    try {
        const blob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const zipName = rootDirHandle ? `${rootDirHandle.name}.zip` : "mini-vscode-project.zip";
        a.href = url;
        a.download = zipName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        logConsole(`Downloaded ${zipName}`);
    } catch (err) {
        logConsole(`ZIP Export Error: ${err.message}`);
    }
}

// Sidebar Views (Explorer / Global Search)
function switchSidebarView(viewName) {
    const sidebar = document.getElementById("sidebar");
    const explorerView = document.getElementById("explorer-view");
    const searchView = document.getElementById("search-view");
    const explorerBtn = document.getElementById("toggle-explorer");
    const searchBtn = document.getElementById("toggle-search");

    const isSameOpen = sidebar && !sidebar.classList.contains("hidden") &&
        ((viewName === "explorer" && explorerView && !explorerView.classList.contains("hidden")) ||
         (viewName === "search" && searchView && !searchView.classList.contains("hidden")));

    if (isSameOpen) {
        sidebar.classList.add("hidden");
        explorerBtn?.classList.remove("active");
        searchBtn?.classList.remove("active");
        setTimeout(fitTerminalSafe, 50);
        return;
    }

    sidebar?.classList.remove("hidden");
    if (viewName === "explorer") {
        explorerView?.classList.remove("hidden");
        searchView?.classList.add("hidden");
        explorerBtn?.classList.add("active");
        searchBtn?.classList.remove("active");
    } else {
        explorerView?.classList.add("hidden");
        searchView?.classList.remove("hidden");
        searchBtn?.classList.add("active");
        explorerBtn?.classList.remove("active");
        const input = document.getElementById("global-search-input");
        input?.focus();
        runGlobalSearch();
    }
    setTimeout(fitTerminalSafe, 50);
}

function runGlobalSearch() {
    const input = document.getElementById("global-search-input");
    const summaryEl = document.getElementById("search-summary");
    const resultsEl = document.getElementById("search-results");
    if (!input || !summaryEl || !resultsEl) return;

    const query = input.value;
    resultsEl.innerHTML = "";

    if (!query.trim()) {
        summaryEl.textContent = "Type to search";
        return;
    }

    const lowerQuery = query.toLowerCase();
    let matchCount = 0;
    let fileMatches = 0;

    Object.keys(files).sort().forEach((fileName) => {
        const content = files[fileName].content || "";
        const lines = content.split("\n");
        let foundInThisFile = false;

        lines.forEach((lineText, idx) => {
            const colIndex = lineText.toLowerCase().indexOf(lowerQuery);
            if (colIndex !== -1) {
                matchCount++;
                if (!foundInThisFile) {
                    fileMatches++;
                    foundInThisFile = true;
                }

                const li = document.createElement("li");
                li.className = "search-result-item";

                const meta = document.createElement("div");
                meta.className = "search-result-meta";
                meta.textContent = `${fileName} : Ln ${idx + 1}`;

                const lineDiv = document.createElement("div");
                lineDiv.className = "search-result-line";
                lineDiv.textContent = lineText.trim() || "(empty line)";

                li.appendChild(meta);
                li.appendChild(lineDiv);
                li.onclick = () => {
                    openFileAtPosition(fileName, idx + 1, colIndex + 1);
                };
                resultsEl.appendChild(li);
            }
        });
    });

    summaryEl.textContent = `${matchCount} result(s) across ${fileMatches} file(s)`;
}

function openFileAtPosition(fileName, lineNumber, columnNumber) {
    openFile(fileName);
    if (editor) {
        editor.revealLineInCenter(lineNumber);
        editor.setPosition({ lineNumber, column: columnNumber });
        editor.focus();
    }
}

const openFolderBtn = document.getElementById("open-folder-btn");
if (openFolderBtn) {
    openFolderBtn.onclick = async () => {
        try {
            if (!window.showDirectoryPicker) {
                alert("Your browser does not support File System Access API. Use Chrome, Edge, or Brave.");
                return;
            }
            rootDirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
            const rootNameEl = document.getElementById("root-folder-name");
            if (rootNameEl) rootNameEl.textContent = `▼ ${rootDirHandle.name.toUpperCase()}`;

            files = {};
            folders = new Set();
            openTabs = [];
            activeFile = null;

            await readDirectoryRecursive(rootDirHandle, "");

            const firstFile = Object.keys(files).sort()[0];
            if (firstFile) {
                openFile(firstFile);
            } else {
                if (editor) editor.setValue("");
                renderFileList();
                renderTabs();
            }
            runGlobalSearch();
            logConsole(`Opened folder: ${rootDirHandle.name}`);
        } catch (err) {
            if (err.name !== "AbortError") {
                logConsole(`Folder Error: ${err.message}`);
            }
        }
    };
}

async function readDirectoryRecursive(dirHandle, pathPrefix) {
    for await (const entry of dirHandle.values()) {
        if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "__pycache__") continue;

        const fullPath = pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name;
        if (entry.kind === "file") {
            const file = await entry.getFile();
            if (file.size < 2 * 1024 * 1024) {
                const text = await file.text();
                files[fullPath] = {
                    language: getLanguageFromFilename(entry.name),
                    content: text,
                    handle: entry
                };
            }
        } else if (entry.kind === "directory") {
            folders.add(fullPath);
            await readDirectoryRecursive(entry, fullPath);
        }
    }
}

async function getOrCreateDirHandle(folderPath, create = false) {
    if (!rootDirHandle) return null;
    if (!folderPath) return rootDirHandle;
    const parts = folderPath.split("/").filter(Boolean);
    let currentDir = rootDirHandle;
    for (const folder of parts) {
        currentDir = await currentDir.getDirectoryHandle(folder, { create });
    }
    return currentDir;
}

function renderFileList() {
    const fileListEl = document.getElementById("file-list");
    if (!fileListEl) return;
    fileListEl.innerHTML = "";

    Array.from(folders).sort().forEach((folderName) => {
        const li = document.createElement("li");
        li.className = "file-item";
        const label = document.createElement("span");
        label.className = "file-name-label";
        label.textContent = `📁 ${folderName}`;
        li.appendChild(label);
        fileListEl.appendChild(li);
    });

    Object.keys(files).sort().forEach((fileName) => {
        const li = document.createElement("li");
        li.className = `file-item ${fileName === activeFile ? "active" : ""}`;

        const label = document.createElement("span");
        label.className = "file-name-label";
        label.textContent = `📄 ${fileName}`;
        label.title = fileName;
        label.onclick = () => openFile(fileName);

        const actionsDiv = document.createElement("div");
        actionsDiv.className = "file-actions";

        const renameBtn = document.createElement("button");
        renameBtn.className = "file-action-btn";
        renameBtn.textContent = "✏️";
        renameBtn.title = "Rename File";
        renameBtn.onclick = (e) => {
            e.stopPropagation();
            renameFile(fileName);
        };

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "file-action-btn";
        deleteBtn.textContent = "🗑️";
        deleteBtn.title = "Delete File";
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            deleteFile(fileName);
        };

        actionsDiv.appendChild(renameBtn);
        actionsDiv.appendChild(deleteBtn);

        li.appendChild(label);
        li.appendChild(actionsDiv);
        fileListEl.appendChild(li);
    });
}

function renderTabs() {
    const tabsBar = document.getElementById("tabs-bar");
    if (!tabsBar) return;
    tabsBar.innerHTML = "";

    openTabs.forEach((fileName) => {
        const tab = document.createElement("div");
        tab.className = `tab ${fileName === activeFile ? "active" : ""}`;

        const title = document.createElement("span");
        title.textContent = fileName.split("/").pop();
        title.title = fileName;
        title.onclick = () => openFile(fileName);

        const closeBtn = document.createElement("span");
        closeBtn.className = "tab-close";
        closeBtn.textContent = "✕";
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            closeTab(fileName);
        };

        tab.appendChild(title);
        tab.appendChild(closeBtn);
        tabsBar.appendChild(tab);
    });
}

function openFile(fileName) {
    if (!files[fileName]) return;
    if (!openTabs.includes(fileName)) {
        openTabs.push(fileName);
    }
    activeFile = fileName;
    const fileData = files[fileName];

    if (editor) {
        monaco.editor.setModelLanguage(editor.getModel(), fileData.language);
        editor.setValue(fileData.content);
    }
    const langEl = document.getElementById("file-lang");
    if (langEl) langEl.textContent = fileData.language.toUpperCase();

    renderFileList();
    renderTabs();
}

function closeTab(fileName) {
    openTabs = openTabs.filter((t) => t !== fileName);
    if (activeFile === fileName) {
        activeFile = openTabs.length > 0 ? openTabs[openTabs.length - 1] : null;
        if (activeFile) {
            openFile(activeFile);
        } else if (editor) {
            editor.setValue("");
            const langEl = document.getElementById("file-lang");
            if (langEl) langEl.textContent = "PLAIN TEXT";
        }
    }
    renderTabs();
    renderFileList();
}

const newFileBtn = document.getElementById("new-file-btn");
if (newFileBtn) {
    newFileBtn.onclick = async () => {
        const rawName = prompt("Enter new file name (e.g. main.py or src/helper.py):");
        if (!rawName) return;
        const cleanPath = rawName.trim().replace(/^\/+|\/+$/g, "");
        if (!cleanPath || files[cleanPath]) return;

        const parts = cleanPath.split("/");
        const baseName = parts.pop();
        const folderPath = parts.join("/");

        let fileHandle = null;
        if (rootDirHandle) {
            try {
                const targetDir = await getOrCreateDirHandle(folderPath, true);
                fileHandle = await targetDir.getFileHandle(baseName, { create: true });
            } catch (err) {
                logConsole(`Could not create local file: ${err.message}`);
            }
        }

        if (folderPath) {
            folders.add(folderPath);
        }

        files[cleanPath] = {
            language: getLanguageFromFilename(baseName),
            content: "",
            handle: fileHandle
        };
        openFile(cleanPath);
        runGlobalSearch();
    };
}

const newFolderBtn = document.getElementById("new-folder-btn");
if (newFolderBtn) {
    newFolderBtn.onclick = async () => {
        const rawName = prompt("Enter new folder name (e.g. components or utils):");
        if (!rawName) return;
        const cleanFolder = rawName.trim().replace(/^\/+|\/+$/g, "");
        if (!cleanFolder) return;

        if (rootDirHandle) {
            try {
                await getOrCreateDirHandle(cleanFolder, true);
            } catch (err) {
                logConsole(`Could not create local folder: ${err.message}`);
                return;
            }
        }

        folders.add(cleanFolder);
        renderFileList();
        logConsole(`Created folder: ${cleanFolder}`);
    };
}

async function renameFile(oldPath) {
    const parts = oldPath.split("/");
    const oldBaseName = parts.pop();
    const folderPrefix = parts.length > 0 ? parts.join("/") + "/" : "";

    const newBaseName = prompt("Enter new file name:", oldBaseName);
    if (!newBaseName || newBaseName === oldBaseName) return;

    const newPath = folderPrefix + newBaseName;
    if (files[newPath]) {
        alert("A file with that name already exists!");
        return;
    }

    const fileObj = files[oldPath];
    let newHandle = null;

    if (rootDirHandle && fileObj.handle) {
        try {
            const parentDir = await getOrCreateDirHandle(folderPrefix.slice(0, -1), false);
            newHandle = await parentDir.getFileHandle(newBaseName, { create: true });
            const writable = await newHandle.createWritable();
            await writable.write(fileObj.content);
            await writable.close();
            await parentDir.removeEntry(oldBaseName);
        } catch (err) {
            logConsole(`Rename Error on Disk: ${err.message}`);
            return;
        }
    }

    files[newPath] = {
        language: getLanguageFromFilename(newBaseName),
        content: fileObj.content,
        handle: newHandle
    };
    delete files[oldPath];

    const tabIndex = openTabs.indexOf(oldPath);
    if (tabIndex !== -1) {
        openTabs[tabIndex] = newPath;
    }

    if (activeFile === oldPath) {
        openFile(newPath);
    } else {
        renderFileList();
        renderTabs();
    }
    runGlobalSearch();
    logConsole(`Renamed: ${oldPath} -> ${newPath}`);
}

async function deleteFile(filePath) {
    if (!confirm(`Are you sure you want to delete "${filePath}"?`)) return;

    const fileObj = files[filePath];

    if (rootDirHandle && fileObj.handle) {
        try {
            const parts = filePath.split("/");
            const baseName = parts.pop();
            const parentDir = await getOrCreateDirHandle(parts.join("/"), false);
            await parentDir.removeEntry(baseName);
        } catch (err) {
            logConsole(`Delete Error on Disk: ${err.message}`);
            return;
        }
    }

    delete files[filePath];
    closeTab(filePath);
    runGlobalSearch();
    logConsole(`Deleted: ${filePath}`);
}

async function saveCurrentFile() {
    if (!activeFile || !files[activeFile]) return;
    const fileObj = files[activeFile];

    if (fileObj.handle) {
        try {
            const writable = await fileObj.handle.createWritable();
            await writable.write(fileObj.content);
            await writable.close();
            const statusEl = document.getElementById("status-msg");
            if (statusEl) statusEl.textContent = "Saved to Disk";
            logConsole(`[Saved to Disk] ${activeFile}`);
        } catch (err) {
            logConsole(`Save Error: ${err.message}`);
        }
    } else {
        const statusEl = document.getElementById("status-msg");
        if (statusEl) statusEl.textContent = "Saved (Memory)";
        logConsole(`[Saved in Memory] ${activeFile}`);
    }
}

const runCodeBtn = document.getElementById("run-code-btn");
if (runCodeBtn) {
    runCodeBtn.onclick = async () => {
        if (!activeFile || !files[activeFile]) return;
        const fileObj = files[activeFile];

        if (!["python", "c", "cpp"].includes(fileObj.language)) {
            logConsole(`Cannot run ${fileObj.language} via backend. Use Live Preview for HTML/CSS/JS.`);
            return;
        }

        logConsole(`Running ${activeFile} (${fileObj.language})...`);
        try {
            const response = await fetch("http://localhost:5000/run", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    code: fileObj.content,
                    language: fileObj.language
                })
            });
            const result = await response.json();
            logConsole(result.output);
        } catch (err) {
            logConsole(`Backend Error: Make sure 'python3 backend/server.py' is running.\n(${err.message})`);
        }
    };
}

function logConsole(text) {
    if (term) {
        term.write("\r\n" + String(text).replace(/\n/g, "\r\n") + "\r\n");
        term.scrollToBottom();
    } else {
        const consoleEl = document.getElementById("output-console");
        if (consoleEl) consoleEl.textContent = text;
    }
}

function updateLivePreview() {
    const previewPane = document.getElementById("preview-pane");
    if (!previewPane || previewPane.classList.contains("hidden")) return;

    const html = files["index.html"] ? files["index.html"].content : "";
    const css = files["style.css"] ? `<style>${files["style.css"].content}</style>` : "";
    const js = files["script.js"] ? `<script>${files["script.js"].content}<\/script>` : "";

    const frame = document.getElementById("preview-frame");
    if (frame) frame.srcdoc = `${html}\n${css}\n${js}`;
}

document.getElementById("toggle-explorer")?.addEventListener("click", () => switchSidebarView("explorer"));
document.getElementById("toggle-search")?.addEventListener("click", () => switchSidebarView("search"));
document.getElementById("download-zip-btn")?.addEventListener("click", downloadProjectZip);
document.getElementById("global-search-input")?.addEventListener("input", runGlobalSearch);

document.getElementById("clear-terminal-btn")?.addEventListener("click", () => {
    if (term) {
        term.clear();
    }
});

document.getElementById("expand-terminal-btn")?.addEventListener("click", () => {
    const panel = document.getElementById("bottom-panel");
    if (panel) {
        panel.classList.toggle("expanded");
        setTimeout(fitTerminalSafe, 80);
    }
});

document.getElementById("toggle-preview")?.addEventListener("click", () => {
    const pane = document.getElementById("preview-pane");
    if (pane) pane.classList.toggle("hidden");
    updateLivePreview();
    setTimeout(fitTerminalSafe, 50);
});

document.getElementById("refresh-preview")?.addEventListener("click", () => updateLivePreview());
document.getElementById("close-preview")?.addEventListener("click", () => {
    document.getElementById("preview-pane")?.classList.add("hidden");
    setTimeout(fitTerminalSafe, 50);
});

document.getElementById("toggle-theme")?.addEventListener("click", () => {
    isDark = !isDark;
    document.body.className = isDark ? "theme-dark" : "theme-light";
    if (typeof monaco !== "undefined" && editor) {
        monaco.editor.setTheme(isDark ? "vs-dark" : "vs");
    }
    if (term) {
        term.options.theme = isDark
            ? { background: "#1e1e1e", foreground: "#cccccc" }
            : { background: "#ffffff", foreground: "#222222" };
    }
});

window.addEventListener("resize", () => {
    fitTerminalSafe();
});

window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveCurrentFile();
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        switchSidebarView("search");
    }
    if (e.altKey && e.shiftKey && e.key.toLowerCase() === "f" && editor) {
        e.preventDefault();
        editor.getAction("editor.action.formatDocument")?.run();
    }
});

function initTerminal() {
    const container = document.getElementById("terminal-container");
    if (!container) return;

    if (typeof Terminal === "undefined") {
        container.innerHTML = '<pre style="color:#ff6b6b;padding:8px;">xterm.js failed to load.</pre>';
        return;
    }

    term = new Terminal({
        cursorBlink: true,
        scrollback: 1000,
        fontSize: 13,
        fontFamily: "monospace",
        convertEol: true,
        theme: {
            background: "#1e1e1e",
            foreground: "#cccccc"
        }
    });

    if (typeof FitAddon !== "undefined" && FitAddon.FitAddon) {
        fitAddon = new FitAddon.FitAddon();
        term.loadAddon(fitAddon);
    }

    term.open(container);
    setTimeout(fitTerminalSafe, 100);
    term.writeln("Connecting to ws://localhost:8765 ...");

    socket = new WebSocket("ws://localhost:8765");

    socket.onopen = () => {
        term.writeln("\x1b[32mConnected to terminal backend.\x1b[0m\r\n");
        fitTerminalSafe();
    };

    socket.onmessage = (event) => {
        term.write(event.data, () => {
            term.scrollToBottom();
        });
    };

    socket.onclose = () => {
        term.writeln("\r\n\x1b[31mTerminal disconnected. Start terminal_server.py and refresh.\x1b[0m\r\n");
    };

    socket.onerror = () => {
        term.writeln("\r\n\x1b[31mCould not connect to ws://localhost:8765\x1b[0m\r\n");
    };

    term.onData((data) => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(data);
        }
    });
}

window.addEventListener("DOMContentLoaded", () => {
    initTerminal();
});
