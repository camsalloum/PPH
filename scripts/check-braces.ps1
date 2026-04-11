$content = Get-Content 'D:\Projects\IPD 10-12\scripts\transform-actual-to-sql.ps1' -Raw
$lines = $content -split "`r?`n"

Write-Host "Total lines: $($lines.Count)"
Write-Host ""
Write-Host "Lines 1010-1020:"
for ($i = 1009; $i -lt 1020 -and $i -lt $lines.Count; $i++) {
    $lineNum = $i + 1
    $line = $lines[$i]
    Write-Host "${lineNum}: $line"
}

Write-Host ""
Write-Host "Checking brace balance from line 900 to end..."

$openBraces = 0
for ($i = 899; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]
    $opens = ($line.ToCharArray() | Where-Object { $_ -eq '{' }).Count
    $closes = ($line.ToCharArray() | Where-Object { $_ -eq '}' }).Count
    $openBraces += ($opens - $closes)
    
    if ($opens -ne 0 -or $closes -ne 0) {
        $lineNum = $i + 1
        Write-Host "${lineNum}: opens=$opens, closes=$closes, balance=$openBraces | $line"
    }
}

Write-Host ""
Write-Host "Final brace balance: $openBraces (should be 0)"
