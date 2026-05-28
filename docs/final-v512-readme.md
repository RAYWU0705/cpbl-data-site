# FINAL v5.0-12 RECENT GUARD

修正重點：

1. 近 0～2 天 FINAL 場次強制啟用 stats fallback 交叉驗證。
2. `needsStatsFallback()` 會把主客隊鏡像也視為需要 fallback。
3. `mergeStatsFallbackIntoDetail()` 在 recentFinalGuard 啟用時，優先使用 stats.cpbl.com.tw 的球員資料。
4. sanitize 後重新計算 dataQuality，避免錯資料仍顯示 confirmed。

覆蓋：

```txt
scripts/fetch-cpbl-final-today.js
data/manual/manual-boxscore-overrides.json
```

測試：

```powershell
node scripts/fetch-cpbl-final-today.js --date=2026-05-19
node scripts/fetch-cpbl-final-today.js --date=2026-05-20
```

重點檢查：108、109、111。
