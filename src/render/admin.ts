import { STYLES } from "./styles";

/** Minimal token-driven admin form. Token is held in localStorage and sent as a Bearer header. */
export function renderAdmin(): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<title>status admin</title>
<style>${STYLES}
.wrap{max-width:640px} label{display:block;font-size:12px;color:var(--muted);margin:10px 0 4px}
input,select,textarea{width:100%;padding:8px 10px;background:var(--card);border:1px solid var(--border);border-radius:8px;color:var(--text)}
button.go{margin-top:16px;background:var(--accent);color:#fff;border:0;border-radius:8px;padding:10px 16px;font-weight:600;cursor:pointer}
#out{margin-top:14px;font-size:13px;color:var(--muted);white-space:pre-wrap}
</style>
</head><body>
<div class="wrap">
  <header><h1>status admin</h1><div class="sub">Post a manual incident or maintenance window</div></header>
  <label for="token">Admin token</label>
  <input id="token" type="password" placeholder="STATUS_ADMIN_TOKEN">
  <label for="component">Component</label>
  <select id="component">
    <option value="global">Global (all)</option>
    <option value="api">API</option><option value="rest">REST API</option>
    <option value="webdav">WebDAV</option><option value="s3">S3 API</option><option value="sftp">SFTP</option>
    <option value="docs">Document Editor</option>
  </select>
  <label for="kind">Kind</label>
  <select id="kind"><option value="manual">Incident</option><option value="maintenance">Maintenance</option></select>
  <label for="status">Status</label>
  <input id="status" value="investigating" placeholder="investigating | identified | monitoring | resolved | scheduled | in_progress | completed">
  <label for="title">Title</label>
  <input id="title" placeholder="Short summary">
  <label for="body">Body</label>
  <textarea id="body" rows="4" placeholder="Details (optional)"></textarea>
  <button class="go" id="create">Create incident</button>
  <div id="out"></div>
</div>
<script>
var tk = document.getElementById('token');
tk.value = localStorage.getItem('status_admin_token') || '';
tk.addEventListener('change', function(){ localStorage.setItem('status_admin_token', tk.value); });
document.getElementById('create').addEventListener('click', async function(){
  var out = document.getElementById('out'); out.textContent = 'Submitting…';
  var payload = {
    component: document.getElementById('component').value,
    kind: document.getElementById('kind').value,
    status: document.getElementById('status').value,
    title: document.getElementById('title').value,
    body: document.getElementById('body').value || null
  };
  try {
    var res = await fetch('/admin/incidents', { method:'POST',
      headers:{ 'content-type':'application/json', 'authorization':'Bearer '+tk.value },
      body: JSON.stringify(payload) });
    out.textContent = res.status + ' ' + await res.text();
  } catch (e) { out.textContent = 'Error: ' + e; }
});
</script>
</body></html>`;
}
