// Static HTML viewer: chat interface + crystal viewer with selective disclosure.

export const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Memoria Civica</title>
<style>
  :root {
    --bg: #0a0a0f;
    --surface: #12121a;
    --surface2: #1a1a26;
    --border: #2a2a3a;
    --text: #e0e0e8;
    --text2: #8888a0;
    --accent: #6c5ce7;
    --accent2: #a29bfe;
    --green: #00b894;
    --amber: #fdcb6e;
    --red: #e17055;
    --glass: rgba(108, 92, 231, 0.08);
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    background: var(--bg);
    color: var(--text);
    height: 100vh;
    display: flex;
    flex-direction: column;
  }

  /* Header */
  .header {
    padding: 16px 24px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 16px;
    background: var(--surface);
  }
  .header h1 {
    font-size: 18px;
    font-weight: 600;
    background: linear-gradient(135deg, var(--accent2), var(--green));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .header .subtitle {
    font-size: 12px;
    color: var(--text2);
  }

  /* Main layout */
  .main {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  /* Chat panel */
  .chat-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--border);
    min-width: 0;
  }
  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .msg {
    max-width: 85%;
    padding: 10px 14px;
    border-radius: 12px;
    font-size: 13px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-wrap: break-word;
  }
  .msg.user {
    align-self: flex-end;
    background: var(--accent);
    color: #fff;
    border-bottom-right-radius: 4px;
  }
  .msg.assistant {
    align-self: flex-start;
    background: var(--surface2);
    border-bottom-left-radius: 4px;
    border: 1px solid var(--border);
  }
  .msg.assistant strong { color: var(--accent2); }
  .msg.system {
    align-self: center;
    color: var(--text2);
    font-size: 11px;
    font-style: italic;
  }
  .chat-input {
    display: flex;
    padding: 12px 16px;
    gap: 8px;
    border-top: 1px solid var(--border);
    background: var(--surface);
  }
  .chat-input input {
    flex: 1;
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 14px;
    color: var(--text);
    font-family: inherit;
    font-size: 13px;
    outline: none;
  }
  .chat-input input:focus { border-color: var(--accent); }
  .chat-input input::placeholder { color: var(--text2); }
  .chat-input button {
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 10px 20px;
    font-family: inherit;
    font-size: 13px;
    cursor: pointer;
    transition: opacity 0.2s;
  }
  .chat-input button:hover { opacity: 0.85; }
  .chat-input button:disabled { opacity: 0.4; cursor: not-allowed; }

  /* Crystal panel */
  .crystal-panel {
    width: 420px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    overflow-y: auto;
  }
  .crystal-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 32px;
    color: var(--text2);
    font-size: 13px;
    line-height: 1.6;
  }
  .crystal-header {
    padding: 16px;
    border-bottom: 1px solid var(--border);
  }
  .crystal-header h2 {
    font-size: 14px;
    color: var(--accent2);
    margin-bottom: 8px;
  }
  .crystal-stats {
    display: flex;
    gap: 16px;
    font-size: 11px;
    color: var(--text2);
  }
  .crystal-stats .stat-val { color: var(--text); font-weight: 600; }

  /* Role selector */
  .role-selector {
    display: flex;
    gap: 6px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
  }
  .role-btn {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface2);
    color: var(--text2);
    font-family: inherit;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.3s ease;
    text-align: center;
  }
  .role-btn:hover { border-color: var(--accent); color: var(--text); }
  .role-btn.active {
    background: var(--glass);
    border-color: var(--accent);
    color: var(--accent2);
  }
  .role-btn .role-icon { font-size: 16px; display: block; margin-bottom: 2px; }
  .role-btn .role-desc { display: block; font-size: 9px; color: var(--text2); margin-top: 2px; line-height: 1.3; }
  .role-btn.active .role-desc { color: var(--accent2); opacity: 0.7; }

  /* Frames */
  .frames { padding: 12px 16px; display: flex; flex-direction: column; gap: 10px; }
  .frame-card {
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
    transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .frame-card.viewable { border-color: var(--green); }
  .frame-card.sealed { border-color: var(--border); }

  .frame-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: var(--surface2);
    font-size: 12px;
  }
  .frame-label { font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
  .frame-status {
    font-size: 10px;
    padding: 2px 8px;
    border-radius: 10px;
    font-weight: 600;
  }
  .frame-status.viewable { background: rgba(0,184,148,0.15); color: var(--green); }
  .frame-status.sealed { background: rgba(225,112,85,0.15); color: var(--red); }

  .frame-body {
    padding: 12px 14px;
    font-size: 12px;
    line-height: 1.6;
    max-height: 0;
    overflow: hidden;
    opacity: 0;
    transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .frame-card.viewable .frame-body {
    max-height: 600px;
    opacity: 1;
    padding: 12px 14px;
  }
  .frame-card.sealed .frame-body {
    max-height: 40px;
    opacity: 0.4;
    padding: 8px 14px;
  }
  .frame-sealed-msg {
    font-style: italic;
    color: var(--text2);
    font-size: 11px;
  }

  /* Frame content rendering */
  .frame-body .kv { margin-bottom: 4px; }
  .frame-body .kv-key { color: var(--accent2); }
  .frame-body .kv-val { color: var(--text); }
  .frame-body .section-title {
    color: var(--amber);
    font-weight: 600;
    margin: 8px 0 4px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* Unlock animation */
  @keyframes unlock-glow {
    0% { box-shadow: 0 0 0 0 rgba(0,184,148,0); }
    50% { box-shadow: 0 0 20px 4px rgba(0,184,148,0.3); }
    100% { box-shadow: 0 0 0 0 rgba(0,184,148,0); }
  }
  .frame-card.just-unlocked {
    animation: unlock-glow 0.8s ease-out;
  }

  @keyframes seal-fade {
    0% { opacity: 1; }
    50% { opacity: 0.3; }
    100% { opacity: 0.4; }
  }
  .frame-card.just-sealed .frame-body {
    animation: seal-fade 0.4s ease-out;
  }

  /* Loading */
  .loading-dots::after {
    content: '';
    animation: dots 1.5s steps(4, end) infinite;
  }
  @keyframes dots {
    0% { content: ''; }
    25% { content: '.'; }
    50% { content: '..'; }
    75% { content: '...'; }
  }

  /* Scrollbar */
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

  /* Mobile */
  @media (max-width: 768px) {
    .main { flex-direction: column; }
    .crystal-panel { width: 100%; max-height: 50vh; border-right: none; border-top: 1px solid var(--border); }
  }
</style>
</head>
<body>
  <div class="header">
    <h1>memoria civica</h1>
    <span class="subtitle">AI queries live Milan data. The report it builds shows different things to different people.</span>
  </div>

  <div class="main">
    <div class="chat-panel">
      <div class="messages" id="messages"></div>
      <div class="chat-input">
        <input id="input" type="text" placeholder="Ask about Milan's climate data..." autocomplete="off">
        <button id="send" onclick="sendMessage()">Send</button>
      </div>
    </div>

    <div class="crystal-panel" id="crystalPanel">
      <div class="crystal-empty" id="crystalEmpty">
        <div>
          <div style="font-size:32px;margin-bottom:12px;opacity:0.3">&#9670;</div>
          <div>No crystal yet.</div>
          <div style="margin-top:8px;font-size:11px">
            Ask a question about Milan's air, traffic,<br>
            trees, or neighborhoods. The agent will<br>
            build a report that reveals different<br>
            content depending on who's reading it.
          </div>
        </div>
      </div>
      <div id="crystalContent" style="display:none">
        <div class="crystal-header">
          <h2 id="crystalTitle">Memory Crystal</h2>
          <div style="font-size:11px;color:var(--text2);margin-bottom:8px;line-height:1.5">One file. Same bytes. Toggle roles to see how different keys reveal different content.</div>
          <div class="crystal-stats">
            <span>ID: <span class="stat-val" id="crystalId">--</span></span>
            <span>Size: <span class="stat-val" id="crystalSize">--</span></span>
            <span>Frames: <span class="stat-val" id="crystalFrames">--</span></span>
          </div>
        </div>
        <div class="role-selector">
          <button class="role-btn active" onclick="setRole('public')" id="btn-public">
            <span class="role-icon">&#127758;</span> Public
            <span class="role-desc">What any citizen sees</span>
          </button>
          <button class="role-btn" onclick="setRole('planner')" id="btn-planner">
            <span class="role-icon">&#127959;</span> Planner
            <span class="role-desc">What a city official unlocks</span>
          </button>
          <button class="role-btn" onclick="setRole('researcher')" id="btn-researcher">
            <span class="role-icon">&#128300;</span> Researcher
            <span class="role-desc">What an academic unlocks</span>
          </button>
        </div>
        <div class="frames" id="framesContainer"></div>
      </div>
    </div>
  </div>

<script>
const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('input');
const sendBtn = document.getElementById('send');
let history = [];
let currentRole = 'public';
let crystalData = null;

// Init: trigger greeting
window.addEventListener('load', () => {
  sendBtn.disabled = false;
  inputEl.focus();
  // Send empty to get greeting
  doChat('hello');
});

inputEl.addEventListener('keydown', e => { if (e.key === 'Enter' && !sendBtn.disabled) sendMessage(); });

function sendMessage() {
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = '';
  addMsg('user', text);
  doChat(text);
}

async function doChat(text) {
  sendBtn.disabled = true;
  history.push({ role: 'user', content: text });

  const loadingEl = addMsg('assistant', '');
  loadingEl.classList.add('loading-dots');
  loadingEl.textContent = 'Thinking';

  try {
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history }),
    });
    const data = await resp.json();

    loadingEl.classList.remove('loading-dots');
    loadingEl.innerHTML = formatMarkdown(data.reply);
    history.push({ role: 'assistant', content: data.reply });

    // Check if a crystal was built
    if (data.crystal) {
      crystalData = data.crystal;
      showCrystal(data.crystal);
    }
  } catch (err) {
    loadingEl.classList.remove('loading-dots');
    loadingEl.textContent = 'Error: ' + err.message;
  }

  sendBtn.disabled = false;
  inputEl.focus();
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addMsg(role, text) {
  const el = document.createElement('div');
  el.className = 'msg ' + role;
  el.innerHTML = formatMarkdown(text);
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return el;
}

function formatMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
    .replace(/\\n/g, '<br>');
}

// Crystal viewer
function showCrystal(crystal) {
  document.getElementById('crystalEmpty').style.display = 'none';
  document.getElementById('crystalContent').style.display = 'block';
  document.getElementById('crystalId').textContent = crystal.receiptId.slice(0, 12) + '...';
  document.getElementById('crystalSize').textContent = crystal.memSize + ' B';
  document.getElementById('crystalFrames').textContent = crystal.frames.length;
  setRole('public');
}

async function setRole(role) {
  currentRole = role;

  // Update buttons
  document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('btn-' + role).classList.add('active');

  if (!crystalData) return;

  try {
    const resp = await fetch('/api/crystal/decrypt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, memBytesB64: crystalData.memBytesB64 }),
    });
    const data = await resp.json();
    renderFrames(data.frames);
  } catch (err) {
    console.error('Decrypt failed:', err);
  }
}

function renderFrames(frames) {
  const container = document.getElementById('framesContainer');
  const prevStates = {};
  container.querySelectorAll('.frame-card').forEach(el => {
    prevStates[el.dataset.label] = el.classList.contains('viewable') ? 'viewable' : 'sealed';
  });

  container.innerHTML = '';

  for (const frame of frames) {
    const card = document.createElement('div');
    card.className = 'frame-card ' + frame.status;
    card.dataset.label = frame.label;

    // Detect transition for animation
    const prev = prevStates[frame.label];
    if (prev && prev !== frame.status) {
      card.classList.add(frame.status === 'viewable' ? 'just-unlocked' : 'just-sealed');
      setTimeout(() => card.classList.remove('just-unlocked', 'just-sealed'), 800);
    }

    const header = document.createElement('div');
    header.className = 'frame-header';
    header.innerHTML =
      '<span class="frame-label">' + frame.label + '</span>' +
      '<span class="frame-status ' + frame.status + '">' +
      (frame.status === 'viewable' ? '&#128275; VIEWABLE' : '&#128274; SEALED') +
      '</span>';

    const body = document.createElement('div');
    body.className = 'frame-body';

    if (frame.status === 'viewable' && frame.content) {
      body.innerHTML = renderContent(frame.content);
    } else {
      const sealedLabels = {
        public: 'This section is open to everyone.',
        planner: 'This section is locked. Only city planners can read it.',
        researcher: 'This section is locked. Only academic researchers can read it.'
      };
      body.innerHTML = '<div class="frame-sealed-msg">' + (sealedLabels[frame.label] || ('Locked. Requires the ' + frame.label + ' key.')) + '</div>';
    }

    card.appendChild(header);
    card.appendChild(body);
    container.appendChild(card);
  }
}

function renderContent(obj, depth) {
  depth = depth || 0;
  if (depth > 3) return '<span class="kv-val">...</span>';
  let html = '';
  for (const [key, val] of Object.entries(obj)) {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      html += '<div class="section-title">' + key + '</div>';
      html += renderContent(val, depth + 1);
    } else if (Array.isArray(val)) {
      html += '<div class="section-title">' + key + ' (' + val.length + ')</div>';
      for (const item of val.slice(0, 5)) {
        if (typeof item === 'object') {
          html += '<div style="margin-left:8px;margin-bottom:4px;padding:4px 0;border-bottom:1px solid var(--border)">';
          html += renderContent(item, depth + 1);
          html += '</div>';
        } else {
          html += '<div class="kv"><span class="kv-val">' + item + '</span></div>';
        }
      }
      if (val.length > 5) html += '<div class="kv" style="color:var(--text2)">...and ' + (val.length - 5) + ' more</div>';
    } else {
      html += '<div class="kv"><span class="kv-key">' + key + ': </span><span class="kv-val">' + val + '</span></div>';
    }
  }
  return html;
}
</script>
</body>
</html>`;
