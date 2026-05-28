# v5.1.0-TEAMS-CSS-SPLIT-STABLE

這包是球隊系統 CSS 拆分版，目的：避免 `css/teams.css` 再被某個頁面升級時覆蓋，導致其他球隊頁樣式消失。

## 覆蓋 / 新增位置

```txt
E:\cpbl-website\css\teams.css
E:\cpbl-website\css\team-common.css
E:\cpbl-website\css\team-home.css
E:\cpbl-website\css\team-roster.css
E:\cpbl-website\css\team-stats.css
```

## 拆分後架構

```txt
teams.css          球隊系統 CSS 入口，只負責 import
team-common.css    共用球隊樣式、隊色、teams.html 基礎
team-home.css      team.html 專用
team-roster.css    team-roster.html 專用
team-stats.css     team-stats.html 專用
```

`team-transactions.html` 已經使用獨立的 `css/team-transactions.css`，不放進 `teams.css`。

## 測試頁面

```txt
team.html?team=brothers
team-roster.html?team=brothers&squad=first
team-stats.html?team=brothers
team-transactions.html?team=brothers
```
