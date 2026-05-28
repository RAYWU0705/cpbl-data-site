# Ray's CPBL Data Site - FINAL Manual Override v1

## 覆蓋方式

把 `scripts/fetch-cpbl-final-today.js` 覆蓋到專案：

```txt
E:\cpbl-website\scripts\fetch-cpbl-final-today.js
```

把 `data/manual/manual-boxscore-overrides.json` 放到：

```txt
E:\cpbl-website\data\manual\manual-boxscore-overrides.json
```

如果資料夾不存在，請建立 `data/manual/`。

## 人工修正檔 key

支援三種 key：

```txt
2026-05-16_102
102
2026-05-16_中信兄弟_統一7-ELEVEn獅
```

建議用第一種：`日期_gameSno`。

## 修正規則

人工修正只會覆蓋你有填的欄位：

- `meta.win / lose / save / mvp`
- `totals.away / totals.home`
- `lineScore.away / lineScore.home`
- `batters.away / batters.home`
- `pitchers.away / pitchers.home`
- `pregame`

例如只填：

```json
{
  "2026-05-16_102": {
    "enabled": true,
    "reason": "統一主隊投手由人工修正",
    "pitchers": {
      "home": [
        {
          "name": "布雷克",
          "rawName": "布雷克",
          "note": "(L)",
          "IP": "9",
          "H": "7",
          "R": "1",
          "ER": "1",
          "BB": "0",
          "SO": "1",
          "ERA": "0.00"
        }
      ]
    }
  }
}
```

就只會覆蓋 `pitchers.home`，其他爬蟲抓到的資料會保留。

## 測試指令

```powershell
node scripts/fetch-cpbl-final-today.js --date=2026-05-16
node scripts/fetch-cpbl-final-today.js --date=2026-05-17
```

看到這種訊息代表人工修正有套用：

```txt
🛠️ 102: 已套用人工修正｜key=2026-05-16_102
```

