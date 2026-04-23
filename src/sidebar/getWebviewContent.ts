import * as vscode from 'vscode';

export function getNonce(): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let i = 0; i < 32; i++) {
        nonce += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }
    return nonce;
}

export function getWebviewContent(webview: vscode.Webview, nonce: string): string {
    const csp = [
        `default-src 'none'`,
        `img-src ${webview.cspSource} https: data:`,
        `style-src ${webview.cspSource} 'unsafe-inline'`,
        `font-src ${webview.cspSource}`,
        `script-src 'nonce-${nonce}'`
    ].join('; ');

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>AI Usage</title>
<style>
  :root {
    --fg: var(--vscode-foreground);
    --bg: var(--vscode-editor-background);
    --panel: var(--vscode-sideBar-background);
    --border: var(--vscode-panel-border);
    --muted: var(--vscode-descriptionForeground);
    --accent: var(--vscode-textLink-foreground);
    --accent-hover: var(--vscode-textLink-activeForeground);
    --warn: var(--vscode-statusBarItem-warningForeground, #d19a66);
    --error: var(--vscode-statusBarItem-errorForeground, #f14c4c);
    --ok: var(--vscode-testing-iconPassed, #4caf50);
    --button-bg: var(--vscode-button-background);
    --button-fg: var(--vscode-button-foreground);
    --button-hover: var(--vscode-button-hoverBackground);
    --chart-grid: var(--vscode-editorLineNumber-foreground);
  }

  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; color: var(--fg); background: var(--bg); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); }
  body { padding: 8px; }

  h2 { font-size: 12px; text-transform: uppercase; color: var(--muted); letter-spacing: 0.08em; margin: 16px 0 8px; font-weight: 600; }
  h2:first-child { margin-top: 0; }

  .overview { display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 6px; }
  .stat-card { background: var(--panel); border: 1px solid var(--border); border-radius: 4px; padding: 8px; }
  .stat-label { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
  .stat-value { font-size: 16px; font-weight: 600; word-break: break-all; }

  .tool-row { background: var(--panel); border: 1px solid var(--border); border-radius: 4px; padding: 8px; margin-bottom: 6px; }
  .tool-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
  .tool-name { font-weight: 600; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badge { font-size: 10px; padding: 1px 5px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); border-radius: 8px; }
  .muted { color: var(--muted); font-size: 11px; }

  .progress { position: relative; background: var(--vscode-editorWidget-background); border: 1px solid var(--border); border-radius: 2px; height: 8px; overflow: hidden; margin-bottom: 4px; }
  .progress-fill { height: 100%; transition: width 200ms ease; }
  .progress-fill.low { background: var(--ok); }
  .progress-fill.mid { background: var(--warn); }
  .progress-fill.high { background: var(--error); }

  .tool-stats { display: flex; justify-content: space-between; gap: 6px; font-size: 11px; flex-wrap: wrap; }
  .tool-stats strong { font-weight: 600; }

  .tool-actions { display: flex; gap: 4px; margin-top: 6px; flex-wrap: wrap; }
  button {
    background: var(--button-bg); color: var(--button-fg); border: none; padding: 3px 8px;
    border-radius: 2px; cursor: pointer; font-size: 11px; font-family: inherit;
  }
  button:hover { background: var(--button-hover); }
  button.ghost { background: transparent; color: var(--accent); padding: 3px 4px; }
  button.ghost:hover { text-decoration: underline; background: transparent; }

  .tool-details { margin-top: 8px; display: none; border-top: 1px solid var(--border); padding-top: 8px; }
  .tool-row.expanded .tool-details { display: block; }

  .chart-wrap { width: 100%; height: 80px; }
  canvas { width: 100%; height: 100%; display: block; }

  .breakdown { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 6px; font-size: 11px; }
  .breakdown-cell { background: var(--vscode-editorWidget-background); padding: 4px 6px; border-radius: 2px; }

  .sessions-table { width: 100%; border-collapse: collapse; font-size: 11px; }
  .sessions-table th, .sessions-table td { padding: 3px 4px; text-align: left; border-bottom: 1px solid var(--border); }
  .sessions-table th { color: var(--muted); font-weight: 500; text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em; }
  .sessions-wrap { max-height: 260px; overflow: auto; border: 1px solid var(--border); border-radius: 4px; }

  .footer { margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--border); display: flex; justify-content: space-between; font-size: 11px; }
  a { color: var(--accent); text-decoration: none; cursor: pointer; }
  a:hover { color: var(--accent-hover); text-decoration: underline; }

  .empty { padding: 16px 8px; text-align: center; color: var(--muted); font-size: 12px; }
  .warn-pill { color: var(--warn); }
  .error-pill { color: var(--error); }

  @media (max-width: 260px) {
    .overview { grid-template-columns: 1fr 1fr; }
    .tool-stats { font-size: 10px; }
    body { padding: 4px; }
  }
</style>
</head>
<body>
  <h2>Overview</h2>
  <div class="overview" id="overview">
    <div class="stat-card"><div class="stat-label">Used today</div><div class="stat-value" id="stat-used">—</div></div>
    <div class="stat-card"><div class="stat-label">Remaining</div><div class="stat-value" id="stat-remaining">—</div></div>
    <div class="stat-card"><div class="stat-label">Cost</div><div class="stat-value" id="stat-cost">—</div></div>
    <div class="stat-card"><div class="stat-label">Resets in</div><div class="stat-value" id="stat-reset">—</div></div>
  </div>

  <h2>Per tool</h2>
  <div id="tools"><div class="empty">Loading…</div></div>

  <h2>Session history</h2>
  <div class="sessions-wrap">
    <table class="sessions-table">
      <thead>
        <tr>
          <th>Time</th><th>Tool</th><th>Model</th>
          <th>In</th><th>Out</th><th>Cost</th><th>Dur</th>
        </tr>
      </thead>
      <tbody id="sessions"></tbody>
    </table>
  </div>

  <div class="footer">
    <a id="settings-link">Open settings</a>
    <a id="export-link">Export CSV</a>
    <a id="refresh-link">Refresh</a>
  </div>

<script nonce="${nonce}">
(function () {
  const vscode = acquireVsCodeApi();

  function formatK(n) {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return (Math.round(n / 100000) / 10) + 'm';
    if (abs >= 10_000)    return Math.round(n / 1000) + 'k';
    if (abs >= 1_000)     return (Math.round(n / 100) / 10) + 'k';
    return String(Math.round(n));
  }
  function formatNum(n) {
    return (n || 0).toLocaleString('en-US');
  }
  function formatCurrency(n) {
    return '$' + (n || 0).toFixed(2);
  }
  function formatRelative(iso) {
    if (!iso) return 'never';
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    if (diff < 60000) return Math.floor(diff / 1000) + 's ago';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    return Math.floor(diff / 86400000) + 'd ago';
  }
  function pctClass(pct) {
    if (pct > 80) return 'high';
    if (pct >= 50) return 'mid';
    return 'low';
  }
  function daysUntil(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    const diff = d.getTime() - Date.now();
    if (diff <= 0) return '0d';
    return Math.ceil(diff / 86400000) + 'd';
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  let latestWeekly = [];
  let latestSessions = [];

  function renderOverview(tools) {
    let used = 0, limit = 0, cost = 0, soonest = null;
    tools.forEach(t => {
      if (!t.isConfigured) return;
      used += t.used || 0;
      limit += t.limit || 0;
      cost += t.costUSD || 0;
      if (t.resetDate) {
        const d = new Date(t.resetDate);
        if (!soonest || d < soonest) soonest = d;
      }
    });
    const remaining = Math.max(0, limit - used);
    document.getElementById('stat-used').textContent = formatK(used);
    document.getElementById('stat-remaining').textContent = formatK(remaining);
    document.getElementById('stat-cost').textContent = formatCurrency(cost);
    document.getElementById('stat-reset').textContent = soonest ? daysUntil(soonest.toISOString()) : '—';
  }

  function renderTools(tools) {
    const container = document.getElementById('tools');
    if (!tools || tools.length === 0) {
      container.innerHTML = '<div class="empty">No AI tools detected yet.</div>';
      return;
    }

    container.innerHTML = tools.map(tool => {
      const pct = tool.limit > 0 ? Math.min(100, Math.round((tool.used / tool.limit) * 100)) : 0;
      const cls = pctClass(pct);
      const status = tool.isConfigured
        ? (tool.isStale
            ? '<span class="warn-pill">stale</span>'
            : '<span class="muted">' + escapeHtml(formatRelative(tool.lastUsed)) + '</span>')
        : '<span class="error-pill">not configured</span>';

      return (
        '<div class="tool-row" data-tool="' + escapeHtml(tool.shortName) + '">' +
          '<div class="tool-head">' +
            '<span class="tool-name">' + escapeHtml(tool.name) + '</span>' +
            '<span class="badge">' + escapeHtml(tool.model || '—') + '</span>' +
            status +
          '</div>' +
          '<div class="progress"><div class="progress-fill ' + cls + '" style="width:' + pct + '%"></div></div>' +
          '<div class="tool-stats">' +
            '<span>' + pct + '%</span>' +
            '<span>' + formatNum(tool.used) + ' / ' + formatNum(tool.limit) + '</span>' +
            '<span>' + formatCurrency(tool.costUSD) + '</span>' +
          '</div>' +
          '<div class="tool-actions">' +
            '<button data-action="reset">Reset</button>' +
            '<button class="ghost" data-action="details">Details ▾</button>' +
            (tool.isConfigured ? '' : '<button data-action="configure">Configure</button>') +
          '</div>' +
          '<div class="tool-details">' +
            '<div class="chart-wrap"><canvas data-chart="' + escapeHtml(tool.shortName) + '"></canvas></div>' +
            '<div class="breakdown">' +
              '<div class="breakdown-cell"><div class="muted">Input</div><strong id="in-' + escapeHtml(tool.shortName) + '">—</strong></div>' +
              '<div class="breakdown-cell"><div class="muted">Output</div><strong id="out-' + escapeHtml(tool.shortName) + '">—</strong></div>' +
            '</div>' +
            '<div class="muted" style="margin-top:6px">Top sessions today</div>' +
            '<ol id="top-' + escapeHtml(tool.shortName) + '" style="margin:4px 0 0 16px;padding:0;font-size:11px"></ol>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    container.querySelectorAll('.tool-row').forEach(row => {
      const tool = row.getAttribute('data-tool');
      row.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', ev => {
          ev.stopPropagation();
          const action = btn.getAttribute('data-action');
          if (action === 'reset') {
            vscode.postMessage({ type: 'resetTool', toolName: tool });
          } else if (action === 'details') {
            row.classList.toggle('expanded');
            if (row.classList.contains('expanded')) drawChart(tool, row);
          } else if (action === 'configure') {
            vscode.postMessage({ type: 'configureKey', toolName: tool });
          }
        });
      });
    });
  }

  function renderSessions(sessions) {
    const tbody = document.getElementById('sessions');
    if (!sessions || sessions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="muted" style="text-align:center;padding:8px">No sessions recorded yet.</td></tr>';
      return;
    }
    tbody.innerHTML = sessions.slice(0, 50).map(s => {
      const t = new Date(s.timestamp);
      const hhmm = t.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      return (
        '<tr>' +
          '<td>' + escapeHtml(hhmm) + '</td>' +
          '<td>' + escapeHtml(s.tool) + '</td>' +
          '<td>' + escapeHtml(s.model || '—') + '</td>' +
          '<td>' + formatNum(s.inputTokens) + '</td>' +
          '<td>' + formatNum(s.outputTokens) + '</td>' +
          '<td>' + formatCurrency(s.costUSD) + '</td>' +
          '<td>' + Math.round((s.durationMs || 0) / 100) / 10 + 's</td>' +
        '</tr>'
      );
    }).join('');
  }

  function drawChart(tool, row) {
    const canvas = row.querySelector('canvas[data-chart]');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const days = {};
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days[key] = 0;
    }
    (latestWeekly || []).forEach(row => {
      if (row.tool === tool && days[row.date] !== undefined) {
        days[row.date] = row.totalTokens || 0;
      }
    });

    const values = Object.values(days);
    const max = Math.max(1, ...values);
    const keys = Object.keys(days);

    ctx.clearRect(0, 0, rect.width, rect.height);
    const pad = 4;
    const barW = (rect.width - pad * 2) / keys.length - 2;
    keys.forEach((k, i) => {
      const v = values[i];
      const h = (v / max) * (rect.height - pad * 2);
      const x = pad + i * ((rect.width - pad * 2) / keys.length) + 1;
      const y = rect.height - pad - h;
      const ratio = v / max;
      const color = ratio > 0.8 ? getComputedStyle(document.body).getPropertyValue('--error')
                 : ratio >= 0.5 ? getComputedStyle(document.body).getPropertyValue('--warn')
                                : getComputedStyle(document.body).getPropertyValue('--ok');
      ctx.fillStyle = color.trim() || '#4caf50';
      ctx.fillRect(x, y, barW, Math.max(1, h));
    });

    const todayRows = (latestWeekly || []).filter(r => r.tool === tool && r.date === keys[keys.length - 1]);
    const inTokens = todayRows.reduce((a, r) => a + (r.inputTokens || 0), 0);
    const outTokens = todayRows.reduce((a, r) => a + (r.outputTokens || 0), 0);
    const inEl = document.getElementById('in-' + tool);
    const outEl = document.getElementById('out-' + tool);
    if (inEl) inEl.textContent = formatNum(inTokens);
    if (outEl) outEl.textContent = formatNum(outTokens);

    const todaySessions = (latestSessions || [])
      .filter(s => s.tool === tool && s.timestamp.slice(0, 10) === keys[keys.length - 1])
      .sort((a, b) => (b.costUSD || 0) - (a.costUSD || 0))
      .slice(0, 5);
    const ol = document.getElementById('top-' + tool);
    if (ol) {
      ol.innerHTML = todaySessions.length
        ? todaySessions.map(s => '<li>' + escapeHtml(s.model || '—') + ' — ' + formatNum((s.inputTokens || 0) + (s.outputTokens || 0)) + ' tok · ' + formatCurrency(s.costUSD) + '</li>').join('')
        : '<li class="muted">none</li>';
    }
  }

  window.addEventListener('message', ev => {
    const msg = ev.data;
    if (!msg || msg.type !== 'update') return;
    latestWeekly = msg.weekly || [];
    latestSessions = msg.sessions || [];
    renderOverview(msg.data || []);
    renderTools(msg.data || []);
    renderSessions(msg.sessions || []);
  });

  document.getElementById('settings-link').addEventListener('click', () => vscode.postMessage({ type: 'openSettings' }));
  document.getElementById('export-link').addEventListener('click', () => vscode.postMessage({ type: 'exportCSV' }));
  document.getElementById('refresh-link').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));

  vscode.postMessage({ type: 'refresh' });
})();
</script>
</body>
</html>`;
}
