# v6.2 快速維護

## 平常賽前／日常

```powershell
.\maintain.ps1 -Mode Daily
```

只跑賽前、LIVE、快訊與缺漏掃描，通常幾十秒到數分鐘。

## 比賽進行中

```powershell
.\maintain.ps1 -Mode Live
```

只跑 Changed-Only LIVE。

## 賽後

```powershell
.\maintain.ps1 -Mode Postgame
```

只補昨天或指定日期的 FINAL，再重建快訊與報告。

## 自動補漏

```powershell
.\maintain.ps1 -Mode Repair
```

掃描一軍／二軍缺漏，只處理需要補抓的日期與場次。

## 每週完整維護

```powershell
.\maintain.ps1 -Mode Weekly
```

更新名單、賽前、FINAL、二軍賽程，二軍 Boxscore 只抓新增或不完整場次。

## 驗證

```powershell
.\maintain.ps1 -Mode Verify
```
