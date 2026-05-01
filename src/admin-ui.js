export function renderAdminHtml() {
  const svg = (body, size = 14) => '<svg class="icon-svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  const icons = {
    server: svg('<rect x="5" y="6" width="14" height="12" rx="2"></rect><path d="M8 10h8"></path><path d="M8 14h8"></path>', 24),
    play: svg('<path d="M8.5 6.5c0-1.05 1.15-1.68 2.02-1.09l6.55 4.45c1.25.85 1.25 3.43 0 4.28l-6.55 4.45c-.87.59-2.02-.04-2.02-1.09v-11z"></path>', 24),
    copy: svg('<rect x="9" y="9" width="11" height="11" rx="2"></rect><rect x="4" y="4" width="11" height="11" rx="2"></rect>'),
    eye: svg('<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"></path><circle cx="12" cy="12" r="3"></circle>'),
    folderPlus: svg('<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z"></path><path d="M12 10v6"></path><path d="M9 13h6"></path>'),
    database: svg('<ellipse cx="12" cy="5" rx="8" ry="3"></ellipse><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"></path><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"></path>'),
    refresh: svg('<g class="refresh-icon-swoosh"><path d="M19.8 9.5A7.7 7.7 0 0 0 6.1 6.4L4 8.7"></path><path d="M4 4.7v4h4"></path><path d="M4.2 14.5a7.7 7.7 0 0 0 13.7 3.1l2.1-2.3"></path><path d="M20 19.3v-4h-4"></path></g><g class="refresh-icon-spark"><path d="M12 3.2l.5 1 .95.5-.95.5-.5 1-.5-1-.95-.5.95-.5z" fill="currentColor" stroke="none"></path><circle cx="18.8" cy="5.9" r=".9" fill="currentColor" stroke="none"></circle></g>'),
    power: svg('<path d="M12 2v10"></path><path d="M18.4 6.6a9 9 0 1 1-12.8 0"></path>'),
    grid: svg('<rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect>'),
    square: svg('<rect x="5" y="5" width="14" height="14" rx="2"></rect>'),
    clock: svg('<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>'),
    calendar: svg('<rect x="3" y="4" width="18" height="17" rx="2"></rect><path d="M16 2v4"></path><path d="M8 2v4"></path><path d="M3 10h18"></path>'),
    activity: svg('<path d="M22 12h-4l-3 8-6-16-3 8H2"></path>'),
    key: svg('<circle cx="7.5" cy="15.5" r="4.5"></circle><path d="M11 12l9-9"></path><path d="M15 6l3 3"></path>'),
    diamond: svg('<path d="M12 3l9 9-9 9-9-9 9-9z"></path>'),
    upload: svg('<path d="M12 3v12"></path><path d="M7 8l5-5 5 5"></path><path d="M5 21h14"></path>'),
    trash: svg('<path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path>')
  };
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Codex API Gateway</title>
  <style>
    :root {
      color-scheme: dark;
      --bg-page: #070704;
      --bg-card: rgba(20, 18, 12, 0.88);
      --bg-secondary: rgba(26, 23, 15, 0.88);
      --bg-tertiary: rgba(37, 31, 19, 0.78);
      --bg-hover: rgba(108, 82, 31, 0.34);
      --border: rgba(218, 176, 71, 0.24);
      --border-light: rgba(218, 176, 71, 0.15);
      --text-primary: #f5efe1;
      --text-secondary: #c8bb98;
      --text-muted: #938662;
      --primary: #d4af37;
      --primary-light: rgba(212, 175, 55, 0.20);
      --accent: #f5d06f;
      --gold-soft: rgba(212, 175, 55, 0.12);
      --gold-line: rgba(245, 208, 111, 0.26);
      --success: #6ee7b7;
      --warning: #f5c451;
      --danger: #f87171;
      --radius-lg: 16px;
      --radius-md: 12px;
      --radius-sm: 10px;
      --radius-full: 999px;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      --shadow-sm: 0 10px 30px rgba(0, 0, 0, 0.34);
      --shadow-md: 0 22px 58px rgba(0, 0, 0, 0.48);
      --shadow-card: 0 18px 44px rgba(0, 0, 0, 0.36);
      --plan-plus-bg: linear-gradient(180deg, rgba(245, 208, 111, .22) 0%, rgba(212, 175, 55, .10) 100%);
      --plan-plus-color: #ffe08a;
      --plan-plus-border: rgba(245, 208, 111, 0.40);
      --plan-free-bg: rgba(255, 255, 255, .055);
      --plan-free-color: #b9ad8d;
      --plan-free-border: rgba(218, 176, 71, .17);
    }

    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; }
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--text-primary);
      background:
        radial-gradient(circle at 90% 4%, rgba(245, 208, 111, .16), transparent 30%),
        radial-gradient(circle at 5% 0%, rgba(176, 133, 47, .20), transparent 34%),
        radial-gradient(circle at 50% 100%, rgba(80, 57, 21, .20), transparent 45%),
        linear-gradient(135deg, #050505 0%, #0a0907 42%, #151007 100%);
    }

    .page {
      padding: 24px;
    }

    .app-header {
      display: flex;
      justify-content: center;
      margin: -6px 0 22px;
    }

    .codex-tab-nav {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px;
      border: 1px solid rgba(214, 224, 236, .78);
      border-radius: 24px;
      background: rgba(255, 255, 255, .82);
      box-shadow: 0 18px 42px rgba(30, 41, 59, .12);
      backdrop-filter: blur(16px);
    }

    .tab-btn {
      min-height: 42px;
      padding: 0 18px;
      border-radius: 16px;
      background: transparent;
      color: var(--text-secondary);
      gap: 8px;
    }

    .tab-btn.active {
      background: rgba(37, 99, 235, .10);
      color: var(--primary);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, .75);
    }

    .tab-page {
      display: none;
    }

    .tab-page.active {
      display: block;
    }

    .overview-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 20px;
      padding: 12px 16px;
      border: 1px solid var(--border);
      border-radius: 14px;
      background: rgba(255, 255, 255, .72);
      box-shadow: var(--shadow-sm);
      backdrop-filter: blur(14px);
    }

    .toolbar-left,
    .toolbar-right {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .filter-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 34px;
      padding: 0 12px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--bg-tertiary);
      color: var(--text-secondary);
      font-size: 13px;
      font-weight: 800;
    }

    .filter-pill.active {
      color: var(--primary);
      border-color: rgba(37, 99, 235, .22);
      background: rgba(37, 99, 235, .08);
    }

    .toolbar-hint,
    .panel-subtitle {
      margin: 4px 0 0;
      color: var(--text-muted);
      font-size: 12px;
      font-weight: 700;
    }

    .quota-auto-refresh {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      color: var(--text-secondary);
      font-size: 12px;
      font-weight: 800;
    }

    .quota-auto-refresh input[type="number"] {
      width: 74px;
      height: 34px;
      padding: 0 9px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: rgba(255, 255, 255, .76);
      color: var(--text-primary);
      font: 13px var(--font-mono);
    }

    .quota-auto-status {
      color: var(--text-muted);
      font-size: 12px;
      font-weight: 800;
    }

    .top-panel {
      max-width: 1580px;
      margin-bottom: 20px;
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 14px;
    }

    .wakeup-strip,
    .panel-card {
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      backdrop-filter: blur(14px);
    }

    .wakeup-strip {
      display: grid;
      grid-template-columns: minmax(220px, 0.9fr) minmax(360px, 2fr) auto;
      align-items: center;
      gap: 14px;
      padding: 14px 16px;
    }

    .strip-title {
      display: flex;
      align-items: center;
      min-width: 0;
      gap: 12px;
    }

    .strip-icon,
    .card-icon {
      width: 42px;
      height: 42px;
      border-radius: 12px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      background: rgba(14, 165, 233, 0.12);
      color: #0369a1;
      font-size: 20px;
      font-weight: 900;
    }

    .strip-title h2,
    .card-title h1 {
      margin: 0;
      font-size: 18px;
      line-height: 1.15;
      font-weight: 800;
      letter-spacing: -0.02em;
    }

    .strip-title p,
    .card-title p {
      margin: 4px 0 0;
      color: var(--text-muted);
      font-size: 12px;
      font-weight: 700;
    }

    .selected-pill,
    .status-pill,
    .current-tag,
    .member-tag,
    .default-tag,
    .tier-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-full);
      white-space: nowrap;
      line-height: 1;
    }

    .selected-pill,
    .status-pill {
      min-height: 30px;
      padding: 0 12px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border);
      color: var(--text-secondary);
      font-size: 12px;
      font-weight: 800;
    }

    .wakeup-form {
      display: grid;
      grid-template-columns: 145px minmax(180px, 1fr);
      gap: 10px;
      min-width: 0;
    }

    .input,
    .textarea {
      width: 100%;
      min-width: 0;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: rgba(255, 255, 255, 0.68);
      color: var(--text-primary);
      outline: none;
      font: 13px var(--font-mono);
      transition: border-color .18s ease, box-shadow .18s ease, background .18s ease;
    }

    .input {
      height: 38px;
      padding: 0 12px;
    }

    .textarea {
      height: 38px;
      min-height: 38px;
      max-height: 92px;
      padding: 10px 12px;
      resize: vertical;
      line-height: 1.35;
    }

    .input:focus,
    .textarea:focus {
      border-color: rgba(59, 130, 246, .45);
      box-shadow: 0 0 0 3px rgba(59, 130, 246, .10);
      background: #fff;
    }

    .strip-actions,
    .card-actions,
    .inline-actions {
      display: inline-flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      flex-wrap: wrap;
    }

    button {
      min-height: 34px;
      border: 1px solid transparent;
      border-radius: var(--radius-sm);
      padding: 0 12px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      background: var(--bg-tertiary);
      color: var(--text-secondary);
      font-size: 13px;
      font-weight: 800;
      cursor: pointer;
      transition: transform .18s ease, box-shadow .18s ease, background .18s ease, color .18s ease, border-color .18s ease;
    }

    button:hover:not(:disabled) {
      transform: translateY(-1px);
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    button:disabled {
      opacity: .55;
      cursor: not-allowed;
      transform: none;
    }

    button.primary {
      color: #fff;
      background: var(--primary);
      border-color: rgba(37, 99, 235, .2);
      box-shadow: 0 8px 18px rgba(37, 99, 235, .18);
    }

    button.primary:hover:not(:disabled) {
      background: #1d4ed8;
      color: #fff;
    }

    button.danger {
      color: #b91c1c;
      background: rgba(239, 68, 68, .10);
      border-color: rgba(239, 68, 68, .16);
    }

    .icon-svg {
      display: block;
      flex-shrink: 0;
    }

    .icon-btn {
      width: 32px;
      height: 32px;
      min-height: 32px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 10px;
      font-size: 15px;
      line-height: 1;
    }

    .icon-btn .icon-svg {
      width: 14px;
      height: 14px;
    }

    .refresh-icon-swoosh {
      transform-box: fill-box;
      transform-origin: center;
    }

    .refresh-icon-spark {
      transform-box: fill-box;
      transform-origin: center;
      opacity: .88;
    }

    button:hover:not(:disabled) .refresh-icon-swoosh {
      animation: refresh-spin-pop .72s cubic-bezier(.2, .8, .2, 1);
    }

    button:hover:not(:disabled) .refresh-icon-spark {
      animation: refresh-spark-pop .72s cubic-bezier(.2, .8, .2, 1);
    }

    @keyframes refresh-spin-pop {
      0% { transform: rotate(0deg) scale(1); }
      55% { transform: rotate(210deg) scale(1.08); }
      100% { transform: rotate(360deg) scale(1); }
    }

    @keyframes refresh-spark-pop {
      0%, 100% { opacity: .72; transform: scale(.86); }
      45% { opacity: 1; transform: scale(1.22); }
    }

    .strip-icon .icon-svg,
    .card-icon .icon-svg {
      width: 24px;
      height: 24px;
    }

    .codex-accounts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 20px;
      align-items: stretch;
    }

    .as-contents { display: contents; }

    .ghcp-account-card {
      height: var(--overview-card-height, 452px);
      min-height: var(--overview-card-height, 452px);
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 20px;
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      backdrop-filter: blur(10px);
      transition: transform .22s ease, box-shadow .22s ease, border-color .22s ease, background .22s ease;
      overflow: hidden;
    }

    .ghcp-account-card:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-md);
    }

    .ghcp-account-card.current {
      border-color: var(--primary);
      box-shadow: 0 0 0 2px var(--primary-light), var(--shadow-md);
    }

    .ghcp-account-card.selected:not(.current) {
      border-color: rgba(37, 99, 235, .42);
      background: rgba(37, 99, 235, .04);
    }

    .codex-local-access-card {
      background: linear-gradient(135deg, #f5fbff 0%, #eef7ff 45%, #edfdf8 100%);
      border: 1.5px solid rgba(14, 165, 233, .18);
    }

    .codex-local-access-card:hover {
      border-color: rgba(14, 165, 233, .38);
      box-shadow: 0 14px 30px rgba(14, 165, 233, .12);
    }

    .wakeup-service-card {
      background:
        radial-gradient(circle at top right, rgba(59, 130, 246, .10), transparent 40%),
        var(--bg-card);
    }

    .wakeup-card-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      min-width: 0;
    }

    .wakeup-service-card .strip-title {
      align-items: center;
      gap: 12px;
    }

    .wakeup-service-card .wakeup-form {
      grid-template-columns: 1fr;
      gap: 12px;
    }

    .wakeup-service-card .textarea {
      height: 84px;
      min-height: 84px;
    }

    .wakeup-hint {
      margin: 0;
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.45;
      font-weight: 700;
      text-align: center;
    }

    .wakeup-service-card .strip-actions {
      justify-content: flex-end;
    }

    .codex-wakeup-content {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .codex-wakeup-hero {
      display: block;
      padding: 28px 30px;
      border: 1px solid var(--border);
      border-radius: 20px;
      background:
        radial-gradient(circle at top right, rgba(59, 130, 246, .12), transparent 38%),
        linear-gradient(135deg, rgba(15, 23, 42, .03), rgba(15, 23, 42, .01)),
        var(--bg-card);
      box-shadow: var(--shadow-sm);
      backdrop-filter: blur(14px);
    }

    .codex-wakeup-hero-copy h2 {
      margin: 12px 0 8px;
      font-size: 28px;
      line-height: 1.15;
      letter-spacing: -0.03em;
    }

    .codex-wakeup-hero-copy p {
      margin: 0;
      max-width: 980px;
      color: var(--text-secondary);
      line-height: 1.55;
      font-weight: 600;
    }

    .codex-wakeup-runtime-badge {
      display: inline-flex;
      align-items: center;
      padding: 6px 10px;
      border-radius: var(--radius-full);
      font-size: 12px;
      font-weight: 800;
      color: #0f766e;
      background: rgba(16, 185, 129, .12);
    }

    .codex-wakeup-stats {
      display: grid;
      grid-template-columns: repeat(3, minmax(160px, 220px));
      gap: 12px;
      margin-top: 18px;
      max-width: 720px;
    }

    .codex-wakeup-stat {
      padding: 14px 16px;
      border-radius: 16px;
      background: rgba(255, 255, 255, .70);
      border: 1px solid rgba(148, 163, 184, .16);
    }

    .codex-wakeup-stat span {
      display: block;
      margin-bottom: 6px;
      color: var(--text-muted);
      font-size: 12px;
      font-weight: 800;
    }

    .codex-wakeup-stat strong {
      font-size: 24px;
      line-height: 1;
      color: var(--text-primary);
    }

    .codex-wakeup-runtime-card {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 18px;
      border: 1px solid var(--border-light);
      border-radius: var(--radius-lg);
      background: rgba(255, 255, 255, .74);
    }

    .codex-wakeup-runtime-card .textarea {
      min-height: 92px;
      height: 92px;
    }

    .form-label {
      color: var(--text-secondary);
      font-size: 12px;
      font-weight: 900;
    }

    .wakeup-actions-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 8px;
    }

    .schedule-card {
      margin-top: 14px;
      padding: 16px;
      border: 1px solid var(--border-light);
      border-radius: var(--radius-lg);
      background: rgba(248, 252, 255, .76);
    }

    .schedule-card-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 12px;
    }

    .schedule-switch {
      margin: 0;
      gap: 8px;
    }

    .schedule-mode-pill {
      min-height: 28px;
      display: inline-flex;
      align-items: center;
      padding: 0 10px;
      border: 1px solid var(--border-light);
      border-radius: var(--radius-full);
      color: var(--text-secondary);
      background: var(--bg-tertiary);
      font-size: 12px;
      font-weight: 900;
      white-space: nowrap;
    }

    .daily-schedule-row {
      display: grid;
      grid-template-columns: minmax(170px, 220px) auto auto auto;
      gap: 10px;
      align-items: end;
    }

    .schedule-status {
      margin-top: 10px;
      padding: 10px 12px;
      border-radius: var(--radius-md);
      background: rgba(235, 242, 250, .72);
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.65;
      white-space: normal;
    }

    .wakeup-task-layout {
      display: grid;
      grid-template-columns: minmax(360px, .78fr) minmax(520px, 1.22fr);
      gap: 20px;
      align-items: start;
    }

    .wakeup-right-stack {
      display: flex;
      flex-direction: column;
      gap: 20px;
      min-width: 0;
    }

    .wakeup-panel {
      min-height: 260px;
    }

    .wakeup-account-list,
    .wakeup-status-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 14px;
    }

    .wakeup-account-row,
    .wakeup-status-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px;
      border: 1px solid var(--border-light);
      border-radius: var(--radius-md);
      background: rgba(248, 251, 255, .72);
    }

    .wakeup-account-row {
      cursor: pointer;
    }

    .wakeup-account-row.selected {
      border-color: rgba(37, 99, 235, .35);
      background: rgba(37, 99, 235, .07);
    }

    .wakeup-account-main,
    .wakeup-status-main {
      min-width: 0;
      flex: 1;
    }

    .wakeup-account-title,
    .wakeup-status-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-width: 0;
      font-weight: 900;
    }

    .wakeup-account-meta,
    .wakeup-status-meta {
      margin-top: 4px;
      color: var(--text-secondary);
      font: 12px var(--font-mono);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .result-pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 22px;
      padding: 0 8px;
      border-radius: var(--radius-full);
      font-size: 11px;
      font-weight: 900;
      background: rgba(16, 185, 129, .12);
      color: #0f766e;
    }

    .result-pill.fail {
      background: rgba(239, 68, 68, .10);
      color: #b91c1c;
    }

    .empty-state {
      padding: 28px 14px;
      text-align: center;
      color: var(--text-muted);
      border: 1px dashed var(--border);
      border-radius: var(--radius-md);
      background: rgba(248, 251, 255, .54);
      font-weight: 800;
    }

    .codex-app-layout {
      display: grid;
      grid-template-columns: minmax(360px, .95fr) minmax(360px, 1.05fr);
      gap: 20px;
      align-items: start;
    }

    .codex-app-hero {
      grid-column: span 1;
      background: linear-gradient(135deg, #f5fbff 0%, #eef7ff 45%, #edfdf8 100%);
      border-color: rgba(14, 165, 233, .20);
    }

    .codex-app-accounts {
      grid-column: 1 / -1;
    }

    .codex-path-grid {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 16px;
    }

    .path-row {
      display: grid;
      grid-template-columns: 110px minmax(0, 1fr);
      gap: 10px;
      align-items: center;
      padding: 10px 12px;
      border: 1px solid var(--border-light);
      border-radius: var(--radius-md);
      background: rgba(255, 255, 255, .56);
    }

    .path-row span {
      color: var(--text-secondary);
      font-size: 12px;
      font-weight: 900;
    }

    .path-row code {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: var(--font-mono);
      color: var(--text-primary);
      font-size: 12px;
    }

    .codex-app-note {
      margin-top: 16px;
      padding: 12px;
      border: 1px solid rgba(37, 99, 235, .12);
      border-radius: var(--radius-md);
      color: var(--text-secondary);
      background: rgba(37, 99, 235, .06);
      font-size: 13px;
      line-height: 1.5;
      font-weight: 700;
    }

    .switch-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 16px 0 12px;
      color: var(--text-primary);
      font-weight: 800;
    }

    .codex-app-account-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 12px;
      margin-top: 14px;
    }

    .codex-app-account-card {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 14px;
      border: 1px solid var(--border-light);
      border-radius: var(--radius-md);
      background: rgba(248, 251, 255, .72);
    }

    .codex-app-account-card.active {
      border-color: var(--primary);
      box-shadow: 0 0 0 2px var(--primary-light);
      background: rgba(37, 99, 235, .05);
    }

    .codex-app-account-card.api-member {
      border-color: rgba(37, 99, 235, .20);
      background: rgba(37, 99, 235, .035);
    }

    .codex-app-account-card .account-email {
      font-size: 14px;
    }

    .card-head,
    .account-top,
    .card-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      min-width: 0;
    }

    .card-head {
      align-items: flex-start;
    }

    .card-brand {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }

    .card-title {
      min-width: 0;
    }

    .close-mark {
      color: var(--text-muted);
      font-size: 20px;
      line-height: 1;
    }

    .config-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 4px;
    }

    .config-row {
      display: grid;
      grid-template-columns: 42px minmax(0, 1fr) auto auto;
      align-items: center;
      gap: 8px;
      min-height: 30px;
    }

    .label {
      color: var(--text-secondary);
      font-size: 12px;
    }

    .code {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--text-primary);
    }

    .local-note {
      margin: 12px 0 0;
      text-align: center;
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.45;
      font-weight: 700;
    }

    .add-btn {
      align-self: center;
      min-height: 34px;
      margin-top: 2px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      border-radius: var(--radius-full);
      border-color: rgba(14, 165, 233, .34);
      background: rgba(56, 189, 248, .14);
      color: #0369a1;
    }

    .api-pool-card {
      min-height: 320px;
    }

    .api-pool-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 12px;
      max-height: 220px;
      overflow: auto;
      padding-right: 2px;
    }

    .api-pool-row {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: 10px;
      padding: 11px 12px;
      border: 1px solid var(--border-light);
      border-radius: 14px;
      background: rgba(248, 251, 255, .74);
      cursor: pointer;
      transition: .16s ease;
    }

    .api-pool-row:hover {
      border-color: rgba(37, 99, 235, .24);
      background: rgba(37, 99, 235, .05);
    }

    .api-pool-row.selected {
      border-color: rgba(37, 99, 235, .52);
      background: rgba(37, 99, 235, .10);
      box-shadow: inset 0 0 0 1px rgba(37, 99, 235, .12);
    }

    .api-pool-main {
      min-width: 0;
    }

    .api-pool-email {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 850;
      color: var(--text-primary);
    }

    .api-pool-meta {
      margin-top: 4px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--text-secondary);
      font-size: 12px;
    }

    .api-pool-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 12px;
    }

    .api-pool-hint {
      margin-top: 10px;
      color: var(--text-muted);
      font-size: 12px;
      line-height: 1.5;
    }

    .local-access-members {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-height: 70px;
      margin-top: 4px;
    }

    .local-access-member-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto auto;
      align-items: center;
      gap: 8px;
      min-height: 28px;
      color: var(--text-secondary);
      font-size: 12px;
      font-weight: 800;
    }

    .local-access-member-email {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--text-primary);
    }

    .local-access-member-empty {
      margin: auto 0;
      padding: 16px 8px;
      border: 1px dashed var(--border-light);
      border-radius: var(--radius-md);
      text-align: center;
      color: var(--text-muted);
      font-size: 12px;
      font-weight: 800;
      background: rgba(248, 251, 255, .50);
    }

    .modal-overlay {
      position: fixed;
      inset: 0;
      z-index: 40;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 22px;
      background: rgba(15, 23, 42, .42);
      backdrop-filter: blur(8px);
    }

    .modal-overlay.show { display: flex; }

    .modal {
      width: min(980px, 100%);
      max-height: min(860px, calc(100vh - 44px));
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid rgba(219, 226, 238, .9);
      border-radius: 28px;
      background: rgba(255, 255, 255, .96);
      box-shadow: 0 28px 80px rgba(15, 23, 42, .26);
    }

    .modal-header,
    .modal-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 22px 28px;
      border-bottom: 1px solid var(--border-light);
    }

    .modal-footer {
      justify-content: flex-end;
      border-top: 1px solid var(--border-light);
      border-bottom: 0;
      background: rgba(248, 251, 255, .78);
    }

    .modal-title {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 0;
      font-size: 26px;
      letter-spacing: -0.03em;
    }

    .modal-body {
      overflow: auto;
      padding: 22px 28px;
      background: linear-gradient(180deg, rgba(248, 251, 255, .74), rgba(255, 255, 255, .92));
    }

    .api-pool-modal .api-pool-list {
      max-height: min(420px, 52vh);
      padding-right: 8px;
    }

    .account-add-modal {
      width: min(560px, 100%);
    }

    .export-format-modal {
      width: min(620px, 100%);
    }

    .export-format-body {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .export-format-help,
    .import-format-help,
    .export-token-warning {
      padding: 12px 14px;
      border-radius: var(--radius-md);
      border: 1px solid var(--border-light);
      background: rgba(248, 251, 255, .82);
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.55;
      font-weight: 700;
    }

    .export-token-warning {
      border-color: rgba(245, 196, 81, .28);
      background: rgba(245, 196, 81, .10);
      color: #9a5b00;
    }

    .account-add-tabs {
      display: flex;
      gap: 6px;
      padding: 4px;
      margin-bottom: 18px;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: var(--bg-tertiary);
    }

    .account-add-tab {
      flex: 1;
      justify-content: center;
      min-height: 36px;
      border-radius: 10px;
      box-shadow: none;
      background: transparent;
    }

    .account-add-tab.active {
      color: #fff;
      border-color: transparent;
      background: linear-gradient(135deg, var(--primary), #4f46e5);
      box-shadow: 0 8px 20px rgba(37, 99, 235, .18);
    }

    .account-add-section {
      display: none;
      flex-direction: column;
      gap: 12px;
    }

    .account-add-section.active {
      display: flex;
    }

    .section-desc {
      margin: 0;
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.6;
    }

    .oauth-url-box {
      display: flex;
      gap: 8px;
      min-width: 0;
    }

    .oauth-url-box input {
      flex: 1;
      min-width: 0;
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: rgba(255, 255, 255, .76);
      color: var(--text-primary);
      font: 12px var(--font-mono);
      outline: none;
    }

    .oauth-status {
      display: none;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      border-radius: var(--radius-md);
      border: 1px solid var(--border-light);
      background: rgba(248, 251, 255, .8);
      color: var(--text-secondary);
      font-size: 13px;
      font-weight: 800;
      line-height: 1.5;
    }

    .oauth-status.show { display: flex; }
    .oauth-status.success { color: #08785a; border-color: rgba(34, 197, 94, .24); background: rgba(34, 197, 94, .08); }
    .oauth-status.error { color: #b91c1c; border-color: rgba(239, 68, 68, .22); background: rgba(239, 68, 68, .08); }

    .api-pool-row.disabled {
      cursor: not-allowed;
      opacity: .55;
    }

    .api-pool-row.disabled input {
      cursor: not-allowed;
    }

    .stats-modal {
      width: min(1120px, 100%);
    }

    .stats-header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .stats-range-tabs {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px;
      border: 1px solid var(--border);
      border-radius: var(--radius-full);
      background: rgba(255, 255, 255, .78);
    }

    .stats-range-tabs button {
      min-height: 34px;
      padding: 0 14px;
      border: 0;
      border-radius: var(--radius-full);
      background: transparent;
      box-shadow: none;
      color: var(--text-secondary);
      font-weight: 900;
    }

    .stats-range-tabs button.active {
      color: var(--accent);
      background: rgba(37, 99, 235, .12);
    }

    .stats-section {
      margin-bottom: 22px;
      padding: 22px;
      border: 1px solid var(--border-light);
      border-radius: 24px;
      background: rgba(255, 255, 255, .78);
      box-shadow: var(--shadow-card);
    }

    .stats-section-title {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 0 0 16px;
      font-size: 18px;
      font-weight: 950;
      letter-spacing: -0.02em;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 14px;
    }

    .stats-metric {
      min-height: 112px;
      padding: 18px;
      border: 1px solid rgba(148, 163, 184, .28);
      border-top: 3px solid rgba(37, 99, 235, .30);
      border-radius: 18px;
      background: linear-gradient(180deg, rgba(255, 255, 255, .96), rgba(248, 251, 255, .88));
    }

    .stats-metric.teal { border-top-color: rgba(20, 184, 166, .48); }
    .stats-metric.purple { border-top-color: rgba(168, 85, 247, .44); }
    .stats-metric.orange { border-top-color: rgba(245, 158, 11, .48); }

    .stats-metric-label {
      color: var(--accent);
      font-size: 13px;
      font-weight: 900;
    }

    .stats-metric.teal .stats-metric-label { color: #0f766e; }
    .stats-metric.purple .stats-metric-label { color: #7c3aed; }
    .stats-metric.orange .stats-metric-label { color: #b45309; }

    .stats-metric-value {
      margin-top: 10px;
      color: var(--text-primary);
      font-size: 30px;
      line-height: 1;
      font-weight: 950;
      letter-spacing: -0.04em;
    }

    .stats-metric-sub {
      margin-top: 10px;
      color: var(--text-muted);
      font-size: 13px;
      font-weight: 850;
    }

    .stats-config-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px;
    }

    .stats-config-card {
      padding: 16px;
      border: 1px solid var(--border-light);
      border-radius: 18px;
      background: rgba(255, 255, 255, .72);
    }

    .stats-config-label {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 10px;
      color: var(--text-secondary);
      font-weight: 900;
    }

    .stats-config-value {
      min-height: 42px;
      display: flex;
      align-items: center;
      padding: 0 14px;
      border: 1px solid var(--border-light);
      border-radius: 14px;
      background: rgba(248, 251, 255, .82);
      color: var(--text-primary);
      font-family: var(--font-mono);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .stats-account-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .stats-account-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto auto auto;
      align-items: center;
      gap: 12px;
      min-height: 52px;
      padding: 12px 16px;
      border: 1px solid var(--border-light);
      border-radius: 16px;
      background: rgba(255, 255, 255, .78);
      font-weight: 850;
    }

    .stats-account-main {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--text-primary);
    }

    .stats-pill {
      display: inline-flex;
      align-items: center;
      min-height: 28px;
      padding: 0 12px;
      border: 1px solid var(--border-light);
      border-radius: var(--radius-full);
      background: rgba(248, 251, 255, .82);
      color: var(--text-secondary);
      font-size: 12px;
      font-weight: 900;
      white-space: nowrap;
    }

    .modal-toolbar {
      display: grid;
      grid-template-columns: minmax(220px, 1fr) auto auto;
      gap: 10px;
      align-items: center;
      margin-bottom: 14px;
    }

    .modal-toolbar input[type="search"] {
      width: 100%;
      min-height: 42px;
      padding: 0 14px;
      border: 1px solid var(--border);
      border-radius: 16px;
      outline: none;
      background: rgba(255, 255, 255, .82);
      color: var(--text-primary);
      font: inherit;
      font-weight: 750;
    }

    .modal-toggle {
      min-height: 42px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 0 14px;
      border: 1px solid var(--border);
      border-radius: var(--radius-full);
      color: var(--text-secondary);
      background: rgba(255, 255, 255, .70);
      font-size: 13px;
      font-weight: 850;
      white-space: nowrap;
    }

    .card-footer {
      margin-top: auto;
      padding-top: 12px;
      border-top: 1px solid var(--border-light);
    }

    .footer-note,
    .card-date {
      color: var(--text-muted);
      font-size: 12px;
      font-family: var(--font-mono);
      white-space: nowrap;
    }

    .account-top {
      align-items: flex-start;
      margin-bottom: 12px;
    }

    .account-title {
      display: flex;
      align-items: center;
      min-width: 0;
      gap: 10px;
    }

    input[type="checkbox"] {
      width: 18px;
      height: 18px;
      margin: 0;
      accent-color: var(--primary);
      cursor: pointer;
      flex-shrink: 0;
    }

    .account-email {
      flex: 1;
      min-width: 0;
      max-width: none;
      color: var(--text-primary);
      font-size: 15px;
      font-weight: 800;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      letter-spacing: -0.01em;
    }

    .badges {
      display: inline-flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      flex-shrink: 0;
      flex-wrap: wrap;
    }

    .current-tag {
      min-height: 24px;
      padding: 0 9px;
      background: var(--success);
      color: #fff;
      font-size: 11px;
      font-weight: 800;
    }

    .member-tag {
      position: relative;
      min-height: 24px;
      padding: 0 11px 0 22px;
      border: 1px solid rgba(37, 99, 235, .18);
      background:
        linear-gradient(180deg, rgba(239, 246, 255, .98), rgba(219, 234, 254, .86));
      color: #1d4ed8;
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, .85),
        0 4px 12px rgba(37, 99, 235, .10);
      font-size: 11px;
      font-weight: 900;
      letter-spacing: .01em;
    }

    .member-tag::before {
      content: '';
      position: absolute;
      left: 10px;
      width: 6px;
      height: 6px;
      border-radius: 999px;
      background: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, .14);
    }

    .default-tag {
      min-height: 24px;
      padding: 0 10px;
      border: 1px solid rgba(148, 163, 184, .24);
      background: rgba(148, 163, 184, .10);
      color: var(--text-secondary);
      font-size: 11px;
      font-weight: 900;
      letter-spacing: .01em;
    }

    .tier-badge {
      min-height: 24px;
      min-width: 58px;
      padding: 0 12px;
      font-size: 12px;
      font-weight: 900;
      letter-spacing: .025em;
      text-transform: uppercase;
      border: 1px solid var(--plan-plus-border);
      background: var(--plan-plus-bg);
      color: var(--plan-plus-color);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, .82),
        0 5px 14px rgba(16, 185, 129, .12);
    }

    .tier-badge.free {
      background: var(--plan-free-bg);
      color: var(--plan-free-color);
      border-color: var(--plan-free-border);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, .72),
        0 4px 10px rgba(71, 85, 105, .08);
    }

    .account-meta {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-height: 50px;
      margin-bottom: 10px;
    }

    .small-line {
      min-width: 0;
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.35;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .small-line b {
      color: var(--text-primary);
      font-weight: 800;
    }

    .ghcp-quota-section {
      display: flex;
      flex-direction: column;
      gap: 14px;
      min-height: 124px;
    }

    .quota-item {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .quota-header {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--text-secondary);
      font-size: 13px;
    }

    .quota-label {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .quota-pct {
      font-size: 16px;
      font-weight: 900;
      color: var(--success);
    }

    .quota-pct.warn { color: var(--warning); }
    .quota-pct.danger { color: var(--danger); }

    .quota-bar-track {
      height: 6px;
      border-radius: 3px;
      background: var(--bg-tertiary);
      overflow: hidden;
    }

    .quota-bar {
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, #22c55e, #16a34a);
      transition: width .25s ease;
    }

    .quota-bar.warn { background: linear-gradient(90deg, #f59e0b, #d97706); }
    .quota-bar.danger { background: linear-gradient(90deg, #ef4444, #dc2626); }

    .quota-reset {
      min-height: 15px;
      text-align: right;
      color: var(--text-secondary);
      font: 12px var(--font-mono);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .sub-box {
      min-height: 40px;
      margin-top: 4px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 9px 12px;
      border-radius: var(--radius-sm);
      border: 1px solid rgba(20, 184, 166, .28);
      background: rgba(16, 185, 129, .10);
      color: #08785a;
      font-size: 13px;
      font-weight: 900;
    }

    .sub-box > span,
    .sub-box.missing {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .sub-box .date {
      color: var(--text-secondary);
      font: 12px var(--font-mono);
      font-weight: 800;
    }

    .sub-box.warn {
      color: #b45309;
      background: rgba(245, 158, 11, .10);
      border-color: rgba(245, 158, 11, .28);
    }

    .sub-box.missing {
      justify-content: flex-start;
      color: var(--text-secondary);
      background: var(--bg-tertiary);
      border-color: var(--border);
    }

    .panel {
      display: none;
      max-width: 940px;
      margin-top: 18px;
    }

    .panel.show { display: block; }

    .panel-card {
      padding: 18px;
    }

    .panel-card h2 {
      margin: 0;
      font-size: 18px;
      letter-spacing: -0.02em;
    }

    .import-textarea {
      width: 100%;
      min-height: 130px;
      margin-top: 12px;
      padding: 12px;
      resize: vertical;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: rgba(255, 255, 255, .7);
      color: var(--text-primary);
      outline: none;
      font: 12px var(--font-mono);
    }

    pre {
      min-height: 90px;
      max-height: 300px;
      margin: 12px 0 0;
      padding: 14px;
      overflow: auto;
      border-radius: var(--radius-md);
      background: #0b1220;
      color: #dbeafe;
      white-space: pre-wrap;
      font-size: 12px;
    }

    .toast {
      position: fixed;
      right: 20px;
      bottom: 20px;
      z-index: 20;
      padding: 11px 14px;
      border-radius: var(--radius-md);
      background: #111827;
      color: #fff;
      opacity: 0;
      transform: translateY(8px);
      transition: .2s ease;
      box-shadow: var(--shadow-md);
    }

    .toast.show {
      opacity: 1;
      transform: translateY(0);
    }

    /* Dark gold theme refinements */
    ::selection {
      color: #120f08;
      background: rgba(245, 208, 111, .82);
    }

    * {
      scrollbar-color: rgba(212, 175, 55, .48) rgba(12, 10, 7, .72);
    }

    *::-webkit-scrollbar {
      width: 10px;
      height: 10px;
    }

    *::-webkit-scrollbar-track {
      background: rgba(12, 10, 7, .72);
    }

    *::-webkit-scrollbar-thumb {
      border: 2px solid rgba(12, 10, 7, .72);
      border-radius: 999px;
      background: linear-gradient(180deg, rgba(245, 208, 111, .72), rgba(154, 112, 34, .68));
    }

    .codex-tab-nav,
    .overview-toolbar,
    .wakeup-strip,
    .panel-card,
    .ghcp-account-card,
    .modal,
    .stats-section {
      border-color: var(--border);
      background:
        linear-gradient(180deg, rgba(30, 26, 17, .92), rgba(15, 13, 9, .88));
      box-shadow:
        inset 0 1px 0 rgba(245, 208, 111, .08),
        var(--shadow-sm);
    }

    .codex-tab-nav {
      background:
        linear-gradient(180deg, rgba(31, 27, 18, .92), rgba(10, 9, 7, .86));
      box-shadow:
        inset 0 1px 0 rgba(245, 208, 111, .10),
        0 18px 46px rgba(0, 0, 0, .40);
    }

    .tab-btn.active,
    .stats-range-tabs button.active {
      color: var(--accent);
      background: rgba(212, 175, 55, .14);
      box-shadow: inset 0 1px 0 rgba(245, 208, 111, .16);
    }

    .filter-pill,
    .selected-pill,
    .status-pill,
    .account-add-tabs,
    .stats-range-tabs,
    .modal-toggle,
    .stats-pill {
      border-color: var(--border-light);
      background: rgba(24, 21, 14, .82);
      color: var(--text-secondary);
    }

    .filter-pill.active {
      color: var(--accent);
      border-color: rgba(245, 208, 111, .36);
      background: rgba(212, 175, 55, .12);
    }

    #localAccessStatus {
      position: relative;
      min-height: 34px;
      padding: 0 14px 0 30px;
      border-width: 1.5px;
      letter-spacing: .01em;
      transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease, background .18s ease, color .18s ease;
    }

    #localAccessStatus::before {
      content: '';
      position: absolute;
      left: 13px;
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: var(--text-muted);
      box-shadow: 0 0 0 3px rgba(147, 134, 98, .14);
    }

    #localAccessStatus.live {
      color: #171207;
      border-color: rgba(255, 232, 150, .72);
      background:
        radial-gradient(circle at 22% 20%, rgba(255, 250, 210, .72), transparent 34%),
        linear-gradient(135deg, #fff1b8 0%, #f5d06f 42%, #d4af37 70%, #9f6f18 100%);
      box-shadow:
        0 0 0 2px rgba(212, 175, 55, .16),
        0 0 24px rgba(245, 208, 111, .30),
        inset 0 1px 0 rgba(255, 255, 255, .38);
      transform: translateY(-1px);
      text-shadow: 0 1px 0 rgba(255, 248, 218, .35);
    }

    #localAccessStatus.live::before {
      background: #113016;
      box-shadow:
        0 0 0 3px rgba(17, 48, 22, .12),
        0 0 14px rgba(17, 48, 22, .35);
    }

    .strip-icon,
    .card-icon {
      background:
        radial-gradient(circle at 35% 25%, rgba(255, 235, 160, .35), transparent 42%),
        linear-gradient(135deg, rgba(245, 208, 111, .24), rgba(116, 84, 25, .20));
      color: #f5d06f;
      box-shadow:
        inset 0 0 0 1px rgba(245, 208, 111, .18),
        0 10px 22px rgba(0, 0, 0, .28);
    }

    .input,
    .textarea,
    .import-textarea,
    .quota-auto-refresh input[type="number"],
    .oauth-url-box input,
    .modal-toolbar input[type="search"] {
      border-color: var(--border-light);
      background: rgba(10, 9, 7, .72);
      color: var(--text-primary);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, .03);
    }

    .input::placeholder,
    .textarea::placeholder,
    .import-textarea::placeholder,
    .modal-toolbar input[type="search"]::placeholder {
      color: rgba(200, 187, 152, .52);
    }

    .input:focus,
    .textarea:focus,
    .import-textarea:focus,
    .oauth-url-box input:focus,
    .modal-toolbar input[type="search"]:focus {
      border-color: rgba(245, 208, 111, .48);
      background: rgba(17, 14, 9, .92);
      box-shadow:
        0 0 0 3px rgba(212, 175, 55, .14),
        inset 0 1px 0 rgba(245, 208, 111, .08);
    }

    button {
      border-color: var(--border-light);
      background: rgba(31, 27, 18, .86);
      color: var(--text-secondary);
      box-shadow: inset 0 1px 0 rgba(245, 208, 111, .05);
    }

    button:hover:not(:disabled) {
      background: rgba(72, 55, 22, .48);
      color: var(--text-primary);
      border-color: rgba(245, 208, 111, .30);
      box-shadow:
        inset 0 1px 0 rgba(245, 208, 111, .10),
        0 8px 18px rgba(0, 0, 0, .26);
    }

    button.primary,
    .account-add-tab.active {
      color: #151006;
      border-color: rgba(245, 208, 111, .56);
      background:
        linear-gradient(135deg, #ffe08a 0%, #d4af37 48%, #a5751d 100%);
      box-shadow:
        inset 0 1px 0 rgba(255, 247, 210, .42),
        0 10px 24px rgba(212, 175, 55, .22);
    }

    button.primary:hover:not(:disabled),
    .account-add-tab.active:hover:not(:disabled) {
      color: #120f08;
      background:
        linear-gradient(135deg, #fff1b8 0%, #e4bd43 50%, #b98724 100%);
    }

    button.danger {
      color: #ffb4b4;
      background: rgba(127, 29, 29, .20);
      border-color: rgba(248, 113, 113, .24);
    }

    .ghcp-account-card {
      position: relative;
      background:
        radial-gradient(circle at 100% 0%, rgba(245, 208, 111, .10), transparent 34%),
        linear-gradient(180deg, rgba(29, 25, 16, .92), rgba(13, 12, 8, .90));
    }

    .ghcp-account-card::before {
      content: '';
      position: absolute;
      inset: 0 0 auto 0;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(245, 208, 111, .44), transparent);
      opacity: .72;
      pointer-events: none;
    }

    .ghcp-account-card:hover {
      border-color: rgba(245, 208, 111, .34);
      box-shadow:
        inset 0 1px 0 rgba(245, 208, 111, .08),
        var(--shadow-md);
    }

    .ghcp-account-card.current {
      border-color: rgba(245, 208, 111, .74);
      box-shadow:
        0 0 0 2px rgba(212, 175, 55, .18),
        0 22px 58px rgba(0, 0, 0, .48);
    }

    .ghcp-account-card.selected:not(.current),
    .wakeup-account-row.selected,
    .api-pool-row.selected,
    .codex-app-account-card.active {
      border-color: rgba(245, 208, 111, .48);
      background:
        radial-gradient(circle at 100% 0%, rgba(245, 208, 111, .12), transparent 42%),
        rgba(43, 34, 16, .62);
      box-shadow: inset 0 0 0 1px rgba(212, 175, 55, .12);
    }

    .codex-app-account-card.api-member:not(.active) {
      border-color: rgba(245, 208, 111, .24);
      background:
        radial-gradient(circle at 100% 0%, rgba(245, 208, 111, .08), transparent 42%),
        rgba(29, 24, 13, .50);
    }

    .codex-local-access-card,
    .codex-app-hero,
    .wakeup-service-card,
    .codex-wakeup-hero {
      border-color: rgba(245, 208, 111, .24);
      background:
        radial-gradient(circle at 96% 0%, rgba(245, 208, 111, .16), transparent 36%),
        radial-gradient(circle at 0% 100%, rgba(176, 133, 47, .12), transparent 42%),
        linear-gradient(135deg, rgba(31, 27, 18, .94), rgba(12, 11, 8, .92));
    }

    .codex-local-access-card:hover {
      border-color: rgba(245, 208, 111, .42);
      box-shadow: 0 18px 44px rgba(0, 0, 0, .42);
    }

    .codex-wakeup-runtime-badge,
    .result-pill,
    .sub-box {
      color: #9ff0cf;
      border-color: rgba(110, 231, 183, .22);
      background: rgba(16, 185, 129, .10);
    }

    .result-pill.fail,
    .oauth-status.error {
      color: #ffb4b4;
      border-color: rgba(248, 113, 113, .24);
      background: rgba(127, 29, 29, .18);
    }

    .codex-wakeup-stat,
    .codex-wakeup-runtime-card,
    .schedule-card,
    .schedule-status,
    .wakeup-account-row,
    .wakeup-status-item,
    .empty-state,
    .path-row,
    .codex-app-account-card,
    .api-pool-row,
    .local-access-member-empty,
    .oauth-status,
    .stats-metric,
    .stats-config-card,
    .stats-config-value,
    .stats-account-row {
      border-color: var(--border-light);
      background: rgba(18, 16, 10, .72);
    }

    .codex-app-note {
      color: var(--text-secondary);
      border-color: rgba(245, 208, 111, .20);
      background: rgba(212, 175, 55, .08);
    }

    .add-btn {
      color: #f5d06f;
      border-color: rgba(245, 208, 111, .34);
      background: rgba(212, 175, 55, .12);
    }

    .api-pool-row:hover {
      border-color: rgba(245, 208, 111, .32);
      background: rgba(72, 55, 22, .36);
    }

    .modal-overlay {
      background: rgba(3, 3, 3, .66);
      backdrop-filter: blur(10px);
    }

    .modal {
      border-color: rgba(245, 208, 111, .28);
      background: rgba(15, 13, 9, .97);
      box-shadow:
        inset 0 1px 0 rgba(245, 208, 111, .10),
        0 30px 90px rgba(0, 0, 0, .62);
    }

    .modal-header,
    .modal-footer,
    .card-footer {
      border-color: var(--border-light);
    }

    .modal-footer {
      background: rgba(12, 10, 7, .82);
    }

    .modal-body {
      background:
        radial-gradient(circle at 100% 0%, rgba(245, 208, 111, .09), transparent 34%),
        linear-gradient(180deg, rgba(22, 19, 12, .92), rgba(11, 10, 7, .96));
    }

    .oauth-status.success {
      color: #9ff0cf;
      border-color: rgba(110, 231, 183, .24);
      background: rgba(16, 185, 129, .10);
    }

    .stats-metric {
      border-top-color: rgba(245, 208, 111, .48);
      background:
        linear-gradient(180deg, rgba(30, 26, 17, .92), rgba(16, 14, 9, .86));
    }

    .stats-metric.teal { border-top-color: rgba(110, 231, 183, .44); }
    .stats-metric.purple { border-top-color: rgba(196, 181, 253, .38); }
    .stats-metric.orange { border-top-color: rgba(245, 196, 81, .48); }
    .stats-metric-label,
    .stats-metric.orange .stats-metric-label { color: var(--accent); }
    .stats-metric.teal .stats-metric-label { color: #9ff0cf; }
    .stats-metric.purple .stats-metric-label { color: #c4b5fd; }

    .current-tag {
      color: #171207;
      background: linear-gradient(135deg, #f5d06f, #d4af37);
      box-shadow: 0 4px 12px rgba(212, 175, 55, .22);
    }

    .member-tag {
      border-color: rgba(245, 208, 111, .30);
      background:
        linear-gradient(180deg, rgba(245, 208, 111, .18), rgba(212, 175, 55, .08));
      color: #ffe08a;
      box-shadow:
        inset 0 1px 0 rgba(255, 239, 178, .16),
        0 4px 12px rgba(0, 0, 0, .22);
    }

    .member-tag::before {
      background: #f5d06f;
      box-shadow:
        0 0 0 3px rgba(245, 208, 111, .14),
        0 0 12px rgba(245, 208, 111, .42);
    }

    .default-tag {
      border-color: rgba(245, 208, 111, .18);
      background: rgba(255, 255, 255, .045);
      color: var(--text-muted);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, .04);
    }

    .tier-badge {
      text-shadow: 0 1px 0 rgba(0, 0, 0, .28);
      box-shadow:
        inset 0 1px 0 rgba(255, 239, 178, .16),
        0 5px 14px rgba(0, 0, 0, .20);
    }

    .tier-badge.free {
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, .04),
        0 4px 10px rgba(0, 0, 0, .18);
    }

    .quota-bar-track {
      height: 7px;
      border: 1px solid rgba(245, 208, 111, .10);
      background: rgba(255, 255, 255, .055);
    }

    .quota-bar {
      background: linear-gradient(90deg, #6ee7b7, #22c55e);
      box-shadow: 0 0 14px rgba(110, 231, 183, .22);
    }

    .quota-bar.warn {
      background: linear-gradient(90deg, #f5d06f, #d4af37);
      box-shadow: 0 0 14px rgba(245, 208, 111, .22);
    }

    .quota-bar.danger {
      background: linear-gradient(90deg, #fca5a5, #f87171);
      box-shadow: 0 0 14px rgba(248, 113, 113, .20);
    }

    .sub-box.warn {
      color: #ffe08a;
      background: rgba(212, 175, 55, .10);
      border-color: rgba(245, 208, 111, .26);
    }

    .sub-box.missing {
      color: var(--text-secondary);
      background: rgba(255, 255, 255, .045);
      border-color: var(--border-light);
    }

    pre {
      border: 1px solid rgba(245, 208, 111, .12);
      background: #050403;
      color: #f2e7c9;
    }

    .toast {
      border: 1px solid rgba(245, 208, 111, .22);
      background: rgba(17, 14, 9, .96);
      color: var(--text-primary);
    }

    @media (max-width: 920px) {
      .wakeup-strip {
        grid-template-columns: 1fr;
        align-items: stretch;
      }

      .strip-actions {
        justify-content: flex-start;
      }

      .overview-toolbar,
      .codex-wakeup-hero,
      .wakeup-task-layout,
      .codex-app-layout {
        grid-template-columns: 1fr;
      }

      .stats-grid,
      .stats-config-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .overview-toolbar {
        align-items: stretch;
        flex-direction: column;
      }

      .daily-schedule-row {
        grid-template-columns: 1fr 1fr;
      }
    }

    @media (max-width: 680px) {
      .page { padding: 14px; }
      .app-header { justify-content: flex-start; overflow-x: auto; }
      .codex-tab-nav { min-width: max-content; }
      .codex-accounts-grid { grid-template-columns: 1fr; }
      .ghcp-account-card { height: auto; min-height: 0; }
      .account-meta,
      .ghcp-quota-section { min-height: 0; }
      .wakeup-form { grid-template-columns: 1fr; }
      .config-row { grid-template-columns: 42px minmax(0, 1fr) auto; }
      .config-row .copy-extra { display: none; }
      .codex-wakeup-stats { grid-template-columns: 1fr; }
      .daily-schedule-row { grid-template-columns: 1fr; }
      .stats-grid,
      .stats-config-grid { grid-template-columns: 1fr; }
      .stats-account-row { grid-template-columns: 1fr; align-items: stretch; }
    }
  </style>
</head>
<body>
  <main class="page">
    <header class="app-header">
      <nav class="codex-tab-nav" aria-label="Codex 管理导航">
        <button class="tab-btn active" data-tab-target="overview">${icons.grid}<span>账号总览</span></button>
        <button class="tab-btn" data-tab-target="codexapp">${icons.server}<span>Codex App</span></button>
        <button class="tab-btn" data-tab-target="wakeup">${icons.play}<span>唤醒任务</span></button>
      </nav>
    </header>

    <section class="tab-page active" id="tab-overview">
      <div class="overview-toolbar">
        <div class="toolbar-left">
          <span class="filter-pill active">全部 <b id="accountTotal">0</b></span>
          <span class="filter-pill">已选 <b data-selected-number>0</b></span>
          <button id="overviewRefreshAllBtn">${icons.refresh} 刷新状态</button>
          <button id="overviewImportAccountBtn">${icons.folderPlus} 添加 / 导入账号</button>
          <button id="overviewExportSelectedBtn">${icons.upload} 导出选中</button>
          <button id="overviewOpenWakeupBtn">${icons.play} 打开唤醒任务</button>
        </div>
        <div class="toolbar-right">
          <label class="quota-auto-refresh"><input type="checkbox" id="quotaAutoRefreshEnabled" /> &#33258;&#21160;&#21047;&#26032;&#39069;&#24230;</label>
          <span class="quota-auto-refresh">&#27599; <input type="number" min="1" id="quotaAutoRefreshInterval" value="10" /> &#20998;&#38047;</span>
          <button id="saveQuotaAutoRefreshBtn">&#20445;&#23384;&#33258;&#21160;&#21047;&#26032;</button>
          <button id="runQuotaAutoRefreshNowBtn">&#31435;&#21363;&#21047;&#26032;&#20840;&#37096;</button>
          <span class="quota-auto-status" id="quotaAutoRefreshStatus">&#26410;&#21551;&#29992;</span>
        </div>
      </div>

      <div class="codex-accounts-grid">
        <section class="ghcp-account-card codex-local-access-card" id="localAccessCard">
          <div class="card-head">
            <div class="card-brand">
              <div class="card-icon">${icons.server}</div>
              <div class="card-title">
                <h1>API 服务</h1>
                <p>仅 Codex 访问</p>
              </div>
            </div>
            <div class="inline-actions">
              <span class="status-pill" id="localAccessStatus">已启用</span>
              <span class="close-mark">×</span>
            </div>
          </div>

          <div class="config-list">
            <div class="config-row">
              <div class="label">地址</div>
              <div class="code" id="baseUrl">加载中...</div>
              <button class="icon-btn" data-copy="baseUrl" title="复制地址">${icons.copy}</button>
              <span class="copy-extra"></span>
            </div>
            <div class="config-row">
              <div class="label">密钥</div>
              <div class="code" id="apiKeyMasked">加载中...</div>
              <button class="icon-btn" id="toggleKeyBtn" title="显示/隐藏密钥">${icons.eye}</button>
              <button class="icon-btn copy-extra" data-copy-secret="apiKey" title="复制密钥">${icons.copy}</button>
            </div>
          </div>

          <div class="local-note" id="localAccessHint">点击“添加账号”维护 API 服务集合；播放按钮才会切到 API 服务模式。</div>
          <div class="local-access-members" id="localAccessMembers"></div>
          <button class="add-btn" id="addAccountBtn">${icons.folderPlus} 添加账号</button>

          <div class="card-footer">
            <span class="footer-note">仅监听 127.0.0.1</span>
            <div class="card-actions">
              <button class="icon-btn" id="copyChatBtn" title="复制 Chat Completions 地址">${icons.copy}</button>
              <button class="icon-btn" id="testModelsBtn" title="API 服务控制面板">${icons.database}</button>
              <button class="icon-btn" id="reloadBtn" title="刷新">${icons.refresh}</button>
              <button class="icon-btn" id="activateApiServiceBtn" title="写入 Codex App 并重启">${icons.play}</button>
              <button class="icon-btn" id="shutdownBtn" title="停止服务">${icons.power}</button>
            </div>
          </div>
        </section>

        <div id="accountsList" class="as-contents"></div>        <div id="accountsList" class="as-contents"></div>
      </div>
    </section>

    <section class="tab-page" id="tab-codexapp">
      <div class="codex-app-layout">
        <section class="panel-card codex-app-hero">
          <div class="card-head">
            <div class="card-brand">
              <div class="card-icon">${icons.server}</div>
              <div class="card-title">
                <h1>Codex App 登录</h1>
                <p>从这里把账号写入本机 ~/.codex/auth.json</p>
              </div>
            </div>
            <span class="status-pill" id="codexAppMatchBadge">检测中</span>
          </div>

          <div class="codex-path-grid">
            <div class="path-row"><span>CODEX_HOME</span><code id="codexHomePath">加载中...</code></div>
            <div class="path-row"><span>auth.json</span><code id="codexAuthPath">加载中...</code></div>
            <div class="path-row"><span>config.toml</span><code id="codexConfigPath">加载中...</code></div>
          </div>

          <div class="codex-app-note">
            点击“登录到 Codex App”会先备份现有 auth.json，再写入所选账号，并同步设置为当前 API 网关账号。
          </div>
        </section>

        <section class="panel-card codex-app-config">
          <div class="card-head">
            <div>
              <h2>快速配置</h2>
              <p class="panel-subtitle">复刻开源项目里的 Codex quick config：1M 上下文和自动压缩阈值。</p>
            </div>
            <button id="reloadCodexAppBtn">${icons.refresh} 重新检测</button>
          </div>
          <label class="switch-row">
            <input type="checkbox" id="quickContextWindow1m" />
            <span>启用 1M context window</span>
          </label>
          <label class="form-label" for="quickAutoCompactLimit">自动压缩阈值</label>
          <input class="input" id="quickAutoCompactLimit" value="900000" />
          <div class="inline-actions" style="margin-top:12px">
            <button class="primary" id="saveQuickConfigBtn">保存到 config.toml</button>
          </div>
        </section>

        <section class="panel-card codex-app-accounts">
          <div class="card-head">
            <div>
              <h2>选择账号登录 Codex App</h2>
              <p class="panel-subtitle">这个列表和账号总览共用同一个账号池。</p>
            </div>
            <span class="selected-pill" id="codexAppCurrentText">未检测</span>
          </div>
          <div class="codex-app-account-list" id="codexAppAccountList"></div>
        </section>
      </div>
    </section>

    <section class="tab-page" id="tab-wakeup">
      <div class="codex-wakeup-content">
        <section class="codex-wakeup-hero">
          <div class="codex-wakeup-hero-copy">
            <span class="codex-wakeup-runtime-badge ok">API 服务运行中</span>
            <h2>唤醒任务</h2>
            <p>这里专门负责账号唤醒：选择账号、设置模型和提示词，然后批量发送轻量请求。账号状态和用量仍然回到“账号总览”里看。</p>
            <div class="codex-wakeup-stats">
              <div class="codex-wakeup-stat"><span>账号总数</span><strong id="wakeupTotalAccounts">0</strong></div>
              <div class="codex-wakeup-stat"><span>已选择</span><strong data-selected-number>0</strong></div>
              <div class="codex-wakeup-stat"><span>最近结果</span><strong id="wakeupLastStatus">-</strong></div>
            </div>
          </div>
        </section>

        <div class="wakeup-task-layout">
          <section class="panel-card wakeup-panel">
            <div class="card-head">
              <div>
                <h2>选择账号</h2>
                <p class="panel-subtitle">这里选择的账号会同步到总览卡片左上角。</p>
              </div>
              <div class="inline-actions">
                <span class="selected-pill" data-selected-count>0 已选</span>
                <button id="selectAllWakeupBtn">全选</button>
                <button id="clearWakeupSelectionBtn">清空</button>
              </div>
            </div>
            <div class="wakeup-account-list" id="wakeupAccountList"></div>
          </section>

          <div class="wakeup-right-stack">
            <section class="panel-card wakeup-control-panel">
              <div class="card-head">
                <div>
                  <h2>运行设置</h2>
                  <p class="panel-subtitle">选择模型、提示词和每日固定唤醒时间。</p>
                </div>
              </div>
              <div class="codex-wakeup-runtime-card">
                <label class="form-label">模型</label>
                <input class="input" id="wakeupModel" value="gpt-5.5" />
                <label class="form-label">提示词</label>
                <textarea class="textarea" id="wakeupPrompt">Reply with exactly: OK</textarea>
                <div class="wakeup-actions-row">
                  <button class="primary" id="runWakeupBtn">${icons.play} 唤醒选中</button>
                  <button id="refreshSelectedQuotaBtn">${icons.refresh} 刷新用量</button>
                  <button id="loadWakeupHistoryBtn">历史</button>
                </div>
                <div class="schedule-card">
                  <div class="schedule-card-head">
                    <label class="switch-row schedule-switch"><input type="checkbox" id="wakeupScheduleEnabled" /> <span>每天定时唤醒选中账号</span></label>
                    <span class="schedule-mode-pill">每日固定时间</span>
                  </div>
                  <div class="daily-schedule-row">
                    <div>
                      <label class="form-label">每天时间</label>
                      <input class="input" id="wakeupScheduleDailyTime" type="time" value="20:00" />
                    </div>
                    <button class="primary" id="saveWakeupScheduleBtn">保存定时</button>
                    <button id="runWakeupScheduleNowBtn">立即运行</button>
                    <button id="disableWakeupScheduleBtn">关闭定时</button>
                  </div>
                  <div class="schedule-status" id="wakeupScheduleStatus">定时唤醒未启用。</div>
                </div>
              </div>
            </section>

            <section class="panel-card wakeup-panel">
              <div class="card-head">
                <div>
                  <h2>任务状态</h2>
                  <p class="panel-subtitle">显示本次唤醒结果和最近历史。</p>
                </div>
                <button id="clearWakeupStatusBtn">清空显示</button>
              </div>
              <div class="wakeup-status-list" id="wakeupStatusList">
                <div class="empty-state">还没有运行唤醒任务。</div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </section>

    <section class="panel" id="outputPanel">
      <div class="panel-card">
        <div class="card-head">
          <h2>运行输出</h2>
          <button id="toggleOutputBtn">隐藏</button>
        </div>
        <pre id="output">等待操作...</pre>
      </div>
    </section>
  </main>
  <div class="toast" id="toast">已复制</div>

  <div class="modal-overlay" id="accountAddModal" aria-hidden="true">
    <div class="modal account-add-modal" role="dialog" aria-modal="true" aria-labelledby="accountAddModalTitle">
      <div class="modal-header">
        <h2 class="modal-title" id="accountAddModalTitle">${icons.folderPlus} 添加 Codex 账号</h2>
        <button class="icon-btn" id="accountAddModalCloseBtn" title="关闭">&times;</button>
      </div>
      <div class="modal-body">
        <div class="account-add-tabs">
          <button class="account-add-tab active" data-add-tab="oauth">OAuth 授权</button>
          <button class="account-add-tab" data-add-tab="token">Token / JSON</button>
          <button class="account-add-tab" data-add-tab="local">本地导入</button>
        </div>

        <section class="account-add-section active" id="addSectionOauth">
          <p class="section-desc">通过 OpenAI 官方 OAuth 授权 Codex 账号。成功后会保存 id_token、access_token 和 refresh_token，可自动续期。</p>
          <div class="oauth-url-box">
            <input id="oauthUrlInput" type="text" readonly placeholder="正在准备授权链接..." />
            <button id="copyOauthUrlBtn" title="复制授权链接">${icons.copy}</button>
          </div>
          <button class="primary" id="openOauthUrlBtn">${icons.server} 在浏览器中打开</button>
          <div class="oauth-url-box">
            <input id="oauthCallbackInput" type="text" placeholder="可选：粘贴完整回调地址 http://localhost:1455/auth/callback?code=...&state=..." />
            <button id="submitOauthCallbackBtn">我已授权，继续</button>
          </div>
          <div class="oauth-status show" id="oauthStatus">正在准备授权链接...</div>
        </section>

        <section class="account-add-section" id="addSectionToken">
          <p class="section-desc">粘贴另一个账号的 ~/.codex/auth.json、Gateway / Cockpit / sub2api / CPA 导出的账号 JSON。请不要粘贴无 refresh_token 的网页会话凭证作为长期账号。</p>
          <div>
            <label class="form-label" for="importFormatSelect">导入格式</label>
            <select class="input" id="importFormatSelect">
              <option value="auto">自动识别（推荐）</option>
              <option value="gateway">gateway（本项目）</option>
              <option value="cockpit-tools">cockpit-tools</option>
              <option value="sub2api">sub2api</option>
              <option value="cpa">cpa / token storage</option>
            </select>
          </div>
          <div class="import-format-help" id="importFormatHelp">自动识别：按 JSON 结构判断 gateway、cockpit-tools、sub2api 或 cpa。</div>
          <textarea id="authJsonInput" class="import-textarea" placeholder="把账号 JSON 粘贴到这里"></textarea>
          <div class="inline-actions">
            <button class="primary" id="importJsonBtn">导入粘贴内容</button>
          </div>
        </section>

        <section class="account-add-section" id="addSectionLocal">
          <p class="section-desc">读取当前本机 ~/.codex/auth.json 并导入账号池。</p>
          <button class="primary" id="importCurrentBtn">导入当前 ~/.codex/auth.json</button>
        </section>
      </div>
      <div class="modal-footer">
        <button class="danger" id="rotateBtn">轮换 API Key</button>
        <button id="retryOauthBtn">${icons.refresh} 刷新授权链接</button>
        <button id="accountAddCancelBtn">关闭</button>
      </div>
    </div>
  </div>

  <div class="modal-overlay" id="exportAccountsModal" aria-hidden="true">
    <div class="modal export-format-modal" role="dialog" aria-modal="true" aria-labelledby="exportAccountsModalTitle">
      <div class="modal-header">
        <h2 class="modal-title" id="exportAccountsModalTitle">${icons.upload} 导出账号</h2>
        <button class="icon-btn" id="exportAccountsModalCloseBtn" title="关闭">&times;</button>
      </div>
      <div class="modal-body export-format-body">
        <p class="section-desc">即将导出 <b id="exportAccountsCount">0</b> 个账号的完整 OAuth tokens。请选择目标平台格式。</p>
        <div>
          <label class="form-label" for="exportFormatSelect">导出格式</label>
          <select class="input" id="exportFormatSelect">
            <option value="gateway">gateway（本项目）</option>
            <option value="cockpit-tools">cockpit-tools</option>
            <option value="sub2api">sub2api</option>
            <option value="cpa">cpa / token storage</option>
          </select>
        </div>
        <div class="export-format-help" id="exportFormatHelp">gateway：本项目原生迁移包，包含 accounts 字段，可再次导入本项目。</div>
        <div class="export-token-warning">导出的 JSON 等同登录凭证。请只保存在你信任的位置，不要提交到 GitHub 或发送给他人。</div>
      </div>
      <div class="modal-footer">
        <button id="exportAccountsCancelBtn">取消</button>
        <button class="primary" id="exportAccountsConfirmBtn">导出 JSON</button>
      </div>
    </div>
  </div>

  <div class="modal-overlay" id="apiPoolModal" aria-hidden="true">
    <div class="modal api-pool-modal" role="dialog" aria-modal="true" aria-labelledby="apiPoolModalTitle">
      <div class="modal-header">
        <h2 class="modal-title" id="apiPoolModalTitle">${icons.server} 添加至 API 服务</h2>
        <button class="icon-btn" id="apiPoolModalCloseBtn" title="关闭">&times;</button>
      </div>
      <div class="modal-body">
        <div class="modal-toolbar">
          <input id="apiPoolSearch" type="search" placeholder="搜索账号..." />
          <label class="modal-toggle"><input type="checkbox" id="apiRestrictFreeAccounts" checked /> 限制 Free 账号使用</label>
          <span class="selected-pill"><b id="apiModalSelectedCount">0</b> 已选</span>
        </div>
        <div class="api-pool-list" id="apiPoolModalList"></div>
        <div class="api-pool-hint" id="apiPoolHint">这里的选择只影响 API 服务账号池；不会切换 Codex App。</div>
      </div>
      <div class="modal-footer">
        <button id="apiPoolSelectAllBtn">全选可用账号</button>
        <button id="apiPoolClearBtn">清空</button>
        <button id="apiPoolCancelBtn">取消</button>
        <button class="primary" id="saveApiPoolBtn">保存集合</button>
      </div>
    </div>
  </div>

  <div class="modal-overlay" id="apiStatsModal" aria-hidden="true">
    <div class="modal stats-modal" role="dialog" aria-modal="true" aria-labelledby="apiStatsModalTitle">
      <div class="modal-header">
        <div>
          <h2 class="modal-title" id="apiStatsModalTitle">${icons.server} API 服务</h2>
          <div class="api-pool-hint" id="apiStatsSubtitle">运行中 · 仅 Codex 访问</div>
        </div>
        <div class="stats-header-actions">
          <button class="icon-btn" id="apiStatsRefreshBtn" title="刷新统计">${icons.refresh}</button>
          <button class="icon-btn danger" id="apiStatsClearBtn" title="清除统计">${icons.trash}</button>
          <button class="icon-btn" id="apiStatsModalCloseBtn" title="关闭">&times;</button>
        </div>
      </div>
      <div class="modal-body">
        <section class="stats-section">
          <div class="card-head">
            <h3 class="stats-section-title">${icons.activity} 总量统计</h3>
            <div class="stats-range-tabs" id="apiStatsRangeTabs">
              <button data-stats-range="daily" class="active">日</button>
              <button data-stats-range="weekly">周</button>
              <button data-stats-range="monthly">月</button>
              <button data-stats-range="total">总</button>
            </div>
          </div>
          <div class="stats-grid">
            <div class="stats-metric">
              <div class="stats-metric-label">总请求数</div>
              <div class="stats-metric-value" id="statsRequestCount">0</div>
              <div class="stats-metric-sub" id="statsRequestSub">成功 0 / 失败 0</div>
            </div>
            <div class="stats-metric teal">
              <div class="stats-metric-label">总 TOKEN 数</div>
              <div class="stats-metric-value" id="statsTokenTotal">0</div>
              <div class="stats-metric-sub" id="statsTokenSub">输入 0 / 输出 0</div>
            </div>
            <div class="stats-metric purple">
              <div class="stats-metric-label">缓存 / 思考</div>
              <div class="stats-metric-value" id="statsCacheReasoning">0</div>
              <div class="stats-metric-sub" id="statsCacheSub">缓存 0 / 思考 0</div>
            </div>
            <div class="stats-metric orange">
              <div class="stats-metric-label">平均延迟</div>
              <div class="stats-metric-value" id="statsAvgLatency">0s</div>
              <div class="stats-metric-sub" id="statsLatencySub">成功率 0%</div>
            </div>
          </div>
        </section>

        <section class="stats-section">
          <h3 class="stats-section-title">${icons.key} 服务配置</h3>
          <div class="stats-config-grid">
            <div class="stats-config-card">
              <div class="stats-config-label">地址 <button class="icon-btn" data-copy="statsBaseUrl" title="复制地址">${icons.copy}</button></div>
              <div class="stats-config-value" id="statsBaseUrl">加载中...</div>
            </div>
            <div class="stats-config-card">
              <div class="stats-config-label">密钥 <button class="icon-btn" data-copy-secret="apiKey" title="复制密钥">${icons.copy}</button></div>
              <div class="stats-config-value" id="statsApiKey">加载中...</div>
            </div>
            <div class="stats-config-card">
              <div class="stats-config-label">服务端口 <span class="stats-pill" id="statsRoutingStrategy">策略</span></div>
              <div class="stats-config-value" id="statsPort">-</div>
            </div>
            <div class="stats-config-card">
              <div class="stats-config-label">API 端口 URL <button class="icon-btn" data-copy="statsChatUrl" title="复制 API URL">${icons.copy}</button></div>
              <div class="stats-config-value" id="statsChatUrl">加载中...</div>
            </div>
            <div class="stats-config-card">
              <div class="stats-config-label">模型 ID <span class="stats-pill">仅查看</span></div>
              <div class="stats-config-value" id="statsModelId">gpt-5.5</div>
            </div>
            <div class="stats-config-card">
              <div class="stats-config-label">集合成员 <span class="stats-pill" id="statsMemberCount">0 个</span></div>
              <div class="stats-config-value">仅监听 127.0.0.1</div>
            </div>
          </div>
        </section>

        <section class="stats-section">
          <h3 class="stats-section-title">${icons.database} 按账号统计</h3>
          <div class="stats-account-list" id="statsAccountList">
            <div class="empty-state">暂无 API 服务请求统计</div>
          </div>
        </section>
      </div>
      <div class="modal-footer">
        <button id="apiStatsCloseFooterBtn">关闭</button>
      </div>
    </div>
  </div>

<script>
const ACCOUNT_ORDER_STORAGE_KEY = 'codex-api-gateway.account-order.v1';
const state = {
  data: null,
  showKey: false,
  activeTab: 'overview',
  selectedWakeupIds: new Set(),
  apiAccountIds: new Set(),
  apiModalIds: new Set(),
  apiModalOpen: false,
  apiPoolQuery: '',
  apiRestrictFreeAccounts: true,
  selectionInitialized: false,
  apiSelectionInitialized: false,
  lastWakeupResult: null,
  wakeupHistory: [],
  statePollTimer: null,
  loadingState: false,
  statsRange: 'daily',
  addTab: 'oauth',
  oauthLoginId: null,
  oauthUrl: '',
  oauthPollTimer: null,
  oauthCompleting: false,
  importFormat: 'auto',
  exportAccountIds: [],
  exportFormat: 'gateway',
  accountOrder: loadAccountOrder()
};
const $ = (id) => document.getElementById(id);

const importFormatHelpText = {
  auto: '自动识别：按 JSON 结构判断 gateway、cockpit-tools、sub2api 或 cpa。',
  gateway: 'gateway：本项目原生迁移包，包含 accounts 字段。',
  'cockpit-tools': 'cockpit-tools：Cockpit Tools 兼容的账号对象或账号数组。',
  sub2api: 'sub2api：读取 accounts[].credentials 中的 OAuth tokens 与账号元数据。',
  cpa: 'cpa：读取 CPA / Codex token storage 的根级 id_token、access_token、refresh_token。'
};

const exportFormatHelpText = {
  gateway: 'gateway：本项目原生迁移包，包含 accounts 字段，可再次导入本项目。',
  'cockpit-tools': 'cockpit-tools：保持 Cockpit Tools 兼容的账号数组格式。',
  sub2api: 'sub2api：生成 sub2api-data 批量导入结构，包含 openai/oauth credentials。',
  cpa: 'cpa：生成 CPA / Codex token storage 结构；多账号时导出为 token storage 数组。'
};

function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  setTimeout(function() { el.classList.remove('show'); }, 1500);
}

function setOutput(value) {
  $('outputPanel').classList.add('show');
  $('output').textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function(ch) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
  });
}

function maskMiddle(value, start, end) {
  value = String(value || '');
  if (value.length <= start + end) return value.charAt(0) + '***';
  return value.slice(0, start) + '***' + value.slice(value.length - end);
}

function maskEmail(email) {
  email = String(email || 'unknown');
  const parts = email.split('@');
  if (parts.length !== 2) return maskMiddle(email, 2, 2);
  const local = parts[0];
  const domain = parts[1];
  const dot = domain.lastIndexOf('.');
  const domainName = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : '';
  return maskMiddle(local, Math.min(2, local.length), 1) + '@' + maskMiddle(domainName, 1, 1) + tld;
}

function maskId(value) {
  value = String(value || '');
  if (!value) return '-';
  return maskMiddle(value, 3, 3);
}

function loadAccountOrder() {
  try {
    const raw = localStorage.getItem(ACCOUNT_ORDER_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(function(id) { return String(id || '').trim(); }).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function saveAccountOrder() {
  try {
    localStorage.setItem(ACCOUNT_ORDER_STORAGE_KEY, JSON.stringify(state.accountOrder || []));
  } catch {
    // ignore storage failures
  }
}

function exportFileName(count, format) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const key = String(format || 'gateway').replace(/_/g, '-');
  const segment = ({
    gateway: 'gateway',
    'cockpit-tools': 'cockpit_tools',
    sub2api: 'sub2api',
    cpa: 'cpa'
  })[key] || 'gateway';
  return 'codex_' + segment + '_accounts_' + count + '_' + stamp + '.json';
}

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
}

function planLabel(plan) {
  const p = String(plan || '').trim().toLowerCase();
  if (!p) return 'FREE';
  if (p.includes('plus')) return 'PLUS';
  if (p.includes('pro')) return 'PRO';
  if (p.includes('team')) return 'TEAM';
  if (p.includes('free')) return 'FREE';
  return p.toUpperCase();
}

function loginLabel(account) {
  const provider = String(account.authProvider || account.authMode || '').toLowerCase();
  if (provider.includes('google')) return 'Google';
  if (provider.includes('microsoft')) return 'Microsoft';
  if (provider.includes('passwordless')) return 'passwordless';
  if (provider.includes('password')) return 'Password';
  if (provider.includes('oauth')) return 'OAuth';
  return provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : 'OAuth';
}

function teamLabel(value) {
  value = String(value || '').trim();
  if (!value || value.toLowerCase() === 'personal') return '个人账户';
  return value;
}

function percentClass(percent) {
  percent = Number(percent);
  if (percent < 30) return 'danger';
  if (percent < 60) return 'warn';
  return '';
}

function formatClock(msOrSec) {
  if (!msOrSec) return '-';
  const n = Number(msOrSec);
  const ms = n < 10000000000 ? n * 1000 : n;
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return '-';
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return y + '/' + mo + '/' + da + ' ' + h + ':' + mi;
}

function formatShortDate(msOrSec) {
  const full = formatClock(msOrSec);
  return full === '-' ? '-' : full.slice(0, 10).replaceAll('/', '-') + ' ' + full.slice(11);
}

function durationText(ms) {
  if (!Number.isFinite(ms)) return '';
  if (ms < 0) ms = 0;
  let minutes = Math.floor(ms / 60000);
  const days = Math.floor(minutes / 1440);
  minutes -= days * 1440;
  const hours = Math.floor(minutes / 60);
  minutes -= hours * 60;
  const chunks = [];
  if (days) chunks.push(days + 'd');
  if (hours) chunks.push(hours + 'h');
  chunks.push(minutes + 'm');
  return chunks.join(' ');
}

function resetText(sec) {
  if (!sec) return '';
  const ms = Number(sec) * 1000;
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return durationText(ms - Date.now()) + ' (' + mm + '/' + dd + ' ' + hh + ':' + mi + ')';
}

function compactNumber(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '0';
  if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(n >= 10000000 ? 1 : 1).replace(/\.0$/, '') + 'M';
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '') + 'K';
  return String(Math.round(n));
}

function latencyText(ms) {
  const n = Number(ms || 0);
  if (!Number.isFinite(n) || n <= 0) return '0s';
  if (n < 1000) return Math.round(n) + 'ms';
  return (n / 1000).toFixed(2).replace(/0$/, '').replace(/\.0$/, '') + 's';
}

function strategyLabel(value) {
  switch (String(value || 'auto')) {
    case 'expiry_soon_first': return '快到期优先';
    case 'expiry_late_first': return '晚到期优先';
    case 'quota_high_first': return '高额度优先';
    case 'quota_low_first': return '低额度优先';
    case 'plan_high_first': return '高套餐优先';
    case 'plan_low_first': return '低套餐优先';
    case 'round_robin': return '轮询';
    default: return '自动';
  }
}

function windowLabel(minutes, fallback) {
  const m = Number(minutes || 0);
  if (m >= 10080) return 'Weekly';
  if (m >= 60 && m % 60 === 0) return (m / 60) + 'h';
  if (m > 0) return m + 'm';
  return fallback;
}

function quotaBlock(kind, label, percent, reset) {
  percent = Number(percent == null ? 100 : percent);
  const cls = percentClass(percent);
  return '<div class="quota-item">' +
    '<div class="quota-header">' + (kind === 'weekly' ? '${icons.calendar}' : '${icons.clock}') + '<span class="quota-label">' + escapeHtml(label) + '</span>' +
    '<span class="quota-pct ' + cls + '">' + percent + '%</span></div>' +
    '<div class="quota-bar-track"><div class="quota-bar ' + cls + '" style="width:' + Math.max(0, Math.min(100, percent)) + '%"></div></div>' +
    '<div class="quota-reset">' + escapeHtml(resetText(reset)) + '</div>' +
    '</div>';
}

function quotaWindowInfo(quota, prefix, fallbackLabel, fallbackKind) {
  quota = quota || {};
  if (quota[prefix + '_window_present'] === false) return null;
  const percent = quota[prefix + '_percentage'];
  const reset = quota[prefix + '_reset_time'];
  const minutes = quota[prefix + '_window_minutes'];
  if (percent == null && !reset && !minutes) return null;
  const label = windowLabel(minutes, fallbackLabel);
  const normalized = String(label || '').toLowerCase();
  const kind = Number(minutes || 0) >= 10080 || normalized.includes('week') ? 'weekly' : fallbackKind;
  return { kind: kind, label: label, percent: percent, reset: reset, minutes: minutes };
}

function quotaWindows(account) {
  const quota = (account && account.quota) || {};
  const windows = [];
  [quotaWindowInfo(quota, 'hourly', '5h', 'hourly'), quotaWindowInfo(quota, 'weekly', 'Weekly', 'weekly')].forEach(function(item) {
    if (!item) return;
    const duplicate = windows.some(function(existing) {
      return existing.kind === item.kind && existing.label === item.label;
    });
    if (!duplicate) windows.push(item);
  });
  return windows;
}

function quotaSectionHtml(account) {
  const plan = planLabel(account && account.planType);
  const windows = quotaWindows(account);
  const hasHourly = windows.some(function(item) { return item.kind === 'hourly'; });
  const hasWeekly = windows.some(function(item) { return item.kind === 'weekly'; });
  const parts = windows.map(function(item) {
    return quotaBlock(item.kind, item.label, item.percent, item.reset);
  });
  if (!parts.length) {
    parts.push('<div class="small-line">未获得用量信息</div>');
  } else if (plan !== 'FREE') {
    if (!hasHourly) parts.push('<div class="small-line">未获得 5h 用量信息</div>');
    if (!hasWeekly) parts.push('<div class="small-line">未获得 Weekly 用量信息</div>');
  }
  return '<div class="ghcp-quota-section">' + parts.join('') + '</div>';
}

function quotaSummaryText(account) {
  const windows = quotaWindows(account);
  if (!windows.length) return '用量未获取';
  return windows.map(function(item) {
    return item.label + ' ' + (item.percent == null ? '-' : item.percent + '%');
  }).join(' · ');
}

function subscriptionBox(account) {
  const plan = planLabel(account.planType);
  if (plan === 'FREE' || !account.subscriptionActiveUntil) {
    return '<div class="sub-box missing">${icons.calendar} 未获得订阅信息</div>';
  }
  const t = Date.parse(account.subscriptionActiveUntil);
  if (!Number.isFinite(t)) {
    return '<div class="sub-box warn"><span>${icons.calendar} 有效期未知</span><span class="date">' + escapeHtml(account.subscriptionActiveUntil) + '</span></div>';
  }
  const days = Math.ceil((t - Date.now()) / 86400000);
  const warn = days <= 3 ? ' warn' : '';
  return '<div class="sub-box' + warn + '"><span>${icons.calendar} 有效期 ' + Math.max(0, days) + '天</span><span class="date">' + escapeHtml(formatShortDate(t)) + '</span></div>';
}

function isApiServiceActive() {
  return Boolean(state.data && state.data.codexApp && state.data.codexApp.apiService && state.data.codexApp.apiService.active);
}

function visualCurrentAccountId() {
  if (isApiServiceActive()) return null;
  const appMatched = state.data && state.data.codexApp && state.data.codexApp.matchedGatewayAccountId;
  return appMatched || (state.data && state.data.currentAccountId) || null;
}

function accountPlanSortRank(account) {
  const plan = planLabel(account && account.planType);
  if (plan === 'FREE') return 20;
  if (plan === 'PRO') return 1;
  if (plan === 'PLUS') return 2;
  if (plan === 'TEAM') return 3;
  return 10;
}

function normalizeAccountOrder() {
  const accounts = (state.data && state.data.accounts) || [];
  const valid = new Set(accounts.map(function(account) { return account.id; }));
  state.accountOrder = (state.accountOrder || []).filter(function(id) { return valid.has(id); });
}

function sortedAccounts() {
  const currentId = visualCurrentAccountId();
  const accounts = ((state.data && state.data.accounts) || []).slice();
  const originalIndex = new Map();
  accounts.forEach(function(account, index) { originalIndex.set(account.id, index); });
  const orderIndex = new Map();
  (state.accountOrder || []).forEach(function(id, index) { orderIndex.set(id, index); });
  const hasCustomOrder = orderIndex.size > 0;
  const apiServiceActive = isApiServiceActive();
  const apiIds = new Set((state.data && state.data.localAccess && state.data.localAccess.accountIds) || []);
  return accounts.sort(function(a, b) {
    if (hasCustomOrder) {
      const ai = orderIndex.has(a.id) ? orderIndex.get(a.id) : Number.MAX_SAFE_INTEGER;
      const bi = orderIndex.has(b.id) ? orderIndex.get(b.id) : Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
    }
    if (a.id === currentId) return -1;
    if (b.id === currentId) return 1;
    if (!hasCustomOrder && apiServiceActive) {
      const am = apiIds.has(a.id) ? 0 : 1;
      const bm = apiIds.has(b.id) ? 0 : 1;
      if (am !== bm) return am - bm;
    }
    if (!hasCustomOrder) {
      const ap = accountPlanSortRank(a);
      const bp = accountPlanSortRank(b);
      if (ap !== bp) return ap - bp;
    }
    return (originalIndex.get(a.id) || 0) - (originalIndex.get(b.id) || 0);
  });
}

function allAccountIds() {
  return sortedAccounts().map(function(account) { return account.id; });
}

function moveAccountOrder(accountId, direction) {
  const ids = sortedAccounts().map(function(account) { return account.id; });
  const index = ids.indexOf(accountId);
  if (index < 0) return;
  const delta = direction === 'down' ? 1 : -1;
  const next = index + delta;
  if (next < 0 || next >= ids.length) return;
  const swap = ids[index];
  ids[index] = ids[next];
  ids[next] = swap;
  state.accountOrder = ids;
  saveAccountOrder();
  renderLocalAccessMembers();
  renderAccounts();
  renderApiPoolAccounts();
  renderWakeupAccounts();
  renderCodexAppAccounts();
  syncSelectionControls();
  syncApiSelectionControls();
  toast('账号顺序已更新');
}

function selectedAccountIds() {
  return Array.from(state.selectedWakeupIds).filter(function(id) {
    return allAccountIds().includes(id);
  });
}

function selectedApiAccountIds() {
  const selected = state.apiAccountIds || new Set();
  return sortedAccounts().map(function(account) { return account.id; }).filter(function(id) {
    return selected.has(id);
  });
}

function isApiKeyAccount(account) {
  const mode = String(account && (account.authMode || account.auth_mode) || 'oauth').toLowerCase();
  return mode === 'apikey' || !!(account && (account.openaiApiKey || account.openai_api_key));
}

function isFreeAccount(account) {
  return String(account && (account.planType || account.plan_type) || '').toLowerCase().includes('free');
}

function apiAccountById() {
  const map = new Map();
  sortedAccounts().forEach(function(account) { map.set(account.id, account); });
  return map;
}

function syncApiSelectionControls() {
  document.querySelectorAll('[data-api-modal-select]').forEach(function(item) {
    item.checked = state.apiModalIds.has(item.value);
    const row = item.closest('.api-pool-row');
    if (row) row.classList.toggle('selected', item.checked);
  });
  const modalCount = selectedApiModalAccountIds().length;
  if ($('apiModalSelectedCount')) $('apiModalSelectedCount').textContent = String(modalCount);
  if ($('apiPoolCount')) $('apiPoolCount').textContent = String(selectedApiAccountIds().length);
  if ($('apiRestrictFreeAccounts')) $('apiRestrictFreeAccounts').checked = !!state.apiRestrictFreeAccounts;
  if ($('apiPoolHint')) {
    const savedCount = selectedApiAccountIds().length;
    const active = state.data && state.data.codexApp && state.data.codexApp.apiService && state.data.codexApp.apiService.active;
    $('apiPoolHint').textContent = (active ? 'Codex App 当前已接入本地 API 服务。' : '这里的选择只影响 API 服务集合；不会切换 Codex App。') + ' 已保存集合：' + savedCount + ' 个账号。';
  }
}

function selectedApiModalAccountIds() {
  const valid = new Set(allAccountIds());
  return Array.from(state.apiModalIds).filter(function(id) { return valid.has(id); });
}

function renderLocalAccessMembers() {
  const box = $('localAccessMembers');
  if (!box || !state.data) return;
  const ids = selectedApiAccountIds();
  const byId = apiAccountById();
  const accounts = ids.map(function(id) { return byId.get(id); }).filter(Boolean);
  if (!accounts.length) {
    box.innerHTML = '<div class="local-access-member-empty">当前集合暂无账号，点击“添加账号”选择 OAuth 账号。</div>';
    return;
  }
  box.innerHTML = accounts.slice(0, 4).map(function(account) {
    const plan = planLabel(account.planType);
    const quota = account.quota || {};
    const primary = quota.hourly_percentage == null ? '--' : quota.hourly_percentage + '%';
    const weekly = quota.weekly_percentage == null ? '--' : quota.weekly_percentage + '%';
    return '<div class="local-access-member-row">' +
      '<span class="local-access-member-email" title="' + escapeHtml(account.email || '') + '">' + escapeHtml(maskEmail(account.email)) + '</span>' +
      '<span>' + escapeHtml(primary) + '</span>' +
      '<span>' + escapeHtml(weekly) + '</span>' +
      '<span class="tier-badge ' + (plan === 'FREE' ? 'free' : '') + '">' + escapeHtml(plan) + '</span>' +
    '</div>';
  }).join('') + (accounts.length > 4 ? '<div class="api-pool-hint">还有 ' + (accounts.length - 4) + ' 个账号，点击“添加账号”查看全部。</div>' : '');
}

function renderApiPoolAccounts() {
  const box = $('apiPoolModalList');
  if (!box || !state.data) return;
  const query = String(state.apiPoolQuery || '').trim().toLowerCase();
  const accounts = sortedAccounts().filter(function(account) {
    if (isApiKeyAccount(account)) return false;
    if (!query) return true;
    return String(account.email || '').toLowerCase().includes(query)
      || String(account.accountId || '').toLowerCase().includes(query)
      || String(account.userId || '').toLowerCase().includes(query);
  });
  if (!accounts.length) {
    box.innerHTML = '<div class="empty-state">暂无可加入的 OAuth 账号。</div>';
    syncApiSelectionControls();
    return;
  }
  box.innerHTML = accounts.map(function(account) {
    const selected = state.apiModalIds.has(account.id);
    const plan = planLabel(account.planType);
    const freeBlocked = state.apiRestrictFreeAccounts && plan === 'FREE' && !selected;
    const quotaText = quotaSummaryText(account);
    return '<label class="api-pool-row ' + (selected ? 'selected ' : '') + (freeBlocked ? 'disabled' : '') + '">' +
      '<input type="checkbox" data-api-modal-select value="' + escapeHtml(account.id) + '"' + (selected ? ' checked' : '') + (freeBlocked ? ' disabled' : '') + '>' +
      '<div class="api-pool-main">' +
        '<div class="api-pool-email" title="' + escapeHtml(account.email || '') + '">' + escapeHtml(maskEmail(account.email)) + '</div>' +
        '<div class="api-pool-meta">' + escapeHtml(loginLabel(account)) + ' · ' + escapeHtml(quotaText) + '</div>' +
      '</div>' +
      '<span class="tier-badge ' + (plan === 'FREE' ? 'free' : '') + '">' + escapeHtml(plan) + '</span>' +
    '</label>';
  }).join('');
  syncApiSelectionControls();
}

function currentStatsWindow() {
  const stats = (state.data && state.data.localAccessStats) || {};
  if (state.statsRange === 'total') {
    return { totals: stats.totals || {}, accounts: stats.accounts || [], since: stats.since, updatedAt: stats.updatedAt };
  }
  return stats[state.statsRange] || stats.daily || { totals: {}, accounts: [] };
}

function renderApiStatsPanel() {
  if (!state.data || !$('apiStatsModal')) return;
  const local = state.data.localAccess || {};
  const win = currentStatsWindow();
  const totals = win.totals || {};
  const requestCount = Number(totals.requestCount || 0);
  const successCount = Number(totals.successCount || 0);
  const failureCount = Number(totals.failureCount || 0);
  const avgLatency = requestCount ? Number(totals.totalLatencyMs || 0) / requestCount : 0;
  const successRate = requestCount ? Math.round((successCount / requestCount) * 100) : 0;
  const baseUrl = state.data.baseUrl || '';
  const chatUrl = baseUrl ? baseUrl + '/chat/completions' : '';
  let port = '-';
  try { port = new URL(baseUrl).port || '-'; } catch {}

  if ($('apiStatsSubtitle')) {
    const running = state.data.codexApp && state.data.codexApp.apiService && state.data.codexApp.apiService.active;
    $('apiStatsSubtitle').textContent = (running ? '已接入' : '运行中') + ' · 仅 Codex 访问';
  }
  if ($('statsRequestCount')) $('statsRequestCount').textContent = compactNumber(requestCount);
  if ($('statsRequestSub')) $('statsRequestSub').textContent = '成功 ' + compactNumber(successCount) + ' / 失败 ' + compactNumber(failureCount);
  if ($('statsTokenTotal')) $('statsTokenTotal').textContent = compactNumber(totals.totalTokens || 0);
  if ($('statsTokenSub')) $('statsTokenSub').textContent = '输入 ' + compactNumber(totals.inputTokens || 0) + ' / 输出 ' + compactNumber(totals.outputTokens || 0);
  if ($('statsCacheReasoning')) $('statsCacheReasoning').textContent = compactNumber(Number(totals.cachedTokens || 0) + Number(totals.reasoningTokens || 0));
  if ($('statsCacheSub')) $('statsCacheSub').textContent = '缓存 ' + compactNumber(totals.cachedTokens || 0) + ' / 思考 ' + compactNumber(totals.reasoningTokens || 0);
  if ($('statsAvgLatency')) $('statsAvgLatency').textContent = latencyText(avgLatency);
  if ($('statsLatencySub')) $('statsLatencySub').textContent = '成功率 ' + successRate + '%';
  if ($('statsBaseUrl')) $('statsBaseUrl').textContent = baseUrl || '-';
  if ($('statsApiKey')) $('statsApiKey').textContent = state.showKey ? state.data.apiKey : state.data.apiKeyMasked;
  if ($('statsPort')) $('statsPort').textContent = port;
  if ($('statsChatUrl')) $('statsChatUrl').textContent = chatUrl || '-';
  if ($('statsRoutingStrategy')) $('statsRoutingStrategy').textContent = strategyLabel(local.routingStrategy);
  if ($('statsMemberCount')) $('statsMemberCount').textContent = ((local.accountIds || []).length || 0) + ' 个';
  document.querySelectorAll('[data-stats-range]').forEach(function(button) {
    button.classList.toggle('active', button.dataset.statsRange === state.statsRange);
  });

  const accountList = $('statsAccountList');
  if (!accountList) return;
  const byId = apiAccountById();
  const byEmail = new Map();
  sortedAccounts().forEach(function(account) {
    const email = String(account.email || '').trim().toLowerCase();
    if (email) byEmail.set(email, account);
  });
  const rows = (win.accounts || []).filter(function(item) { return item && item.usage && item.usage.requestCount; });
  if (!rows.length) {
    accountList.innerHTML = '<div class="empty-state">暂无 API 服务请求统计。发起一次 /v1 请求后这里会显示。</div>';
    return;
  }
  accountList.innerHTML = rows.map(function(item) {
    const account = byId.get(item.accountId) || byEmail.get(String(item.email || '').trim().toLowerCase()) || {};
    const usage = item.usage || {};
    const email = item.email || account.email || item.accountId;
    const plan = planLabel(account.planType);
    const quota = account.quota || {};
    const quotaText = quota.weekly_percentage == null ? '' : '<span class="stats-pill">Weekly ' + escapeHtml(quota.weekly_percentage + '%') + '</span>';
    return '<div class="stats-account-row">' +
      '<div class="stats-account-main" title="' + escapeHtml(email) + '">' + escapeHtml(maskEmail(email)) + '</div>' +
      '<span class="tier-badge ' + (plan === 'FREE' ? 'free' : '') + '">' + escapeHtml(plan) + '</span>' +
      quotaText +
      '<span class="stats-pill">成功 ' + compactNumber(usage.successCount || 0) + ' / 失败 ' + compactNumber(usage.failureCount || 0) + '</span>' +
      '<span class="stats-pill">' + compactNumber(usage.totalTokens || 0) + ' tokens</span>' +
    '</div>';
  }).join('');
}

function openApiStatsModal() {
  renderApiStatsPanel();
  $('apiStatsModal').classList.add('show');
  $('apiStatsModal').setAttribute('aria-hidden', 'false');
}

function closeApiStatsModal() {
  if ($('apiStatsModal')) {
    $('apiStatsModal').classList.remove('show');
    $('apiStatsModal').setAttribute('aria-hidden', 'true');
  }
}

async function clearApiStats() {
  if (!confirm('确定清除 API 服务统计？不会删除账号或请求日志以外的配置。')) return;
  const res = await fetch('/_admin/local-access/stats/clear', { method: 'POST' });
  const data = await res.json();
  if (data.stats) state.data.localAccessStats = data.stats;
  renderApiStatsPanel();
  await loadState();
  setOutput(data);
  toast('API 服务统计已清除');
}

function openApiPoolModal() {
  const local = state.data && state.data.localAccess || {};
  state.apiModalOpen = true;
  state.apiModalIds = new Set((local.accountIds || []).filter(Boolean));
  state.apiRestrictFreeAccounts = local.restrictFreeAccounts !== false;
  state.apiPoolQuery = '';
  if ($('apiPoolSearch')) $('apiPoolSearch').value = '';
  if ($('apiRestrictFreeAccounts')) $('apiRestrictFreeAccounts').checked = state.apiRestrictFreeAccounts;
  renderApiPoolAccounts();
  $('apiPoolModal').classList.add('show');
  $('apiPoolModal').setAttribute('aria-hidden', 'false');
  setTimeout(function() { if ($('apiPoolSearch')) $('apiPoolSearch').focus(); }, 0);
}

function closeApiPoolModal() {
  state.apiModalOpen = false;
  if ($('apiPoolModal')) {
    $('apiPoolModal').classList.remove('show');
    $('apiPoolModal').setAttribute('aria-hidden', 'true');
  }
}

async function saveApiPool(options) {
  options = options || {};
  const restrictFreeAccounts = options.restrictFreeAccounts ?? state.apiRestrictFreeAccounts;
  const rawIds = Array.isArray(options.accountIds) ? options.accountIds : selectedApiModalAccountIds();
  const byId = apiAccountById();
  const ids = rawIds.filter(function(id) {
    const account = byId.get(id);
    if (!account || isApiKeyAccount(account)) return false;
    if (restrictFreeAccounts && isFreeAccount(account)) return false;
    return true;
  });
  const res = await fetch('/_admin/local-access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: true, accountIds: ids, restrictFreeAccounts: restrictFreeAccounts })
  });
  const data = await res.json();
  state.data.localAccess = data;
  state.apiAccountIds = new Set(data.accountIds || []);
  state.apiModalIds = new Set(data.accountIds || []);
  state.apiRestrictFreeAccounts = data.restrictFreeAccounts !== false;
  renderLocalAccessMembers();
  renderApiPoolAccounts();
  renderAccounts();
  syncApiSelectionControls();
  toast('已保存 API 服务集合：' + (data.accountIds || []).length + ' 个账号');
  return data;
}


function syncSelectionControls() {
  document.querySelectorAll('[data-wakeup-select]').forEach(function(item) {
    item.checked = state.selectedWakeupIds.has(item.value);
    const card = item.closest('.ghcp-account-card, .wakeup-account-row');
    if (card) card.classList.toggle('selected', item.checked);
  });
  updateSelectedCount();
}

function updateSelectedCount() {
  const count = selectedAccountIds().length;
  document.querySelectorAll('[data-selected-count]').forEach(function(el) {
    el.textContent = count + ' 已选';
  });
  document.querySelectorAll('[data-selected-number]').forEach(function(el) {
    el.textContent = String(count);
  });
}

function setActiveTab(name) {
  state.activeTab = name;
  if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
  document.querySelectorAll('.tab-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.tabTarget === name);
  });
  document.querySelectorAll('.tab-page').forEach(function(page) {
    page.classList.toggle('active', page.id === 'tab-' + name);
  });
  if (name === 'wakeup') {
    renderWakeupAccounts();
    renderWakeupStats();
    renderWakeupSchedule();
    syncSelectionControls();
  } else if (name === 'codexapp') {
    renderCodexAppState();
    renderCodexAppAccounts();
  }
}

function renderAccounts() {
  const list = $('accountsList');
  const currentId = visualCurrentAccountId();
  const apiServiceActive = isApiServiceActive();
  const localAccessIds = new Set((state.data.localAccess && state.data.localAccess.accountIds) || []);
  const accounts = sortedAccounts();
  if ($('accountTotal')) $('accountTotal').textContent = String(accounts.length);
  if (!accounts.length) {
    list.innerHTML = '<section class="ghcp-account-card"><h2 style="margin:0">暂无账号</h2><p class="small-line">点击“添加账号”导入 Codex OAuth 账号。</p></section>';
    updateSelectedCount();
    return;
  }

  list.innerHTML = accounts.map(function(account) {
    const current = account.id === currentId;
    const apiMember = apiServiceActive && localAccessIds.has(account.id);
    const selected = state.selectedWakeupIds.has(account.id);
    const plan = planLabel(account.planType);
    const created = account.createdAt || account.importedAt || account.updatedAt || account.lastUsedAt;
    return '<section class="ghcp-account-card acct-card ' + (current ? 'current ' : '') + (selected ? 'selected ' : '') + '">' +
      '<div class="account-top">' +
        '<div class="account-title"><input type="checkbox" class="wakeup-account" data-wakeup-select value="' + escapeHtml(account.id) + '"' + (selected ? ' checked' : '') + '><div class="account-email" title="' + escapeHtml(account.email || '') + '">' + escapeHtml(maskEmail(account.email)) + '</div></div>' +
        '<div class="badges">' + (current ? '<span class="current-tag">当前</span>' : '') + (apiMember ? '<span class="member-tag">API成员</span>' : '') + '<span class="tier-badge ' + (plan === 'FREE' ? 'free' : '') + '">' + escapeHtml(plan) + '</span></div>' +
      '</div>' +
      '<div class="account-meta">' +
        '<div class="small-line">Team Name：<b>' + escapeHtml(teamLabel(account.teamName)) + '</b></div>' +
        '<div class="small-line">使用 ' + escapeHtml(loginLabel(account)) + ' 登录 | 用户 ID: ' + escapeHtml(maskId(account.userId || account.accountId)) + '</div>' +
      '</div>' +
      quotaSectionHtml(account) +
      subscriptionBox(account) +
      '<div class="card-footer">' +
        '<span class="card-date">' + escapeHtml(formatShortDate(created)) + '</span>' +
        '<div class="card-actions">' +
          '<button class="icon-btn" data-switch-codex-app="' + escapeHtml(account.id) + '" title="登录到 Codex App">${icons.server}</button>' +
          '<button class="icon-btn" data-wakeup-account="' + escapeHtml(account.id) + '" title="唤醒此账号">${icons.play}</button>' +
          '<button class="icon-btn" data-refresh-quota="' + escapeHtml(account.id) + '" title="刷新用量">${icons.refresh}</button>' +
          '<button class="icon-btn" data-export-account="' + escapeHtml(account.id) + '" title="导出账号 JSON">${icons.upload}</button>' +
          '<button class="icon-btn" data-move-account="up" data-account-id="' + escapeHtml(account.id) + '" title="上移账号">↑</button>' +
          '<button class="icon-btn" data-move-account="down" data-account-id="' + escapeHtml(account.id) + '" title="下移账号">↓</button>' +
          '<button class="icon-btn" data-delete-account="' + escapeHtml(account.id) + '" title="删除账号">${icons.trash}</button>' +
        '</div>' +
      '</div>' +
    '</section>';
  }).join('');
  updateSelectedCount();
}

function renderWakeupStats() {
  const accounts = sortedAccounts();
  if ($('wakeupTotalAccounts')) $('wakeupTotalAccounts').textContent = String(accounts.length);
  if ($('wakeupLastStatus')) {
    if (!state.lastWakeupResult) {
      $('wakeupLastStatus').textContent = '-';
    } else {
      $('wakeupLastStatus').textContent = state.lastWakeupResult.successCount + '/' + state.lastWakeupResult.count;
    }
  }
  updateSelectedCount();
}

function renderQuotaAutoRefresh() {
  const schedule = (state.data && state.data.quotaAutoRefresh) || {};
  if ($('quotaAutoRefreshEnabled')) $('quotaAutoRefreshEnabled').checked = !!schedule.enabled;
  if ($('quotaAutoRefreshInterval')) $('quotaAutoRefreshInterval').value = String(schedule.intervalMinutes || 10);
  const status = $('quotaAutoRefreshStatus');
  if (!status) return;
  const last = schedule.lastResult;
  const nextText = schedule.nextRunAt ? formatShortDate(schedule.nextRunAt) : '-';
  const lastText = schedule.lastRunAt ? formatShortDate(schedule.lastRunAt) : '-';
  const resultText = last ? ((last.ok ? '\u6210\u529f ' : '\u5931\u8d25 ') + (last.successCount || 0) + '/' + (last.count || 0)) : '-';
  if (schedule.enabled) {
    status.innerHTML = '\u5df2\u542f\u7528\uff1a\u6bcf ' + escapeHtml(schedule.intervalMinutes || 10) + ' \u5206\u949f \u00b7 \u4e0b\u6b21 ' + escapeHtml(nextText) + ' \u00b7 \u4e0a\u6b21 ' + escapeHtml(resultText) + (schedule.running ? ' \u00b7 \u6b63\u5728\u5237\u65b0...' : '');
  } else {
    status.innerHTML = '\u672a\u542f\u7528' + (last ? ' \u00b7 \u4e0a\u6b21 ' + escapeHtml(lastText) + ' ' + escapeHtml(resultText) : '');
  }
}

async function saveQuotaAutoRefresh(enabledOverride) {
  const enabled = enabledOverride == null ? $('quotaAutoRefreshEnabled').checked : !!enabledOverride;
  const payload = {
    enabled: enabled,
    intervalMinutes: Number($('quotaAutoRefreshInterval').value || 10),
  };
  setOutput('\u6b63\u5728\u4fdd\u5b58\u989d\u5ea6\u81ea\u52a8\u5237\u65b0...');
  const res = await fetch('/_admin/quota-auto-refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    setOutput(data);
    return toast(data.error || '\u4fdd\u5b58\u5931\u8d25');
  }
  state.data.quotaAutoRefresh = data;
  renderQuotaAutoRefresh();
  scheduleStateAutoPoll();
  setOutput(data);
  toast(data.enabled ? '\u989d\u5ea6\u81ea\u52a8\u5237\u65b0\u5df2\u542f\u7528' : '\u989d\u5ea6\u81ea\u52a8\u5237\u65b0\u5df2\u5173\u95ed');
}

async function runQuotaAutoRefreshNow() {
  setOutput('\u6b63\u5728\u5237\u65b0\u6240\u6709\u8d26\u53f7\u989d\u5ea6...');
  const res = await fetch('/_admin/quota-auto-refresh/run-now', { method: 'POST' });
  const data = await res.json();
  setOutput(data);
  await loadState();
  toast(data.ok ? '\u6240\u6709\u8d26\u53f7\u989d\u5ea6\u5df2\u5237\u65b0' : '\u5237\u65b0\u5b8c\u6210\uff0c\u90e8\u5206\u5931\u8d25');
}

function renderWakeupSchedule() {
  const schedule = (state.data && state.data.wakeupSchedule) || {};
  if ($('wakeupScheduleEnabled')) $('wakeupScheduleEnabled').checked = !!schedule.enabled;
  if ($('wakeupScheduleDailyTime')) $('wakeupScheduleDailyTime').value = schedule.dailyTime || '20:00';
  const status = $('wakeupScheduleStatus');
  if (!status) return;
  const last = schedule.lastResult;
  const nextText = schedule.nextRunAt ? formatShortDate(schedule.nextRunAt) : '-';
  const lastText = schedule.lastRunAt ? formatShortDate(schedule.lastRunAt) : '-';
  const resultText = last ? ((last.ok ? '\u6210\u529f ' : '\u5931\u8d25 ') + (last.successCount || 0) + '/' + (last.count || 0)) : '-';
  if (schedule.enabled) {
    const legacyInterval = schedule.mode && schedule.mode !== 'daily';
    const modeText = legacyInterval
      ? ('旧版间隔定时：每 ' + escapeHtml(schedule.intervalMinutes || 240) + ' 分钟，保存后会切换为每日固定时间')
      : ('每天 ' + escapeHtml(schedule.dailyTime || '20:00'));
    status.innerHTML = '已启用 · ' + modeText + ' · ' + escapeHtml((schedule.accountIds || []).length) + ' 个账号<br>下次：' + escapeHtml(nextText) + '<br>上次：' + escapeHtml(lastText) + ' · ' + escapeHtml(resultText) + (schedule.running ? '<br>正在运行中...' : '');
  } else {
    status.innerHTML = '未启用。保存时会使用当前选中的账号、模型和提示词，并按每天固定时间运行。' + (last ? '<br>上次：' + escapeHtml(lastText) + ' · ' + escapeHtml(resultText) : '');
  }
}

function buildWakeupSchedulePayload(enabled) {
  return {
    enabled: !!enabled,
    mode: 'daily',
    intervalMinutes: 1440,
    dailyTime: $('wakeupScheduleDailyTime') ? ($('wakeupScheduleDailyTime').value || '20:00') : '20:00',
    accountIds: selectedAccountIds(),
    model: $('wakeupModel').value.trim() || 'gpt-5.5',
    prompt: $('wakeupPrompt').value.trim() || 'Reply with exactly: OK',
    reasoningEffort: 'medium',
  };
}

async function saveWakeupSchedule(enabledOverride) {
  const enabled = enabledOverride == null ? $('wakeupScheduleEnabled').checked : !!enabledOverride;
  const payload = buildWakeupSchedulePayload(enabled);
  if (payload.enabled && !payload.accountIds.length) return toast('\u8bf7\u81f3\u5c11\u9009\u62e9\u4e00\u4e2a\u8d26\u53f7');
  setOutput('\u6b63\u5728\u4fdd\u5b58\u5b9a\u65f6\u5524\u9192...');
  const res = await fetch('/_admin/wakeup/schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    setOutput(data);
    return toast(data.error || '\u4fdd\u5b58\u5931\u8d25');
  }
  state.data.wakeupSchedule = data;
  renderWakeupSchedule();
  setOutput(data);
  toast(data.enabled ? '\u5b9a\u65f6\u5524\u9192\u5df2\u542f\u7528' : '\u5b9a\u65f6\u5524\u9192\u5df2\u5173\u95ed');
}

async function runWakeupScheduleNow() {
  setActiveTab('wakeup');
  $('wakeupStatusList').innerHTML = '<div class="empty-state">\u6b63\u5728\u8fd0\u884c\u5b9a\u65f6\u5524\u9192...</div>';
  setOutput('\u6b63\u5728\u8fd0\u884c\u5b9a\u65f6\u5524\u9192...');
  const res = await fetch('/_admin/wakeup/schedule/run-now', { method: 'POST' });
  const data = await res.json();
  state.lastWakeupResult = data;
  renderWakeupStats();
  renderWakeupStatusItems(data.results || [], '\u5b9a\u65f6\u5524\u9192\u7acb\u5373\u6267\u884c\u7ed3\u679c');
  setOutput(data);
  await loadState();
}

function renderWakeupAccounts() {
  const box = $('wakeupAccountList');
  if (!box || !state.data) return;
  const accounts = sortedAccounts();
  const apiServiceActive = isApiServiceActive();
  const localAccessIds = new Set((state.data.localAccess && state.data.localAccess.accountIds) || []);
  if (!accounts.length) {
    box.innerHTML = '<div class="empty-state">暂无账号，请先在账号总览里添加。</div>';
    renderWakeupStats();
    return;
  }
  box.innerHTML = accounts.map(function(account) {
    const selected = state.selectedWakeupIds.has(account.id);
    const current = !apiServiceActive && account.id === state.data.currentAccountId;
    const apiMember = apiServiceActive && localAccessIds.has(account.id);
    const badges = (current ? '<span class="current-tag">当前</span>' : '') +
      (apiMember ? '<span class="member-tag">API成员</span>' : '');
    const plan = planLabel(account.planType);
    const quota = account.quota || {};
    const hourly = quota.hourly_percentage == null ? '-' : quota.hourly_percentage + '%';
    const weekly = quota.weekly_percentage == null ? '-' : quota.weekly_percentage + '%';
    return '<label class="wakeup-account-row ' + (selected ? 'selected ' : '') + '">' +
      '<input type="checkbox" class="wakeup-task-account" data-wakeup-select value="' + escapeHtml(account.id) + '"' + (selected ? ' checked' : '') + '>' +
      '<div class="wakeup-account-main">' +
        '<div class="wakeup-account-title"><span>' + escapeHtml(maskEmail(account.email)) + '</span><span class="badges">' + badges + '<span class="tier-badge ' + (plan === 'FREE' ? 'free' : '') + '">' + escapeHtml(plan) + '</span></span></div>' +
        '<div class="wakeup-account-meta">5h ' + escapeHtml(hourly) + ' · Weekly ' + escapeHtml(weekly) + ' · ' + escapeHtml(loginLabel(account)) + '</div>' +
      '</div>' +
    '</label>';
  }).join('');
  renderWakeupStats();
}

function usageText(usage) {
  if (!usage) return 'usage: -';
  return 'tokens: ' + (usage.totalTokens || 0) + ' · input ' + (usage.inputTokens || 0) + ' · output ' + (usage.outputTokens || 0);
}

function renderWakeupStatusItems(items, title) {
  const box = $('wakeupStatusList');
  if (!box) return;
  items = Array.isArray(items) ? items : [];
  if (!items.length) {
    box.innerHTML = '<div class="empty-state">还没有任务记录。</div>';
    return;
  }
  box.innerHTML = '<div class="small-line" style="white-space:normal">' + escapeHtml(title || '任务记录') + '</div>' +
    items.slice(0, 20).map(function(item) {
      const ok = !!item.ok;
      const meta = ok
        ? usageText(item.usage)
        : ('error: ' + String(item.error || 'unknown').slice(0, 160));
      return '<div class="wakeup-status-item">' +
        '<div class="wakeup-status-main">' +
          '<div class="wakeup-status-title"><span>' + escapeHtml(maskEmail(item.email || item.accountId || 'unknown')) + '</span><span class="result-pill ' + (ok ? '' : 'fail') + '">' + (ok ? '成功' : '失败') + '</span></div>' +
          '<div class="wakeup-status-meta">' + escapeHtml(formatShortDate(item.finishedAt || item.startedAt)) + ' · ' + escapeHtml(item.model || '-') + ' · ' + escapeHtml(meta) + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
}

function renderCodexAppState() {
  if (!state.data) return;
  const app = state.data.codexApp || {};
  if ($('codexHomePath')) $('codexHomePath').textContent = app.codexHome || '-';
  if ($('codexAuthPath')) $('codexAuthPath').textContent = app.authPath || '-';
  if ($('codexConfigPath')) $('codexConfigPath').textContent = app.configPath || '-';
  const matched = app.matchedGatewayAccountId;
  const appAuth = app.appAuth || null;
  const apiServiceActive = app.apiService && app.apiService.active;
  if ($('codexAppMatchBadge')) {
    $('codexAppMatchBadge').textContent = apiServiceActive ? 'API \u670d\u52a1\u6a21\u5f0f' : (matched ? '\u5df2\u5339\u914d\u8d26\u53f7\u6c60' : (app.authExists ? '\u672a\u5339\u914d\u8d26\u53f7\u6c60' : '\u672a\u767b\u5f55'));
  }
  if ($('codexAppCurrentText')) {
    $('codexAppCurrentText').textContent = apiServiceActive ? 'API \u670d\u52a1' : (appAuth?.email ? maskEmail(appAuth.email) : '\u672a\u68c0\u6d4b\u5230\u767b\u5f55');
  }
  if ($('quickContextWindow1m')) $('quickContextWindow1m').checked = !!app.quickConfig?.contextWindow1m;
  if ($('quickAutoCompactLimit')) $('quickAutoCompactLimit').value = String(app.quickConfig?.autoCompactTokenLimit || 900000);
}

function renderCodexAppAccounts() {
  const box = $('codexAppAccountList');
  if (!box || !state.data) return;
  const accounts = sortedAccounts();
  const app = state.data.codexApp || {};
  const apiServiceActive = isApiServiceActive();
  const localAccessIds = new Set((state.data.localAccess && state.data.localAccess.accountIds) || []);
  if (!accounts.length) {
    box.innerHTML = '<div class="empty-state">暂无账号，请先导入账号。</div>';
    return;
  }
  box.innerHTML = accounts.map(function(account) {
    const isAppCurrent = !apiServiceActive && account.id === app.matchedGatewayAccountId;
    const isGatewayCurrent = !apiServiceActive && account.id === state.data.currentAccountId;
    const isGatewayDefault = apiServiceActive && account.id === state.data.currentAccountId;
    const apiMember = apiServiceActive && localAccessIds.has(account.id);
    const badges = (apiMember ? '<span class="member-tag">API成员</span>' : '') +
      (isGatewayCurrent ? '<span class="current-tag">网关当前</span>' : '') +
      (isAppCurrent ? '<span class="current-tag">App 已登录</span>' : '') +
      (isGatewayDefault ? '<span class="default-tag" title="API 服务模式下不是正在调用的账号，只是单账号模式/手动切换的默认值">单账号默认</span>' : '');
    const useLabel = apiServiceActive ? '设为单账号默认' : '设为网关当前';
    const useDisabled = (isGatewayCurrent || isGatewayDefault) ? ' disabled' : '';
    const plan = planLabel(account.planType);
    return '<div class="codex-app-account-card ' + (isAppCurrent ? 'active ' : '') + (apiMember ? 'api-member ' : '') + '">' +
      '<div class="account-top" style="margin-bottom:0">' +
        '<div class="account-title"><div class="account-email" title="' + escapeHtml(account.email || '') + '">' + escapeHtml(maskEmail(account.email)) + '</div></div>' +
        '<div class="badges">' + badges + '<span class="tier-badge ' + (plan === 'FREE' ? 'free' : '') + '">' + escapeHtml(plan) + '</span></div>' +
      '</div>' +
      '<div class="small-line">使用 ' + escapeHtml(loginLabel(account)) + ' 登录 | 用户 ID: ' + escapeHtml(maskId(account.userId || account.accountId)) + '</div>' +
      '<div class="inline-actions" style="justify-content:flex-start">' +
        '<button class="primary" data-switch-codex-app="' + escapeHtml(account.id) + '">${icons.server} 登录到 Codex App</button>' +
        '<button data-use-account="' + escapeHtml(account.id) + '"' + useDisabled + '>' + useLabel + '</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

async function reloadCodexAppState() {
  const res = await fetch('/_admin/codex-app/state');
  const data = await res.json();
  state.data.codexApp = data;
  renderCodexAppState();
  renderCodexAppAccounts();
  return data;
}

async function switchCodexAppAccount(accountId) {
  const account = (state.data.accounts || []).find(function(item) { return item.id === accountId; });
  const label = account ? maskEmail(account.email) : accountId;
  if (!confirm('确定把 ' + label + ' 写入本机 Codex App 登录文件？\\n\\n会备份并覆盖 ~/.codex/auth.json。')) return;
  setOutput('正在切换 Codex App 登录账号...');
  const res = await fetch('/_admin/codex-app/switch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId: accountId, makeGatewayCurrent: true, backup: true, restartCodexApp: true })
  });
  const data = await res.json();
  setOutput(data);
  await loadState();
  setActiveTab('codexapp');
  toast(data.ok ? '\u5df2\u5199\u5165 Codex App \u767b\u5f55\uff0c\u5df2\u5b89\u6392\u81ea\u52a8\u91cd\u542f' : '\u5207\u6362\u5931\u8d25');
}

async function saveQuickConfig() {
  setOutput('正在保存 Codex quick config...');
  const res = await fetch('/_admin/codex-app/quick-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contextWindow1m: $('quickContextWindow1m').checked,
      autoCompactTokenLimit: Number($('quickAutoCompactLimit').value || 900000)
    })
  });
  const data = await res.json();
  setOutput(data);
  await reloadCodexAppState();
  toast('已保存 config.toml');
}

function scheduleStateAutoPoll(delayOverride) {
  if (state.statePollTimer) {
    clearTimeout(state.statePollTimer);
    state.statePollTimer = null;
  }
  const schedule = (state.data && state.data.quotaAutoRefresh) || {};
  if (!schedule.enabled && delayOverride == null) return;
  const now = Date.now();
  let delay = Number(delayOverride || 0);
  if (!delay) {
    if (schedule.running) {
      delay = 5000;
    } else if (Number(schedule.nextRunAt || 0) > now) {
      delay = Number(schedule.nextRunAt) - now + 3000;
    } else {
      delay = 5000;
    }
  }
  delay = Math.max(5000, Math.min(delay, 60000));
  state.statePollTimer = setTimeout(function() {
    state.statePollTimer = null;
    loadState({ silent: true }).catch(function(err) {
      console.warn('[admin] state auto poll failed:', err);
      if (state.data && state.data.quotaAutoRefresh && state.data.quotaAutoRefresh.enabled) {
        scheduleStateAutoPoll(15000);
      }
    });
  }, delay);
}

async function loadState() {
  if (state.loadingState) return;
  state.loadingState = true;
  try {
  const res = await fetch('/_admin/state?_=' + Date.now(), { cache: 'no-store' });
  state.data = await res.json();
  const localAccessIds = (state.data.localAccess && state.data.localAccess.accountIds) || [];
  state.apiAccountIds = new Set(localAccessIds);
  state.apiRestrictFreeAccounts = !(state.data.localAccess && state.data.localAccess.restrictFreeAccounts === false);
  if (!state.apiModalOpen) state.apiModalIds = new Set(localAccessIds);
  state.apiSelectionInitialized = true;
  normalizeAccountOrder();
  state.selectionInitialized = true;
  $('baseUrl').textContent = state.data.baseUrl;
  $('apiKeyMasked').textContent = state.showKey ? state.data.apiKey : state.data.apiKeyMasked;
  if ($('localAccessStatus')) {
    const local = state.data.localAccess || {};
    const running = isApiServiceActive();
    $('localAccessStatus').textContent = running ? '当前 · 已接入' : (local.enabled === false ? '已停用' : '运行中');
    $('localAccessStatus').classList.toggle('live', running);
    if ($('localAccessCard')) $('localAccessCard').classList.toggle('current', running);
  }
  if ($('localAccessHint')) {
    const ids = (state.data.localAccess && state.data.localAccess.accountIds) || [];
    const active = state.data.codexApp && state.data.codexApp.apiService && state.data.codexApp.apiService.active;
    $('localAccessHint').textContent = (active ? 'Codex App 已接入本地 API 服务。' : '点击“添加账号”维护 API 服务集合；播放按钮才会切到 API 服务模式。') + (ids.length ? ' 已保存集合：' + ids.length + ' 个。' : '');
  }
  renderLocalAccessMembers();
  renderAccounts();
  renderApiPoolAccounts();
  renderApiStatsPanel();
  renderQuotaAutoRefresh();
  renderWakeupAccounts();
  renderWakeupStats();
  renderWakeupSchedule();
  renderCodexAppState();
  renderCodexAppAccounts();
  syncSelectionControls();
  syncApiSelectionControls();
  scheduleStateAutoPoll();
  } finally {
    state.loadingState = false;
  }
}

async function copyText(text) {
  await navigator.clipboard.writeText(text);
  toast('已复制');
}

async function testModels() {
  setOutput('请求 /v1/models ...');
  const res = await fetch('/v1/models', { headers: { Authorization: 'Bearer ' + state.data.apiKey } });
  setOutput(await res.json());
}

async function testChat() {
  setOutput('请求 /v1/chat/completions ...');
  const res = await fetch('/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + state.data.apiKey, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ model: 'gpt-5.5', stream: true, messages: [{ role: 'user', content: 'Reply with exactly: OK' }] })
  });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  while (true) {
    const r = await reader.read();
    if (r.done) break;
    text += decoder.decode(r.value, { stream: true });
    setOutput(text);
  }
}


async function activateApiServiceForCodexApp() {
  const ids = selectedApiAccountIds();
  if (!ids.length) {
    alert('\u8bf7\u5148\u70b9\u51fb API \u670d\u52a1\u5361\u7247\u7684\u201c\u6dfb\u52a0\u8d26\u53f7\u201d\uff0c\u4fdd\u5b58\u81f3\u5c11 1 \u4e2a OAuth \u8d26\u53f7\u5230 API \u670d\u52a1\u96c6\u5408\u3002');
    return;
  }
  const confirmMessage = '\u786e\u5b9a\u628a Codex App \u5207\u6362\u5230\u672c\u5730 API \u670d\u52a1\u6a21\u5f0f\u5417\uff1f'
    + String.fromCharCode(10, 10)
    + '\u5c06\u4f7f\u7528\u5df2\u4fdd\u5b58\u7684 ' + ids.length + ' \u4e2a\u96c6\u5408\u8d26\u53f7\uff1b\u4f1a\u5907\u4efd\u5e76\u8986\u76d6 ~/.codex/auth.json \u548c config.toml\uff0c\u7136\u540e\u81ea\u52a8\u91cd\u542f Codex App\u3002';
  if (!confirm(confirmMessage)) return;
  setOutput('\u6b63\u5728\u5199\u5165 Codex App API \u670d\u52a1\u914d\u7f6e...');
  const restrictFreeAccounts = !(state.data.localAccess && state.data.localAccess.restrictFreeAccounts === false);
  const res = await fetch('/_admin/codex-app/api-service', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountIds: ids, restrictFreeAccounts: restrictFreeAccounts, backup: true, restartCodexApp: true })
  });
  const data = await res.json();
  setOutput(data);
  await loadState();
  setActiveTab('overview');
  toast(data.ok ? '\u5df2\u5199\u5165 API \u670d\u52a1\u6a21\u5f0f\uff0c\u5df2\u5b89\u6392\u91cd\u542f Codex App' : '\u5199\u5165\u5931\u8d25');
}

async function rotateKey() {
  if (!confirm('确定轮换 API Key？旧客户端需要更新密钥。')) return;
  const res = await fetch('/_admin/rotate-key', { method: 'POST' });
  const data = await res.json();
  setOutput(data);
  await loadState();
}

async function shutdownGateway() {
  if (!confirm('确定停止 API 服务？停止后需要用桌面快捷方式重新启动。')) return;
  try {
    const res = await fetch('/_admin/shutdown', { method: 'POST' });
    setOutput(await res.json());
  } catch (err) {
    setOutput(String(err));
  }
}

function setOauthStatus(text, tone) {
  const el = $('oauthStatus');
  if (!el) return;
  el.textContent = text || '';
  el.classList.add('show');
  el.classList.toggle('success', tone === 'success');
  el.classList.toggle('error', tone === 'error');
}

function clearOauthPoll() {
  if (state.oauthPollTimer) {
    clearInterval(state.oauthPollTimer);
    state.oauthPollTimer = null;
  }
}

function resetOauthUi() {
  clearOauthPoll();
  state.oauthLoginId = null;
  state.oauthUrl = '';
  state.oauthCompleting = false;
  if ($('oauthUrlInput')) $('oauthUrlInput').value = '';
  if ($('oauthCallbackInput')) $('oauthCallbackInput').value = '';
  setOauthStatus('正在准备授权链接...');
}

function setAddAccountTab(tab) {
  state.addTab = tab || 'oauth';
  document.querySelectorAll('[data-add-tab]').forEach(function(button) {
    button.classList.toggle('active', button.dataset.addTab === state.addTab);
  });
  ['oauth', 'token', 'local'].forEach(function(name) {
    const el = $('addSection' + name.charAt(0).toUpperCase() + name.slice(1));
    if (el) el.classList.toggle('active', name === state.addTab);
  });
  if (state.addTab === 'oauth' && !state.oauthLoginId) startOauthFlow(false);
}

async function cancelOauthFlow() {
  clearOauthPoll();
  const loginId = state.oauthLoginId;
  state.oauthLoginId = null;
  state.oauthUrl = '';
  if (!loginId) return;
  try {
    await fetch('/_admin/codex/oauth/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginId: loginId })
    });
  } catch {
    // ignore cancel failures
  }
}

function openAddAccountModal(tab) {
  const modal = $('accountAddModal');
  if (!modal) return;
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  setAddAccountTab(tab || 'oauth');
}

async function closeAddAccountModal() {
  const modal = $('accountAddModal');
  if (modal) {
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
  }
  await cancelOauthFlow();
}

async function startOauthFlow(force) {
  if (state.oauthLoginId && !force) return;
  if (state.oauthLoginId && force) await cancelOauthFlow();
  resetOauthUi();
  setOauthStatus('正在准备授权链接...');
  try {
    const res = await fetch('/_admin/codex/oauth/start', { method: 'POST' });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || ('HTTP ' + res.status));
    state.oauthLoginId = data.loginId;
    state.oauthUrl = data.authUrl || '';
    if ($('oauthUrlInput')) $('oauthUrlInput').value = state.oauthUrl;
    setOauthStatus('授权链接已生成，请点击“在浏览器中打开”。');
    clearOauthPoll();
    state.oauthPollTimer = setInterval(pollOauthStatus, 1500);
  } catch (err) {
    setOauthStatus(String(err.message || err), 'error');
    setOutput(String(err.message || err));
  }
}

async function completeOauthFlow() {
  if (!state.oauthLoginId || state.oauthCompleting) return;
  state.oauthCompleting = true;
  clearOauthPoll();
  setOauthStatus('正在交换 token 并保存账号...');
  try {
    const res = await fetch('/_admin/codex/oauth/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginId: state.oauthLoginId })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || ('HTTP ' + res.status));
    setOauthStatus('授权成功，账号已导入。', 'success');
    setOutput(data);
    await loadState();
    state.oauthLoginId = null;
    state.oauthUrl = '';
    setTimeout(function() {
      if ($('accountAddModal')) {
        $('accountAddModal').classList.remove('show');
        $('accountAddModal').setAttribute('aria-hidden', 'true');
      }
    }, 900);
  } catch (err) {
    setOauthStatus(String(err.message || err), 'error');
    setOutput(String(err.message || err));
    if (state.oauthLoginId) state.oauthPollTimer = setInterval(pollOauthStatus, 2500);
  } finally {
    state.oauthCompleting = false;
  }
}

async function pollOauthStatus() {
  if (!state.oauthLoginId || state.oauthCompleting) return;
  try {
    const res = await fetch('/_admin/codex/oauth/status?loginId=' + encodeURIComponent(state.oauthLoginId));
    const data = await res.json();
    if (!data.active) return;
    if (data.expired) {
      clearOauthPoll();
      setOauthStatus('授权链接已超时，请点击“刷新授权链接”后重试。', 'error');
      return;
    }
    if (data.completed) {
      await completeOauthFlow();
    }
  } catch {
    // keep polling; transient admin reloads are acceptable
  }
}

async function submitOauthCallbackUrl() {
  const callbackUrl = $('oauthCallbackInput') ? $('oauthCallbackInput').value.trim() : '';
  if (!callbackUrl) return toast('请先粘贴回调地址');
  if (!state.oauthLoginId) return toast('请先生成授权链接');
  setOauthStatus('正在提交回调地址...');
  try {
    const res = await fetch('/_admin/codex/oauth/callback-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginId: state.oauthLoginId, callbackUrl: callbackUrl })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || ('HTTP ' + res.status));
    await completeOauthFlow();
  } catch (err) {
    setOauthStatus(String(err.message || err), 'error');
    setOutput(String(err.message || err));
  }
}

async function importCurrent() {
  setOutput('正在从当前 ~/.codex/auth.json 导入...');
  const res = await fetch('/_admin/import-current', { method: 'POST' });
  setOutput(await res.json());
  await loadState();
}

function selectedImportFormat() {
  const select = $('importFormatSelect');
  return select ? select.value : (state.importFormat || 'auto');
}

function syncImportFormatHelp() {
  const format = selectedImportFormat();
  state.importFormat = format;
  if ($('importFormatHelp')) {
    $('importFormatHelp').textContent = importFormatHelpText[format] || importFormatHelpText.auto;
  }
}

async function importJson() {
  const jsonContent = $('authJsonInput').value.trim();
  if (!jsonContent) return toast('请先粘贴账号 JSON');
  const importFormat = selectedImportFormat();
  setOutput('正在导入粘贴内容...');
  const res = await fetch('/_admin/import-json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonContent: jsonContent, format: importFormat })
  });
  const data = await res.json();
  setOutput(data);
  if (data.ok) $('authJsonInput').value = '';
  await loadState();
}

async function useAccount(accountId) {
  const res = await fetch('/_admin/use-account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId: accountId })
  });
  setOutput(await res.json());
  await loadState();
}

async function deleteAccount(accountId) {
  if (!confirm('确定删除这个账号？')) return;
  const res = await fetch('/_admin/account?accountId=' + encodeURIComponent(accountId), { method: 'DELETE' });
  setOutput(await res.json());
  await loadState();
}

async function runWakeup(accountIds) {
  accountIds = accountIds || selectedAccountIds();
  if (!accountIds.length) return toast('请至少选择一个账号');
  setActiveTab('wakeup');
  $('wakeupStatusList').innerHTML = '<div class="empty-state">正在唤醒 ' + accountIds.length + ' 个账号...</div>';
  setOutput('正在唤醒 ' + accountIds.length + ' 个账号...');
  const res = await fetch('/_admin/wakeup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accountIds: accountIds,
      model: $('wakeupModel').value.trim() || 'gpt-5.5',
      prompt: $('wakeupPrompt').value.trim() || 'Reply with exactly: OK'
    })
  });
  const data = await res.json();
  state.lastWakeupResult = data;
  renderWakeupStats();
  renderWakeupStatusItems(data.results || [], '本次执行结果');
  setOutput(data);
  await loadState();
}

async function refreshQuota(accountIds) {
  accountIds = accountIds || selectedAccountIds();
  if (!accountIds.length) return toast('请至少选择一个账号');
  if (state.activeTab === 'wakeup') {
    $('wakeupStatusList').innerHTML = '<div class="empty-state">正在刷新 ' + accountIds.length + ' 个账号的用量...</div>';
  }
  setOutput('正在刷新 ' + accountIds.length + ' 个账号的用量...');
  const res = await fetch('/_admin/refresh-quotas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountIds: accountIds })
  });
  const data = await res.json();
  setOutput(data);
  if (state.activeTab === 'wakeup') {
    renderWakeupStatusItems((data.results || []).map(function(item) {
      return {
        ok: item.ok,
        email: item.email || (item.account && item.account.email) || item.accountId,
        accountId: item.accountId || (item.account && item.account.id),
        model: 'refresh-quota',
        error: item.error,
        finishedAt: Date.now()
      };
    }), '刷新用量结果');
  }
  await loadState();
}

async function loadWakeupHistory() {
  setActiveTab('wakeup');
  const res = await fetch('/_admin/wakeup/history');
  const data = await res.json();
  state.wakeupHistory = data.history || [];
  renderWakeupStatusItems(state.wakeupHistory, '最近唤醒历史');
  setOutput(data);
}

function selectedExportFormat() {
  const select = $('exportFormatSelect');
  return select ? select.value : (state.exportFormat || 'gateway');
}

function syncExportFormatHelp() {
  const format = selectedExportFormat();
  state.exportFormat = format;
  if ($('exportFormatHelp')) {
    $('exportFormatHelp').textContent = exportFormatHelpText[format] || exportFormatHelpText.gateway;
  }
}

function closeExportAccountsModal() {
  const modal = $('exportAccountsModal');
  if (modal) {
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
  }
}

function exportAccountsJson(accountIds) {
  const ids = Array.isArray(accountIds) ? accountIds.filter(Boolean) : [];
  if (!ids.length) return toast('请先选择要导出的账号');
  state.exportAccountIds = ids;
  if ($('exportAccountsCount')) $('exportAccountsCount').textContent = String(ids.length);
  if ($('exportFormatSelect')) $('exportFormatSelect').value = state.exportFormat || 'gateway';
  syncExportFormatHelp();
  const modal = $('exportAccountsModal');
  if (modal) {
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
  }
}

async function confirmExportAccountsJson() {
  const ids = Array.isArray(state.exportAccountIds) ? state.exportAccountIds.filter(Boolean) : [];
  if (!ids.length) return toast('请先选择要导出的账号');
  const format = selectedExportFormat();
  const confirmBtn = $('exportAccountsConfirmBtn');
  if (confirmBtn) confirmBtn.disabled = true;
  setOutput('正在导出账号 JSON...');
  try {
    const res = await fetch('/_admin/export-accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountIds: ids, format: format })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setOutput(data);
      return toast('导出失败');
    }
    const content = Object.prototype.hasOwnProperty.call(data, 'content') ? data.content : (data.accounts || []);
    const count = Number(data.count || (data.accounts || []).length || ids.length);
    const filename = data.filename || exportFileName(count, data.format || format);
    const json = JSON.stringify(content, null, 2);
    downloadTextFile(filename, json);
    closeExportAccountsModal();
    setOutput({
      ok: true,
      format: data.format || format,
      count: data.count,
      filename: filename,
      documents: Array.isArray(data.documents) ? data.documents.length : 0,
      message: '已生成账号导出文件。为避免泄露，运行输出不显示 tokens。'
    });
    toast('导出完成');
  } catch (err) {
    setOutput(String(err.message || err));
    return toast('导出失败');
  } finally {
    if (confirmBtn) confirmBtn.disabled = false;
  }
}

document.addEventListener('click', function(event) {
  const target = event.target && event.target.closest ? event.target.closest('button, [data-tab-target]') : event.target;
  const tabTarget = target && target.dataset && target.dataset.tabTarget;
  if (tabTarget) setActiveTab(tabTarget);
  const copy = target && target.dataset && target.dataset.copy;
  if (copy) copyText($(copy).textContent);
  const secret = target && target.dataset && target.dataset.copySecret;
  if (secret) copyText(state.data[secret]);
  const useId = target && target.dataset && target.dataset.useAccount;
  if (useId) useAccount(useId);
  const wakeId = target && target.dataset && target.dataset.wakeupAccount;
  if (wakeId) runWakeup([wakeId]);
  const switchCodexAppId = target && target.dataset && target.dataset.switchCodexApp;
  if (switchCodexAppId) switchCodexAppAccount(switchCodexAppId);
  const refreshId = target && target.dataset && target.dataset.refreshQuota;
  if (refreshId) refreshQuota([refreshId]);
  const exportId = target && target.dataset && target.dataset.exportAccount;
  if (exportId) exportAccountsJson([exportId]);
  const moveDirection = target && target.dataset && target.dataset.moveAccount;
  const moveAccountId = target && target.dataset && target.dataset.accountId;
  if (moveDirection && moveAccountId) moveAccountOrder(moveAccountId, moveDirection);
  const deleteId = target && target.dataset && target.dataset.deleteAccount;
  if (deleteId) deleteAccount(deleteId);
  const statsRange = target && target.dataset && target.dataset.statsRange;
  if (statsRange) {
    state.statsRange = statsRange;
    renderApiStatsPanel();
  }
});

document.addEventListener('change', function(event) {
  if (event.target && event.target.matches && event.target.matches('[data-wakeup-select]')) {
    if (event.target.checked) state.selectedWakeupIds.add(event.target.value);
    else state.selectedWakeupIds.delete(event.target.value);
    syncSelectionControls();
    renderWakeupStats();
    renderWakeupSchedule();
  }
  if (event.target && event.target.matches && event.target.matches('[data-api-modal-select]')) {
    if (event.target.checked) state.apiModalIds.add(event.target.value);
    else state.apiModalIds.delete(event.target.value);
    syncApiSelectionControls();
  }
  if (event.target && event.target.id === 'apiRestrictFreeAccounts') {
    state.apiRestrictFreeAccounts = event.target.checked;
    if (state.apiRestrictFreeAccounts) {
      const byId = apiAccountById();
      Array.from(state.apiModalIds).forEach(function(id) {
        const account = byId.get(id);
        if (account && isFreeAccount(account)) state.apiModalIds.delete(id);
      });
    }
    renderApiPoolAccounts();
  }
});

$('addAccountBtn').onclick = openApiPoolModal;
$('overviewImportAccountBtn').onclick = function() { openAddAccountModal('oauth'); };
$('overviewExportSelectedBtn').onclick = function() { exportAccountsJson(selectedAccountIds()); };
$('exportAccountsModalCloseBtn').onclick = closeExportAccountsModal;
$('exportAccountsCancelBtn').onclick = closeExportAccountsModal;
$('exportAccountsConfirmBtn').onclick = confirmExportAccountsJson;
$('exportAccountsModal').onclick = function(event) { if (event.target === $('exportAccountsModal')) closeExportAccountsModal(); };
$('exportFormatSelect').onchange = syncExportFormatHelp;
$('accountAddModalCloseBtn').onclick = closeAddAccountModal;
$('accountAddCancelBtn').onclick = closeAddAccountModal;
$('accountAddModal').onclick = function(event) { if (event.target === $('accountAddModal')) closeAddAccountModal(); };
document.querySelectorAll('[data-add-tab]').forEach(function(button) {
  button.onclick = function() { setAddAccountTab(button.dataset.addTab); };
});
$('retryOauthBtn').onclick = function() { startOauthFlow(true); };
$('openOauthUrlBtn').onclick = function() {
  if (!state.oauthUrl) return toast('授权链接还没有生成');
  window.open(state.oauthUrl, '_blank', 'noopener,noreferrer');
};
$('copyOauthUrlBtn').onclick = function() {
  if (!state.oauthUrl) return toast('授权链接还没有生成');
  copyText(state.oauthUrl);
};
$('submitOauthCallbackBtn').onclick = submitOauthCallbackUrl;
$('apiPoolModalCloseBtn').onclick = closeApiPoolModal;
$('apiPoolCancelBtn').onclick = closeApiPoolModal;
$('apiPoolModal').onclick = function(event) { if (event.target === $('apiPoolModal')) closeApiPoolModal(); };
$('apiPoolSearch').oninput = function(event) { state.apiPoolQuery = event.target.value; renderApiPoolAccounts(); };
$('toggleKeyBtn').onclick = function() {
  state.showKey = !state.showKey;
  $('apiKeyMasked').textContent = state.showKey ? state.data.apiKey : state.data.apiKeyMasked;
  if ($('statsApiKey')) $('statsApiKey').textContent = state.showKey ? state.data.apiKey : state.data.apiKeyMasked;
};
$('copyChatBtn').onclick = function() { copyText(state.data.baseUrl + '/chat/completions'); };
$('reloadBtn').onclick = loadState;
$('testModelsBtn').onclick = openApiStatsModal;
$('apiStatsModalCloseBtn').onclick = closeApiStatsModal;
$('apiStatsCloseFooterBtn').onclick = closeApiStatsModal;
$('apiStatsModal').onclick = function(event) { if (event.target === $('apiStatsModal')) closeApiStatsModal(); };
$('apiStatsRefreshBtn').onclick = function() { loadState().then(function() { renderApiStatsPanel(); toast('统计已刷新'); }); };
$('apiStatsClearBtn').onclick = clearApiStats;
$('activateApiServiceBtn').onclick = activateApiServiceForCodexApp;
$('saveApiPoolBtn').onclick = function() { saveApiPool().then(closeApiPoolModal).catch(function(err) { setOutput(String(err)); }); };
$('apiPoolSelectAllBtn').onclick = function() {
  sortedAccounts().forEach(function(account) {
    if (isApiKeyAccount(account)) return;
    if (state.apiRestrictFreeAccounts && isFreeAccount(account)) return;
    state.apiModalIds.add(account.id);
  });
  renderApiPoolAccounts();
};
$('apiPoolClearBtn').onclick = function() {
  state.apiModalIds.clear();
  renderApiPoolAccounts();
};
$('rotateBtn').onclick = rotateKey;
$('shutdownBtn').onclick = shutdownGateway;
$('importCurrentBtn').onclick = importCurrent;
$('importJsonBtn').onclick = importJson;
$('importFormatSelect').onchange = syncImportFormatHelp;
$('overviewOpenWakeupBtn').onclick = function() { setActiveTab('wakeup'); };
$('overviewRefreshAllBtn').onclick = function() { refreshQuota(allAccountIds()); };
$('saveQuotaAutoRefreshBtn').onclick = function() { saveQuotaAutoRefresh(); };
$('runQuotaAutoRefreshNowBtn').onclick = runQuotaAutoRefreshNow;
$('reloadCodexAppBtn').onclick = function() { reloadCodexAppState().then(function() { toast('已重新检测 Codex App'); }); };
$('saveQuickConfigBtn').onclick = saveQuickConfig;
$('runWakeupBtn').onclick = function() { runWakeup(); };
$('refreshSelectedQuotaBtn').onclick = function() { refreshQuota(); };
$('loadWakeupHistoryBtn').onclick = loadWakeupHistory;
$('saveWakeupScheduleBtn').onclick = function() { saveWakeupSchedule(); };
$('disableWakeupScheduleBtn').onclick = function() { $('wakeupScheduleEnabled').checked = false; saveWakeupSchedule(false); };
$('runWakeupScheduleNowBtn').onclick = runWakeupScheduleNow;
$('selectAllWakeupBtn').onclick = function() {
  allAccountIds().forEach(function(id) { state.selectedWakeupIds.add(id); });
  syncSelectionControls();
  renderWakeupAccounts();
};
$('clearWakeupSelectionBtn').onclick = function() {
  state.selectedWakeupIds.clear();
  syncSelectionControls();
  renderWakeupAccounts();
};
$('clearWakeupStatusBtn').onclick = function() {
  state.lastWakeupResult = null;
  renderWakeupStats();
  $('wakeupStatusList').innerHTML = '<div class="empty-state">还没有运行唤醒任务。</div>';
};
$('toggleOutputBtn').onclick = function() { $('outputPanel').classList.remove('show'); };

loadState()
  .then(function() {
    setActiveTab(location.hash === '#wakeup' ? 'wakeup' : (location.hash === '#codexapp' ? 'codexapp' : 'overview'));
  })
  .catch(function(err) { setOutput(String(err)); });
</script>
</body>
</html>`;
}
