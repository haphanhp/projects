// src/main.js
// Đọc public/data.json và render: masthead, heatmap tổng, bộ lọc tag/status,
// lưới project card, và trang chi tiết từng project (client-side route).

const app = document.getElementById("app");
let DATA = null;
let activeTags = new Set();
let activeStatus = "all"; // all | in-progress | done

async function loadData() {
  const res = await fetch("/data.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Không đọc được data.json — đã chạy `npm run data` chưa?");
  return res.json();
}

function dateKey(d) {
  return d.toISOString().slice(0, 10);
}

function levelFor(count) {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 3;
  return 4;
}

function buildHeatmapCells(heatmap, weeks = 26) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = weeks * 7;
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));
  start.setDate(start.getDate() - start.getDay());

  const cells = [];
  const cursor = new Date(start);
  while (cursor <= today) {
    const key = dateKey(cursor);
    const count = heatmap[key] || 0;
    cells.push({ date: key, count, level: levelFor(count) });
    cursor.setDate(cursor.getDate() + 1);
  }
  return cells;
}

function renderHeatmap(heatmap, weeks = 26) {
  const cells = buildHeatmapCells(heatmap, weeks);
  const totalDays = Object.keys(heatmap).length;
  const totalCommits = Object.values(heatmap).reduce((a, b) => a + b, 0);

  const cellsHtml = cells
    .map(
      (c) =>
        `<div class="heatmap-cell" data-level="${c.level}" title="${c.date} · ${c.count} hoạt động"></div>`
    )
    .join("");

  return `
    <div class="heatmap-wrap">
      <div class="heatmap-grid">${cellsHtml}</div>
    </div>
    <div class="heatmap-legend">
      <span>${totalDays} ngày có hoạt động · ${totalCommits} commit</span>
      <span style="margin-left:auto">ít</span>
      <div class="heatmap-cell" data-level="0" style="width:10px;height:10px"></div>
      <div class="heatmap-cell" data-level="1" style="width:10px;height:10px"></div>
      <div class="heatmap-cell" data-level="2" style="width:10px;height:10px"></div>
      <div class="heatmap-cell" data-level="3" style="width:10px;height:10px"></div>
      <div class="heatmap-cell" data-level="4" style="width:10px;height:10px"></div>
      <span>nhiều</span>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderChecklist(checklist, { limit = null } = {}) {
  const items = limit ? checklist.items.slice(0, limit) : checklist.items;
  const remaining = checklist.items.length - items.length;

  const itemsHtml = items
    .map(
      (item) => `
      <li class="checklist-item ${item.done ? "done" : ""}">
        <span class="box">[${item.done ? "x" : " "}]</span>
        <span>${escapeHtml(item.text)}</span>
      </li>`
    )
    .join("");

  const moreHtml = remaining > 0 ? `<div class="checklist-more">+ ${remaining} việc khác…</div>` : "";

  return `<ul class="checklist">${itemsHtml}</ul>${moreHtml}`;
}

function renderProjectCard(project) {
  const statusClass = project.status === "done" ? "status-done" : "status-in-progress";
  const links = [];
  if (project.link) links.push(`<a href="${project.link}" target="_blank" rel="noopener">Xem demo</a>`);
  if (project.repo) links.push(`<a href="${project.repo}" target="_blank" rel="noopener">Repo</a>`);

  return `
    <article class="project-card">
      <a class="card-link-overlay" href="/projects/${project.slug}" data-route aria-label="Xem chi tiết ${escapeHtml(project.title)}"></a>
      <div class="card-top">
        <div>
          <h3 class="card-title">${escapeHtml(project.title)}</h3>
          <p class="card-desc">${escapeHtml(project.description)}</p>
        </div>
        <div class="stamp ${statusClass}">${project.checklist.percent}%</div>
      </div>

      ${project.tags.length ? `<div class="card-meta">${project.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>` : ""}

      ${renderChecklist(project.checklist, { limit: 5 })}

      <div class="card-footer">
        <span>cập nhật ${project.lastActivity}</span>
        <div class="card-links">${links.join("")}</div>
      </div>
    </article>
  `;
}

function allTags(projects) {
  const set = new Set();
  for (const p of projects) for (const t of p.tags) set.add(t);
  return [...set].sort();
}

function filteredProjects(projects) {
  return projects.filter((p) => {
    const statusOk = activeStatus === "all" || p.status === activeStatus;
    const tagsOk = activeTags.size === 0 || p.tags.some((t) => activeTags.has(t));
    return statusOk && tagsOk;
  });
}

function renderFilterBar(projects) {
  const tags = allTags(projects);
  const statusChip = (value, label) => `
    <button class="chip status-chip ${activeStatus === value ? "active" : ""}" data-status="${value}">
      ${label}
    </button>`;

  const tagChips = tags
    .map(
      (t) => `
      <button class="chip tag-chip ${activeTags.has(t) ? "active" : ""}" data-tag="${escapeHtml(t)}">
        ${escapeHtml(t)}
      </button>`
    )
    .join("");

  return `
    <div class="filter-bar">
      <div class="filter-group">
        ${statusChip("all", "Tất cả")}
        ${statusChip("in-progress", "Đang làm")}
        ${statusChip("done", "Hoàn thành")}
      </div>
      ${tags.length ? `<div class="filter-group">${tagChips}</div>` : ""}
    </div>
  `;
}

function attachFilterEvents(projects) {
  document.querySelectorAll("[data-status]").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeStatus = btn.dataset.status;
      renderDashboard(projects, DATA.heatmap);
    });
  });
  document.querySelectorAll("[data-tag]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tag = btn.dataset.tag;
      if (activeTags.has(tag)) activeTags.delete(tag);
      else activeTags.add(tag);
      renderDashboard(projects, DATA.heatmap);
    });
  });
}

function attachRouteLinks() {
  document.querySelectorAll("[data-route]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      navigate(el.getAttribute("href"));
    });
  });
}

function renderDashboard(projects, heatmap) {
  const visible = filteredProjects(projects);
  const doneCount = projects.filter((p) => p.status === "done").length;
  const avgPercent = projects.length
    ? Math.round(projects.reduce((sum, p) => sum + p.checklist.percent, 0) / projects.length)
    : 0;

  app.innerHTML = `
    <header class="masthead">
      <div>
        <h1 class="masthead-title">project<span>_</span>log</h1>
        <div class="masthead-sub">checklist thật · % hoàn thành thật · cập nhật từ git log</div>
      </div>
      <div class="masthead-stats">
        <div class="masthead-stat"><span class="num">${projects.length}</span><span class="label">Dự án</span></div>
        <div class="masthead-stat"><span class="num">${doneCount}</span><span class="label">Hoàn thành</span></div>
        <div class="masthead-stat"><span class="num">${avgPercent}%</span><span class="label">Trung bình</span></div>
      </div>
    </header>

    <section class="heatmap-section">
      <div class="section-label">Hoạt động · 26 tuần gần nhất</div>
      ${renderHeatmap(heatmap, 26)}
    </section>

    <section>
      <div class="section-label">Dự án</div>
      ${renderFilterBar(projects)}
      ${
        visible.length
          ? `<div class="project-grid">${visible.map(renderProjectCard).join("")}</div>`
          : `<div class="empty-state">Không có project khớp bộ lọc hiện tại.</div>`
      }
    </section>
  `;

  attachFilterEvents(projects);
  attachRouteLinks();
}

function renderProjectDetail(project) {
  if (!project) {
    app.innerHTML = `
      <a href="/" data-route class="back-link">← Quay lại dashboard</a>
      <div class="empty-state">Không tìm thấy project này.</div>
    `;
    attachRouteLinks();
    return;
  }

  const statusClass = project.status === "done" ? "status-done" : "status-in-progress";
  const links = [];
  if (project.link) links.push(`<a href="${project.link}" target="_blank" rel="noopener">Xem demo →</a>`);
  if (project.repo) links.push(`<a href="${project.repo}" target="_blank" rel="noopener">Repo →</a>`);

  app.innerHTML = `
    <a href="/" data-route class="back-link">← Quay lại dashboard</a>

    <header class="detail-header">
      <div>
        <h1 class="detail-title">${escapeHtml(project.title)}</h1>
        <p class="detail-desc">${escapeHtml(project.description)}</p>
        <div class="card-meta">${project.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>
      </div>
      <div class="stamp ${statusClass} stamp-lg">${project.checklist.percent}%</div>
    </header>

    <div class="detail-links">${links.join("")}</div>

    <section class="heatmap-section">
      <div class="section-label">Hoạt động riêng của project · 12 tuần</div>
      ${renderHeatmap(project.activity || {}, 12)}
    </section>

    <section>
      <div class="section-label">Checklist trong project note (${project.checklist.items.filter(i=>i.done).length}/${project.checklist.items.length})</div>
      <div class="detail-card">
        ${renderChecklist(project.checklist)}
      </div>
    </section>

    ${
      project.linkedActions.length
        ? `<section>
            <div class="section-label">Action liên kết (${project.linkedActions.length} file · ${project.checklist.done - project.checklist.items.filter(i=>i.done).length}/${project.checklist.total - project.checklist.items.length} task)</div>
            ${project.linkedActions
              .map(
                (a) => `
              <div class="detail-card action-card">
                <div class="action-card-title">${escapeHtml(a.filename)} <span class="action-card-ratio">${a.done}/${a.total}</span></div>
                ${renderChecklist({ items: a.items })}
              </div>`
              )
              .join("")}
          </section>`
        : ""
    }

    <div class="detail-footer">
      Bắt đầu ${project.started} · Cập nhật gần nhất ${project.lastActivity} · ${project.commitCount} ngày hoạt động (gộp project + action liên kết)
    </div>
  `;

  attachRouteLinks();
}

function navigate(path) {
  history.pushState({}, "", path);
  route();
}

function route() {
  const path = location.pathname;
  const match = path.match(/^\/projects\/(.+)$/);
  if (match) {
    const project = DATA.projects.find((p) => p.slug === match[1]);
    renderProjectDetail(project);
  } else {
    renderDashboard(DATA.projects, DATA.heatmap);
  }
}

window.addEventListener("popstate", route);

loadData()
  .then((data) => {
    DATA = data;
    route();
  })
  .catch((err) => {
    app.innerHTML = `<div class="empty-state">${err.message}</div>`;
    console.error(err);
  });
