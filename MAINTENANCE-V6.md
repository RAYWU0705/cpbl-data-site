# Ray's CPBL Data v6.1.0 維護說明

## 最簡單的完整維護

在 PowerShell 執行：

```powershell
cd E:\cpbl-website
.\maintain.ps1
```

腳本會依序：修復缺少的 npm 套件、檢查 Puppeteer、更新一軍名單／賽前／LIVE／FINAL、更新二軍、重建快訊、清理逾期備份、執行全部測試與 Strict Release Gate。

## 快速更新

```powershell
npm run update
```

## 賽後更新

```powershell
npm run update:postgame -- --date=2026-07-23
```

## Puppeteer 單獨修復

```powershell
Remove-Item node_modules -Recurse -Force
npm ci
npx puppeteer browsers install chrome
npm run check:runtime
```
