# WriteUp Component Suite

This folder contains all components and utilities related to the WriteUp feature.

## Structure

```
writeup/
├── WriteUpView.js          # Original WriteUp component (legacy)
├── WriteUpView.css         # Original WriteUp styles (legacy)
├── WriteUpViewV2.js        # New WriteUp component with AI analysis
├── WriteUpViewV2.css       # New WriteUp styles
├── analysis/               # Analysis engines
│   ├── insightEngine.js   # Insight scoring and ranking
│   └── pvm.js            # Price-Volume-Mix analysis
├── renderer/              # Rendering utilities
│   └── markdownRenderer.js # Safe markdown to HTML conversion
└── export/                # Export utilities
    └── exportWriteup.js   # PDF export functionality
```

## Features

### WriteUpViewV2
- Deep AI analysis using PVM decomposition
- Insight scoring and ranking
- Safe markdown rendering
- Branded PDF export
- Year-over-year comparison
- Cost driver analysis

### Analysis Engine
- **insightEngine.js**: Ranks insights by impact, confidence, and volatility
- **pvm.js**: Decomposes revenue changes into price, volume, and mix effects

### Renderer
- **markdownRenderer.js**: Converts markdown to sanitized HTML using marked + DOMPurify

### Export
- **exportWriteup.js**: Generates branded PDF reports using html2pdf.js

## Usage

```javascript
import WriteUpViewV2 from '../writeup/WriteUpViewV2';

// Pass required props
<WriteUpViewV2 
  tableData={excelData}
  selectedPeriods={selectedPeriods}
  computeCellValue={computeCellValue}
/>
```

## Dependencies

- `marked` - Markdown parsing
- `dompurify` - HTML sanitization
- `html2pdf.js` - PDF generation
- ECharts data from Excel context






