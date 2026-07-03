const STORAGE_KEY = "love-notes-lowfi-v1";

const seedRecords = [
  {
    id: 101,
    author: "我",
    date: "2026-07-02",
    time: "19:26",
    title: "下班后的一小段晚风",
    body: "没有特别安排，只是在河边慢慢走了一圈。普通的一天也值得被记住。",
    mood: "平静",
    event: "日常",
    visibility: "shared",
    mediaType: "image",
    reaction: "TA 回应了：抱抱",
  },
  {
    id: 102,
    author: "TA",
    date: "2026-06-21",
    time: "15:08",
    title: "雨天的临时约会",
    body: "计划被雨打乱了，但临时找到的小店很好吃。",
    mood: "开心",
    event: "约会",
    visibility: "shared",
    mediaType: "image",
    reaction: "我回应了：心动",
  },
  {
    id: 103,
    author: "我",
    date: "2026-05-18",
    time: "23:10",
    title: "把今天的不开心放在这里",
    body: "不是为了分出对错，只想先记下自己的感受，等情绪过去再聊。",
    mood: "委屈",
    event: "争执",
    visibility: "private",
    mediaType: "text",
    reaction: "仅自己可见",
  },
];

const defaultState = () => ({
  route: "welcome",
  history: [],
  activeTab: "time",
  paired: false,
  profileName: "小满",
  partnerName: "阿屿",
  viewMode: "day",
  selectedDay: 2,
  records: seedRecords.map((item) => ({ ...item })),
  composer: {
    step: 1,
    mediaType: "image",
    hasMedia: false,
    title: "",
    body: "",
    mood: "开心",
    event: "日常",
    visibility: "private",
    template: "奶油胶片",
  },
  pet: { name: "团子", level: 3, growth: 64, happy: false },
  recap: { title: "我们的 2026", selected: ["春天", "盛夏", "普通日子", "小小纪念"] },
});

let state = loadState();
let toastTimer;

const screen = document.getElementById("app-screen");
const header = document.getElementById("app-header");
const bottomNav = document.getElementById("bottom-nav");
const fab = document.getElementById("record-fab");
const toast = document.getElementById("toast");
const modalLayer = document.getElementById("modal-layer");

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved ? { ...defaultState(), ...saved, history: [] } : defaultState();
  } catch {
    return defaultState();
  }
}

function saveState() {
  const safe = { ...state, history: [] };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
}

function resetState(overrides = {}) {
  state = { ...defaultState(), ...overrides, history: [] };
  saveState();
  closeModal();
  render();
}

const routesWithNav = new Set(["home", "couple", "recaps", "mine"]);

function navigate(route, options = {}) {
  if (state.route !== route && !options.replace) state.history.push(state.route);
  state.route = route;
  if (options.tab) state.activeTab = options.tab;
  closeModal();
  saveState();
  render();
  screen.scrollTop = 0;
}

function goBack() {
  const previous = state.history.pop();
  if (previous) {
    state.route = previous;
  } else {
    state.route = routeForTab(state.activeTab);
  }
  closeModal();
  render();
}

function routeForTab(tab) {
  return { time: "home", couple: "couple", recap: "recaps", mine: "mine" }[tab];
}

function setTab(tab) {
  state.activeTab = tab;
  state.route = routeForTab(tab);
  state.history = [];
  saveState();
  render();
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("show");
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function openModal(html) {
  modalLayer.innerHTML = `<div class="sheet-modal">${html}</div>`;
  modalLayer.classList.add("open");
}

function closeModal() {
  modalLayer.classList.remove("open");
  modalLayer.innerHTML = "";
}

function renderHeader() {
  if (state.route === "welcome") {
    header.style.display = "none";
    return;
  }
  header.style.display = "grid";
  const root = routesWithNav.has(state.route);
  const meta = headerMeta();
  header.innerHTML = `
    <button class="icon-button" data-action="${root ? "open-messages" : "back"}" aria-label="${root ? "消息" : "返回"}">${root ? "◌" : "‹"}</button>
    <div class="header-title"><strong>${meta.title}</strong><small>${meta.subtitle}</small></div>
    <button class="icon-button" data-action="${meta.rightAction || "noop"}" aria-label="${meta.rightLabel || "更多"}">${meta.rightIcon || "···"}</button>
  `;
}

function headerMeta() {
  const map = {
    onboarding: ["开始使用", "第 1 步，共 2 步"],
    home: ["时光", state.paired ? "小满 & 阿屿" : "我的记录"],
    composer: ["记录一个时刻", `第 ${state.composer.step} 步，共 3 步`],
    beautify: ["图片美化", "可跳过"],
    "moment-detail": ["时刻详情", "真实记录不被覆盖"],
    couple: ["我们", state.paired ? "相伴第 426 天" : "尚未配对"],
    invite: ["邀请另一半", "邀请 24 小时有效"],
    recaps: ["回顾", "把一段时间整理成作品"],
    "recap-editor": ["编辑年度回顾", "默认排除敏感记录"],
    "recap-preview": ["回顾预览", "保存前检查公开内容"],
    mine: ["我的", "个人与安全设置"],
    privacy: ["隐私与关系", "重要操作需要再次确认"],
    messages: ["消息", "应用内提醒"],
  };
  const [title, subtitle] = map[state.route] || ["恋爱笔记", "低保真原型"];
  if (state.route === "home") return { title, subtitle, rightAction: "open-filter", rightIcon: "⌁", rightLabel: "筛选" };
  if (state.route === "composer") return { title, subtitle, rightAction: "save-draft", rightIcon: "存", rightLabel: "保存草稿" };
  return { title, subtitle };
}

function renderNav() {
  const visible = routesWithNav.has(state.route);
  bottomNav.classList.toggle("is-hidden", !visible);
  fab.classList.toggle("is-hidden", !visible);
  if (!visible) return;
  const items = [
    ["time", "⌂", "时光"],
    ["couple", "♡", "我们"],
    ["recap", "▤", "回顾"],
    ["mine", "○", "我的"],
  ];
  bottomNav.innerHTML = items.map(([tab, icon, label]) => `
    <button class="nav-button ${state.activeTab === tab ? "active" : ""}" data-tab="${tab}"><b>${icon}</b><span>${label}</span></button>
  `).join("");
}

function render() {
  renderHeader();
  renderNav();
  screen.classList.toggle("no-pad", state.route === "welcome");
  const renderer = {
    welcome: renderWelcome,
    onboarding: renderOnboarding,
    home: renderHome,
    composer: renderComposer,
    beautify: renderBeautify,
    "moment-detail": renderMomentDetail,
    couple: renderCouple,
    invite: renderInvite,
    recaps: renderRecaps,
    "recap-editor": renderRecapEditor,
    "recap-preview": renderRecapPreview,
    mine: renderMine,
    privacy: renderPrivacy,
    messages: renderMessages,
  }[state.route] || renderHome;
  screen.innerHTML = renderer();
}

function renderWelcome() {
  return `
    <div class="welcome-screen">
      <div class="welcome-mark">恋</div>
      <h1>恋爱笔记</h1>
      <p class="lead">把两个人走过的日子，认真地留在一起。甜蜜、普通、争执与和好，都可以被记录。</p>
      <div class="welcome-actions">
        <button class="primary-button full-width" data-action="start-onboarding">从第一次记录开始</button>
        <button class="secondary-button full-width" data-action="load-paired-demo">载入双人示例</button>
      </div>
      <p class="welcome-footnote">这是低保真原型，不会申请真实微信权限</p>
    </div>
  `;
}

function renderOnboarding() {
  return `
    <div class="progress-dots"><i class="active"></i><i></i></div>
    <p class="eyebrow">开始之前</p>
    <h1 class="screen-title">先选择你的开始方式</h1>
    <p class="screen-subtitle">即使暂时不邀请另一半，你也可以先记录自己的日子。旧记录不会在配对后自动共享。</p>
    <div class="spacer"></div>
    <div class="choice-grid">
      <button class="choice-card active" data-choice="record"><span class="choice-icon">✎</span><b>先记录</b><small>独立使用，之后再邀请</small></button>
      <button class="choice-card" data-choice="invite"><span class="choice-icon">♡</span><b>邀请 TA</b><small>创建双人私密空间</small></button>
    </div>
    <div class="privacy-rule" style="margin-top:18px">所有内容默认不公开。仅自己记录不会自动变成共同记录；分享和提醒都会再次征得同意。</div>
    <div class="field">
      <label><input type="checkbox" id="privacy-consent"> 我已阅读并同意隐私说明与用户协议</label>
    </div>
    <button class="primary-button full-width" data-action="finish-onboarding">模拟微信登录并继续</button>
  `;
}

function renderHome() {
  return `
    <div class="mode-tabs" aria-label="时间视图">
      ${["day:天", "week:周", "month:月", "year:年", "custom:自定义"].map((item) => {
        const [key, label] = item.split(":");
        return `<button class="${state.viewMode === key ? "active" : ""}" data-view="${key}">${label}</button>`;
      }).join("")}
    </div>
    ${renderTimelineView()}
  `;
}

function renderTimelineView() {
  if (state.viewMode === "week") return renderWeekView();
  if (state.viewMode === "month") return renderMonthView();
  if (state.viewMode === "year") return renderYearView();
  if (state.viewMode === "custom") return renderCustomView();
  return renderDayView();
}

function renderDayView() {
  const records = visibleRecords().filter((record) => record.date === "2026-07-02");
  return `
    <div class="date-hero">
      <div><span>2026 年 7 月</span><strong>02 / 周四</strong></div>
      <div class="date-nav"><button data-action="previous-day">‹</button><button data-action="next-day">›</button></div>
    </div>
    ${!state.paired ? `<div class="annotation">未配对状态：当前记录默认仅自己可见，配对后也不会自动共享。</div>` : ""}
    <div class="section-head"><h2>今天的时刻</h2><small>${records.length} 条记录</small></div>
    <div class="moment-list">
      ${records.length ? records.map(renderMomentCard).join("") : renderEmpty("今天还没有被记下", "记录现在，或者补记过去。")}
    </div>
  `;
}

function renderWeekView() {
  const days = ["一", "二", "三", "四", "五", "六", "日"];
  return `
    <div class="date-hero"><div><span>6 月 29 日 - 7 月 5 日</span><strong>这一周</strong></div><div class="date-nav"><button>‹</button><button>›</button></div></div>
    <div class="week-strip">${days.map((day, index) => `<button class="day-cell ${index === 3 ? "active has-record" : index === 1 || index === 5 ? "has-record" : ""}" data-action="week-day"><span>周${day}</span><b>${29 + index > 30 ? index - 1 : 29 + index}</b></button>`).join("")}</div>
    <div class="summary-grid"><div class="summary-box"><b>3</b><span>时刻</span></div><div class="summary-box"><b>7</b><span>张照片</span></div><div class="summary-box"><b>2</b><span>次回应</span></div></div>
    <div class="hero-card accent"><p class="eyebrow">本周代表时刻</p><h2>下班后的一小段晚风</h2><p>这是基于事实的回看，不生成“感情分数”。</p></div>
    <div class="section-head"><h2>本周记录</h2><small>按发生时间</small></div>
    <div class="moment-list">${visibleRecords().slice(0, 2).map(renderMomentCard).join("")}</div>
  `;
}

function renderMonthView() {
  const weekdays = ["一", "二", "三", "四", "五", "六", "日"];
  const cells = Array.from({ length: 35 }, (_, index) => index - 1);
  return `
    <div class="date-hero"><div><span>2026 年</span><strong>七月</strong></div><div class="date-nav"><button>‹</button><button>›</button></div></div>
    <div class="calendar">
      ${weekdays.map((day) => `<div class="weekday">${day}</div>`).join("")}
      ${cells.map((day) => day < 1 || day > 31 ? `<button class="muted" tabindex="-1"></button>` : `<button class="${[2, 6, 12, 21].includes(day) ? "has-record" : ""}" data-day="${day}">${day}</button>`).join("")}
    </div>
    <div class="section-head"><h2>7 月 ${state.selectedDay} 日</h2><small>${state.selectedDay === 2 ? "1 条记录" : "没有记录"}</small></div>
    ${state.selectedDay === 2 ? `<div class="moment-list">${renderMomentCard(visibleRecords()[0])}</div>` : renderEmpty("这一天还没有被记下", "可以补记过去发生的时刻。")}
  `;
}

function renderYearView() {
  return `
    <div class="date-hero"><div><span>我们共同记录的</span><strong>2026 年</strong></div><button class="secondary-button" data-action="open-recap-editor">生成回顾</button></div>
    <div class="summary-grid"><div class="summary-box"><b>18</b><span>时刻</span></div><div class="summary-box"><b>42</b><span>照片</span></div><div class="summary-box"><b>6</b><span>共同回应</span></div></div>
    <div class="year-grid">${Array.from({ length: 12 }, (_, i) => `<button class="month-cell ${[4,5,6].includes(i) ? "active" : ""}" data-action="open-month"><b>${i + 1} 月</b><span>${[4,5,6].includes(i) ? `${i - 2} 条记录` : "暂无"}</span></button>`).join("")}</div>
    <div class="annotation" style="margin-top:16px">年度视图只陈述记录数量与里程碑，不判断关系好坏。</div>
  `;
}

function renderCustomView() {
  return `
    <div class="date-hero"><div><span>按条件回看</span><strong>自定义范围</strong></div></div>
    <div class="field"><span>时间范围</span><div class="button-row" style="margin-top:0"><input type="date" value="2026-05-01"><input type="date" value="2026-07-02"></div></div>
    <div class="field"><span>心情</span><div class="select-chips"><button class="chip-button active">全部</button><button class="chip-button">开心</button><button class="chip-button">平静</button><button class="chip-button">委屈</button></div></div>
    <div class="field"><span>事件</span><div class="select-chips"><button class="chip-button active">全部</button><button class="chip-button">约会</button><button class="chip-button">日常</button><button class="chip-button">和好</button></div></div>
    <div class="field"><span>可见范围</span><div class="select-chips"><button class="chip-button active">全部</button><button class="chip-button">仅自己</button><button class="chip-button">共同可见</button></div></div>
    <button class="primary-button full-width" data-action="apply-custom-filter">查看 3 条时刻</button>
    <div class="section-head"><h2>匹配结果</h2><small>按发生时间</small></div>
    <div class="moment-list">${visibleRecords().map(renderMomentCard).join("")}</div>
  `;
}

function visibleRecords() {
  return state.records.filter((record) => state.paired || record.author === "我");
}

function renderMomentCard(record) {
  if (!record) return "";
  const media = record.mediaType === "text" ? "" : `<div class="media-placeholder">${record.mediaType === "video" ? "视频封面 · 00:18" : "照片占位 · 3 张"}</div>`;
  return `
    <article class="moment-card" data-moment-id="${record.id}">
      ${media}
      <div class="moment-body">
        <div class="moment-meta"><span>${record.author} · ${record.time}</span><span>${record.visibility === "private" ? "仅自己" : "共同可见"}</span></div>
        <h3>${escapeHtml(record.title || "没有标题的时刻")}</h3>
        <p>${escapeHtml(record.body)}</p>
        <div class="tag-row"><span class="tag">${record.mood}</span><span class="tag">${record.event}</span>${record.visibility === "private" ? `<span class="tag private">不会进入双人回顾</span>` : ""}</div>
        <div class="reaction-line">${record.reaction}</div>
      </div>
    </article>
  `;
}

function renderEmpty(title, body) {
  return `<div class="empty-state"><div class="empty-icon">○</div><h3>${title}</h3><p>${body}</p><button class="secondary-button" data-action="new-record">记录一个时刻</button></div>`;
}

function renderComposer() {
  if (state.composer.step === 1) return renderComposerMedia();
  if (state.composer.step === 2) return renderComposerContent();
  return renderComposerPreview();
}

function renderComposerMedia() {
  return `
    <div class="progress-dots"><i class="active"></i><i></i><i></i></div>
    <p class="eyebrow">选择记录形式</p><h1 class="screen-title">这一刻是什么样的？</h1>
    <div class="choice-grid" style="margin-top:18px">
      ${[["image","▧","图片"],["video","▷","视频"],["text","≡","纯文字"]].map(([type, icon, label]) => `<button class="choice-card ${state.composer.mediaType === type ? "active" : ""}" data-media-type="${type}"><span class="choice-icon">${icon}</span><b>${label}</b><small>${type === "image" ? "1-9 张" : type === "video" ? "单个视频" : "只写下感受"}</small></button>`).join("")}
    </div>
    ${state.composer.mediaType !== "text" ? `<button class="upload-box ${state.composer.hasMedia ? "has-media" : ""}" data-action="toggle-media" style="margin-top:16px"><div><span class="choice-icon">${state.composer.hasMedia ? "✓" : "+"}</span><b>${state.composer.hasMedia ? "已选择 3 张示例照片" : "点击选择示例媒体"}</b><small>${state.composer.hasMedia ? "可继续，也可以重新选择" : "原图会被保留"}</small></div></button>` : `<div class="annotation" style="margin-top:16px">纯文字记录同样可以选择心情、事件和可见范围。</div>`}
    <button class="primary-button full-width" style="margin-top:18px" data-action="composer-next" ${state.composer.mediaType !== "text" && !state.composer.hasMedia ? "disabled" : ""}>下一步：写下感受</button>
  `;
}

function renderComposerContent() {
  return `
    <div class="progress-dots"><i></i><i class="active"></i><i></i></div>
    <p class="eyebrow">写下感受</p><h1 class="screen-title">给这一刻一点语境</h1>
    <div class="field"><label for="moment-title">标题（可选）</label><input id="moment-title" maxlength="30" value="${escapeAttr(state.composer.title)}" placeholder="例如：下班后的一小段晚风"></div>
    <div class="field"><label for="moment-body">当时的感受</label><textarea id="moment-body" maxlength="1000" placeholder="发生了什么？你当时是什么感受？">${escapeHtml(state.composer.body)}</textarea><span class="field-help">原文会被保留，生成图片不会覆盖它。</span></div>
    <div class="field"><span>心情</span><div class="select-chips">${["开心","心动","平静","想念","委屈","生气","和好"].map((mood) => `<button class="chip-button ${state.composer.mood === mood ? "active" : ""}" data-mood="${mood}">${mood}</button>`).join("")}</div></div>
    <div class="field"><span>事件</span><div class="select-chips">${["日常","约会","旅行","纪念日","第一次","争执","和好"].map((event) => `<button class="chip-button ${state.composer.event === event ? "active" : ""}" data-event="${event}">${event}</button>`).join("")}</div></div>
    <div class="field"><span>谁可以看</span><div class="select-chips"><button class="chip-button ${state.composer.visibility === "private" ? "active" : ""}" data-visibility="private">仅自己可见</button><button class="chip-button ${state.composer.visibility === "shared" ? "active" : ""}" data-visibility="shared" ${!state.paired ? "disabled" : ""}>与另一半共同可见</button></div><span class="field-help">${state.paired ? "从共同可见改为仅自己后，TA 将无法再访问。" : "尚未配对，只能保存为仅自己可见。"}</span></div>
    <button class="primary-button full-width" data-action="composer-next">下一步：预览</button>
  `;
}

function renderComposerPreview() {
  return `
    <div class="progress-dots"><i></i><i></i><i class="active"></i></div>
    <p class="eyebrow">发布前确认</p><h1 class="screen-title">这条记录会这样保存</h1>
    <div class="moment-list" style="margin-top:18px">${renderMomentCard({ id: 0, author: "我", date: "2026-07-02", time: "现在", title: state.composer.title || "没有标题的时刻", body: state.composer.body || "这一刻还没有配文。", mood: state.composer.mood, event: state.composer.event, visibility: state.composer.visibility, mediaType: state.composer.mediaType, reaction: state.composer.visibility === "private" ? "仅自己可见" : "发布后会通知 TA" })}</div>
    ${state.composer.mediaType === "image" ? `<button class="secondary-button full-width" style="margin-top:14px" data-action="open-beautify">先生成一张甜甜的照片</button>` : ""}
    <div class="privacy-rule" style="margin-top:14px">可见范围：${state.composer.visibility === "private" ? "仅自己可见，不进入双人回顾" : "与当前另一半共同可见"}</div>
    <button class="primary-button full-width" style="margin-top:14px" data-action="publish-record">确认发布</button>
  `;
}

function renderBeautify() {
  const templates = ["奶油胶片", "复古拍立得", "旅行邮票", "月光蓝"];
  return `
    <p class="eyebrow">模板合成，不改变人物</p><h1 class="screen-title">选一种甜甜的样子</h1>
    <p class="screen-subtitle">原图、原文会一直保留。首版只做可控边框、贴纸、日期和配文排版。</p>
    <div class="template-grid" style="margin-top:18px">${templates.map((name) => `<button class="template-card ${state.composer.template === name ? "active" : ""}" data-template="${name}"><div class="template-preview">照片 + 日期<br>${state.composer.title || "今天也很好"}</div><b>${name}</b></button>`).join("")}</div>
    <div class="field"><label><input type="checkbox" checked> 显示日期</label><label><input type="checkbox" checked> 显示配文</label></div>
    <div class="button-row"><button class="secondary-button" data-action="skip-beautify">跳过</button><button class="primary-button" data-action="apply-beautify">使用此模板</button></div>
  `;
}

function renderMomentDetail() {
  const record = state.records.find((item) => item.id === state.selectedMomentId) || state.records[0];
  return `
    ${record.mediaType !== "text" ? `<div class="media-placeholder" style="min-height:240px;border:1px solid var(--line)">原始媒体 · 不被模板覆盖</div>` : ""}
    <div class="moment-body" style="padding:18px 0">
      <div class="moment-meta"><span>${record.author} · ${record.date} ${record.time}</span><span>${record.visibility === "private" ? "仅自己" : "共同可见"}</span></div>
      <h1 class="screen-title" style="font-size:27px;margin-top:14px">${escapeHtml(record.title)}</h1>
      <p style="line-height:1.8;font-size:13px">${escapeHtml(record.body)}</p>
      <div class="tag-row"><span class="tag">${record.mood}</span><span class="tag">${record.event}</span></div>
      <hr class="divider">
      ${record.visibility === "shared" && state.paired ? `<div class="section-head"><h2>回应</h2><small>不显示已读压力</small></div><div class="select-chips">${["心动","抱抱","笑哭","懂你","对不起","收藏"].map((reaction) => `<button class="chip-button" data-action="react">${reaction}</button>`).join("")}</div><div class="field"><label for="short-comment">留一句话</label><input id="short-comment" placeholder="最多 300 字"></div><button class="secondary-button full-width" data-action="comment">发送短评</button>` : `<div class="privacy-rule">这是一条仅自己可见的记录，不会通知另一半，也不会自动进入双人回顾。</div>`}
    </div>
  `;
}

function renderCouple() {
  if (!state.paired) {
    return `
      <div class="hero-card accent"><p class="eyebrow">双人私密空间</p><h2>邀请 TA 一起记录</h2><p>配对后可以共同回应、合养云宠物和制作双人回顾。旧记录不会自动共享。</p><button class="primary-button full-width" style="margin-top:16px" data-action="open-invite">邀请另一半</button></div>
      <div class="section-head"><h2>配对后可以做什么</h2></div>
      <div class="stack"><div class="wire-card" style="padding:14px"><b>♡ 共同回应</b><p class="screen-subtitle">不替代聊天，只把回应留在时刻旁边。</p></div><div class="wire-card" style="padding:14px"><b>◉ 合养云宠物</b><p class="screen-subtitle">不死亡、不降级、不比较双方贡献。</p></div><div class="wire-card" style="padding:14px"><b>▤ 双人回顾</b><p class="screen-subtitle">敏感记录默认排除，分享前逐条确认。</p></div></div>
    `;
  }
  return `
    <div class="hero-card">
      <p class="eyebrow">我们的关系卡</p>
      <div class="couple-avatar-row"><div class="avatar">满</div><div class="bond-line"></div><div class="avatar partner">屿</div></div>
      <h2 style="text-align:center">相伴第 426 天</h2><p style="text-align:center">下一纪念日还有 19 天</p>
    </div>
    <div class="section-head"><h2>我们的小宠物</h2><small>等级只增不降</small></div>
    <div class="pet-card">
      <div class="pet-stage"><div class="pet-blob ${state.pet.happy ? "is-happy" : ""}" id="pet-blob">◕ᴥ◕</div></div>
      <div style="display:flex;justify-content:space-between;font-size:11px"><b>${state.pet.name} · Lv.${state.pet.level}</b><span>${state.pet.growth}/100</span></div>
      <div class="progress-bar" style="margin-top:7px"><i style="width:${state.pet.growth}%"></i></div>
      <div class="pet-actions"><button data-pet-action="喂食">◌ 喂食</button><button data-pet-action="玩耍">◇ 玩耍</button><button data-pet-action="摸摸">♡ 摸摸</button></div>
    </div>
    <div class="section-head"><h2>今天的共同日志</h2><small>不比较贡献</small></div>
    <div class="settings-list"><div class="settings-row"><span>08:20　阿屿给团子喂了早餐</span></div><div class="settings-row"><span>19:26　小满记录了一个时刻</span></div></div>
  `;
}

function renderInvite() {
  return `
    <p class="eyebrow">一次性邀请</p><h1 class="screen-title">让 TA 扫码加入</h1><p class="screen-subtitle">邀请中不会包含你的记录。TA 确认身份和共享规则后，情侣空间才会创建。</p>
    <div class="pair-code" aria-label="邀请二维码占位"></div>
    <div class="hero-card"><div class="moment-meta"><span>邀请人</span><span>剩余 23:58:41</span></div><h2 style="margin-top:12px">小满邀请你一起记录</h2><p>一个账号同一时间只能加入一个情侣空间。</p></div>
    <div class="button-row"><button class="secondary-button" data-action="copy-invite">复制邀请链接</button><button class="primary-button" data-action="simulate-accept">模拟 TA 接受</button></div>
    <button class="text-button" style="margin:18px auto 0;display:block" data-action="cancel-invite">撤销这份邀请</button>
  `;
}

function renderRecaps() {
  return `
    <div class="hero-card accent"><p class="eyebrow">年度作品</p><h2>把 2026 整理成一个故事</h2><p>系统先选出候选素材，你可以替换、删减和改文案。争执、委屈与“第一次”等记录默认排除。</p><button class="primary-button full-width" style="margin-top:16px" data-action="open-recap-editor">开始制作</button></div>
    <div class="section-head"><h2>我的回顾</h2><small>1 个草稿</small></div>
    <article class="recap-card" data-action="open-recap-editor"><div class="recap-cover">我们的 2026</div><h3>年度回顾 · 草稿</h3><p>4 个章节 · 最近编辑于今天</p></article>
  `;
}

function renderRecapEditor() {
  const sensitiveCount = state.records.filter((record) => record.visibility === "private" || ["争执","第一次"].includes(record.event)).length;
  return `
    <div class="privacy-rule">已默认排除 ${sensitiveCount} 条私密或敏感记录。只有你逐条主动加入，它们才会出现在回顾中。</div>
    <div class="field"><label for="recap-title">回顾标题</label><input id="recap-title" value="${escapeAttr(state.recap.title)}"></div>
    <div class="section-head"><h2>章节与素材</h2><small>拖动排序将在高保真稿验证</small></div>
    <div class="chapter-list">${state.recap.selected.map((chapter, index) => `<div class="chapter-row"><div class="chapter-thumb">${index + 1}</div><div><b>${chapter}</b><small>${index === 2 ? "5 条候选时刻" : "3 条候选时刻"}</small></div><button class="icon-button" data-action="edit-chapter">›</button></div>`).join("")}</div>
    <div class="section-head"><h2>默认隐藏</h2><small>需要逐条确认</small></div>
    <div class="settings-list"><button class="settings-row"><span>委屈 / 争执记录</span><small>1 条　未加入</small></button><button class="settings-row"><span>仅自己可见记录</span><small>永不进入双人回顾</small></button></div>
    <button class="primary-button full-width" style="margin-top:18px" data-action="generate-recap">生成预览</button>
  `;
}

function renderRecapPreview() {
  return `
    <div class="annotation">分享前请确认：预览中包含双方昵称、日期、照片占位和公开配文。</div>
    <div class="story-preview" style="margin-top:16px">
      <section class="story-page"><div><p class="eyebrow">2026 · OUR STORY</p><h2>${escapeHtml(state.recap.title)}</h2></div><div class="story-media">年度封面占位</div><small>18 个时刻 · 42 张照片</small></section>
      <section class="story-page"><div><p class="eyebrow">普通日子</p><h2>下班后的一小段晚风</h2></div><div class="story-media">照片占位</div><small>2026-07-02 · 共同可见</small></section>
    </div>
    <div class="button-row"><button class="secondary-button" data-action="back">继续编辑</button><button class="primary-button" data-action="export-recap">生成长图</button></div>
  `;
}

function renderMine() {
  return `
    <div class="hero-card"><div class="couple-avatar-row" style="justify-content:flex-start"><div class="avatar">满</div><div><h2 style="margin:0">小满</h2><p>已记录 ${state.records.filter((r) => r.author === "我").length} 个时刻</p></div></div></div>
    <div class="section-head"><h2>记录设置</h2></div>
    <div class="settings-list"><button class="settings-row"><span>默认可见范围</span><small>${state.paired ? "共同可见" : "仅自己"}　›</small></button><button class="settings-row"><span>提醒设置</span><small>应用内消息　›</small></button><button class="settings-row"><span>回收站</span><small>30 天　›</small></button></div>
    <div class="section-head"><h2>隐私与安全</h2></div>
    <div class="settings-list"><button class="settings-row" data-action="open-privacy"><span>隐私与关系管理</span><small>›</small></button><button class="settings-row"><span>个人数据导出</span><small>后续版本　›</small></button><button class="settings-row"><span>用户协议与内容规范</span><small>›</small></button></div>
    <div class="annotation" style="margin-top:16px">评审快捷项：可以从桌面左侧直接跳转“解绑”场景。</div>
  `;
}

function renderPrivacy() {
  return `
    <p class="eyebrow">关系与数据</p><h1 class="screen-title">谁能看到什么</h1>
    <div class="privacy-rule" style="margin-top:16px">记录归创建者，媒体归上传者。情侣空间只授予关系存续期间的访问权，不转移所有权。</div>
    <div class="section-head"><h2>当前状态</h2></div>
    <div class="settings-list"><div class="settings-row"><span>情侣空间</span><small>${state.paired ? "有效" : "未配对"}</small></div><div class="settings-row"><span>仅自己记录</span><small>${state.records.filter((r) => r.visibility === "private").length} 条</small></div><div class="settings-row"><span>共同可见记录</span><small>${state.records.filter((r) => r.visibility === "shared").length} 条</small></div></div>
    ${state.paired ? `<div class="section-head"><h2>终止关系</h2></div><button class="settings-row danger" style="border:1px solid #a43c43;border-radius:12px" data-action="start-unbind"><span>解除情侣关系</span><small>任一方可单独发起　›</small></button><p class="screen-subtitle">解绑后立即停止互访。你保留自己创建的记录和上传的媒体；TA 创建或上传的内容会对你隐藏。</p>` : `<div class="empty-state" style="margin-top:18px"><div class="empty-icon">✓</div><h3>当前没有有效情侣关系</h3><p>你可以继续独立记录，或重新邀请另一半。</p></div>`}
  `;
}

function renderMessages() {
  return `
    <div class="settings-list"><button class="settings-row"><span>♡ 阿屿回应了你的时刻</span><small>刚刚</small></button><button class="settings-row"><span>◉ 团子升级到 Lv.3</span><small>昨天</small></button><button class="settings-row"><span>▤ 年度回顾候选已准备好</span><small>2 天前</small></button></div>
    <p class="screen-subtitle" style="text-align:center;margin-top:18px">外部订阅提醒需要用户主动授权；关闭后不影响应用内消息。</p>
  `;
}

function handleAction(action, target) {
  if (action === "noop") return;
  if (action === "back") return goBack();
  if (action === "reset-demo") return resetState();
  if (action === "start-onboarding") return navigate("onboarding");
  if (action === "load-paired-demo") return resetState({ route: "home", activeTab: "time", paired: true });
  if (action === "finish-onboarding") {
    const checked = document.getElementById("privacy-consent")?.checked;
    if (!checked) return showToast("请先确认隐私说明与用户协议");
    const choice = document.querySelector(".choice-card.active")?.dataset.choice || "record";
    state.paired = false;
    if (choice === "invite") return navigate("invite");
    state.composer = { ...defaultState().composer };
    state.route = "composer";
    state.history.push("home");
    return render();
  }
  if (action === "new-record") {
    state.composer = { ...defaultState().composer, visibility: state.paired ? "shared" : "private" };
    return navigate("composer");
  }
  if (action === "toggle-media") { state.composer.hasMedia = !state.composer.hasMedia; return render(); }
  if (action === "composer-next") {
    syncComposerInputs();
    if (state.composer.step < 3) state.composer.step += 1;
    saveState();
    return render();
  }
  if (action === "save-draft") { syncComposerInputs(); saveState(); return showToast("草稿已保存在当前设备"); }
  if (action === "open-beautify") return navigate("beautify");
  if (action === "skip-beautify") { state.route = "composer"; state.composer.step = 3; return render(); }
  if (action === "apply-beautify") { state.route = "composer"; state.composer.step = 3; showToast(`已使用“${state.composer.template}”模板`); return render(); }
  if (action === "publish-record") return publishRecord();
  if (action === "open-messages") return navigate("messages");
  if (action === "open-filter") return openFilterModal();
  if (action === "previous-day" || action === "next-day") return showToast("原型固定展示 7 月 2 日");
  if (action === "week-day") { state.viewMode = "day"; return render(); }
  if (action === "open-month") { state.viewMode = "month"; return render(); }
  if (action === "apply-custom-filter") return showToast("已按当前条件筛选");
  if (action === "react") return showToast(`已回应：${target.textContent.trim()}`);
  if (action === "comment") return showToast("短评已发送并保存在这条时刻中");
  if (action === "open-invite") return navigate("invite");
  if (action === "copy-invite") return showToast("示例邀请链接已复制");
  if (action === "simulate-accept") return simulateAccept();
  if (action === "cancel-invite") { showToast("邀请已撤销"); return goBack(); }
  if (action === "open-recap-editor") return navigate("recap-editor");
  if (action === "edit-chapter") return showToast("高保真稿将支持替换素材和排序");
  if (action === "generate-recap") { state.recap.title = document.getElementById("recap-title")?.value || state.recap.title; return navigate("recap-preview"); }
  if (action === "export-recap") return showToast("长图生成任务已创建，原型不写入相册");
  if (action === "open-privacy") return navigate("privacy");
  if (action === "start-unbind") return openUnbindModal();
  if (action === "confirm-unbind") return confirmUnbind();
  if (action === "close-modal") return closeModal();
}

function syncComposerInputs() {
  const title = document.getElementById("moment-title");
  const body = document.getElementById("moment-body");
  if (title) state.composer.title = title.value;
  if (body) state.composer.body = body.value;
}

function publishRecord() {
  const newRecord = {
    id: Date.now(), author: "我", date: "2026-07-02", time: "现在",
    title: state.composer.title || "刚刚记录的时刻",
    body: state.composer.body || "这一刻还没有配文。",
    mood: state.composer.mood, event: state.composer.event,
    visibility: state.composer.visibility, mediaType: state.composer.mediaType,
    reaction: state.composer.visibility === "shared" ? "等待 TA 的回应" : "仅自己可见",
  };
  state.records.unshift(newRecord);
  state.route = "home";
  state.activeTab = "time";
  state.viewMode = "day";
  state.history = [];
  saveState();
  render();
  showToast("这一刻已经被好好保存");
}

function simulateAccept() {
  openModal(`
    <h2>确认创建情侣空间？</h2>
    <p>模拟受邀方“阿屿”已确认身份。创建后，双方可以共享新记录；已有私人记录不会自动共享。</p>
    <div class="couple-avatar-row"><div class="avatar">满</div><div class="bond-line"></div><div class="avatar partner">屿</div></div>
    <div class="button-row"><button class="secondary-button" data-action="close-modal">再想想</button><button class="primary-button" data-action="confirm-pair">确认配对</button></div>
  `);
}

function confirmPair() {
  state.paired = true;
  state.route = "couple";
  state.activeTab = "couple";
  state.history = [];
  saveState();
  closeModal();
  render();
  showToast("情侣空间已创建，旧记录仍保持原范围");
}

function openFilterModal() {
  openModal(`<h2>筛选时刻</h2><div class="field"><span>媒体类型</span><div class="select-chips"><button class="chip-button active">全部</button><button class="chip-button">图片</button><button class="chip-button">视频</button><button class="chip-button">文字</button></div></div><div class="field"><span>可见范围</span><div class="select-chips"><button class="chip-button active">全部</button><button class="chip-button">仅自己</button><button class="chip-button">共同可见</button></div></div><button class="primary-button full-width" data-action="close-modal">应用筛选</button>`);
}

function openUnbindModal() {
  openModal(`
    <p class="eyebrow">不可撤销的关系操作</p><h2>确认解除情侣关系？</h2>
    <p>解绑不需要对方同意，确认后立即停止双方互访。你保留自己创建的记录和上传媒体；对方内容会立即隐藏。</p>
    <div class="privacy-rule">云宠物和双人回顾将冻结。解除关系不会删除你的个人记录。</div>
    <div class="field"><label for="unbind-input">输入“解除关系”以继续</label><input id="unbind-input" autocomplete="off" placeholder="解除关系"></div>
    <div class="button-row"><button class="secondary-button" data-action="close-modal">取消</button><button class="danger-button" id="unbind-confirm" data-action="confirm-unbind" disabled>确认解绑</button></div>
  `);
}

function confirmUnbind() {
  const value = document.getElementById("unbind-input")?.value.trim();
  if (value !== "解除关系") return showToast("请输入完整的“解除关系”");
  state.paired = false;
  state.records = state.records
    .filter((record) => record.author === "我")
    .map((record) => ({ ...record, visibility: "private", reaction: "仅自己可见" }));
  state.route = "home";
  state.activeTab = "time";
  state.viewMode = "day";
  state.history = [];
  saveState();
  closeModal();
  render();
  showToast("情侣空间已停止访问，已保留你的记录");
}

function runFlow(flow) {
  if (flow === "first-record") {
    resetState({ route: "composer", activeTab: "time", paired: false, history: ["home"] });
    state.composer = { ...defaultState().composer, visibility: "private" };
  } else if (flow === "pair") {
    resetState({ route: "invite", activeTab: "couple", paired: false, history: ["couple"] });
  } else if (flow === "timeline") {
    resetState({ route: "home", activeTab: "time", paired: true, viewMode: "month" });
  } else if (flow === "recap") {
    resetState({ route: "recap-editor", activeTab: "recap", paired: true, history: ["recaps"] });
  } else if (flow === "unbind") {
    resetState({ route: "privacy", activeTab: "mine", paired: true, history: ["mine"] });
  }
  saveState();
  render();
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function escapeAttr(value = "") { return escapeHtml(value); }

document.addEventListener("click", (event) => {
  const flowButton = event.target.closest("[data-flow]");
  if (flowButton) return runFlow(flowButton.dataset.flow);

  const tabButton = event.target.closest("[data-tab]");
  if (tabButton) return setTab(tabButton.dataset.tab);

  const actionButton = event.target.closest("[data-action]");
  if (actionButton) return handleAction(actionButton.dataset.action, actionButton);

  const viewButton = event.target.closest("[data-view]");
  if (viewButton) { state.viewMode = viewButton.dataset.view; saveState(); return render(); }

  const choice = event.target.closest("[data-choice]");
  if (choice) {
    document.querySelectorAll("[data-choice]").forEach((button) => button.classList.remove("active"));
    choice.classList.add("active");
    return;
  }

  const mediaType = event.target.closest("[data-media-type]");
  if (mediaType) { state.composer.mediaType = mediaType.dataset.mediaType; state.composer.hasMedia = mediaType.dataset.mediaType === "text"; return render(); }

  const mood = event.target.closest("[data-mood]");
  if (mood) { syncComposerInputs(); state.composer.mood = mood.dataset.mood; return render(); }
  const eventChip = event.target.closest("[data-event]");
  if (eventChip) { syncComposerInputs(); state.composer.event = eventChip.dataset.event; return render(); }
  const visibility = event.target.closest("[data-visibility]");
  if (visibility && !visibility.disabled) { syncComposerInputs(); state.composer.visibility = visibility.dataset.visibility; return render(); }
  const template = event.target.closest("[data-template]");
  if (template) { state.composer.template = template.dataset.template; return render(); }
  const day = event.target.closest("[data-day]");
  if (day) { state.selectedDay = Number(day.dataset.day); return render(); }
  const moment = event.target.closest("[data-moment-id]");
  if (moment && moment.dataset.momentId !== "0") { state.selectedMomentId = Number(moment.dataset.momentId); return navigate("moment-detail"); }
  const petAction = event.target.closest("[data-pet-action]");
  if (petAction) {
    state.pet.growth = Math.min(100, state.pet.growth + 4);
    state.pet.happy = true;
    render();
    showToast(`${petAction.dataset.petAction}完成，成长值 +4`);
    setTimeout(() => { state.pet.happy = false; render(); }, 700);
  }
});

document.addEventListener("input", (event) => {
  if (event.target.id === "unbind-input") {
    const button = document.getElementById("unbind-confirm");
    if (button) button.disabled = event.target.value.trim() !== "解除关系";
  }
});

modalLayer.addEventListener("click", (event) => {
  if (event.target === modalLayer) closeModal();
});

document.addEventListener("click", (event) => {
  if (event.target.closest('[data-action="confirm-pair"]')) confirmPair();
});

render();
