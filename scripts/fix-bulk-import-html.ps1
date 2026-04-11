# PowerShell script to fix HTML files for bulk import
# Extracts budget data from HTML table inputs and adds required metadata/savedBudget variables

param(
    [Parameter(Mandatory=$true)]
    [string]$InputFile,
    
    [Parameter(Mandatory=$false)]
    [string]$OutputFile
)

# If no output file specified, create one with _FIXED suffix
if (-not $OutputFile) {
    $directory = [System.IO.Path]::GetDirectoryName($InputFile)
    $filename = [System.IO.Path]::GetFileNameWithoutExtension($InputFile)
    $extension = [System.IO.Path]::GetExtension($InputFile)
    $OutputFile = Join-Path $directory "$($filename)_FIXED$extension"
}

Write-Host "Reading file: $InputFile" -ForegroundColor Cyan

# Read file content
$content = Get-Content $InputFile -Raw -Encoding UTF8

# Extract metadata from title
$titleMatch = [regex]::Match($content, '<title>Budget Planning - (\w+) - (.+?) - (\d{4})</title>')
if (-not $titleMatch.Success) {
    Write-Host "ERROR: Could not extract metadata from title tag" -ForegroundColor Red
    exit 1
}

$division = $titleMatch.Groups[1].Value
$salesRep = $titleMatch.Groups[2].Value
$budgetYear = [int]$titleMatch.Groups[3].Value
$actualYear = $budgetYear - 1

Write-Host "Division: $division" -ForegroundColor Green
Write-Host "Sales Rep: $salesRep" -ForegroundColor Green
Write-Host "Budget Year: $budgetYear" -ForegroundColor Green

# Extract all budget input values
$budgetData = @()

# Pattern to match input fields with data attributes
$inputPattern = '<input[^>]*data-customer="([^"]+)"[^>]*data-country="([^"]+)"[^>]*data-group="([^"]+)"[^>]*data-month="(\d+)"[^>]*value="([^"]*)"[^>]*>'
$matches = [regex]::Matches($content, $inputPattern)

Write-Host "Found $($matches.Count) budget input fields" -ForegroundColor Yellow

# Group by customer/country/product group
$groupedData = @{}

foreach ($match in $matches) {
    $customer = $match.Groups[1].Value
    $country = $match.Groups[2].Value
    $productGroup = $match.Groups[3].Value
    $month = [int]$match.Groups[4].Value
    $value = $match.Groups[5].Value
    
    # Parse value, default to 0
    $numValue = 0.0
    if ($value -and $value -ne "") {
        [double]::TryParse($value, [ref]$numValue) | Out-Null
    }
    
    $key = "$customer|$country|$productGroup"
    
    if (-not $groupedData.ContainsKey($key)) {
        $groupedData[$key] = @{
            customer = $customer
            country = $country
            productGroup = $productGroup
            months = @{}
        }
    }
    
    $groupedData[$key].months[$month] = $numValue
}

Write-Host "Found $($groupedData.Count) unique customer/country/product group combinations" -ForegroundColor Yellow

# Convert to budget array format
foreach ($key in $groupedData.Keys) {
    $data = $groupedData[$key]
    
    # Check if any month has a non-zero value
    $hasValues = $false
    for ($m = 1; $m -le 12; $m++) {
        if ($data.months.ContainsKey($m) -and $data.months[$m] -gt 0) {
            $hasValues = $true
            break
        }
    }
    
    # Include all rows (even zeros) for proper import
    $record = @{
        customer = $data.customer
        country = $data.country
        productGroup = $data.productGroup
        month1 = if ($data.months.ContainsKey(1)) { $data.months[1] } else { 0 }
        month2 = if ($data.months.ContainsKey(2)) { $data.months[2] } else { 0 }
        month3 = if ($data.months.ContainsKey(3)) { $data.months[3] } else { 0 }
        month4 = if ($data.months.ContainsKey(4)) { $data.months[4] } else { 0 }
        month5 = if ($data.months.ContainsKey(5)) { $data.months[5] } else { 0 }
        month6 = if ($data.months.ContainsKey(6)) { $data.months[6] } else { 0 }
        month7 = if ($data.months.ContainsKey(7)) { $data.months[7] } else { 0 }
        month8 = if ($data.months.ContainsKey(8)) { $data.months[8] } else { 0 }
        month9 = if ($data.months.ContainsKey(9)) { $data.months[9] } else { 0 }
        month10 = if ($data.months.ContainsKey(10)) { $data.months[10] } else { 0 }
        month11 = if ($data.months.ContainsKey(11)) { $data.months[11] } else { 0 }
        month12 = if ($data.months.ContainsKey(12)) { $data.months[12] } else { 0 }
    }
    
    $budgetData += $record
}

Write-Host "Created $($budgetData.Count) budget records" -ForegroundColor Green

# Create metadata object
$metadata = @{
    division = $division
    salesRep = $salesRep
    actualYear = $actualYear
    budgetYear = $budgetYear
    currency = @{
        code = "AED"
        name = "UAE Dirham"
        symbol = "د.إ"
    }
    savedAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    version = "1.1"
    dataFormat = "budget_import"
}

# Convert to JSON
$metadataJson = $metadata | ConvertTo-Json -Depth 3
$budgetDataJson = $budgetData | ConvertTo-Json -Depth 3

# Create the script block to inject
$scriptBlock = @"
<script id="savedBudgetData">
/* BUDGET DATA FOR DATABASE IMPORT */
const budgetMetadata = $metadataJson;
const savedBudget = $budgetDataJson;
</script>
"@

# Find position to inject (before </body>)
$bodyEndPos = $content.LastIndexOf('</body>')
if ($bodyEndPos -eq -1) {
    Write-Host "ERROR: Could not find </body> tag" -ForegroundColor Red
    exit 1
}

# Check if signature exists, if not add it
if ($content -notmatch 'IPD_BUDGET_SYSTEM_v') {
    $content = $content -replace '<!DOCTYPE html>', "<!DOCTYPE html>`n<!-- IPD_BUDGET_SYSTEM_v1.1 :: TYPE=SALES_REP_BUDGET :: DO_NOT_EDIT_THIS_LINE -->"
    Write-Host "Added IPD_BUDGET_SYSTEM signature" -ForegroundColor Yellow
}

# Inject the script block before </body>
$newContent = $content.Substring(0, $bodyEndPos) + $scriptBlock + "`n" + $content.Substring($bodyEndPos)

# Write to output file
$newContent | Out-File -FilePath $OutputFile -Encoding UTF8

Write-Host ""
Write-Host "SUCCESS! Fixed file saved to:" -ForegroundColor Green
Write-Host $OutputFile -ForegroundColor Cyan
Write-Host ""
Write-Host "You can now upload this file to the bulk import." -ForegroundColor Green
