$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Ray's CPBL Data Full Maintenance v6" -ForegroundColor Yellow
Write-Host "======================================" -ForegroundColor Cyan

Write-Host "`n[1/5] Checking runtime..." -ForegroundColor Cyan
node .\scripts\check-runtime.js

if ($LASTEXITCODE -ne 0) {
    Write-Host "Runtime is incomplete. Reinstalling npm packages..." -ForegroundColor Yellow

    if (Test-Path ".\node_modules") {
        Remove-Item ".\node_modules" -Recurse -Force
    }

    if (Test-Path ".\package-lock.json") {
        npm ci
    } else {
        npm install
    }

    if ($LASTEXITCODE -ne 0) {
        throw "npm package installation failed."
    }

    node .\scripts\check-runtime.js

    if ($LASTEXITCODE -ne 0) {
        throw "Runtime check still failed after reinstall."
    }
}

Write-Host "`n[2/5] Running complete data pipeline..." -ForegroundColor Cyan
node .\scripts\update-all.js --only=all --soft-exit

if ($LASTEXITCODE -ne 0) {
    Write-Host "The update pipeline reported failures. Review the log before publishing." -ForegroundColor Yellow
}

Write-Host "`n[3/5] Cleaning old backups..." -ForegroundColor Cyan
if (Test-Path ".\scripts\cleanup-backups.js") {
    node .\scripts\cleanup-backups.js
}

Write-Host "`n[4/5] Running tests..." -ForegroundColor Cyan
npm run test:all

if ($LASTEXITCODE -ne 0) {
    throw "Automated tests failed."
}

Write-Host "`n[5/5] Running strict release gate..." -ForegroundColor Cyan
node .\scripts\release-gate.js --strict

if ($LASTEXITCODE -ne 0) {
    throw "Strict release gate failed."
}

Write-Host "`nMaintenance completed successfully." -ForegroundColor Green
Write-Host "Review git status and the website before committing." -ForegroundColor Green

git status --short
