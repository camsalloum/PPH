$mytokens = $null
$myerrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile(
    'D:\Projects\IPD 10-12\scripts\transform-actual-to-sql.ps1',
    [ref]$mytokens,
    [ref]$myerrors
)

if ($myerrors.Count -gt 0) {
    Write-Host "Found $($myerrors.Count) parse error(s):"
    foreach ($err in $myerrors) {
        Write-Host "Line $($err.Extent.StartLineNumber): $($err.Message)"
    }
} else {
    Write-Host "No parse errors found - script syntax is valid"
}
