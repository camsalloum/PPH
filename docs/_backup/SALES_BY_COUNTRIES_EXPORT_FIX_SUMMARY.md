# Sales by Countries Export Fix - Complete Summary

## Date: December 5, 2025

## Problem Statement
The Sales by Countries card in the dashboard has 3 sub-views (Table, Chart, Map 2D) that need to be captured and exported. The initial export was only capturing empty overlay wrappers because:

1. **React State Management Issue**: Programmatic clicks on framer-motion components don't trigger React state changes
2. **Missing Sub-Card Navigation**: The export needs to navigate through sub-cards before capturing content
3. **Component Lifecycle**: The global state setter function wasn't persisting across overlay open/close cycles

## Solutions Implemented

### 1. SalesCountryDetail.js - Added Global State Setter

**File**: `src/components/dashboard/SalesCountryDetail.js`

**Changes**:
```javascript
// Added useEffect to expose setActiveView globally for export
React.useEffect(() => {
  window.__salesCountrySetActiveView = setActiveView;
  return () => {
    delete window.__salesCountrySetActiveView;
  };
}, []);
```

**Purpose**: Allows the export script to programmatically switch between Table/Chart/Map views by calling `window.__salesCountrySetActiveView('table'|'chart'|'map')`.

### 2. MultiChartHTMLExport.js - Enhanced Capture Function

**File**: `src/components/dashboard/MultiChartHTMLExport.js`

**Key Changes**:

#### A. Added Variables for 3 Sub-Views
```javascript
let salesCountryTableHTML = '<div class="placeholder-content"><h3>Sales by Country - Table</h3><p>Not available</p></div>';
let salesCountryChartHTML = '<div class="placeholder-content"><h3>Sales by Country - Chart</h3><p>Not available</p></div>';
let salesCountryMapHTML = '<div class="placeholder-content"><h3>Sales by Country - Map</h3><p>Not available</p></div>';
```

#### B. Enhanced Sub-Card Click Logic
The `captureTableFromCard()` function now:
1. Opens the main card
2. Waits for component to mount (2500ms)
3. Checks if `window.__salesCountrySetActiveView` exists
4. Calls it with the desired view ('table', 'chart', or 'map')
5. Waits for React to re-render (2500ms)
6. Captures the overlay content
7. Resets view to null before closing
8. Closes overlay

```javascript
// Method 1: Use the globally exposed setActiveView function (most reliable!)
if (window.__salesCountrySetActiveView) {
  console.log(`📋 Using window.__salesCountrySetActiveView to switch to "${subCardTitle}"`);
  const viewId = subCardTitle.toLowerCase().replace(' 2d', ''); // 'Table' -> 'table', 'Map 2D' -> 'map'
  console.log(`📋 Calling setActiveView with viewId: "${viewId}"`);
  window.__salesCountrySetActiveView(viewId);
  subCardFound = true;
  await new Promise(resolve => setTimeout(resolve, 2500)); // Wait for React to re-render
  
  // Verify the view changed
  const hasContent = overlay.querySelector('table, canvas, .leaflet-container, .sbc-table, .recharts-wrapper');
  console.log(`📋 After setActiveView: hasContent=${!!hasContent}`);
}
```

#### C. Added Debug Logging
```javascript
// Debug: Log what we're about to capture
const overlayTitle = overlay.querySelector('.divisional-dashboard__overlay-title')?.textContent || 'Unknown';
const hasSubCards = overlay.querySelector('.sales-country-subcard');
const hasSBCTable = overlay.querySelector('.sbc-table, .sales-by-country-table');
const hasCanvas = overlay.querySelector('canvas');
const hasLeaflet = overlay.querySelector('.leaflet-container');
console.log(`📋 CAPTURE DEBUG for ${cardTitle}${subCardTitle ? ' > ' + subCardTitle : ''}:`);
console.log(`   - Overlay title: "${overlayTitle}"`);
console.log(`   - hasSubCards: ${!!hasSubCards}`);
console.log(`   - hasSBCTable: ${!!hasSBCTable}`);
console.log(`   - hasCanvas: ${!!hasCanvas}`);
console.log(`   - hasLeaflet: ${!!hasLeaflet}`);
```

#### D. Separate Capture Calls for Each View
```javascript
// Sales by Countries has 3 sub-cards (Table, Chart, Map 2D) - capture each one
console.log('🔥 Capturing Sales by Countries - Table...');
const coTable = await captureTableFromCard('Sales by Countries', 'table.sales-by-country-table', 'Table');
if (coTable) {
  const overlayCSS = extractOverlayCSS();
  salesCountryTableHTML = `<style>${overlayCSS}</style>${coTable}`;
}

console.log('🔥 Capturing Sales by Countries - Chart...');
const coChart = await captureTableFromCard('Sales by Countries', '.sales-country-chart', 'Chart');
if (coChart) {
  const overlayCSS = extractOverlayCSS();
  salesCountryChartHTML = `<style>${overlayCSS}</style>${coChart}`;
}

console.log('🔥 Capturing Sales by Countries - Map 2D...');
const coMap = await captureTableFromCard('Sales by Countries', '.leaflet-container', 'Map 2D');
if (coMap) {
  const overlayCSS = extractOverlayCSS();
  salesCountryMapHTML = `<style>${overlayCSS}</style>${coMap}`;
}
```

#### E. Enhanced CSS Extraction
```javascript
// Sales by Country specific styles
cssText.includes('.sales-by-country-table') ||
cssText.includes('.sales-country-') ||
```

#### F. Created Tabbed Interface in Export
```javascript
// Create tabbed interface for Table, Chart, Map
var tabsHTML = \`
    <div class="sales-country-tabs" style="display: flex; gap: 8px; margin-bottom: 16px; padding: 8px; background: #f8fafc; border-radius: 8px;">
        <button onclick="switchSalesCountryView('table')" id="sc-tab-table" class="sc-tab sc-tab--active">
            📊 Table
        </button>
        <button onclick="switchSalesCountryView('chart')" id="sc-tab-chart" class="sc-tab">
            📈 Chart
        </button>
        <button onclick="switchSalesCountryView('map')" id="sc-tab-map" class="sc-tab">
            🗺️ Map 2D
        </button>
    </div>
    <div id="sc-content-table" class="sc-content" style="display: block;">\${salesCountryTableHTML}</div>
    <div id="sc-content-chart" class="sc-content" style="display: none;">\${salesCountryChartHTML}</div>
    <div id="sc-content-map" class="sc-content" style="display: none;">\${salesCountryMapHTML}</div>
\`;
```

#### G. Added Tab Switching Function
```javascript
// Switch between Sales by Country views (Table, Chart, Map)
function switchSalesCountryView(view) {
    console.log('Switching Sales by Country view to:', view);
    currentSalesCountryView = view;
    
    // Hide all content panels
    var contents = document.querySelectorAll('.sc-content');
    contents.forEach(function(c) { c.style.display = 'none'; });
    
    // Show selected content
    var selectedContent = document.getElementById('sc-content-' + view);
    if (selectedContent) {
        selectedContent.style.display = 'block';
    }
    
    // Update tab styles
    var tabs = document.querySelectorAll('.sc-tab');
    tabs.forEach(function(tab) {
        tab.style.background = '#e2e8f0';
        tab.style.color = '#475569';
        tab.classList.remove('sc-tab--active');
    });
    
    var activeTab = document.getElementById('sc-tab-' + view);
    if (activeTab) {
        activeTab.style.background = '#1976d2';
        activeTab.style.color = 'white';
        activeTab.classList.add('sc-tab--active');
    }
}

// Expose to window
window.switchSalesCountryView = switchSalesCountryView;
```

#### H. Added Variables to Export
```javascript
var salesCountryTableHTML = ${JSON.stringify(salesCountryTableHTML)};
var salesCountryChartHTML = ${JSON.stringify(salesCountryChartHTML)};
var salesCountryMapHTML = ${JSON.stringify(salesCountryMapHTML)};
```

## Expected Behavior

### During Export (Live App):
1. User clicks "Export to HTML"
2. Export script opens Sales by Countries card
3. Waits for `window.__salesCountrySetActiveView` to be available
4. Calls `setActiveView('table')` to switch to Table view
5. Waits 2500ms for React to render table
6. Captures table HTML
7. Resets view to null
8. Closes overlay
9. Repeats steps 2-8 for Chart view
10. Repeats steps 2-8 for Map view

### In Exported HTML:
1. User clicks "Sales by Countries" card in the dashboard
2. Sees 3 tabs: 📊 Table, 📈 Chart, 🗺️ Map 2D
3. Table tab is active by default
4. Clicking Chart tab shows the ECharts visualization
5. Clicking Map 2D tab shows the Leaflet map
6. All content is pre-captured and works offline

## Debugging

### Console Logs to Check:
During export in live app, look for:
```
🔥 Capturing Sales by Countries - Table...
📋 Capturing Sales by Countries > Table...
📋 Using window.__salesCountrySetActiveView to switch to "Table"
📋 Calling setActiveView with viewId: "table"
📋 After setActiveView: hasContent=true
📋 CAPTURE DEBUG for Sales by Countries > Table:
   - Overlay title: "Sales by Countries"
   - hasSubCards: false
   - hasSBCTable: true
   - hasCanvas: false
   - hasLeaflet: false
✅ Sales by Countries overlay captured
```

### In Exported HTML:
```
renderSalesCountry called - using captured Sales by Country data with tabs
📋 DEBUG - salesCountryTableHTML length: XXXX
📋 DEBUG - salesCountryChartHTML length: YYYY
📋 DEBUG - salesCountryMapHTML length: ZZZZ
Sales by Country rendered successfully with Table/Chart/Map tabs
```

## Known Issues & Limitations

1. **Component Lifecycle Dependency**: The solution relies on `window.__salesCountrySetActiveView` being available, which requires the component to be mounted
2. **Timing Sensitive**: Uses fixed 2500ms delays which may need adjustment if components load slower
3. **Fallback Mechanism**: If global function fails, attempts to click sub-cards using DOM manipulation (less reliable)
4. **ECharts in Export**: Charts are captured as static canvas images, not interactive
5. **Leaflet in Export**: Maps are captured as static images of the map tiles

## Testing Checklist

- [ ] Export captures Table view correctly
- [ ] Export captures Chart view correctly  
- [ ] Export captures Map view correctly
- [ ] All 3 views have different content (not identical)
- [ ] Tabs work in exported HTML
- [ ] Table data displays correctly
- [ ] Chart renders (as image)
- [ ] Map displays (as image)
- [ ] Back button works in exported HTML
- [ ] Hide Budget & Forecast button works (if in table view)

## Files Modified

1. `src/components/dashboard/SalesCountryDetail.js`
   - Added global state setter exposure

2. `src/components/dashboard/MultiChartHTMLExport.js`
   - Enhanced capture function with sub-card navigation
   - Added 3 separate variables for Table/Chart/Map
   - Created tabbed interface in exported HTML
   - Added tab switching functionality
   - Enhanced CSS extraction
   - Added extensive debug logging

## Next Steps if Issues Persist

1. Check browser console for the debug logs during export
2. Verify `window.__salesCountrySetActiveView` is available
3. Confirm timing is adequate for React renders
4. Check captured HTML lengths are different for each view
5. Verify CSS is being extracted properly
6. Test with different network speeds (API calls for chart/map data)
