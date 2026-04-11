const fs = require('fs');
const path = require('path');

// File paths
const htmlPath = 'D:/PPH 26.01/HTML Budget 2026 sales reps export and import/final 2026/final/FINAL_FP_Sofiane___Team_2026_20260118_0712.html';
const unifiedCsvPath = 'D:/PPH 26.01/exports/fp_customer_unified.csv';
const outputPath = 'D:/PPH 26.01/exports/Sofiane_Team_Customer_Review.xlsx';

// Read HTML and extract unique customers
const html = fs.readFileSync(htmlPath, 'utf8');

// Extract customers from savedBudget JSON
const budgetMatch = html.match(/const savedBudget = \[([\s\S]*?)\];/);
let customersFromBudget = new Set();

if (budgetMatch) {
    const budgetData = budgetMatch[1];
    const customerMatches = budgetData.match(/"customer":\s*"([^"]+)"/g);
    if (customerMatches) {
        customerMatches.forEach(m => {
            const name = m.match(/"customer":\s*"([^"]+)"/)[1];
            customersFromBudget.add(name);
        });
    }
}

// Also extract from table rows (rowspan td)
const rowspanMatches = html.match(/<td rowspan="\d+">([^<]+)<\/td>/g);
if (rowspanMatches) {
    rowspanMatches.forEach(m => {
        const name = m.match(/<td rowspan="\d+">([^<]+)<\/td>/)[1];
        if (name && !name.match(/^\d/) && name.length > 2 &&
            !['Oman', 'Algeria', 'Morocco', 'Tunisia', 'United Arab Emirates'].includes(name) &&
            !['Laminates', 'Labels', 'Shrink Film', 'Industrial', 'Mono Layer', 'Commercial'].some(pg => name.includes(pg))) {
            customersFromBudget.add(name);
        }
    });
}

// Also extract from custom rows
const customRowMatches = html.match(/<span style="font-weight: 600;">([^<]+)<\/span>/g);
if (customRowMatches) {
    customRowMatches.forEach(m => {
        const name = m.match(/<span style="font-weight: 600;">([^<]+)<\/span>/)[1];
        if (name && name.length > 2) {
            customersFromBudget.add(name);
        }
    });
}

const htmlCustomers = Array.from(customersFromBudget).sort();
console.log(`Found ${htmlCustomers.length} unique customers in HTML file:`);
htmlCustomers.forEach((c, i) => console.log(`${i+1}. ${c}`));

// Read unified customers CSV
const csvContent = fs.readFileSync(unifiedCsvPath, 'utf8');
const lines = csvContent.split('\n');
const dbCustomers = [];

for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    // Parse CSV - handle quoted fields
    const match = line.match(/^(\d+),"([^"]+)"/);
    if (match) {
        dbCustomers.push({
            id: match[1],
            displayName: match[2]
        });
    }
}

console.log(`\nLoaded ${dbCustomers.length} unified customers from DB`);

// Matching function - fuzzy match
function normalizeForMatch(name) {
    return name.toLowerCase()
        .replace(/[.,\-()]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function findBestMatch(htmlName, dbList) {
    const normalizedHtml = normalizeForMatch(htmlName);

    // Exact match first
    for (const db of dbList) {
        if (normalizeForMatch(db.displayName) === normalizedHtml) {
            return { match: db.displayName, type: 'EXACT' };
        }
    }

    // Contains match - DB contains HTML
    for (const db of dbList) {
        const normDb = normalizeForMatch(db.displayName);
        if (normDb.includes(normalizedHtml) || normalizedHtml.includes(normDb)) {
            return { match: db.displayName, type: 'PARTIAL' };
        }
    }

    // Word-based match
    const htmlWords = normalizedHtml.split(' ').filter(w => w.length > 2);
    let bestScore = 0;
    let bestMatch = null;

    for (const db of dbList) {
        const normDb = normalizeForMatch(db.displayName);
        const dbWords = normDb.split(' ').filter(w => w.length > 2);

        let matchedWords = 0;
        for (const hw of htmlWords) {
            if (dbWords.some(dw => dw.includes(hw) || hw.includes(dw))) {
                matchedWords++;
            }
        }

        const score = matchedWords / Math.max(htmlWords.length, 1);
        if (score > bestScore && score >= 0.5) {
            bestScore = score;
            bestMatch = db.displayName;
        }
    }

    if (bestMatch) {
        return { match: bestMatch, type: 'FUZZY' };
    }

    return { match: '', type: 'NO_MATCH' };
}

// Create comparison results
const results = [];
console.log('\n=== MATCHING RESULTS ===\n');

for (const htmlCustomer of htmlCustomers) {
    const matchResult = findBestMatch(htmlCustomer, dbCustomers);

    let decision = '';
    let remark = '';

    if (matchResult.type === 'EXACT') {
        decision = 'YES - Keep as is';
        remark = 'Exact match found';
    } else if (matchResult.type === 'PARTIAL') {
        decision = '';
        remark = `Partial match - verify if "${matchResult.match}" is correct`;
    } else if (matchResult.type === 'FUZZY') {
        decision = '';
        remark = `Possible match - needs confirmation`;
    } else {
        decision = '';
        remark = 'PROSPECT (not in DB)';
        matchResult.match = htmlCustomer; // Keep original name for prospects
    }

    results.push({
        htmlName: htmlCustomer,
        dbName: matchResult.match,
        decision: decision,
        remark: remark,
        matchType: matchResult.type
    });

    console.log(`${htmlCustomer}`);
    console.log(`   -> ${matchResult.type}: ${matchResult.match || 'NO MATCH'}`);
    console.log('');
}

// Generate CSV output (since xlsx requires external library)
const csvOutput = 'HTML Customer Name,Suggested DB Name,Decision (YES to replace),Remark\n' +
    results.map(r => `"${r.htmlName}","${r.dbName}","${r.decision}","${r.remark}"`).join('\n');

const csvOutputPath = 'D:/PPH 26.01/exports/Sofiane_Team_Customer_Review_NEW.csv';
fs.writeFileSync(csvOutputPath, csvOutput);
console.log(`\n✅ Exported comparison to: ${csvOutputPath}`);

// Summary
const exactMatches = results.filter(r => r.matchType === 'EXACT').length;
const partialMatches = results.filter(r => r.matchType === 'PARTIAL').length;
const fuzzyMatches = results.filter(r => r.matchType === 'FUZZY').length;
const noMatches = results.filter(r => r.matchType === 'NO_MATCH').length;

console.log('\n=== SUMMARY ===');
console.log(`Total customers in HTML: ${htmlCustomers.length}`);
console.log(`Exact matches: ${exactMatches}`);
console.log(`Partial matches: ${partialMatches}`);
console.log(`Fuzzy matches: ${fuzzyMatches}`);
console.log(`No matches (prospects): ${noMatches}`);
