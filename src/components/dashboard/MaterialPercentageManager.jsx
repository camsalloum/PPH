import React, { useState, useEffect } from 'react';
import { useExcelData } from '../../contexts/ExcelDataContext';
import './MaterialPercentageManager.css';

const MaterialPercentageManager = () => {
  const { selectedDivision } = useExcelData();
  const [productGroups, setProductGroups] = useState([]);
  const [materialColumns, setMaterialColumns] = useState([]); // Now dynamically loaded
  const [columnMapping, setColumnMapping] = useState({}); // Map display_name to column_code
  const [materialPercentages, setMaterialPercentages] = useState({});
  const [materialProcessData, setMaterialProcessData] = useState({}); // { productGroup: { material: '', process: '' } }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [newMaterialName, setNewMaterialName] = useState('');
  const [selectedMaterialToAdd, setSelectedMaterialToAdd] = useState('');
  const [availableMaterials, setAvailableMaterials] = useState([]);
  const [isAddingNewMaterial, setIsAddingNewMaterial] = useState(false);
  const [addMaterialError, setAddMaterialError] = useState('');
  
  // Material Group and Material Condition states
  const [materialGroups, setMaterialGroups] = useState([]);
  const [materialGroupsMap, setMaterialGroupsMap] = useState({}); // Map display_name → group_code // For Material Group column dropdown
  const [materialConditions, setMaterialConditions] = useState([]);
  const [materialConditionsMap, setMaterialConditionsMap] = useState({}); // Map display_name → condition_code // For Material Condition column dropdown
  const [allMaterialGroups, setAllMaterialGroups] = useState([]); // All groups across divisions
  const [allMaterialConditions, setAllMaterialConditions] = useState([]); // All conditions across divisions
  const [allMaterialColumns, setAllMaterialColumns] = useState([]); // All material columns across divisions
  
  // Modal states for managing headers (columns, groups, conditions)
  const [showManageSpecs, setShowManageSpecs] = useState(false);
  const [specsTab, setSpecsTab] = useState('columns'); // 'columns', 'groups', or 'conditions'
  const [newSpecName, setNewSpecName] = useState('');
  const [addingSpec, setAddingSpec] = useState(false);
  const [editingColumn, setEditingColumn] = useState(null); // Column being edited
  const [editColumnName, setEditColumnName] = useState(''); // New name for column being edited
  const [editingGroup, setEditingGroup] = useState(null); // Material group being edited
  const [editGroupName, setEditGroupName] = useState(''); // New name for group being edited
  const [editingCondition, setEditingCondition] = useState(null); // Material condition being edited
  const [editConditionName, setEditConditionName] = useState(''); // New name for condition being edited

  // Load available materials from all divisions
  useEffect(() => {
    loadAllAvailableMaterials();
  }, []);

  // Load product groups and material percentages when division changes
  useEffect(() => {
    if (selectedDivision) {
      loadData();
    }
  }, [selectedDivision]);

  const loadAllAvailableMaterials = async () => {
    try {
      // Use hardcoded material list (material_config table was removed - abandoned migration)
      // These materials are standard across all divisions
      const standardMaterials = ['PE', 'PP', 'PET', 'Alu', 'Paper', 'PVC/PET', 'Mix', 'Other'];
      setAvailableMaterials(standardMaterials);
    } catch (error) {
      console.error('Error loading available materials:', error);
    }
  };

  const loadMaterialGroupsAndConditions = async (divisionCode) => {
    try {
      // Load material columns for current division
      const columnsResponse = await fetch(`/api/config/material-columns/${divisionCode}`);
      const columnsResult = await columnsResponse.json();
      if (columnsResult.success && columnsResult.data) {
        const columns = columnsResult.data.map(c => c.display_name);
        setMaterialColumns(columns);
      }

      // Load all material columns across divisions
      const allColumnsResponse = await fetch('/api/config/material-columns');
      const allColumnsResult = await allColumnsResponse.json();
      if (allColumnsResult.success && allColumnsResult.data) {
        setAllMaterialColumns(allColumnsResult.data);
      }

      // Load material groups for current division
      const groupsResponse = await fetch(`/api/config/material-groups/${divisionCode}`);
      const groupsResult = await groupsResponse.json();
      if (groupsResult.success && groupsResult.data) {
        setMaterialGroups(groupsResult.data.map(g => g.display_name));
        // Build map: display_name → group_code
        const groupMap = {};
        groupsResult.data.forEach(g => {
          groupMap[g.display_name] = g.group_code;
        });
        setMaterialGroupsMap(groupMap);
      }

      // Load all material groups across divisions
      const allGroupsResponse = await fetch('/api/config/material-groups');
      const allGroupsResult = await allGroupsResponse.json();
      if (allGroupsResult.success && allGroupsResult.data) {
        setAllMaterialGroups(allGroupsResult.data);
      }

      // Load material conditions for current division
      const conditionsResponse = await fetch(`/api/config/material-conditions/${divisionCode}`);
      const conditionsResult = await conditionsResponse.json();
      if (conditionsResult.success && conditionsResult.data) {
        setMaterialConditions(conditionsResult.data.map(c => c.display_name));
        // Build map: display_name → condition_code
        const conditionMap = {};
        conditionsResult.data.forEach(c => {
          conditionMap[c.display_name] = c.condition_code;
        });
        setMaterialConditionsMap(conditionMap);
      }

      // Load all material conditions across divisions
      const allConditionsResponse = await fetch('/api/config/material-conditions');
      const allConditionsResult = await allConditionsResponse.json();
      if (allConditionsResult.success && allConditionsResult.data) {
        setAllMaterialConditions(allConditionsResult.data);
      }
    } catch (error) {
      console.error('Error loading configurations:', error);
    }
  };

  const loadData = async () => {
    if (!selectedDivision) return;
    
    setLoading(true);
    setError('');
    
    try {
      // Get division code from selectedDivision (handle both formats like 'FP' or 'FP-Product Group')
      const divisionCode = selectedDivision.split('-')[0].toLowerCase();
      
      // Check if this division is supported
      const supportedDivisions = ['fp', 'sb', 'tf', 'hcm'];
      if (!supportedDivisions.includes(divisionCode)) {
        setProductGroups([]);
        setMaterialColumns([]);
        setMaterialPercentages({});
        setMessage(`📝 Note: Material percentage management for ${selectedDivision} division is not yet supported.`);
        return;
      }

      // Load material columns, groups, and conditions (also sets materialColumns)
      await loadMaterialGroupsAndConditions(divisionCode);
      
      // Get the loaded material columns
      const columnsResponse = await fetch(`/api/config/material-columns/${divisionCode}`);
      const columnsResult = await columnsResponse.json();
      
      let materials = [];
      const tempColumnMapping = {}; // Map display_name to actual database column
      
      if (columnsResult.success && columnsResult.data && columnsResult.data.length > 0) {
        materials = columnsResult.data.map(c => c.display_name);
        // Create mapping: display_name → column_code (database column prefix)
        columnsResult.data.forEach(c => {
          tempColumnMapping[c.display_name] = c.column_code.toLowerCase();
        });
      }
      
      // Save to state so it's available in save functions
      setColumnMapping(tempColumnMapping);
      
      if (materials.length === 0) {
        console.warn(`⚠️ No material columns found for ${divisionCode}. Please add columns using Manage Headers.`);
        setMaterialColumns([]);
        setMaterialPercentages({});
        setProductGroups([]);
        setMessage(`📝 No material columns configured for ${selectedDivision} division. Use "Manage Headers" to add columns.`);
        return;
      }

      // NEW: Load from unified product-group-master endpoint (FP only for now)
      let percentagesData = [];
      if (divisionCode === 'fp') {
        const masterResponse = await fetch(`/api/${divisionCode}/master-data/product-group-master?division=${divisionCode.toUpperCase()}`);
        const masterResult = await masterResponse.json();
        
        if (!masterResult.success) {
          throw new Error(masterResult.error || `Failed to load product group master data`);
        }
        
        percentagesData = masterResult.data || [];
      } else {
        // Fallback to old endpoint for other divisions (until they're migrated)
        const percentagesResponse = await fetch(`/api/${divisionCode}/master-data/material-percentages`);
        const percentagesResult = await percentagesResponse.json();
        
        if (!percentagesResult.success) {
          throw new Error(percentagesResult.message || `Failed to load material percentages for ${divisionCode.toUpperCase()}`);
        }
        
        percentagesData = percentagesResult.data || [];
      }

      // Extract PGCombine (product_group) values from material percentages
      // Sort groups alphabetically but keep "Others" at the end
      const groups = percentagesData.map(item => item.product_group).sort((a, b) => {
        const aLower = a.toLowerCase();
        const bLower = b.toLowerCase();
        if (aLower === 'others') return 1;
        if (bLower === 'others') return -1;
        return a.localeCompare(b);
      });
      setProductGroups(groups);

      // Convert array to object for easier access
      const percentagesObj = {};
      const materialProcessObj = {};
      percentagesData.forEach(item => {
        percentagesObj[item.product_group] = {};
        
        // Dynamically set percentages for each material using correct column mapping
        materials.forEach(material => {
          if (material && typeof material === 'string') {
            // Use the mapped column code instead of generated field name
            const columnCode = tempColumnMapping[material] || material.toLowerCase().replace(/[^a-z0-9]/g, '_');
            const fieldName = columnCode + '_percentage';
            percentagesObj[item.product_group][material] = parseFloat(item[fieldName]) || 0;
          }
        });
        
        // Initialize Material and Process
        materialProcessObj[item.product_group] = {
          material: item.material || '',
          process: item.process || ''
        };
      });
      
      setMaterialPercentages(percentagesObj);
      setMaterialProcessData(materialProcessObj);

    } catch (error) {
      console.error('Error loading data:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePercentageChange = (productGroup, material, value) => {
    const numValue = parseFloat(value) || 0;
    
    setMaterialPercentages(prev => ({
      ...prev,
      [productGroup]: {
        ...prev[productGroup],
        [material]: numValue
      }
    }));
  };

  const handleMaterialChange = (productGroup, value) => {
    setMaterialProcessData(prev => ({
      ...prev,
      [productGroup]: {
        ...prev[productGroup],
        material: value
      }
    }));
  };

  const handleProcessChange = (productGroup, value) => {
    setMaterialProcessData(prev => ({
      ...prev,
      [productGroup]: {
        ...prev[productGroup],
        process: value
      }
    }));
  };

  const handleAddMaterialGroup = async () => {
    if (!newSpecName.trim()) {
      setError('Please enter a material group name');
      return;
    }

    setAddingSpec(true);
    try {
      const divisionCode = selectedDivision.split('-')[0].toLowerCase();
      const groupCode = newSpecName.trim().toUpperCase().replace(/[^A-Z0-9]/g, '_');

      const response = await fetch(`/api/config/material-groups/${divisionCode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          group_code: groupCode,
          group_name: newSpecName.trim(),
          display_name: newSpecName.trim(),
          description: `${newSpecName.trim()} material group`
        })
      });

      const result = await response.json();
      if (result.success) {
        await loadMaterialGroupsAndConditions(divisionCode);
        setNewSpecName('');
        setMessage(`✅ Material Group "${newSpecName.trim()}" added successfully`);
        setTimeout(() => setMessage(''), 3000);
      } else {
        setError(result.error || 'Failed to add material group');
      }
    } catch (error) {
      setError('Error adding material group: ' + error.message);
    } finally {
      setAddingSpec(false);
    }
  };

  const handleRemoveMaterialGroup = async (groupName) => {
    if (!window.confirm(`Are you sure you want to remove "${groupName}" from ${selectedDivision} division?`)) {
      return;
    }

    try {
      const divisionCode = selectedDivision.split('-')[0].toLowerCase();
      const groupCode = groupName.toUpperCase().replace(/[^A-Z0-9]/g, '_');

      const response = await fetch(`/api/config/material-groups/${divisionCode}/${groupCode}`, {
        method: 'DELETE'
      });

      const result = await response.json();
      if (result.success) {
        await loadMaterialGroupsAndConditions(divisionCode);
        setMessage(`✅ Material Group "${groupName}" removed successfully`);
        setTimeout(() => setMessage(''), 3000);
      } else {
        setError(result.error || 'Failed to remove material group');
      }
    } catch (error) {
      setError('Error removing material group: ' + error.message);
    }
  };

  const handleAddMaterialCondition = async () => {
    if (!newSpecName.trim()) {
      setError('Please enter a material condition name');
      return;
    }

    setAddingSpec(true);
    try {
      const divisionCode = selectedDivision.split('-')[0].toLowerCase();
      const conditionCode = newSpecName.trim().toUpperCase().replace(/[^A-Z0-9]/g, '_');

      const response = await fetch(`/api/config/material-conditions/${divisionCode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          condition_code: conditionCode,
          condition_name: newSpecName.trim(),
          display_name: newSpecName.trim(),
          description: `${newSpecName.trim()} material condition`
        })
      });

      const result = await response.json();
      if (result.success) {
        await loadMaterialGroupsAndConditions(divisionCode);
        setNewSpecName('');
        setMessage(`✅ Material Condition "${newSpecName.trim()}" added successfully`);
        setTimeout(() => setMessage(''), 3000);
      } else {
        setError(result.error || 'Failed to add material condition');
      }
    } catch (error) {
      setError('Error adding material condition: ' + error.message);
    } finally {
      setAddingSpec(false);
    }
  };

  const handleRemoveMaterialCondition = async (conditionName) => {
    if (!window.confirm(`Are you sure you want to remove "${conditionName}" from ${selectedDivision} division?`)) {
      return;
    }

    try {
      const divisionCode = selectedDivision.split('-')[0].toLowerCase();
      const conditionCode = conditionName.toUpperCase().replace(/[^A-Z0-9]/g, '_');

      const response = await fetch(`/api/config/material-conditions/${divisionCode}/${conditionCode}`, {
        method: 'DELETE'
      });

      const result = await response.json();
      if (result.success) {
        await loadMaterialGroupsAndConditions(divisionCode);
        setMessage(`✅ Material Condition "${conditionName}" removed successfully`);
        setTimeout(() => setMessage(''), 3000);
      } else {
        setError(result.error || 'Failed to remove material condition');
      }
    } catch (error) {
      setError('Error removing material condition: ' + error.message);
    }
  };

  // Edit Material Group
  const handleEditMaterialGroup = async () => {
    if (!editGroupName.trim()) {
      setError('Please enter a group name');
      return;
    }

    if (editGroupName.trim() === editingGroup) {
      setEditingGroup(null);
      setEditGroupName('');
      return;
    }

    setAddingSpec(true);
    try {
      const divisionCode = selectedDivision.split('-')[0].toLowerCase();
      // Use actual group_code from the loaded data, not generated from display_name
      const oldGroupCode = materialGroupsMap[editingGroup] || editingGroup.toUpperCase().replace(/[^A-Z0-9]/g, '_');

      const response = await fetch(`/api/config/material-groups/${divisionCode}/${oldGroupCode}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newDisplayName: editGroupName.trim()
        })
      });

      const result = await response.json();
      if (result.success) {
        await loadMaterialGroupsAndConditions(divisionCode);
        setMessage(`✅ Material Group renamed from "${editingGroup}" to "${editGroupName.trim()}"`);
        setTimeout(() => setMessage(''), 3000);
        setEditingGroup(null);
        setEditGroupName('');
      } else {
        setError(result.error || 'Failed to update material group');
      }
    } catch (error) {
      setError('Error updating material group: ' + error.message);
    } finally {
      setAddingSpec(false);
    }
  };

  // Edit Material Condition
  const handleEditMaterialCondition = async () => {
    if (!editConditionName.trim()) {
      setError('Please enter a condition name');
      return;
    }

    if (editConditionName.trim() === editingCondition) {
      setEditingCondition(null);
      setEditConditionName('');
      return;
    }

    setAddingSpec(true);
    try {
      const divisionCode = selectedDivision.split('-')[0].toLowerCase();
      // Use actual condition_code from the loaded data, not generated from display_name
      const oldConditionCode = materialConditionsMap[editingCondition] || editingCondition.toUpperCase().replace(/[^A-Z0-9]/g, '_');

      const response = await fetch(`/api/config/material-conditions/${divisionCode}/${oldConditionCode}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newDisplayName: editConditionName.trim()
        })
      });

      const result = await response.json();
      if (result.success) {
        await loadMaterialGroupsAndConditions(divisionCode);
        setMessage(`✅ Material Condition renamed from "${editingCondition}" to "${editConditionName.trim()}"`);
        setTimeout(() => setMessage(''), 3000);
        setEditingCondition(null);
        setEditConditionName('');
      } else {
        setError(result.error || 'Failed to update material condition');
      }
    } catch (error) {
      setError('Error updating material condition: ' + error.message);
    } finally {
      setAddingSpec(false);
    }
  };

  const handleAddMaterialColumn = async () => {
    if (!newSpecName.trim()) {
      setError('Please enter a column name');
      return;
    }

    setAddingSpec(true);
    try {
      const divisionCode = selectedDivision.split('-')[0].toLowerCase();
      const columnCode = newSpecName.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');

      // For FP division, use unified endpoint that executes ALTER TABLE
      if (divisionCode === 'fp') {
        const response = await fetch(`/api/${divisionCode}/master-data/material-columns`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            division: divisionCode.toUpperCase(),
            columnCode: columnCode,
            displayName: newSpecName.trim(),
            defaultValue: 0
          })
        });

        const result = await response.json();
        if (result.success) {
          await loadMaterialGroupsAndConditions(divisionCode);
          await loadData(); // Reload data to show new column
          setNewSpecName('');
          setMessage(`✅ Material Column "${newSpecName.trim()}" added successfully (schema updated)`);
          setTimeout(() => setMessage(''), 3000);
        } else {
          setError(result.error || 'Failed to add material column');
        }
      } else {
        // For other divisions, use config endpoint
        const response = await fetch(`/api/config/material-columns/${divisionCode}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            column_code: columnCode,
            column_name: newSpecName.trim(),
            display_name: newSpecName.trim(),
            description: `${newSpecName.trim()} material column`
          })
        });

        const result = await response.json();
        if (result.success) {
          await loadMaterialGroupsAndConditions(divisionCode);
          setNewSpecName('');
          setMessage(`✅ Material Column "${newSpecName.trim()}" added successfully`);
          setTimeout(() => setMessage(''), 3000);
        } else {
          setError(result.error || 'Failed to add material column');
        }
      }
    } catch (error) {
      setError('Error adding material column: ' + error.message);
    } finally {
      setAddingSpec(false);
    }
  };

  const handleEditMaterialColumn = async () => {
    if (!editColumnName.trim()) {
      setError('Please enter a column name');
      return;
    }

    if (editColumnName.trim() === editingColumn) {
      setEditingColumn(null);
      setEditColumnName('');
      return;
    }

    setAddingSpec(true);
    try {
      const divisionCode = selectedDivision.split('-')[0].toLowerCase();
      const oldColumnCode = editingColumn.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
      const newColumnCode = editColumnName.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');

      // For FP division, use unified endpoint
      if (divisionCode === 'fp') {
        const response = await fetch(`/api/${divisionCode}/master-data/material-columns/${oldColumnCode}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            division: divisionCode.toUpperCase(),
            newDisplayName: editColumnName.trim(),
            newColumnCode: newColumnCode
          })
        });

        const result = await response.json();
        if (result.success) {
          // CRITICAL: Transform existing data to use new column name
          const oldName = editingColumn;
          const newName = editColumnName.trim();
          
          // Update materialPercentages object - rename the key in all product groups
          const updatedPercentages = { ...materialPercentages };
          Object.keys(updatedPercentages).forEach(productGroup => {
            if (updatedPercentages[productGroup][oldName] !== undefined) {
              updatedPercentages[productGroup][newName] = updatedPercentages[productGroup][oldName];
              delete updatedPercentages[productGroup][oldName];
            }
          });
          setMaterialPercentages(updatedPercentages);
          
          // Update materialColumns array
          const updatedColumns = materialColumns.map(col => col === oldName ? newName : col);
          setMaterialColumns(updatedColumns);
          
          // Reload configuration from server to ensure sync
          await loadMaterialGroupsAndConditions(divisionCode);
          
          setMessage(`✅ Column renamed: "${oldName}" → "${newName}"`);
          setTimeout(() => setMessage(''), 3000);
          setEditingColumn(null);
          setEditColumnName('');
        } else {
          setError(result.error || 'Failed to update material column');
        }
      } else {
        // For other divisions, use config endpoint
        const response = await fetch(`/api/config/material-columns/${divisionCode}/${oldColumnCode}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            column_name: editColumnName.trim(),
            display_name: editColumnName.trim()
          })
        });

        const result = await response.json();
        if (result.success) {
          await loadMaterialGroupsAndConditions(divisionCode);
          setMessage(`✅ Material Column renamed to "${editColumnName.trim()}"`);
          setTimeout(() => setMessage(''), 3000);
          setEditingColumn(null);
          setEditColumnName('');
        } else {
          setError(result.error || 'Failed to update material column');
        }
      }
    } catch (error) {
      setError('Error updating material column: ' + error.message);
    } finally {
      setAddingSpec(false);
    }
  };

  const handleRemoveMaterialColumn = async (columnName) => {
    if (!window.confirm(`Are you sure you want to remove "${columnName}" column from ${selectedDivision} division? This will affect the table structure.`)) {
      return;
    }

    try {
      const divisionCode = selectedDivision.split('-')[0].toLowerCase();
      const columnCode = columnName.toUpperCase().replace(/[^A-Z0-9_]/g, '_');

      // For FP division, use unified endpoint that executes ALTER TABLE DROP COLUMN
      if (divisionCode === 'fp') {
        const response = await fetch(`/api/${divisionCode}/master-data/material-columns/${columnCode}?division=${divisionCode.toUpperCase()}&hardDelete=false`, {
          method: 'DELETE'
        });

        const result = await response.json();
        if (result.success) {
          await loadMaterialGroupsAndConditions(divisionCode);
          await loadData(); // Reload data
          setMessage(`✅ Material Column "${columnName}" removed successfully (soft delete - hidden)`);
          setTimeout(() => setMessage(''), 3000);
        } else {
          setError(result.error || 'Failed to remove material column');
        }
      } else {
        // For other divisions, use config endpoint
        const response = await fetch(`/api/config/material-columns/${divisionCode}/${columnCode}`, {
          method: 'DELETE'
        });

        const result = await response.json();
        if (result.success) {
          await loadMaterialGroupsAndConditions(divisionCode);
          setMessage(`✅ Material Column "${columnName}" removed successfully`);
          setTimeout(() => setMessage(''), 3000);
        } else {
          setError(result.error || 'Failed to remove material column');
        }
      }
    } catch (error) {
      setError('Error removing material column: ' + error.message);
    }
  };

  const handleSaveAll = async () => {
    setSaving(true);
    setMessage('');
    setError('');
    
    try {
      const divisionCode = selectedDivision.split('-')[0].toLowerCase();
      const invalidRows = [];
      const savedRows = [];
      const skippedRows = [];
      
      for (const productGroup of productGroups) {
        // Check if row has any data
        const total = calculateRowTotal(productGroup);
        const hasMaterialOrProcess = materialProcessData[productGroup]?.material || materialProcessData[productGroup]?.process;
        
        // Skip completely empty rows (no percentages AND no material/process selected)
        if (total === 0 && !hasMaterialOrProcess) {
          skippedRows.push(productGroup);
          continue;
        }
        
        // For rows with material percentages, validate total is 100%
        // But allow 0% rows if they have material/process set (like Services)
        if (total > 0 && Math.abs(total - 100) > 0.01) { // Allow small floating point errors
          invalidRows.push(`${productGroup} (${total.toFixed(1)}%)`);
          continue;
        }
        
        // Prepare percentages object with ALL current material columns
        const percentagesToSave = {};
        materialColumns.forEach(material => {
          percentagesToSave[material] = materialPercentages[productGroup]?.[material] || 0;
        });
        
        // DEBUG: Log what we're sending
        
        const response = await fetch(`/api/${divisionCode}/master-data/material-percentages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            productGroup,
            percentages: percentagesToSave,
            material: materialProcessData[productGroup]?.material || '',
            process: materialProcessData[productGroup]?.process || ''
          }),
        });

        const result = await response.json();
        
        if (!result.success) {
          throw new Error(result.message || `Failed to save ${productGroup}`);
        }
        
        savedRows.push(productGroup);
      }
      
      // Build result message
      let resultMessage = '';
      if (savedRows.length > 0) {
        resultMessage += `✅ Saved ${savedRows.length} rows successfully`;
      }
      if (skippedRows.length > 0) {
        resultMessage += `\n⏭️ Skipped ${skippedRows.length} empty rows`;
      }
      if (invalidRows.length > 0) {
        resultMessage += `\n❌ ${invalidRows.length} rows not at 100%: ${invalidRows.join(', ')}`;
      }
      
      if (invalidRows.length > 0) {
        setError(resultMessage);
      } else {
        setMessage(resultMessage || '✅ All material percentages saved successfully');
        setTimeout(() => setMessage(''), 5000);
      }
      
    } catch (error) {
      console.error('Error saving all material percentages:', error);
      setError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleResetAll = () => {
    if (window.confirm('Are you sure you want to reset all product groups?')) {
      const resetValues = {};
      productGroups.forEach(productGroup => {
        resetValues[productGroup] = {};
        materialColumns.forEach(material => {
          resetValues[productGroup][material] = 0;
        });
      });
      
      setMaterialPercentages(resetValues);
      
      // Reset Material and Process
      const resetMaterialProcess = {};
      productGroups.forEach(productGroup => {
        resetMaterialProcess[productGroup] = {
          material: '',
          process: ''
        };
      });
      setMaterialProcessData(resetMaterialProcess);
      
      setMessage('All fields have been reset');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const handleAddMaterial = async () => {
    setAddMaterialError('');
    setSaving(true);

    try {
      const divisionCode = selectedDivision.split('-')[0].toLowerCase();
      let materialToAdd;

      // Check if adding new material or selecting existing
      if (isAddingNewMaterial) {
        if (!newMaterialName.trim()) {
          setAddMaterialError('Please enter a material name');
          setSaving(false);
          return;
        }
        
        // Check if material already exists in current division
        if (materialColumns.includes(newMaterialName.trim())) {
          setAddMaterialError('Material already exists in this division');
          setSaving(false);
          return;
        }

        // Create new material
        const response = await fetch(`/api/config/materials/${divisionCode}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            material_code: newMaterialName.trim().toUpperCase().replace(/[^A-Z0-9]/g, '_'),
            material_name: newMaterialName.trim(),
            display_name: newMaterialName.trim(),
            description: `${newMaterialName.trim()} material`
          }),
        });

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.message || 'Failed to add material');
        }

        materialToAdd = newMaterialName.trim();
        
        // Reload available materials list
        await loadAllAvailableMaterials();
      } else {
        // Adding existing material to this division
        if (!selectedMaterialToAdd) {
          setAddMaterialError('Please select a material');
          setSaving(false);
          return;
        }

        // Check if material already in current division
        if (materialColumns.includes(selectedMaterialToAdd)) {
          setAddMaterialError('Material already exists in this division');
          setSaving(false);
          return;
        }

        // Add existing material to this division
        const response = await fetch(`/api/config/materials/${divisionCode}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            material_code: selectedMaterialToAdd.toUpperCase().replace(/[^A-Z0-9]/g, '_'),
            material_name: selectedMaterialToAdd,
            display_name: selectedMaterialToAdd,
            description: `${selectedMaterialToAdd} material`
          }),
        });

        const result = await response.json();

        if (!result.success) {
          // If it fails because it already exists, that's OK - we're just adding to this division
          if (!result.message.includes('already exists')) {
            throw new Error(result.message || 'Failed to add material');
          }
        }

        materialToAdd = selectedMaterialToAdd;
      }

      // Add material to local state
      setMaterialColumns([...materialColumns, materialToAdd]);

      // Initialize percentages for this material in all product groups
      const updatedPercentages = { ...materialPercentages };
      productGroups.forEach(pg => {
        if (!updatedPercentages[pg]) {
          updatedPercentages[pg] = {};
        }
        updatedPercentages[pg][materialToAdd] = 0;
      });
      setMaterialPercentages(updatedPercentages);

      setMessage(`✅ Material "${materialToAdd}" added successfully`);
      setNewMaterialName('');
      setSelectedMaterialToAdd('');
      setShowAddMaterial(false);
      setIsAddingNewMaterial(false);
      setTimeout(() => setMessage(''), 3000);

    } catch (error) {
      console.error('Error adding material:', error);
      setAddMaterialError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMaterial = async (material) => {
    if (!window.confirm(`Are you sure you want to remove "${material}" from ${selectedDivision} division? This will not delete the material definition, just remove it from this division.`)) {
      return;
    }

    setSaving(true);
    setError('');

    try {
      const divisionCode = selectedDivision.split('-')[0].toLowerCase();
      const materialCode = material.toUpperCase().replace(/[^A-Z0-9]/g, '_');
      
      const response = await fetch(`/api/config/materials/${divisionCode}/${materialCode}`, {
        method: 'DELETE'
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || 'Failed to remove material');
      }

      // Remove material from local state
      setMaterialColumns(materialColumns.filter(m => m !== material));

      // Remove percentages for this material from all product groups
      const updatedPercentages = { ...materialPercentages };
      productGroups.forEach(pg => {
        if (updatedPercentages[pg]) {
          delete updatedPercentages[pg][material];
        }
      });
      setMaterialPercentages(updatedPercentages);

      setMessage(`✅ Material "${material}" removed from ${divisionCode.toUpperCase()} division`);
      setTimeout(() => setMessage(''), 3000);

    } catch (error) {
      console.error('Error removing material:', error);
      setError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const saveProductGroupPercentages = async (productGroup) => {
    if (!materialPercentages[productGroup]) return;
    
    // Check if total is 100%
    const total = calculateRowTotal(productGroup);
    if (total !== 100) {
      setError(`⚠️ Total percentage is ${total.toFixed(1)}%. Please adjust to 100% before saving.`);
      setTimeout(() => setError(''), 5000);
      return;
    }
    
    setSaving(true);
    setMessage('');
    setError('');
    
    try {
      const divisionCode = selectedDivision.split('-')[0].toLowerCase();
      
      const response = await fetch(`/api/${divisionCode}/master-data/material-percentages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productGroup,
          percentages: materialPercentages[productGroup],
          material: materialProcessData[productGroup]?.material || '',
          process: materialProcessData[productGroup]?.process || ''
        }),
      });

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to save material percentages');
      }
      
      setMessage(`✅ Material percentages saved for ${productGroup}`);
      setTimeout(() => setMessage(''), 3000);
      
    } catch (error) {
      console.error('Error saving material percentages:', error);
      setError(error.message);
    } finally {
      setSaving(false);
    }
  };


  const calculateRowTotal = (productGroup) => {
    if (!materialPercentages[productGroup]) return 0;
    
    const total = materialColumns.reduce((total, material) => {
      const value = materialPercentages[productGroup][material];
      return total + (typeof value === 'number' ? value : 0);
    }, 0);
    
    return typeof total === 'number' ? total : 0;
  };

  const resetRow = (productGroup) => {
    const resetValues = {};
    materialColumns.forEach(material => {
      resetValues[material] = 0;
    });
    
    setMaterialPercentages(prev => ({
      ...prev,
      [productGroup]: resetValues
    }));
    
    // Reset Material and Process
    setMaterialProcessData(prev => ({
      ...prev,
      [productGroup]: {
        material: '',
        process: ''
      }
    }));
  };

  if (loading) {
    return (
      <div className="material-percentage-container">
        <div className="loading-state">
          <p>Loading material percentages...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="material-percentage-container">
        <div className="error-state">
          <p>❌ {error}</p>
          <button onClick={loadData} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="material-percentage-container">
      <div className="material-percentage-header">
        <h3>Material Percentages - {selectedDivision}</h3>
        <div className="header-actions">
          <button 
            onClick={() => setShowManageSpecs(true)}
            disabled={saving}
            className="manage-specs-button"
            title="Manage Material Columns (PE, PP, PET, etc.), Material Groups, and Material Conditions"
          >
            ⚙️ Manage Headers
          </button>
          <button 
            onClick={handleSaveAll}
            disabled={saving}
            className="save-all-button"
          >
            Save All
          </button>
          <button 
            onClick={handleResetAll}
            className="reset-all-button"
          >
            Reset All
          </button>
          <button 
            onClick={loadData}
            disabled={loading}
            className="refresh-button"
          >
            Refresh
          </button>
        </div>
      </div>

      {message && (
        <div className="message-bar success">
          {message}
        </div>
      )}

      {error && (
        <div className="message-bar error">
          {error}
        </div>
      )}

      {productGroups.length === 0 && !loading ? (
        <div className="coming-soon-state">
          <p>📝 {message}</p>
        </div>
      ) : (
        <div className="material-percentage-table-container">
          <table className="material-percentage-table">
            <thead>
              <tr>
                <th className="product-group-header">Product Group</th>
                {materialColumns.map(material => (
                  <th key={material} className="material-header">
                    {material}
                  </th>
                ))}
                <th className="total-header">TOTAL</th>
                <th className="material-column-header">MATERIAL<br/>GROUP</th>
                <th className="process-header">MATERIAL<br/>CONDITION</th>
              </tr>
            </thead>
            <tbody>
              {productGroups.map(productGroup => (
                <tr key={productGroup} className="product-row">
                  <td className="product-group-cell">{productGroup}</td>
                  {materialColumns.map(material => {
                    const value = materialPercentages[productGroup]?.[material] || 0;
                    return (
                      <td key={material} className="material-cell">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={value}
                            onChange={(e) => handlePercentageChange(productGroup, material, e.target.value)}
                            className="percentage-input"
                          />
                          <span className="percentage-symbol">%</span>
                        </div>
                      </td>
                    );
                  })}
                  <td className={`total-cell ${calculateRowTotal(productGroup) === 100 ? 'total-correct' : 'total-incorrect'}`}>
                    {calculateRowTotal(productGroup).toFixed(1)}%
                  </td>
                  <td className="material-input-cell">
                    <select
                      value={materialProcessData[productGroup]?.material || ''}
                      onChange={(e) => handleMaterialChange(productGroup, e.target.value)}
                      className="material-process-select"
                    >
                      <option value="">-- Select --</option>
                      {materialGroups.map(group => (
                        <option key={group} value={group}>{group}</option>
                      ))}
                    </select>
                  </td>
                  <td className="process-input-cell">
                    <select
                      value={materialProcessData[productGroup]?.process || ''}
                      onChange={(e) => handleProcessChange(productGroup, e.target.value)}
                      className="material-process-select"
                    >
                      <option value="">-- Select --</option>
                      {materialConditions.map(condition => (
                        <option key={condition} value={condition}>{condition}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAddMaterial && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h4>Add Material to {selectedDivision}</h4>
            
            {!isAddingNewMaterial ? (
              <>
                <label style={{ fontSize: '0.9rem', color: '#374151', marginBottom: '8px', display: 'block' }}>
                  Select existing material or add new:
                </label>
                <select
                  value={selectedMaterialToAdd}
                  onChange={(e) => {
                    if (e.target.value === '__ADD_NEW__') {
                      setIsAddingNewMaterial(true);
                      setSelectedMaterialToAdd('');
                    } else {
                      setSelectedMaterialToAdd(e.target.value);
                    }
                  }}
                  className="material-input"
                  style={{ cursor: 'pointer' }}
                >
                  <option value="">-- Select Material --</option>
                  {availableMaterials.map(material => {
                    const alreadyAdded = materialColumns.includes(material);
                    return (
                      <option 
                        key={material} 
                        value={material}
                        disabled={alreadyAdded}
                        style={{ 
                          color: alreadyAdded ? '#999' : 'inherit',
                          fontStyle: alreadyAdded ? 'italic' : 'normal'
                        }}
                      >
                        {material} {alreadyAdded ? '(already in division)' : ''}
                      </option>
                    );
                  })}
                  <option value="__ADD_NEW__" style={{ fontWeight: 'bold', color: '#007bff' }}>➕ Add New Material...</option>
                </select>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ fontSize: '0.9rem', color: '#374151' }}>
                    Enter new material name:
                  </label>
                  <button
                    onClick={() => {
                      setIsAddingNewMaterial(false);
                      setNewMaterialName('');
                    }}
                    style={{ background: 'none', border: 'none', color: '#007bff', cursor: 'pointer', fontSize: '0.85rem' }}
                  >
                    ← Back to selection
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Enter material name (e.g., PE, PP, PET)"
                  value={newMaterialName}
                  onChange={(e) => setNewMaterialName(e.target.value)}
                  className="material-input"
                  onKeyPress={(e) => e.key === 'Enter' && handleAddMaterial()}
                  autoFocus
                />
              </>
            )}
            
            {addMaterialError && <p className="error-message">{addMaterialError}</p>}
            
            <div className="modal-actions">
              <button
                onClick={handleAddMaterial}
                disabled={saving || (!isAddingNewMaterial && !selectedMaterialToAdd) || (isAddingNewMaterial && !newMaterialName.trim())}
                className="confirm-button"
              >
                {saving ? 'Adding...' : 'Add'}
              </button>
              <button
                onClick={() => {
                  setShowAddMaterial(false);
                  setNewMaterialName('');
                  setSelectedMaterialToAdd('');
                  setIsAddingNewMaterial(false);
                  setAddMaterialError('');
                }}
                className="cancel-button"
                disabled={saving}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showManageSpecs && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '700px', maxHeight: '90vh', overflow: 'auto' }}>
            <h4>Manage Headers - {selectedDivision}</h4>
            <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '16px' }}>
              Manage material columns, material groups, and material conditions for this division
            </p>
            
            <div className="specs-tabs">
              <button 
                className={`specs-tab ${specsTab === 'columns' ? 'active' : ''}`}
                onClick={() => setSpecsTab('columns')}
              >
                📊 Material Columns
              </button>
              <button 
                className={`specs-tab ${specsTab === 'groups' ? 'active' : ''}`}
                onClick={() => setSpecsTab('groups')}
              >
                📦 Material Groups
              </button>
              <button 
                className={`specs-tab ${specsTab === 'conditions' ? 'active' : ''}`}
                onClick={() => setSpecsTab('conditions')}
              >
                ⚙️ Material Conditions
              </button>
            </div>

            {specsTab === 'columns' ? (
              <div className="specs-content">
                <h5>Material Columns (PE, PP, PET, ALU, etc.)</h5>
                <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '16px' }}>
                  These are the percentage columns in the table.
                </p>

                <div className="specs-list">
                  {materialColumns.length > 0 ? (
                    materialColumns.map(column => (
                      <div key={column} className="spec-item">
                        {editingColumn === column ? (
                          <div style={{ display: 'flex', gap: '8px', flex: 1, alignItems: 'center' }}>
                            <input
                              type="text"
                              value={editColumnName}
                              onChange={(e) => setEditColumnName(e.target.value)}
                              className="material-input"
                              style={{ flex: 1 }}
                              onKeyPress={(e) => e.key === 'Enter' && handleEditMaterialColumn()}
                              autoFocus
                              disabled={addingSpec}
                            />
                            <button
                              onClick={handleEditMaterialColumn}
                              className="add-spec-btn"
                              style={{ padding: '4px 12px', fontSize: '0.85rem' }}
                              disabled={addingSpec}
                            >
                              {addingSpec ? '...' : '✓'}
                            </button>
                            <button
                              onClick={() => {
                                setEditingColumn(null);
                                setEditColumnName('');
                              }}
                              className="remove-spec-btn"
                              style={{ padding: '4px 8px' }}
                              disabled={addingSpec}
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <>
                            <span>{column}</span>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button
                                onClick={() => {
                                  setEditingColumn(column);
                                  setEditColumnName(column);
                                }}
                                className="add-spec-btn"
                                style={{ padding: '4px 8px', fontSize: '0.85rem', background: '#3b82f6' }}
                                title={`Edit ${column}`}
                              >
                                ✎
                              </button>
                              <button 
                                onClick={() => handleRemoveMaterialColumn(column)}
                                className="remove-spec-btn"
                                disabled={materialColumns.length === 1}
                                title={materialColumns.length === 1 ? 'Cannot remove last column' : `Remove ${column}`}
                              >
                                ✕
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))
                  ) : (
                    <p style={{ color: '#999', fontStyle: 'italic' }}>No material columns configured</p>
                  )}
                </div>

                <div className="add-spec-section">
                  <h6>Add New Material Column:</h6>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="text"
                      placeholder="Enter column name (e.g., PE, PP, PET, ALU)"
                      value={newSpecName}
                      onChange={(e) => setNewSpecName(e.target.value)}
                      className="material-input"
                      onKeyPress={(e) => e.key === 'Enter' && handleAddMaterialColumn()}
                      disabled={addingSpec}
                    />
                    <button
                      onClick={handleAddMaterialColumn}
                      disabled={addingSpec || !newSpecName.trim()}
                      className="add-spec-btn"
                    >
                      {addingSpec ? 'Adding...' : '➕ Add'}
                    </button>
                  </div>
                </div>
              </div>
            ) : specsTab === 'groups' ? (
              <div className="specs-content">
                <h5>Material Groups (for Material Group column)</h5>
                <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '16px' }}>
                  These options appear in the Material Group dropdown for each product group.
                </p>

                <div className="specs-list">
                  {materialGroups.length > 0 ? (
                    materialGroups.map(group => (
                      <div key={group} className="spec-item">
                        {editingGroup === group ? (
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%' }}>
                            <input
                              type="text"
                              value={editGroupName}
                              onChange={(e) => setEditGroupName(e.target.value)}
                              className="material-input"
                              style={{ flex: 1 }}
                              onKeyPress={(e) => e.key === 'Enter' && handleEditMaterialGroup()}
                              autoFocus
                              disabled={addingSpec}
                            />
                            <button
                              onClick={handleEditMaterialGroup}
                              className="add-spec-btn"
                              style={{ padding: '4px 12px', fontSize: '0.85rem' }}
                              disabled={addingSpec}
                            >
                              {addingSpec ? '...' : '✓'}
                            </button>
                            <button
                              onClick={() => {
                                setEditingGroup(null);
                                setEditGroupName('');
                              }}
                              className="remove-spec-btn"
                              style={{ padding: '4px 8px' }}
                              disabled={addingSpec}
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <>
                            <span>{group}</span>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button
                                onClick={() => {
                                  setEditingGroup(group);
                                  setEditGroupName(group);
                                }}
                                className="add-spec-btn"
                                style={{ padding: '4px 8px', fontSize: '0.85rem', background: '#3b82f6' }}
                                title={`Edit ${group}`}
                              >
                                ✎
                              </button>
                              <button 
                                onClick={() => handleRemoveMaterialGroup(group)}
                                className="remove-spec-btn"
                                disabled={materialGroups.length === 1}
                                title={materialGroups.length === 1 ? 'Cannot remove last material group' : `Remove ${group}`}
                              >
                                ✕
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))
                  ) : (
                    <p style={{ color: '#999', fontStyle: 'italic' }}>No material groups configured</p>
                  )}
                </div>

                <div className="add-spec-section">
                  <h6>Add New Material Group:</h6>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="text"
                      placeholder="Enter material group name (e.g., PE, Non PE, Other)"
                      value={newSpecName}
                      onChange={(e) => setNewSpecName(e.target.value)}
                      className="material-input"
                      onKeyPress={(e) => e.key === 'Enter' && handleAddMaterialGroup()}
                      disabled={addingSpec}
                    />
                    <button
                      onClick={handleAddMaterialGroup}
                      disabled={addingSpec || !newSpecName.trim()}
                      className="add-spec-btn"
                    >
                      {addingSpec ? 'Adding...' : '➕ Add'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="specs-content">
                <h5>Material Conditions (Plain, Printed, etc.)</h5>
                <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '16px' }}>
                  These options appear in the Material Condition dropdown for each product group.
                </p>

                <div className="specs-list">
                  {materialConditions.length > 0 ? (
                    materialConditions.map(condition => (
                      <div key={condition} className="spec-item">
                        {editingCondition === condition ? (
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%' }}>
                            <input
                              type="text"
                              value={editConditionName}
                              onChange={(e) => setEditConditionName(e.target.value)}
                              className="material-input"
                              style={{ flex: 1 }}
                              onKeyPress={(e) => e.key === 'Enter' && handleEditMaterialCondition()}
                              autoFocus
                              disabled={addingSpec}
                            />
                            <button
                              onClick={handleEditMaterialCondition}
                              className="add-spec-btn"
                              style={{ padding: '4px 12px', fontSize: '0.85rem' }}
                              disabled={addingSpec}
                            >
                              {addingSpec ? '...' : '✓'}
                            </button>
                            <button
                              onClick={() => {
                                setEditingCondition(null);
                                setEditConditionName('');
                              }}
                              className="remove-spec-btn"
                              style={{ padding: '4px 8px' }}
                              disabled={addingSpec}
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <>
                            <span>{condition}</span>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button
                                onClick={() => {
                                  setEditingCondition(condition);
                                  setEditConditionName(condition);
                                }}
                                className="add-spec-btn"
                                style={{ padding: '4px 8px', fontSize: '0.85rem', background: '#3b82f6' }}
                                title={`Edit ${condition}`}
                              >
                                ✎
                              </button>
                              <button 
                                onClick={() => handleRemoveMaterialCondition(condition)}
                                className="remove-spec-btn"
                                disabled={materialConditions.length === 1}
                                title={materialConditions.length === 1 ? 'Cannot remove last material condition' : `Remove ${condition}`}
                              >
                                ✕
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))
                  ) : (
                    <p style={{ color: '#999', fontStyle: 'italic' }}>No material conditions configured</p>
                  )}
                </div>

                <div className="add-spec-section">
                  <h6>Add New Material Condition:</h6>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="text"
                      placeholder="Enter material condition name (e.g., Plain, Printed)"
                      value={newSpecName}
                      onChange={(e) => setNewSpecName(e.target.value)}
                      className="material-input"
                      onKeyPress={(e) => e.key === 'Enter' && handleAddMaterialCondition()}
                      disabled={addingSpec}
                    />
                    <button
                      onClick={handleAddMaterialCondition}
                      disabled={addingSpec || !newSpecName.trim()}
                      className="add-spec-btn"
                    >
                      {addingSpec ? 'Adding...' : '➕ Add'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="modal-actions" style={{ marginTop: '24px' }}>
              <button
                onClick={() => {
                  setShowManageSpecs(false);
                  setNewSpecName('');
                  setSpecsTab('columns');
                  loadData(); // Reload data to reflect changes
                }}
                className="cancel-button"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MaterialPercentageManager;
