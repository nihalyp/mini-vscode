# Mini VS Code (Web IDE)

A browser-based code editor inspired by Visual Studio Code, built with HTML, CSS, JavaScript, Monaco Editor, xterm.js, and Python backends.

## Features
- **VS Code-style Workbench:** Activity Bar, Explorer Sidebar, Search Sidebar, Tab Bar, Monaco Editor, Live Preview pane, Interactive Terminal, and Status Bar.
- **Monaco Editor:** Syntax highlighting, cursor position tracking, dark/light theme toggle, and code formatting (`Alt+Shift+F`).
- **File & Folder Management:** Create files/folders (including nested paths like `src/app.py`), rename files, delete files, and open/save real local folders via the File System Access API.
- **Global Search (`Ctrl+Shift+F`):** Search across all project files by line and jump directly to matching lines.
- **Live Preview:** Real-time HTML + CSS + JavaScript preview inside an `<iframe>`.
- **Code Execution (`▶ Run`):** Run Python (`python3`), C (`gcc`), and C++ (`g++`) snippets with a 5-second timeout via `backend/server.py`.
- **Interactive Terminal:** Full shell session over WebSockets (`ws://localhost:8765`) using `xterm.js` and `backend/terminal_server.py`.
- **Export ZIP:** Download the current project as a `.zip` archive using JSZip.

## Project Structure
```text
mini-vscode/
├── start.sh
├── README.md
├── frontend/
│   ├── index.html
│   ├── xterm.js
│   ├── xterm.css
│   ├── css/
│   │   ├── layout.css
│   │   └── themes.css
│   └── js/
│       └── main.js
└── backend/
    ├── server.py
    └── terminal_server.py
```

## Setup & Run
# Install WebSockets dependency:
```
pip install websockets
```

# Start all services:
```
cd mini-vscode
chmod +x start.sh
./start.sh
```
## Open http://localhost:8000/ in your browser.


## Keyboard Shortcuts

# ​Ctrl+S / Cmd+S: Save active file

# ​Ctrl+Shift+F / Cmd+Shift+F: Open Global Search

# ​Alt+Shift+F: Format code in Monaco Editor


