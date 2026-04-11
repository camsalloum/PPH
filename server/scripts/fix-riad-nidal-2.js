const fs = require('fs');

const path = 'D:/PPH 26.01/HTML Budget 2026 sales reps export and import/final 2026/final/FINAL_FP_Riad___Nidal_2026_20260118_0712.html';

let html = fs.readFileSync(path, 'utf8');

console.log('Before - Ghadeer Water Co. [ Nestle - Jordan] count:', (html.match(/Ghadeer Water Co\. \[ Nestle - Jordan\]/g) || []).length);

// Fix 1: Ghadeer
html = html.split('Ghadeer Water Co. [ Nestle - Jordan]').join('Ghadeer Mineral Waters');

console.log('After - Ghadeer Mineral Waters count:', (html.match(/Ghadeer Mineral Waters/g) || []).length);

fs.writeFileSync(path, html);
console.log('File saved!');
