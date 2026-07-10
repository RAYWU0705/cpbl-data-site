# CPBL HTML Encoding Rescue v1

這包修復三個被 mojibake 亂碼污染的 HTML：

- index.html
- rules.html
- version.html

修復內容：
- 使用正常 UTF-8 中文內容重建
- 移除主站對 `ops/teams-dashboard.html` 的連結
- 首頁導覽改成 `season.html` / 賽季中心
- rules 頁底部連結改為 `teams.html`
- version 頁 Hero action 改為 `season.html`
- 保留 version.html 內文歷史紀錄中提到的 report.html / teams-dashboard.html，因為那是版本紀錄文字，不是壞連結

覆蓋方式：
```powershell
cd E:\cpbl-website
Copy-Item "$env:USERPROFILE\Downloads\cpbl-html-encoding-rescue-v1\index.html" ".\index.html" -Force
Copy-Item "$env:USERPROFILE\Downloads\cpbl-html-encoding-rescue-v1\rules.html" ".\rules.html" -Force
Copy-Item "$env:USERPROFILE\Downloads\cpbl-html-encoding-rescue-v1\version.html" ".\version.html" -Force
```

覆蓋後建議：
```powershell
Select-String -Path *.html,css\*.css,js\*.js -Pattern "href=\"report.html\"|href=\"ops/teams-dashboard.html\"" -CaseSensitive:$false
git add index.html rules.html version.html
git commit --amend --no-edit
```
