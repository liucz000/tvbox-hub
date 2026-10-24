/**
 * 单页管理后台。只用原生 DOM API，所有动态内容走 textContent，避免注入。
 */
export function adminPage(version: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>tvbox-hub 管理后台</title>
<style>
  :root { color-scheme: dark; --bg:#0f1115; --card:#171a21; --line:#262b36; --text:#e6e8ee; --muted:#8b93a7; --accent:#4f8cff; --bad:#ff5c5c; --ok:#3ddc97; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:14px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,"PingFang SC","Microsoft YaHei",sans-serif; }
  .wrap { max-width: 960px; margin: 0 auto; padding: 32px 20px 64px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: var(--muted); font-size: 12px; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 18px; margin-top: 18px; }
  .row { display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
  .grow { flex:1; }
  .grid { display:grid; grid-template-columns: repeat(auto-fit,minmax(120px,1fr)); gap:12px; }
  .metric { background:#11141a; border:1px solid var(--line); border-radius:10px; padding:10px 12px; }
  .metric b { display:block; font-size:20px; }
  .metric span { color:var(--muted); font-size:12px; }
  input { background:#0c0e13; color:var(--text); border:1px solid var(--line); border-radius:8px; padding:9px 11px; font-size:13px; width:100%; }
  button { background:var(--accent); color:#fff; border:0; border-radius:8px; padding:9px 14px; font-size:13px; cursor:pointer; }
  button.ghost { background:transparent; border:1px solid var(--line); color:var(--text); }
  button.danger { background:transparent; border:1px solid #5c2b2b; color:var(--bad); padding:5px 9px; font-size:12px; }
  button:disabled { opacity:.5; cursor:not-allowed; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  td, th { text-align:left; padding:7px 6px; border-bottom:1px solid var(--line); vertical-align:top; }
  th { color:var(--muted); font-weight:500; font-size:12px; }
  .badge { font-size:11px; padding:1px 7px; border-radius:999px; border:1px solid var(--line); color:var(--muted); }
  .ok { color:var(--ok); }
  .bad { color:var(--bad); }
  a { color:var(--accent); text-decoration:none; }
  .msg { min-height:20px; font-size:12px; color:var(--muted); }
  .hidden { display:none !important; }
  .mono { font-family: ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:12px; word-break:break-all; }
</style>
</head>
<body>
<div class="wrap">
  <h1>tvbox-hub <span class="badge">v${version}</span></h1>
  <div class="sub">聚合配置服务 · 管理后台</div>

  <div class="card" id="loginPanel">
    <div class="row">
      <div class="grow"><input id="tokenInput" type="password" placeholder="ADMIN_TOKEN" autocomplete="current-password" /></div>
      <button id="loginBtn">登录</button>
    </div>
    <div class="msg" id="loginMsg"></div>
  </div>

  <div id="main" class="hidden">
    <div class="card">
      <div class="row" style="margin-bottom:14px">
        <div class="grow"><b>运行状态</b> <span id="stateText" class="badge">未知</span></div>
        <button id="refreshBtn">立即刷新</button>
        <button class="ghost" id="logoutBtn">退出</button>
      </div>
      <div class="grid">
        <div class="metric"><b id="mSites">-</b><span>站点</span></div>
        <div class="metric"><b id="mParses">-</b><span>解析</span></div>
        <div class="metric"><b id="mLive">-</b><span>直播频道</span></div>
        <div class="metric"><b id="mSources">-</b><span>可用源</span></div>
        <div class="metric"><b id="mJars">-</b><span>JAR</span></div>
      </div>
      <div class="msg" id="statusMsg" style="margin-top:12px"></div>
      <div class="row" style="margin-top:6px">
        <a href="/" target="_blank" rel="noreferrer">配置文件 /</a>
        <a href="/live.m3u" target="_blank" rel="noreferrer">直播 /live.m3u</a>
        <a href="/live.txt" target="_blank" rel="noreferrer">直播 /live.txt</a>
        <a href="/status-data" target="_blank" rel="noreferrer">状态 JSON</a>
      </div>
    </div>

    <div class="card">
      <b>添加源</b>
      <div class="row" style="margin-top:10px">
        <div style="width:180px"><input id="srcName" placeholder="名称（可选）" /></div>
        <div class="grow"><input id="srcUrl" placeholder="https://example.com/tvbox.json" /></div>
        <button id="addBtn">添加</button>
      </div>
      <div class="msg" id="addMsg"></div>
    </div>

    <div class="card">
      <div class="row" style="margin-bottom:8px"><b class="grow">源列表</b><button class="ghost" id="reloadBtn">重新加载</button></div>
      <table>
        <thead><tr><th style="width:120px">名称</th><th>地址</th><th style="width:88px">类型</th><th style="width:70px"></th></tr></thead>
        <tbody id="sourceBody"></tbody>
      </table>
      <div class="msg" id="sourceMsg"></div>
    </div>
  </div>
</div>

<script>
(function () {
  var TOKEN_KEY = 'tvbox_hub_token';
  var token = sessionStorage.getItem(TOKEN_KEY) || '';
  var polling = null;

  function el(id) { return document.getElementById(id); }
  function setMsg(id, text, bad) {
    var node = el(id);
    node.textContent = text || '';
    node.className = 'msg' + (bad ? ' bad' : '');
  }
  function showMain(on) {
    el('loginPanel').className = on ? 'card hidden' : 'card';
    el('main').className = on ? '' : 'hidden';
  }
  function authHeaders(extra) {
    var headers = Object.assign({}, extra || {});
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return headers;
  }
  function request(path, options) {
    var opts = Object.assign({}, options || {});
    opts.headers = authHeaders(opts.headers);
    return fetch(path, opts).then(function (res) {
      if (res.status === 401 || res.status === 503) {
        token = '';
        sessionStorage.removeItem(TOKEN_KEY);
        showMain(false);
        setMsg('loginMsg', '令牌无效或管理接口未开启', true);
        throw new Error('unauthorized');
      }
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data && data.error ? data.error : ('HTTP ' + res.status));
        return data;
      });
    });
  }
  function renderStatus(data) {
    var status = data.status;
    var state = el('stateText');
    if (data.running) { state.textContent = '刷新中'; state.className = 'badge'; }
    else if (status && status.ok) { state.textContent = '正常'; state.className = 'badge ok'; }
    else if (status) { state.textContent = '异常'; state.className = 'badge bad'; }
    else { state.textContent = '尚未聚合'; state.className = 'badge'; }

    if (!status) { setMsg('statusMsg', '还没有聚合结果，点击“立即刷新”。', false); return; }
    el('mSites').textContent = status.counts.sites;
    el('mParses').textContent = status.counts.parses;
    el('mLive').textContent = status.counts.liveChannels;
    el('mSources').textContent = status.counts.sourcesOk + '/' + status.counts.sources;
    el('mJars').textContent = status.counts.jars;
    var when = new Date(status.generatedAt);
    var text = '生成于 ' + (isNaN(when.getTime()) ? status.generatedAt : when.toLocaleString()) + '，耗时 ' + status.durationMs + 'ms';
    if (status.error) text += '；错误：' + status.error;
    var failed = status.sources.filter(function (s) { return !s.ok; });
    if (failed.length) text += '；失败源：' + failed.map(function (s) { return s.name; }).join('、');
    setMsg('statusMsg', text, !status.ok);
  }
  function loadStatus() {
    return request('/admin/status').then(renderStatus).catch(function () {});
  }
  function renderSources(data) {
    var body = el('sourceBody');
    body.textContent = '';
    var all = data.builtin.map(function (s) { return { name: s.name, url: s.url, builtin: true }; })
      .concat(data.extra.map(function (s) { return { name: s.name, url: s.url, builtin: false }; }));
    all.forEach(function (item) {
      var tr = document.createElement('tr');
      var name = document.createElement('td'); name.textContent = item.name;
      var url = document.createElement('td'); url.className = 'mono'; url.textContent = item.url;
      var type = document.createElement('td'); type.textContent = item.builtin ? '内置' : '自定义';
      var action = document.createElement('td');
      if (!item.builtin) {
        var btn = document.createElement('button');
        btn.className = 'danger';
        btn.textContent = '删除';
        btn.onclick = function () { removeSource(item.url); };
        action.appendChild(btn);
      }
      tr.appendChild(name); tr.appendChild(url); tr.appendChild(type); tr.appendChild(action);
      body.appendChild(tr);
    });
  }
  function loadSources() {
    return request('/admin/sources').then(function (data) {
      renderSources(data);
      setMsg('sourceMsg', '');
    }).catch(function (err) { setMsg('sourceMsg', err.message, true); });
  }
  function removeSource(url) {
    if (!confirm('删除该源？')) return;
    request('/admin/sources?url=' + encodeURIComponent(url), { method: 'DELETE' })
      .then(function (data) { renderSources({ builtin: [], extra: [] });
        return loadSources(); })
      .catch(function (err) { setMsg('sourceMsg', err.message, true); });
  }
  function pollUntilDone() {
    if (polling) clearInterval(polling);
    var attempts = 0;
    polling = setInterval(function () {
      attempts++;
      request('/admin/status').then(function (data) {
        renderStatus(data);
        if (!data.running || attempts > 60) {
          clearInterval(polling);
          polling = null;
          el('refreshBtn').disabled = false;
          loadStatus();
        }
      }).catch(function () {
        clearInterval(polling); polling = null; el('refreshBtn').disabled = false;
      });
    }, 3000);
  }

  el('loginBtn').onclick = function () {
    token = el('tokenInput').value.trim();
    if (!token) { setMsg('loginMsg', '请输入令牌', true); return; }
    request('/admin/status').then(function () {
      sessionStorage.setItem(TOKEN_KEY, token);
      setMsg('loginMsg', '');
      showMain(true);
      loadStatus();
      loadSources();
    }).catch(function () { setMsg('loginMsg', '登录失败', true); });
  };
  el('tokenInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') el('loginBtn').click(); });

  el('logoutBtn').onclick = function () {
    token = ''; sessionStorage.removeItem(TOKEN_KEY); showMain(false);
    setMsg('loginMsg', '已退出');
  };
  el('reloadBtn').onclick = loadSources;
  el('refreshBtn').onclick = function () {
    el('refreshBtn').disabled = true;
    request('/refresh', { method: 'POST' }).then(function () {
      setMsg('statusMsg', '已触发刷新，聚合进行中…', false);
      pollUntilDone();
    }).catch(function (err) {
      el('refreshBtn').disabled = false;
      setMsg('statusMsg', err.message, true);
    });
  };
  el('addBtn').onclick = function () {
    var url = el('srcUrl').value.trim();
    if (!url) { setMsg('addMsg', '请输入配置地址', true); return; }
    request('/admin/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: el('srcName').value.trim(), url: url })
    }).then(function () {
      el('srcName').value = ''; el('srcUrl').value = '';
      setMsg('addMsg', '已添加，刷新后生效', false);
      loadSources();
    }).catch(function (err) { setMsg('addMsg', err.message, true); });
  };

  if (token) {
    showMain(true);
    loadStatus();
    loadSources();
  }
})();
</script>
</body>
</html>`;
}
