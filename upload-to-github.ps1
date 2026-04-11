# ============================================================
#  Upload to GitHub - PPH 26.4
#  Automates git add, commit, and push to:
#    https://github.com/camsalloum/PPH.git
# ============================================================

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Upload to GitHub - PPH 26.4          " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

function Invoke-Git {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$GitArgs,
        [switch]$AllowFailure
    )

    & git @GitArgs
    if (-not $AllowFailure -and $LASTEXITCODE -ne 0) {
        throw "git $($GitArgs -join ' ') failed with exit code $LASTEXITCODE"
    }
}

# Navigate to project root (same folder as this script)
$projectPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectPath

# Init repo if needed
if (-not (Test-Path ".git")) {
    Write-Host "[INIT] No .git found - initializing repository..." -ForegroundColor Yellow
    Invoke-Git -GitArgs @("init")
    Invoke-Git -GitArgs @("branch", "-M", "main")
}

# Ensure commit identity
$haveName  = (git config --get user.name)  2>$null
$haveEmail = (git config --get user.email) 2>$null
if (-not $haveName)  { git config --local user.name  "Cam" | Out-Null }
if (-not $haveEmail) { git config --local user.email "camsalloum@gmail.com" | Out-Null }
git config --local core.longpaths true | Out-Null
Write-Host "Git user: $(git config --get user.name) <$(git config --get user.email)>" -ForegroundColor Gray

# Ensure remote 'origin' points to PPH
$repoUrl = "https://github.com/camsalloum/PPH.git"
$currentOrigin = (git remote get-url origin 2>$null)

if (-not $currentOrigin) {
    Write-Host "Adding remote 'origin' -> $repoUrl" -ForegroundColor Yellow
    Invoke-Git -GitArgs @("remote", "add", "origin", $repoUrl)
} elseif ($currentOrigin -match "https://[^/@]+(:[^@]+)?@github\.com/") {
    # Prevent keeping PAT/user credentials inside the remote URL.
    Write-Host "[WARN] Remote URL contains embedded credentials. Sanitizing..." -ForegroundColor Yellow
    Write-Host "  Old: $currentOrigin" -ForegroundColor DarkGray
    Write-Host "  New: $repoUrl" -ForegroundColor DarkGray
    Invoke-Git -GitArgs @("remote", "set-url", "origin", $repoUrl)
} elseif ($currentOrigin -notlike "*/PPH.git*") {
    Write-Host "Updating remote 'origin'" -ForegroundColor Yellow
    Write-Host "  Old: $currentOrigin" -ForegroundColor DarkGray
    Write-Host "  New: $repoUrl" -ForegroundColor DarkGray
    Invoke-Git -GitArgs @("remote", "set-url", "origin", $repoUrl)
} else {
    Write-Host "Remote 'origin' OK" -ForegroundColor Gray
}

# Clean up legacy remotes if they exist
foreach ($old in @("pph261", "pph262", "pph264")) {
    if (git remote | Select-String -Pattern "^$old$") {
        Write-Host "Removing legacy remote '$old'" -ForegroundColor DarkGray
        Invoke-Git -GitArgs @("remote", "remove", $old)
    }
}

Write-Host ""

# Status
Write-Host "Current changes:" -ForegroundColor Yellow
git status --short
Write-Host ""

# Stage changes with generated output excluded by default
Write-Host "Staging changes..." -ForegroundColor Yellow
Invoke-Git -GitArgs @("add", "-A")

# Generated artifacts are high churn and often bloat commits.
$autoUnstage = @(
    "build/assets",
    "test-results",
    "playwright-report",
    "coverage"
)

foreach ($path in $autoUnstage) {
    & git reset HEAD -q -- $path 2>$null
}

# Abort early if nothing to commit
$stagedFiles = @(git diff --cached --name-only)
$stagedCount = $stagedFiles.Count
if ($stagedCount -eq 0) {
    Write-Host "[INFO] Nothing staged after exclusions - pushing existing commits..." -ForegroundColor Yellow
}

# Show large staged files and block anything near GitHub hard limit.
$warnThreshold = 50MB
$blockThreshold = 95MB
$largeStaged = @()
foreach ($f in $stagedFiles) {
    if (Test-Path $f -PathType Leaf) {
        $size = (Get-Item $f).Length
        if ($size -ge $warnThreshold) {
            $largeStaged += [PSCustomObject]@{
                Path = $f
                SizeMB = [math]::Round($size / 1MB, 2)
            }
        }
    }
}

if ($largeStaged.Count -gt 0) {
    Write-Host "[WARN] Large staged files detected:" -ForegroundColor Yellow
    $largeStaged | Sort-Object SizeMB -Descending | Format-Table -AutoSize

    if (($largeStaged | Where-Object { $_.SizeMB -ge ($blockThreshold / 1MB) }).Count -gt 0) {
        Write-Host "[ERROR] One or more files are >= 95MB. Commit aborted to avoid push failure." -ForegroundColor Red
        Write-Host "        Move big artifacts out of git, or use Git LFS for legitimate binary assets." -ForegroundColor Red
        exit 1
    }
}

# Commit
$commitMessage = "Update: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
Write-Host "Commit message: $commitMessage" -ForegroundColor Gray
Write-Host ""

Write-Host "Committing..." -ForegroundColor Yellow
& git commit -m $commitMessage

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[INFO] Nothing new to commit - pushing existing commits..." -ForegroundColor Yellow
}

# Push
Write-Host ""
Write-Host "Pushing to GitHub (PPH)..." -ForegroundColor Yellow
& git push -u origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "[SUCCESS] Pushed to GitHub!" -ForegroundColor Green
    Write-Host "Repository: $repoUrl" -ForegroundColor Cyan
} else {
    # Detect unrelated histories: fetch remote and check for a common ancestor.
    # If there is none, the remote was likely created with a placeholder README
    # and it is safe to force-push our full project over it.
    & git fetch origin main -q 2>$null
    $mergeBase = (git merge-base HEAD origin/main 2>$null)
    $hasCommonAncestor = ($LASTEXITCODE -eq 0 -and $mergeBase)

    if (-not $hasCommonAncestor) {
        Write-Host ""
        Write-Host "[INFO] Remote has unrelated history (likely a GitHub-generated README)." -ForegroundColor Yellow
        Write-Host "       Force-pushing to replace it with your full project..." -ForegroundColor Yellow
        Write-Host ""
        & git push -u origin main --force

        if ($LASTEXITCODE -eq 0) {
            Write-Host ""
            Write-Host "[SUCCESS] Force-pushed to GitHub!" -ForegroundColor Green
            Write-Host "Repository: $repoUrl" -ForegroundColor Cyan
        } else {
            Write-Host ""
            Write-Host "[ERROR] Force-push also failed" -ForegroundColor Red
            Write-Host ""
            Write-Host "Checklist:" -ForegroundColor Yellow
            Write-Host "  1. Create the repo:  https://github.com/new  ->  PPH (private)" -ForegroundColor Yellow
            Write-Host "  2. Token:  https://github.com/settings/tokens  ->  Generate classic token with repo scope" -ForegroundColor Yellow
            Write-Host "  3. When prompted, use the token as your password (not your GitHub password)" -ForegroundColor Yellow
        }
    } else {
        Write-Host ""
        Write-Host "[ERROR] Push failed - remote has diverged." -ForegroundColor Red
        Write-Host "        Run 'git pull --rebase origin main' first, resolve any conflicts, then re-run this script." -ForegroundColor Yellow
    }
}

Write-Host ""
