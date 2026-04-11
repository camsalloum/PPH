$content = Get-Content 'D:\Projects\IPD 10-12\scripts\transform-actual-to-sql.ps1'
for ($i = 1073; $i -le 1082; $i++) {
    $line = $content[$i-1]
    Write-Host "${i}: $line"
}
