# project-log

Dashboard hiển thị tất cả project cá nhân từ file Markdown: checklist,
% hoàn thành, và heatmap hoạt động lấy từ lịch sử git. Một codebase dùng
được cho cả hai mục đích:

- **Showcase công khai** — deploy lên Netlify để gửi cho nhà tuyển dụng.
- **Quản lý cá nhân** — chạy local (`npm run dev`), sửa file `.md`, xem
  tiến độ cập nhật ngay.

Không có backend, không có database. Toàn bộ "nguồn sự thật" là các file
`.md` trong `projects/` — bạn sửa file, commit, mọi thứ tự cập nhật.

## Chạy thử

```bash
npm install
npm run dev
```

Mở `http://localhost:5173`.

## Cách thêm một project mới

Tạo file `projects/ten-du-an.md`:

```markdown
---
title: Tên dự án
description: Một câu mô tả ngắn.
tags: [react, postgres]
status: in-progress      # hoặc "done" — nếu bỏ trống, tự suy ra từ % checklist
link: https://demo.example.com   # optional, link demo/live
repo: https://github.com/you/repo # optional, link source
started: 2026-01-10       # optional, nếu bỏ trống dùng ngày tạo file
---

## Checklist

- [x] Việc đã xong
- [x] Việc đã xong khác
- [ ] Việc chưa làm
- [ ] Việc chưa làm khác
```

Chỉ cần dòng dạng `- [ ] ...` / `- [x] ...` được tính vào checklist —
phần mô tả/ghi chú phía trên/dưới không ảnh hưởng. % hoàn thành = số dòng
`[x]` / tổng số dòng checklist trong file đó **cộng với** mọi file trong
`actions/` có `[[wikilink]]` trỏ về project này (xem phần "Mô hình dữ
liệu" bên dưới).

## Heatmap hoạt động lấy từ đâu?

Script `scripts/build-data.js` chạy:

```bash
git log --follow --date=short --pretty=format:%ad -- <file>
```

cho từng file trong `projects/`, gộp lại theo ngày. Nghĩa là: **bạn commit
đều, heatmap tự đẹp** — không cần nhập tay ngày nào cả. Nếu một file chưa
từng được commit (vừa tạo, chưa `git add`), heatmap tạm tính theo ngày sửa
file gần nhất để không bị trống khi xem local.

## Tính năng mới: trang chi tiết + bộ lọc

- Bấm vào bất kỳ project card nào → mở `/projects/<slug>` với checklist đầy
  đủ (không bị cắt 5 dòng) + heatmap hoạt động riêng của project đó (12 tuần).
- Trên dashboard có bộ lọc theo **trạng thái** (Tất cả / Đang làm / Hoàn
  thành) và theo **tag** (bấm nhiều tag để lọc kiểu AND giữa nhóm, OR trong
  cùng nhóm tag). Lọc chạy hoàn toàn ở client, không cần rebuild.
- Routing là client-side (không dùng framework, ~80 dòng JS), dựa vào
  `history.pushState` + redirect `/* → /index.html` đã khai báo trong
  `netlify.toml`. Vì vậy **bắt buộc phải deploy qua Netlify** (hoặc host
  nào hỗ trợ SPA fallback) — mở thẳng file `dist/index.html` bằng
  `file://` sẽ không có route hoạt động đúng, dùng `npm run preview` để
  test local cho đúng.

## Mô hình dữ liệu: Project + Action liên kết qua [[wikilink]]

Checklist thật của 1 project **không chỉ nằm trong file project** —
nó gồm cả checkbox trong các file Action có `[[wikilink]]` trỏ về
project đó, đúng cách bạn đang gom bằng Dataview trong Obsidian. Dashboard
làm lại đúng phép gộp này ở bước build:

```
projects/restaurant-booking.md        →  4 done / 7 task (riêng project)
actions/email-confirm-flow.md         →  1 done / 3 task (có [[restaurant-booking]])
                                       -------------------------
% hiển thị trên dashboard             →  5 done / 10 task = 50%
```

**Quy tắc khớp Action ↔ Project — lan truyền qua nhiều tầng:** trong
file Action, chỉ cần có `[[tên]]` trỏ tới **project, hoặc tới một action
khác đã được tính vào project đó** — không bắt buộc link thẳng tới
project. Phù hợp với cách làm việc "không biết task sẽ đào sâu bao nhiêu
tầng, phát sinh thì tạo action mới rồi làm": bạn cứ tạo action con, link
tới action cha (không cần link lại tới project gốc), script tự truy
ngược tới gốc dù qua bao nhiêu tầng.

```
actions/sms-provider-research.md  → [[email-confirm-flow]]        (link tới 1 action khác)
actions/email-confirm-flow.md     → [[restaurant-booking]]        (link thẳng tới project)
                                   -----------------------------------------------
projects/restaurant-booking.md    → tự động gộp cả 2 action trên, dù
                                     sms-provider-research không hề
                                     biết tới project này.
```

Có chu trình (action A link action B, B link lại A) cũng an toàn — thuật
toán dừng đúng lúc, không loop vô hạn.

Action không link tới project nào vẫn được tính (không bị mất dữ liệu)
nhưng sẽ không xuất hiện trên dashboard — chạy `npm run data` sẽ in ra
danh sách Action "orphan" này trong log, để bạn biết file nào quên gắn
wikilink.

## Đồng bộ Project/Action từ vault (tự động, không cần copy tay)

Vault của bạn (`Obsidian-Vault-colourful-not-syncthing`) đã auto-commit
khi ngừng edit. Để chỉ đúng phần Project + Action chảy sang repo
`mydigitalgarden` (đã đổi thành repo chỉ chứa dashboard), dùng GitHub
Action chạy trong repo vault, copy 1 chiều sang dashboard:

```
Sửa note trong 330 Projects/ hoặc 320 Actions/
        ↓ (Obsidian Git auto-commit + push lên vault repo)
GitHub Action trong vault repo tự kích hoạt (chỉ khi đổi đúng 2 thư mục này)
        ↓
Copy nguyên file .md sang mydigitalgarden (projects/ và actions/)
        ↓
Netlify thấy push mới → build lại dashboard
```

**Bước 1 — Tạo Personal Access Token** (GitHub → Settings → Developer
settings → Fine-grained tokens): chỉ cấp quyền cho repo `mydigitalgarden`,
permission **Contents: Read and write**.

**Bước 2 — Lưu token làm secret** trong repo vault
(`Obsidian-Vault-colourful-not-syncthing` → Settings → Secrets and
variables → Actions): tên `DASHBOARD_PUSH_TOKEN`.

**Bước 3 — Đặt file workflow** vào đúng vị trí trong repo vault:

```
.github/workflows/sync-to-dashboard.yml
```

Nội dung file này nằm sẵn trong thư mục `.github-workflow-for-vault-repo/`
đi kèm — copy file `sync-to-dashboard.yml` sang vault repo đúng path
trên, rồi **xoá thư mục `.github-workflow-for-vault-repo/` khỏi repo
dashboard** (nó chỉ là chỗ tạm để mang file qua, không thuộc dashboard).

Workflow đã trỏ đúng 2 thư mục thật của bạn:

```yaml
paths:
  - "300 🚰 Pipelines/330 🧗 Projects/**"
  - "300 🚰 Pipelines/320 🛠 Actions/**"
```

**Bước 4 — Không cần làm gì thêm.** Cứ viết note như bình thường trong
2 thư mục đó, gắn `[[tên project]]` trong file Action khi cần liên kết.
Mọi thứ còn lại tự chạy.

### Lưu ý quan trọng

- Heatmap đọc `git log` của file **trong repo `mydigitalgarden`**, tức
  là tính theo **ngày Action sync chạy**, không phải ngày gốc bạn gõ
  trong vault. Vì Obsidian Git của bạn auto-commit gần như ngay khi
  ngừng edit, 2 mốc thời gian lệch nhau chỉ vài phút — không đáng kể.
- `Outcome` và `Objective` (bạn nói chưa gắn kết) **chưa được đồng bộ**
  ở bản này — nếu sau này bạn muốn đưa vào (vd: nhóm project theo
  Outcome), nói để mình thêm thư mục thứ 3 vào pipeline tương tự.
- Nếu một Action có nhiều `[[project]]` link tới nhiều project khác
  nhau cùng lúc, checklist của nó sẽ được cộng vào **tất cả** project
  đó — đúng hành vi Dataview `dv.pages()` từng làm.

## `status: done` — đánh dấu xong nhanh, không cần tick từng dòng

Trong frontmatter (1 dấu `:`, không phải inline field 2 dấu `::` của
Dataview), thêm:

```yaml
---
status: done
---
```

File đó (project hoặc action) sẽ được tính **100% xong** khi gộp vào
dashboard, bất kể bạn có tick hết từng `- [ ]` hay không. Hợp lý cho lúc
task không phức tạp, làm xong rồi nhưng lười tick từng dòng. Không phân
biệt hoa thường (`Done`, `DONE`, `done` đều nhận).

Lưu ý: việc này chỉ ảnh hưởng tới **% hiển thị trên dashboard**, không
sửa lại file gốc của bạn — checkbox thật trong Obsidian vẫn giữ nguyên
trạng thái chưa tick.

## Lan truyền không giới hạn tầng

Thuật toán gộp action chạy lặp tới khi không còn tìm thêm được action
nào mới — không có giới hạn cứng 1 hay 2 tầng. Action A → B → C → D →
project vẫn gộp đúng dù bạn không biết trước sẽ phát sinh bao nhiêu tầng
khi bắt đầu làm.

## Build cho production

```bash
npm run build    # chạy build-data.js rồi build Vite → dist/
npm run preview  # xem trước bản build
```

## Deploy lên Netlify

1. Push repo này lên GitHub (**đảm bảo có ít nhất 1 commit thật** — nếu
   deploy lúc repo còn trống hoặc chỉ có file rác, Netlify sẽ chỉ serve
   đúng cái rác đó mãi vì sau này nó coi như "không có gì để build mới").
2. Trên Netlify: **Add new site → Import an existing project → chọn repo**.
3. Build command và publish directory **đã được khai báo sẵn** trong
   `netlify.toml` (`npm run build` → `dist/`), Netlify tự đọc, không cần
   tự gõ tay.
4. Mỗi lần bạn `git push` (sau khi sửa/thêm file trong `projects/`),
   Netlify tự build lại — heatmap và % hoàn thành tự cập nhật theo commit
   mới nhất.

## Cấu trúc

```
projects/             ← nguồn sự thật, mỗi project 1 file .md
scripts/build-data.js ← parse .md + git log → public/data.json
src/main.js            ← render heatmap + project card từ data.json
src/style.css          ← giao diện "field journal / ledger"
netlify.toml           ← build command + publish dir cho Netlify
```

## Tùy biến

- Đổi ngưỡng màu heatmap: sửa hàm `levelFor()` trong `src/main.js`.
- Đổi số tuần hiển thị: đổi `weeks` trong `buildHeatmapCells(heatmap, weeks)`.
- Đổi giao diện: toàn bộ token màu/font nằm ở đầu `src/style.css`
  (`:root { ... }`), sửa ở đó là đổi theme toàn site.
- Muốn thêm trang riêng cho từng project (hiện tại chỉ có card tóm tắt):
  thêm route trong `src/main.js`, dùng `project.slug` để build URL
  `/projects/<slug>` (đã có redirect SPA sẵn trong `netlify.toml`).
