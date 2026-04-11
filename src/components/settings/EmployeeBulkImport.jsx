/**
 * Employee Bulk Import/Export Component
 * - Download Excel template with dropdown validations
 * - Export current employees
 * - Import from Excel with validation preview
 */

import React, { useState } from 'react';
import {
    Modal, Button, Upload, Table, Tag, Space, Alert, Progress, message, Tooltip
} from 'antd';
import {
    UploadOutlined, DownloadOutlined, FileExcelOutlined,
    CheckCircleOutlined, CloseCircleOutlined, WarningOutlined
} from '@ant-design/icons';
import * as XLSX from 'xlsx';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

const EmployeeBulkImport = ({ 
    visible, 
    onClose, 
    onSuccess, 
    departments = [], 
    designations = [], 
    branches = [],
    employees = [],
    selectedDivision
}) => {
    const [importData, setImportData] = useState([]);
    const [importing, setImporting] = useState(false);
    const [progress, setProgress] = useState(0);
    const [parseError, setParseError] = useState(null);

    // Column mapping from Excel to database
    const columnMapping = {
        'First Name': 'first_name',
        'Middle Name': 'middle_name',
        'Last Name': 'last_name',
        'Gender': 'gender',
        'Date of Birth': 'date_of_birth',
        'Date of Joining': 'date_of_joining',
        'Department': 'department_name',
        'Designation': 'designation_name',
        'Branch': 'branch_name',
        'Reports To': 'reports_to_name',
        'Status': 'status',
        'Company Email': 'company_email',
        'Personal Email': 'personal_email',
        'Mobile': 'cell_number',
        'Employment Type': 'employment_type',
        'Group Name (Leader)': 'group_leader_name'
    };

    // Template headers (for Employees sheet)
    const templateHeaders = Object.keys(columnMapping);

    // Helper: Parse full name into first name and family name
    // Family name = everything after the first name (e.g., "Al Houseini" from "Ziad Al Houseini")
    const parseName = (fullName) => {
        if (!fullName) return { firstName: '', familyName: '' };
        const parts = fullName.trim().split(/\s+/);
        if (parts.length === 1) {
            return { firstName: parts[0], familyName: '' };
        }
        return { 
            firstName: parts[0], 
            familyName: parts.slice(1).join(' ')  // Everything after first name
        };
    };

    // UNIFIED EXPORT FUNCTION - Creates complete Excel file with ALL sheets
    // This file serves as both TEMPLATE and EXPORT
    // User can edit any sheet and upload back to update everything
    const exportAll = async () => {
        const wb = XLSX.utils.book_new();
        
        // Fetch sales rep data if division is selected
        let salesRepNames = [];
        let salesRepGroups = {};
        
        if (selectedDivision) {
            try {
                // Fetch sales rep names from sales data
                const repsResponse = await fetch(`${API_BASE_URL}/api/sales-reps-universal?division=${selectedDivision}`);
                if (repsResponse.ok) {
                    const repsData = await repsResponse.json();
                    if (repsData.success && repsData.data) {
                        salesRepNames = repsData.data.filter(Boolean).map(name => name.trim());
                    }
                }
                
                // Fetch existing groups
                const groupsResponse = await fetch(`${API_BASE_URL}/api/sales-rep-groups-universal?division=${selectedDivision}`);
                if (groupsResponse.ok) {
                    const groupsData = await groupsResponse.json();
                    if (groupsData.success && groupsData.data) {
                        salesRepGroups = groupsData.data;
                    }
                }
            } catch (error) {
                console.error('Error fetching sales rep data:', error);
            }
        }

        // Build map of member -> group leader for the Group Name column
        const memberToLeader = {};
        Object.entries(salesRepGroups).forEach(([leaderName, members]) => {
            members.forEach(member => {
                memberToLeader[member.toLowerCase().trim()] = leaderName;
            });
        });

        // ============ SHEET 1: EMPLOYEES (Editable - for employee import) ============
        // ALWAYS use salesRepNames as the source - parse into first/last name
        const employeesData = [templateHeaders];
        
        if (salesRepNames.length > 0) {
            // Create employee rows from sales rep names (parsed into first/last name)
            salesRepNames.forEach(name => {
                const { firstName, familyName } = parseName(name);
                const groupLeader = memberToLeader[name.toLowerCase().trim()] || '';
                employeesData.push([
                    firstName,           // First Name
                    '',                  // Middle Name
                    familyName,          // Last Name (family name)
                    'Male',              // Gender (default)
                    '',                  // Date of Birth
                    '',                  // Date of Joining
                    departments[0]?.name || '',   // Department
                    designations[0]?.name || '',  // Designation
                    branches[0]?.name || '',      // Branch
                    '',                  // Reports To
                    'Active',            // Status
                    '',                  // Company Email
                    '',                  // Personal Email
                    '',                  // Mobile
                    'Full-time',         // Employment Type
                    groupLeader          // Group Name (Leader) - pre-filled from existing groups
                ]);
            });
        } else {
            // Add sample row for template
            employeesData.push([
                'John', '', 'Doe', 'Male', '1990-01-15', '2024-01-01',
                departments[0]?.name || 'Sales', 
                designations[0]?.name || 'Sales Executive',
                branches[0]?.name || 'Head Office',
                '', 'Active', 'john.doe@company.com', 'john@personal.com', '+971501234567', 'Full-time',
                ''
            ]);
        }
        const employeesSheet = XLSX.utils.aoa_to_sheet(employeesData);
        employeesSheet['!cols'] = templateHeaders.map(h => ({ wch: Math.max(h.length + 2, 15) }));
        XLSX.utils.book_append_sheet(wb, employeesSheet, 'Employees');

        // ============ SHEET 2: RAW LIST (Reference - all sales rep names) ============
        const rawListData = [['First Name', 'Family Name', 'Full Name']];
        salesRepNames.forEach(name => {
            const { firstName, familyName } = parseName(name);
            rawListData.push([firstName, familyName, name]);
        });
        const rawSheet = XLSX.utils.aoa_to_sheet(rawListData);
        rawSheet['!cols'] = [{ wch: 20 }, { wch: 20 }, { wch: 35 }];
        XLSX.utils.book_append_sheet(wb, rawSheet, 'Raw List');

        // ============ SHEET 3: GROUP ASSIGNMENTS (Editable - for group import) ============
        const groupData = [['Full Name', 'First Name', 'Family Name', 'Group Name (Leader)', 'Status']];
        
        // Add all sales reps with their current group assignment (use memberToLeader already built above)
        salesRepNames.forEach(name => {
            const { firstName, familyName } = parseName(name);
            const groupLeader = memberToLeader[name.toLowerCase().trim()] || '';
            const status = groupLeader ? 'Grouped' : 'Ungrouped';
            groupData.push([name, firstName, familyName, groupLeader, status]);
        });
        const groupSheet = XLSX.utils.aoa_to_sheet(groupData);
        groupSheet['!cols'] = [{ wch: 35 }, { wch: 15 }, { wch: 20 }, { wch: 30 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(wb, groupSheet, 'Group Assignments');

        // ============ SHEET 4: DEPARTMENTS LIST (Reference) ============
        const deptSheet = XLSX.utils.aoa_to_sheet([
            ['Available Departments'],
            ...departments.map(d => [d.name])
        ]);
        XLSX.utils.book_append_sheet(wb, deptSheet, 'Departments_List');

        // ============ SHEET 5: DESIGNATIONS LIST (Reference) ============
        const desigSheet = XLSX.utils.aoa_to_sheet([
            ['Available Designations'],
            ...designations.map(d => [d.name])
        ]);
        XLSX.utils.book_append_sheet(wb, desigSheet, 'Designations_List');

        // ============ SHEET 6: BRANCHES LIST (Reference) ============
        const branchSheet = XLSX.utils.aoa_to_sheet([
            ['Available Branches'],
            ...branches.map(b => [b.name])
        ]);
        XLSX.utils.book_append_sheet(wb, branchSheet, 'Branches_List');

        // ============ SHEET 7: STATUS LIST (Reference) ============
        const statusSheet = XLSX.utils.aoa_to_sheet([
            ['Available Statuses'],
            ['Active'], ['Inactive'], ['Left']
        ]);
        XLSX.utils.book_append_sheet(wb, statusSheet, 'Status_List');

        // ============ SHEET 8: INSTRUCTIONS ============
        const instructionsData = [
            ['📋 IMPORT INSTRUCTIONS'],
            [''],
            ['This file can be used to update BOTH Employees AND Sales Rep Groups'],
            [''],
            ['=== EMPLOYEES SHEET ==='],
            ['- Edit employee data in the "Employees" sheet'],
            ['- Use values from Departments_List, Designations_List, Branches_List sheets'],
            ['- First Name and Last Name are required'],
            [''],
            ['=== GROUP ASSIGNMENTS SHEET ==='],
            ['- Edit the "Group Assignments" sheet to assign sales reps to groups'],
            ['- In "Group Name (Leader)" column, type the LEADER\'s full name'],
            ['- All rows with the same Group Name become members of that group'],
            ['- Leave empty for ungrouped sales reps'],
            [''],
            ['=== EXAMPLE ==='],
            ['Full Name', 'Group Name (Leader)', 'Result'],
            ['Abraham Mathew', 'Abraham Mathew', 'Leader of his own group'],
            ['Alfred Barakat', 'Abraham Mathew', 'Member of Abraham\'s group'],
            ['Mohamed Adel', '', 'Not in any group'],
            [''],
            ['=== UPLOAD ==='],
            ['Save this file and upload it back to update everything'],
        ];
        const instructionsSheet = XLSX.utils.aoa_to_sheet(instructionsData);
        instructionsSheet['!cols'] = [{ wch: 50 }, { wch: 30 }, { wch: 30 }];
        XLSX.utils.book_append_sheet(wb, instructionsSheet, 'Instructions');

        // Download
        const filename = `Employee_Data_${selectedDivision || 'All'}_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, filename);
        message.success(`Exported: ${employees.length} employees, ${salesRepNames.length} sales reps, ${Object.keys(salesRepGroups).length} groups`);
    };

    // Parse uploaded Excel file - reads BOTH Employees sheet AND Group Assignments sheet
    const handleFileUpload = (file) => {
        setParseError(null);
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                
                // Find the Employees sheet (first sheet or named "Employees")
                let employeesSheetName = workbook.SheetNames.find(s => 
                    s.toLowerCase() === 'employees'
                ) || workbook.SheetNames[0];
                
                const worksheet = workbook.Sheets[employeesSheetName];
                
                // Convert to JSON
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
                
                if (jsonData.length === 0) {
                    setParseError('No data found in the Employees sheet');
                    return;
                }

                // Also check for Group Assignments sheet and store it
                const groupSheetName = workbook.SheetNames.find(s => 
                    s.toLowerCase().includes('group')
                );
                let groupAssignments = [];
                if (groupSheetName) {
                    const groupSheet = workbook.Sheets[groupSheetName];
                    groupAssignments = XLSX.utils.sheet_to_json(groupSheet, { defval: '' });
                }
                
                // Store group assignments in state for later use during import
                window._pendingGroupAssignments = groupAssignments;

                // Validate and transform data
                const processedData = jsonData.map((row, index) => {
                    const errors = [];
                    const warnings = [];
                    
                    // Required fields
                    if (!row['First Name']?.toString().trim()) errors.push('First Name required');
                    if (!row['Last Name']?.toString().trim()) errors.push('Last Name required');
                    
                    // Validate department
                    let department_id = null;
                    if (row['Department']) {
                        const dept = departments.find(d => 
                            d.name.toLowerCase() === row['Department'].toString().toLowerCase()
                        );
                        if (dept) {
                            department_id = dept.id;
                        } else {
                            warnings.push(`Department "${row['Department']}" not found`);
                        }
                    }
                    
                    // Validate designation
                    let designation_id = null;
                    if (row['Designation']) {
                        const desig = designations.find(d => 
                            d.name.toLowerCase() === row['Designation'].toString().toLowerCase()
                        );
                        if (desig) {
                            designation_id = desig.id;
                        } else {
                            warnings.push(`Designation "${row['Designation']}" not found`);
                        }
                    }
                    
                    // Validate branch
                    let branch_id = null;
                    if (row['Branch']) {
                        const branch = branches.find(b => 
                            b.name.toLowerCase() === row['Branch'].toString().toLowerCase()
                        );
                        if (branch) {
                            branch_id = branch.id;
                        } else {
                            warnings.push(`Branch "${row['Branch']}" not found`);
                        }
                    }
                    
                    // Validate reports to (match by name)
                    let reports_to = null;
                    if (row['Reports To']) {
                        const manager = employees.find(e => 
                            e.full_name?.toLowerCase() === row['Reports To'].toString().toLowerCase() ||
                            e.employee_name?.toLowerCase() === row['Reports To'].toString().toLowerCase()
                        );
                        if (manager) {
                            reports_to = manager.id;
                        } else {
                            warnings.push(`Manager "${row['Reports To']}" not found`);
                        }
                    }
                    
                    // Validate gender
                    const gender = row['Gender']?.toString().trim();
                    if (gender && !['Male', 'Female'].includes(gender)) {
                        warnings.push('Gender should be Male or Female');
                    }
                    
                    // Validate status
                    const status = row['Status']?.toString().trim() || 'Active';
                    if (!['Active', 'Inactive', 'Left'].includes(status)) {
                        warnings.push('Status should be Active, Inactive, or Left');
                    }
                    
                    // Parse dates
                    let date_of_birth = null;
                    if (row['Date of Birth']) {
                        const dob = row['Date of Birth'];
                        date_of_birth = dob instanceof Date ? dob.toISOString().split('T')[0] : dob;
                    }
                    
                    let date_of_joining = null;
                    if (row['Date of Joining']) {
                        const doj = row['Date of Joining'];
                        date_of_joining = doj instanceof Date ? doj.toISOString().split('T')[0] : doj;
                    }
                    
                    // Check for duplicate by email
                    const email = row['Company Email']?.toString().trim();
                    if (email) {
                        const existing = employees.find(e => 
                            e.company_email?.toLowerCase() === email.toLowerCase()
                        );
                        if (existing) {
                            warnings.push(`Email already exists (${existing.employee_name})`);
                        }
                    }

                    return {
                        key: index,
                        rowNumber: index + 2, // +2 for header row and 0-index
                        // Original values for display
                        first_name: row['First Name']?.toString().trim() || '',
                        middle_name: row['Middle Name']?.toString().trim() || '',
                        last_name: row['Last Name']?.toString().trim() || '',
                        gender: gender || 'Male',
                        date_of_birth,
                        date_of_joining,
                        department_name: row['Department']?.toString().trim() || '',
                        designation_name: row['Designation']?.toString().trim() || '',
                        branch_name: row['Branch']?.toString().trim() || '',
                        reports_to_name: row['Reports To']?.toString().trim() || '',
                        status,
                        company_email: email || '',
                        personal_email: row['Personal Email']?.toString().trim() || '',
                        cell_number: row['Mobile']?.toString().trim() || '',
                        employment_type: row['Employment Type']?.toString().trim() || 'Full-time',
                        group_leader_name: row['Group Name (Leader)']?.toString().trim() || '',
                        // IDs for database
                        department_id,
                        designation_id,
                        branch_id,
                        reports_to,
                        // Validation status
                        errors,
                        warnings,
                        isValid: errors.length === 0
                    };
                });

                setImportData(processedData);
            } catch (error) {
                console.error('Parse error:', error);
                setParseError('Failed to parse Excel file. Please check the format.');
            }
        };
        
        reader.readAsArrayBuffer(file);
        return false; // Prevent auto upload
    };

    // Import validated data
    const handleImport = async () => {
        const validRows = importData.filter(r => r.isValid);
        if (validRows.length === 0) {
            message.error('No valid rows to import');
            return;
        }

        setImporting(true);
        setProgress(0);
        
        try {
            const response = await axios.post(
                `${API_BASE_URL}/api/employees/bulk-import`,
                { 
                    employees: validRows,
                    divisionCode: selectedDivision
                },
                {
                    headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
                }
            );

            if (response.data.success) {
                // Also update sales rep groups from Group Assignments sheet
                await updateSalesRepGroups();
                
                message.success(`Successfully imported ${response.data.imported} employees`);
                setImportData([]);
                onSuccess?.();
                onClose();
            } else {
                message.error(response.data.error || 'Import failed');
            }
        } catch (error) {
            message.error(error.response?.data?.error || 'Import failed');
        } finally {
            setImporting(false);
            setProgress(0);
        }
    };

    // Update sales rep groups from BOTH:
    // 1. Employees sheet (Group Name Leader column)
    // 2. Group Assignments sheet (if present in uploaded file)
    const updateSalesRepGroups = async () => {
        if (!selectedDivision) return;
        
        const groups = {};
        
        // First, process Group Assignments sheet (stored during file upload)
        const groupAssignments = window._pendingGroupAssignments || [];
        groupAssignments.forEach(row => {
            const fullName = row['Full Name']?.toString().trim();
            const groupLeader = row['Group Name (Leader)']?.toString().trim();
            
            if (fullName && groupLeader) {
                if (!groups[groupLeader]) {
                    groups[groupLeader] = [];
                }
                if (!groups[groupLeader].includes(fullName)) {
                    groups[groupLeader].push(fullName);
                }
            }
        });
        
        // Clear the pending data
        window._pendingGroupAssignments = null;

        // Save each group to the database
        let savedCount = 0;
        for (const [groupName, members] of Object.entries(groups)) {
            try {
                const response = await fetch(`${API_BASE_URL}/api/sales-rep-groups-universal`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                    },
                    body: JSON.stringify({
                        division: selectedDivision,
                        groupName: groupName,
                        members: members
                    }),
                });
                if (response.ok) savedCount++;
            } catch (error) {
                console.error(`Error saving group ${groupName}:`, error);
            }
        }
        
        if (savedCount > 0) {
            message.info(`Updated ${savedCount} sales rep group(s) from Group Assignments sheet`);
        }
    };

    // Preview table columns
    const previewColumns = [
        {
            title: 'Row',
            dataIndex: 'rowNumber',
            width: 50,
            fixed: 'left'
        },
        {
            title: 'Status',
            key: 'status',
            width: 80,
            fixed: 'left',
            render: (_, record) => {
                if (record.errors.length > 0) {
                    return <Tooltip title={record.errors.join(', ')}><CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 18 }} /></Tooltip>;
                }
                if (record.warnings.length > 0) {
                    return <Tooltip title={record.warnings.join(', ')}><WarningOutlined style={{ color: '#faad14', fontSize: 18 }} /></Tooltip>;
                }
                return <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 18 }} />;
            }
        },
        {
            title: 'Name',
            key: 'name',
            width: 180,
            render: (_, r) => `${r.first_name} ${r.middle_name} ${r.last_name}`.trim()
        },
        {
            title: 'Department',
            dataIndex: 'department_name',
            width: 120,
            render: (text, record) => (
                <span style={{ color: record.department_id ? 'inherit' : '#faad14' }}>
                    {text || '-'}
                </span>
            )
        },
        {
            title: 'Designation',
            dataIndex: 'designation_name',
            width: 150,
            render: (text, record) => (
                <span style={{ color: record.designation_id ? 'inherit' : '#faad14' }}>
                    {text || '-'}
                </span>
            )
        },
        {
            title: 'Branch',
            dataIndex: 'branch_name',
            width: 120,
            render: (text, record) => (
                <span style={{ color: record.branch_id ? 'inherit' : '#faad14' }}>
                    {text || '-'}
                </span>
            )
        },
        {
            title: 'Email',
            dataIndex: 'company_email',
            width: 200
        },
        {
            title: 'Group (Leader)',
            dataIndex: 'group_leader_name',
            width: 150,
            render: (text) => text ? <Tag color="blue">{text}</Tag> : '-'
        },
        {
            title: 'Status',
            dataIndex: 'status',
            width: 80,
            render: (s) => <Tag color={s === 'Active' ? 'green' : s === 'Left' ? 'red' : 'default'}>{s}</Tag>
        }
    ];

    const validCount = importData.filter(r => r.isValid).length;
    const warningCount = importData.filter(r => r.warnings.length > 0 && r.isValid).length;
    const errorCount = importData.filter(r => !r.isValid).length;

    return (
        <Modal
            title={<><FileExcelOutlined /> Bulk Import/Export Employees</>}
            open={visible}
            onCancel={onClose}
            width={1000}
            footer={[
                <Button key="close" onClick={onClose}>Close</Button>,
                importData.length > 0 && (
                    <Button 
                        key="import" 
                        type="primary" 
                        onClick={handleImport}
                        loading={importing}
                        disabled={validCount === 0}
                    >
                        Import {validCount} Employee{validCount !== 1 ? 's' : ''}
                    </Button>
                )
            ]}
        >
            {/* Action Buttons */}
            <Space style={{ marginBottom: 16 }}>
                <Button icon={<DownloadOutlined />} onClick={exportAll} type="primary">
                    📥 Export / Download Template
                </Button>
                <Upload
                    accept=".xlsx,.xls"
                    beforeUpload={handleFileUpload}
                    showUploadList={false}
                >
                    <Button icon={<UploadOutlined />}>
                        📤 Upload Excel File
                    </Button>
                </Upload>
            </Space>

            {/* Parse Error */}
            {parseError && (
                <Alert type="error" message={parseError} style={{ marginBottom: 16 }} showIcon />
            )}

            {/* Import Progress */}
            {importing && (
                <Progress percent={progress} status="active" style={{ marginBottom: 16 }} />
            )}

            {/* Preview Table */}
            {importData.length > 0 && (
                <>
                    <Alert
                        type="info"
                        style={{ marginBottom: 16 }}
                        message={
                            <Space>
                                <span><CheckCircleOutlined style={{ color: '#52c41a' }} /> Valid: {validCount}</span>
                                <span><WarningOutlined style={{ color: '#faad14' }} /> Warnings: {warningCount}</span>
                                <span><CloseCircleOutlined style={{ color: '#ff4d4f' }} /> Errors: {errorCount}</span>
                            </Space>
                        }
                    />
                    <Table
                        columns={previewColumns}
                        dataSource={importData}
                        size="small"
                        scroll={{ x: 1000, y: 400 }}
                        pagination={false}
                        rowClassName={(record) => {
                            if (!record.isValid) return 'row-error';
                            if (record.warnings.length > 0) return 'row-warning';
                            return '';
                        }}
                    />
                    <style>{`
                        .row-error { background-color: #fff2f0 !important; }
                        .row-warning { background-color: #fffbe6 !important; }
                    `}</style>
                </>
            )}

            {/* Instructions */}
            {importData.length === 0 && !parseError && (
                <Alert
                    type="info"
                    showIcon
                    message="How to Import Employees"
                    description={
                        <ol style={{ marginBottom: 0, paddingLeft: 20 }}>
                            <li>Click "Download Template" to get the Excel template</li>
                            <li>Fill in employee data (check the extra sheets for valid Department/Designation/Branch values)</li>
                            <li><strong>Group Name (Leader)</strong>: To assign employees to a Sales Rep Group, enter the Leader's full name in this column. All employees with the same Group Name will be grouped together.</li>
                            <li>Upload the completed Excel file</li>
                            <li>Review the preview and fix any errors</li>
                            <li>Click "Import" to add employees and update Sales Rep Groups</li>
                        </ol>
                    }
                />
            )}
        </Modal>
    );
};

export default EmployeeBulkImport;
