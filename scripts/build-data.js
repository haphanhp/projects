// scripts/build-data.js
//
// Mô hình: 1 project = file trong projects/. Checklist thật của project KHÔNG
// chỉ nằm trong file đó, mà còn rải ở các file trong actions/ có [[wikilink]]
// trỏ tới project này (đúng cách Dataview đang gom trong Obsidian). Script
// này làm lại đúng phép gộp đó ở bước build, không cần Dataview/Obsidian.
//
// Chạy: node scripts/build-data.js  (npm run dev / npm run build tự gọi)

import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import matter from "gray-matter";

import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PROJECTS_DIR = path.join(ROOT, "projects");
const ACTIONS_DIR = path.join(ROOT, "actions");
const OUT_DIR = path.join(ROOT, "public");
const OUT_FILE = path.join(OUT_DIR, "data.json");

const CHECKLIST_RE = /^\s*-\s\[([ xX])\]\s+(.*)$/;
const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;

function listMarkdownFiles(dir) {
  try {
    return readdirSync(dir).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }
}

function isDoneStatus(status) {
  return String(status || "").trim().toLowerCase() === "done";
}

// Nếu file có status: done trong frontmatter, coi như checklist của RIÊNG
// file đó đã 100% xong — không bắt phải tick từng dòng. Không đụng tới các
// item đã tick thật, chỉ override phần hiển thị done/tổng khi tính %.
function effectiveChecklist(checklist, statusRaw) {
  if (!isDoneStatus(statusRaw)) return checklist;
  const total = checklist.total;
  return {
    items: checklist.items.map((i) => ({ ...i, done: true })),
    done: total,
    total,
    percent: 100,
  };
}

function parseChecklist(body) {
  const items = [];
  for (const rawLine of body.split("\n")) {
    const match = rawLine.match(CHECKLIST_RE);
    if (match) items.push({ done: match[1].toLowerCase() === "x", text: match[2].trim() });
  }
  const done = items.filter((i) => i.done).length;
  const total = items.length;
  return { items, done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

// "[[330 Projects/Tên Project|alias]]" hay "[[Tên Project#Heading]]" đều rút
// về đúng "tên project" thuần, lowercase, để so khớp không phân biệt path/alias/heading.
function normalizeLinkTarget(raw) {
  let t = raw.split("|")[0].split("#")[0].trim();
  t = t.split("/").pop();
  return t.trim().toLowerCase();
}

function extractWikilinks(body) {
  const links = new Set();
  let m;
  while ((m = WIKILINK_RE.exec(body)) !== null) {
    links.add(normalizeLinkTarget(m[1]));
  }
  return links;
}

function gitDatesForFile(absPath) {
  try {
    const out = execSync(
      `git log --follow --date=short --pretty=format:%ad -- "${absPath}"`,
      { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }
    )
      .toString()
      .trim();
    return out ? out.split("\n") : [];
  } catch {
    return [];
  }
}

function fileTimestamps(absPath) {
  const stat = statSync(absPath);
  return { created: stat.birthtime.toISOString(), modified: stat.mtime.toISOString() };
}

function slugFromFilename(filename) {
  return filename
    .replace(/\.md$/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // bỏ dấu tiếng Việt cho URL gọn
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function matchKeysFor(filename, frontmatter) {
  const baseName = filename.replace(/\.md$/, "").toLowerCase();
  const keys = new Set([baseName]);
  if (frontmatter.title) keys.add(String(frontmatter.title).toLowerCase());
  // Obsidian/Templater vault của bạn dùng key "alias" (số ít, dạng mảng) —
  // hỗ trợ cả "alias" và "aliases" để không phụ thuộc template nào.
  for (const a of [...(frontmatter.alias || []), ...(frontmatter.aliases || [])]) {
    keys.add(String(a).toLowerCase());
  }
  return keys;
}

function loadActions() {
  const files = listMarkdownFiles(ACTIONS_DIR);
  return files.map((filename) => {
    const absPath = path.join(ACTIONS_DIR, filename);
    const raw = readFileSync(absPath, "utf-8");
    const { data: frontmatter, content } = matter(raw);
    return {
      filename,
      matchKeys: matchKeysFor(filename, frontmatter),
      checklist: effectiveChecklist(parseChecklist(content), frontmatter.status),
      links: extractWikilinks(raw),
      dates: gitDatesForFile(absPath),
    };
  });
}

function loadProjects(actions) {
  const files = listMarkdownFiles(PROJECTS_DIR);
  const heatmap = {};
  const projects = [];

  for (const filename of files) {
    const absPath = path.join(PROJECTS_DIR, filename);
    const raw = readFileSync(absPath, "utf-8");
    const { data: frontmatter, content } = matter(raw);
    const ownChecklist = effectiveChecklist(parseChecklist(content), frontmatter.status);
    const ownDates = gitDatesForFile(absPath);
    const ts = fileTimestamps(absPath);

    // Khoá để khớp wikilink: tên file (không đuôi .md), title, alias nếu có.
    const matchKeys = matchKeysFor(filename, frontmatter);

    // Lan truyền qua nhiều tầng: action không cần link thẳng tới project,
    // chỉ cần link tới MỘT action đã được tính vào project này là tự gộp
    // theo, dù sâu bao nhiêu tầng (action → action → action → project).
    const knownKeys = new Set(matchKeys);
    const included = [];
    let changed = true;
    while (changed) {
      changed = false;
      for (const a of actions) {
        if (included.includes(a)) continue;
        if ([...a.links].some((l) => knownKeys.has(l))) {
          included.push(a);
          for (const k of a.matchKeys) knownKeys.add(k);
          changed = true;
        }
      }
    }
    const linkedActions = included;

    // Gộp checklist: project + mọi action có link tới nó (trực tiếp hoặc xuyên tầng)
    let totalDone = ownChecklist.done;
    let totalCount = ownChecklist.total;
    const allDates = new Set(ownDates);
    for (const a of linkedActions) {
      totalDone += a.checklist.done;
      totalCount += a.checklist.total;
      for (const d of a.dates) allDates.add(d);
    }
    const percent =
      totalCount === 0 ? (isDoneStatus(frontmatter.status) ? 100 : 0) : Math.round((totalDone / totalCount) * 100);

    // Heatmap riêng của project (own + linked actions)
    const projectActivity = {};
    for (const d of allDates) projectActivity[d] = (projectActivity[d] || 0) + 1;
    if (allDates.size === 0) {
      projectActivity[ts.modified.slice(0, 10)] = 1;
    }
    for (const [d, c] of Object.entries(projectActivity)) {
      heatmap[d] = (heatmap[d] || 0) + c;
    }

    const sortedDates = [...allDates].sort().reverse();

    projects.push({
      slug: slugFromFilename(filename),
      title: frontmatter.title || filename.replace(/\.md$/, ""),
      description: frontmatter.description || "",
      tags: frontmatter.tags || [],
      status: isDoneStatus(frontmatter.status) || percent === 100 ? "done" : "in-progress",
      link: frontmatter.link || null,
      repo: frontmatter.repo || null,
      started: frontmatter.started || ts.created.slice(0, 10),
      checklist: { items: ownChecklist.items, done: totalDone, total: totalCount, percent },
      linkedActions: linkedActions.map((a) => ({
        filename: a.filename.replace(/\.md$/, ""),
        done: a.checklist.done,
        total: a.checklist.total,
        items: a.checklist.items,
      })),
      lastActivity: sortedDates[0] || ts.modified.slice(0, 10),
      commitCount: allDates.size,
      activity: projectActivity,
    });
  }

  projects.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
  return { projects, heatmap };
}

function main() {
  const actions = loadActions();
  const { projects, heatmap } = loadProjects(actions);
  const usedActionFiles = new Set(projects.flatMap((p) => p.linkedActions.map((a) => a.filename)));
  const orphanActions = actions.filter((a) => !usedActionFiles.has(a.filename.replace(/\.md$/, "")));

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    OUT_FILE,
    JSON.stringify({ generatedAt: new Date().toISOString(), projects, heatmap }, null, 2)
  );

  console.log(`✓ data.json: ${projects.length} project, ${actions.length} action file (${orphanActions.length} chưa link tới project nào), ${Object.keys(heatmap).length} ngày hoạt động.`);
  if (orphanActions.length) {
    console.log("  Action chưa khớp project (kiểm tra lại [[wikilink]] hoặc tên project):");
    for (const a of orphanActions) console.log(`   - ${a.filename}`);
  }
}

main();
