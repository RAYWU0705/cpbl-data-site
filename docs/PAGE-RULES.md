# CPBL Data Site 頁面管理規則

## 1. 每個頁面都必須有類型

合法類型：

- `PUBLIC`
- `OPS_PUBLIC`
- `OPS`
- `ADMIN`
- `LOCAL_TOOL`

頁面必須登錄在：

```txt
config/pages.json
```

未登錄頁面不可直接視為正式頁。

## 2. HTML 頁首用途註解

未來逐頁加入下列格式：

```html
<!--
=========================================================
CPBL Data Site Page Metadata
Page Type: PUBLIC
Page Name: 比賽中心
Route: /match.html
Deploy: YES
Navigation: CONTEXT
Maintainer: Ray
Status: ACTIVE
=========================================================
-->
```

管理頁範例：

```html
<!--
=========================================================
CPBL Data Site Page Metadata
Page Type: ADMIN
Page Name: Admin Ops Center
Route: /admin/ops-center.html
Deploy: OPTIONAL
Navigation: ADMIN ONLY
Maintainer: Ray
Status: ACTIVE
=========================================================
-->
```

本機工具範例：

```html
<!--
=========================================================
CPBL Data Site Page Metadata
Page Type: LOCAL TOOL
Page Name: Manual Override Generator
Deploy: NO
Git Tracking: NO
Maintainer: Ray
Status: INTERNAL
=========================================================
-->
```

## 3. 根目錄規則

目前 Stage A 不搬檔。

未來原則：

- 根目錄優先保留正式 PUBLIC 頁面。
- OPS 頁面移至 `ops/`。
- ADMIN 頁面移至 `admin/`。
- LOCAL_TOOL 頁面移至 `local-tools/`。
- GENERATED Debug 留在 `debug/`，不得視為網站頁面。

## 4. 部署規則

- PUBLIC：部署。
- OPS_PUBLIC：部署。
- OPS：可部署，但不進一般導覽。
- ADMIN：視需要部署，不進一般導覽。
- LOCAL_TOOL：不部署、不推 Git。
- GENERATED：不部署、不推 Git。

## 5. 搬移頁面前必查

搬到子資料夾前必須檢查：

- `<link href="...">`
- `<script src="...">`
- `<img src="...">`
- `<a href="...">`
- `fetch("...")`
- `location.href`
- `window.open`
- PWA manifest 與 icon
- CSS 內 `url(...)`

例如從根目錄搬到 `admin/` 後：

```html
<link rel="stylesheet" href="css/style.css">
```

需改成：

```html
<link rel="stylesheet" href="../css/style.css">
```

## 6. 安全提醒

`admin/` 只是分類，不是權限保護。

GitHub Pages 上的檔案只要知道網址仍可開啟。真正不應公開的工具必須放在 `local-tools/`，並加入 `.gitignore`。
