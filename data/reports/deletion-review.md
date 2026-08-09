# 待刪除／封存審核清單

> 本報告只提出建議，未刪除任何檔案。

| 路徑 | 大小 MB | 風險 | 建議 | 理由 |
|---|---:|---|---|---|
| `data/live/backups` | 303.11 | 中 | 保留最近 10 份，其餘封存/刪除 | 大量逐次備份，正式資料不在此 |
| `data/live/backup` | 147.90 | 中 | 與 backups 整併；保留 latest-checkpoints 與人工救援點 | 兩套備份結構重疊 |
| `data/farm/backup` | 0.65 | 低 | 每類保留最近 5 份 | 二軍正式 JSON 可重抓 |
| `debug/pregame` | 0.31 | 低 | 完成問題排查後可清空 | 單次 HTML/TXT/JSON 除錯輸出 |
| `debug/live-inplay` | 0.10 | 低 | 完成問題排查後可清空 | 單次即時爬蟲除錯輸出 |
| `data/farm/farm-boxscore-2026.debug.json` | 5.88 | 低 | 可刪，除錯時再產生 | 非前端正式資料 |
| `data/farm/farm-boxscore-2026.snapshot.json` | 0.12 | 低 | 保留最新一份或刪除 | 可由正式資料重建 |
| `scripts/legacy` | 0.15 | 中 | 先封存，不直接刪 | 可能用於人工救援 |
| `scripts/danger` | 0.02 | 高 | 保留但禁止主流程引用 | 高風險舊爬蟲 |
| `archive` | 0.04 | 中 | 確認無舊頁面需求後可刪 | 歷史頁面封存 |
