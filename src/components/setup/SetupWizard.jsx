/**
 * Setup Wizard Component
 * First-time setup for new ProPackHub installations
 */

import React, { useState, useEffect } from 'react';
import {
    Card, Steps, Form, Input, Button, Space, Row, Col, Typography,
    Alert, Divider, Tag, Table, message, Result, Spin, Upload
} from 'antd';
import {
    KeyOutlined, BankOutlined, UserOutlined, ApartmentOutlined,
    MailOutlined, CheckCircleOutlined, PlusOutlined, DeleteOutlined,
    SettingOutlined, GlobalOutlined, LockOutlined, RocketOutlined,
    UploadOutlined
} from '@ant-design/icons';
import axios from 'axios';

const { Title, Text, Paragraph } = Typography;
const { Step } = Steps;

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

const SetupWizard = ({ onComplete }) => {
    const [currentStep, setCurrentStep] = useState(0);
    const [loading, setLoading] = useState(false);
    const [licenseForm] = Form.useForm();
    const [companyForm] = Form.useForm();
    const [adminForm] = Form.useForm();
    
    // Data state
    const [licenseData, setLicenseData] = useState(null);
    const [companyData, setCompanyData] = useState(null);
    const [adminData, setAdminData] = useState(null);
    const [divisions, setDivisions] = useState([]);
    const [emailDomains, setEmailDomains] = useState([]);
    const [logoFile, setLogoFile] = useState(null);
    const [logoPreview, setLogoPreview] = useState(null);
    const [newDivision, setNewDivision] = useState({ code: '', name: '', database: '' });
    const [newDomain, setNewDomain] = useState('');
    const [setupComplete, setSetupComplete] = useState(false);

    // Step definitions
    const steps = [
        { title: 'License', icon: <KeyOutlined /> },
        { title: 'Company', icon: <BankOutlined /> },
        { title: 'Admin', icon: <UserOutlined /> },
        { title: 'Divisions', icon: <ApartmentOutlined /> },
        { title: 'Complete', icon: <CheckCircleOutlined /> }
    ];

    // =====================================================
    // STEP 1: LICENSE VALIDATION
    // =====================================================
    const handleLicenseValidation = async (values) => {
        setLoading(true);
        try {
            const response = await axios.post(`${API_BASE_URL}/api/setup/validate-license`, {
                licenseKey: values.licenseKey
            });
            
            if (response.data.valid) {
                setLicenseData(response.data.license);
                message.success('License validated successfully!');
                setCurrentStep(1);
            } else {
                message.error(response.data.error || 'Invalid license key');
            }
        } catch (error) {
            message.error('Failed to validate license');
        } finally {
            setLoading(false);
        }
    };

    const LicenseStep = () => (
        <Card>
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
                <RocketOutlined style={{ fontSize: 64, color: '#1890ff', marginBottom: 16 }} />
                <Title level={3}>Welcome to ProPackHub</Title>
                <Paragraph type="secondary">
                    Enter your license key to begin setup. You can purchase a license at{' '}
                    <a href="https://propackhub.com" target="_blank" rel="noopener noreferrer">
                        propackhub.com
                    </a>
                </Paragraph>
            </div>
            
            <Form form={licenseForm} onFinish={handleLicenseValidation} layout="vertical">
                <Form.Item 
                    name="licenseKey" 
                    label="License Key"
                    rules={[{ required: true, message: 'Please enter your license key' }]}
                >
                    <Input 
                        prefix={<KeyOutlined />} 
                        placeholder="PPH-XXXX-XXXX-XXXX" 
                        size="large"
                        style={{ fontFamily: 'monospace' }}
                    />
                </Form.Item>
                
                <Alert
                    message="Don't have a license?"
                    description="You can enter PPH-TRIAL for a 30-day trial, or contact sales@propackhub.com for enterprise pricing."
                    type="info"
                    showIcon
                    style={{ marginBottom: 24 }}
                />
                
                <Button type="primary" htmlType="submit" size="large" block loading={loading}>
                    Validate License
                </Button>
            </Form>
        </Card>
    );

    // =====================================================
    // STEP 2: COMPANY INFORMATION
    // =====================================================
    const handleCompanySubmit = (values) => {
        setCompanyData(values);
        // Auto-add email domain from company domain/website
        if (values.website) {
            try {
                const domain = new URL(values.website).hostname.replace('www.', '');
                if (!emailDomains.includes(domain)) {
                    setEmailDomains([domain]);
                }
            } catch (e) {}
        }
        setCurrentStep(2);
    };

    // Handle logo upload
    const handleLogoChange = (info) => {
        const file = info.file.originFileObj || info.file;
        if (file) {
            setLogoFile(file);
            const reader = new FileReader();
            reader.onload = (e) => setLogoPreview(e.target.result);
            reader.readAsDataURL(file);
        }
    };

    const CompanyStep = () => (
        <Card>
            <Title level={4}><BankOutlined /> Company Information</Title>
            <Paragraph type="secondary">
                Enter your company details. This information will appear throughout the application.
            </Paragraph>
            <Divider />
            
            <Form 
                form={companyForm} 
                onFinish={handleCompanySubmit} 
                layout="vertical"
                initialValues={companyData}
            >
                {/* Company Logo Upload */}
                <Form.Item label="Company Logo" style={{ marginBottom: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <Upload
                            name="logo"
                            showUploadList={false}
                            beforeUpload={() => false}
                            onChange={handleLogoChange}
                            accept="image/*"
                        >
                            <div style={{
                                width: 120,
                                height: 120,
                                border: '2px dashed #d9d9d9',
                                borderRadius: 8,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                overflow: 'hidden',
                                background: logoPreview ? '#fff' : '#fafafa'
                            }}>
                                {logoPreview ? (
                                    <img src={logoPreview} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                ) : (
                                    <div style={{ textAlign: 'center', color: '#999' }}>
                                        <UploadOutlined style={{ fontSize: 24 }} />
                                        <div style={{ marginTop: 8, fontSize: 12 }}>Upload Logo</div>
                                    </div>
                                )}
                            </div>
                        </Upload>
                        <div style={{ color: '#666', fontSize: 12 }}>
                            <div>Recommended: 200x200px or larger</div>
                            <div>Formats: PNG, JPG, SVG</div>
                            {logoFile && (
                                <Button 
                                    type="link" 
                                    danger 
                                    size="small" 
                                    onClick={() => { setLogoFile(null); setLogoPreview(null); }}
                                    style={{ padding: 0, marginTop: 4 }}
                                >
                                    Remove
                                </Button>
                            )}
                        </div>
                    </div>
                </Form.Item>

                <Row gutter={16}>
                    <Col span={12}>
                        <Form.Item 
                            name="name" 
                            label="Company Name"
                            rules={[{ required: true, message: 'Required' }]}
                        >
                            <Input prefix={<BankOutlined />} placeholder="Your Company Name" />
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item name="legal_name" label="Legal Name">
                            <Input placeholder="Your Company Legal Name" />
                        </Form.Item>
                    </Col>
                </Row>
                
                <Row gutter={16}>
                    <Col span={12}>
                        <Form.Item name="website" label="Website">
                            <Input prefix={<GlobalOutlined />} placeholder="https://company.com" />
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item name="email" label="Contact Email">
                            <Input prefix={<MailOutlined />} placeholder="info@company.com" />
                        </Form.Item>
                    </Col>
                </Row>
                
                <Form.Item name="address" label="Address">
                    <Input.TextArea rows={2} placeholder="Company address" />
                </Form.Item>
                
                <Row gutter={16}>
                    <Col span={12}>
                        <Button onClick={() => setCurrentStep(0)} block>
                            Back
                        </Button>
                    </Col>
                    <Col span={12}>
                        <Button type="primary" htmlType="submit" block>
                            Next: Admin Account
                        </Button>
                    </Col>
                </Row>
            </Form>
        </Card>
    );

    // =====================================================
    // STEP 3: ADMIN ACCOUNT
    // =====================================================
    const handleAdminSubmit = (values) => {
        setAdminData(values);
        // Auto-add admin's email domain
        const domain = values.email.split('@')[1];
        if (domain && !emailDomains.includes(domain)) {
            setEmailDomains(prev => [...new Set([...prev, domain])]);
        }
        setCurrentStep(3);
    };

    const AdminStep = () => (
        <Card>
            <Title level={4}><UserOutlined /> Administrator Account</Title>
            <Paragraph type="secondary">
                Create the primary administrator account. This user will have full access to all features.
            </Paragraph>
            <Divider />
            
            <Form 
                form={adminForm} 
                onFinish={handleAdminSubmit} 
                layout="vertical"
                initialValues={adminData}
            >
                <Form.Item 
                    name="name" 
                    label="Full Name"
                    rules={[{ required: true, message: 'Required' }]}
                >
                    <Input prefix={<UserOutlined />} placeholder="John Doe" />
                </Form.Item>
                
                <Form.Item 
                    name="email" 
                    label="Email Address"
                    rules={[
                        { required: true, message: 'Required' },
                        { type: 'email', message: 'Invalid email' }
                    ]}
                >
                    <Input prefix={<MailOutlined />} placeholder="admin@company.com" />
                </Form.Item>
                
                <Row gutter={16}>
                    <Col span={12}>
                        <Form.Item 
                            name="password" 
                            label="Password"
                            rules={[
                                { required: true, message: 'Required' },
                                { min: 8, message: 'At least 8 characters' }
                            ]}
                        >
                            <Input.Password prefix={<LockOutlined />} placeholder="Min 8 characters" />
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item 
                            name="confirmPassword" 
                            label="Confirm Password"
                            dependencies={['password']}
                            rules={[
                                { required: true, message: 'Required' },
                                ({ getFieldValue }) => ({
                                    validator(_, value) {
                                        if (!value || getFieldValue('password') === value) {
                                            return Promise.resolve();
                                        }
                                        return Promise.reject('Passwords do not match');
                                    }
                                })
                            ]}
                        >
                            <Input.Password prefix={<LockOutlined />} placeholder="Confirm password" />
                        </Form.Item>
                    </Col>
                </Row>
                
                <Alert
                    message="Security Note"
                    description="Use a strong password. You can change it later in Settings → User Management."
                    type="warning"
                    showIcon
                    style={{ marginBottom: 24 }}
                />
                
                <Row gutter={16}>
                    <Col span={12}>
                        <Button onClick={() => setCurrentStep(1)} block>
                            Back
                        </Button>
                    </Col>
                    <Col span={12}>
                        <Button type="primary" htmlType="submit" block>
                            Next: Divisions
                        </Button>
                    </Col>
                </Row>
            </Form>
        </Card>
    );

    // =====================================================
    // STEP 4: DIVISIONS SETUP
    // =====================================================
    const addDivision = () => {
        if (!newDivision.code || !newDivision.name) {
            message.warning('Code and Name are required');
            return;
        }
        if (divisions.find(d => d.code === newDivision.code.toUpperCase())) {
            message.warning('Division code already exists');
            return;
        }
        
        const division = {
            code: newDivision.code.toUpperCase(),
            name: newDivision.name,
            database: newDivision.database || `${newDivision.code.toLowerCase()}_database`,
            active: true,
            color: ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1'][divisions.length % 5]
        };
        
        setDivisions([...divisions, division]);
        setNewDivision({ code: '', name: '', database: '' });
    };

    const removeDivision = (code) => {
        setDivisions(divisions.filter(d => d.code !== code));
    };

    const addEmailDomain = () => {
        if (!newDomain) return;
        const domain = newDomain.toLowerCase().replace(/^@/, '');
        if (!emailDomains.includes(domain)) {
            setEmailDomains([...emailDomains, domain]);
        }
        setNewDomain('');
    };

    const removeEmailDomain = (domain) => {
        if (emailDomains.length > 1) {
            setEmailDomains(emailDomains.filter(d => d !== domain));
        } else {
            message.warning('At least one email domain is required');
        }
    };

    const DivisionsStep = () => (
        <Card>
            <Title level={4}><ApartmentOutlined /> Divisions & Email Domains</Title>
            <Paragraph type="secondary">
                Configure your company divisions (business units) and allowed email domains.
            </Paragraph>
            <Divider />
            
            {/* Divisions Section */}
            <Card size="small" title="Divisions" style={{ marginBottom: 16 }}>
                <Row gutter={8} style={{ marginBottom: 12 }}>
                    <Col span={4}>
                        <Input 
                            placeholder="Code" 
                            value={newDivision.code}
                            onChange={e => setNewDivision({ ...newDivision, code: e.target.value.toUpperCase() })}
                            maxLength={5}
                        />
                    </Col>
                    <Col span={8}>
                        <Input 
                            placeholder="Division Name" 
                            value={newDivision.name}
                            onChange={e => setNewDivision({ ...newDivision, name: e.target.value })}
                        />
                    </Col>
                    <Col span={8}>
                        <Input 
                            placeholder="Database name (auto-generated)" 
                            value={newDivision.database}
                            onChange={e => setNewDivision({ ...newDivision, database: e.target.value })}
                        />
                    </Col>
                    <Col span={4}>
                        <Button type="primary" icon={<PlusOutlined />} onClick={addDivision} block>
                            Add
                        </Button>
                    </Col>
                </Row>
                
                {divisions.length > 0 ? (
                    <Table 
                        dataSource={divisions}
                        rowKey="code"
                        size="small"
                        pagination={false}
                        columns={[
                            { 
                                title: 'Code', 
                                dataIndex: 'code', 
                                render: (code, record) => <Tag color={record.color}>{code}</Tag>
                            },
                            { title: 'Name', dataIndex: 'name' },
                            { title: 'Database', dataIndex: 'database', render: db => <code>{db}</code> },
                            { 
                                title: '', 
                                width: 50,
                                render: (_, record) => (
                                    <Button 
                                        type="text" 
                                        danger 
                                        icon={<DeleteOutlined />} 
                                        onClick={() => removeDivision(record.code)}
                                    />
                                )
                            }
                        ]}
                    />
                ) : (
                    <Alert message="Add at least one division to continue" type="warning" showIcon />
                )}
            </Card>
            
            {/* Email Domains Section */}
            <Card size="small" title="Email Domains">
                <Row gutter={8} style={{ marginBottom: 12 }}>
                    <Col flex="auto">
                        <Input 
                            placeholder="domain.com" 
                            value={newDomain}
                            onChange={e => setNewDomain(e.target.value.toLowerCase())}
                            onPressEnter={addEmailDomain}
                            prefix="@"
                        />
                    </Col>
                    <Col>
                        <Button type="primary" icon={<PlusOutlined />} onClick={addEmailDomain}>
                            Add
                        </Button>
                    </Col>
                </Row>
                
                <Space wrap>
                    {emailDomains.map(domain => (
                        <Tag 
                            key={domain} 
                            closable={emailDomains.length > 1}
                            onClose={() => removeEmailDomain(domain)}
                            style={{ padding: '4px 8px' }}
                        >
                            <MailOutlined /> {domain}
                        </Tag>
                    ))}
                </Space>
                <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                    Only users with these email domains can be registered.
                </Text>
            </Card>
            
            <Divider />
            
            <Row gutter={16}>
                <Col span={12}>
                    <Button onClick={() => setCurrentStep(2)} block>
                        Back
                    </Button>
                </Col>
                <Col span={12}>
                    <Button 
                        type="primary" 
                        onClick={() => setCurrentStep(4)} 
                        block
                        disabled={divisions.length === 0}
                    >
                        Review & Complete
                    </Button>
                </Col>
            </Row>
        </Card>
    );

    // =====================================================
    // STEP 5: REVIEW & COMPLETE
    // =====================================================
    const handleCompleteSetup = async () => {
        setLoading(true);
        try {
            // First, upload logo if present
            let logoUrl = null;
            if (logoFile) {
                const logoFormData = new FormData();
                logoFormData.append('logo', logoFile);
                try {
                    const logoResponse = await axios.post(`${API_BASE_URL}/api/setup/logo`, logoFormData, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                    });
                    logoUrl = logoResponse.data.logoUrl;
                } catch (logoError) {
                    console.warn('Logo upload failed, continuing without logo:', logoError);
                }
            }

            const response = await axios.post(`${API_BASE_URL}/api/setup/complete`, {
                license: licenseData,
                company: { ...companyData, logo_url: logoUrl },
                admin: adminData,
                divisions: divisions,
                emailDomains: emailDomains,
                preferences: {
                    currency: 'USD',
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    date_format: 'DD/MM/YYYY',
                    language: navigator.language.split('-')[0] || 'en'
                }
            });
            
            if (response.data.success) {
                setSetupComplete(true);
                message.success('Setup completed successfully!');
            } else {
                message.error(response.data.error || 'Setup failed');
            }
        } catch (error) {
            message.error(error.response?.data?.error || 'Setup failed');
        } finally {
            setLoading(false);
        }
    };

    const CompleteStep = () => (
        <Card>
            {setupComplete ? (
                <Result
                    status="success"
                    title="Setup Complete!"
                    subTitle={`Welcome to ProPackHub, ${adminData?.name}!`}
                    extra={[
                        <Button 
                            type="primary" 
                            size="large" 
                            key="login"
                            onClick={() => {
                                if (onComplete) onComplete();
                                window.location.href = '/login';
                            }}
                        >
                            Go to Login
                        </Button>
                    ]}
                />
            ) : (
                <>
                    <Title level={4}><CheckCircleOutlined /> Review Setup</Title>
                    <Paragraph type="secondary">
                        Please review your configuration before completing setup.
                    </Paragraph>
                    <Divider />
                    
                    {/* License Summary */}
                    <Card size="small" title={<><KeyOutlined /> License</>} style={{ marginBottom: 12 }}>
                        <Text><strong>Key:</strong> {licenseData?.key}</Text><br />
                        <Text><strong>Type:</strong> <Tag color="blue">{licenseData?.type}</Tag></Text><br />
                        <Text><strong>Expires:</strong> {licenseData?.expires}</Text>
                    </Card>
                    
                    {/* Company Summary */}
                    <Card size="small" title={<><BankOutlined /> Company</>} style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                            {logoPreview && (
                                <img src={logoPreview} alt="Logo" style={{ width: 50, height: 50, objectFit: 'contain', border: '1px solid #f0f0f0', borderRadius: 4 }} />
                            )}
                            <div>
                                <Text><strong>Name:</strong> {companyData?.name}</Text><br />
                                {companyData?.legal_name && <Text><strong>Legal:</strong> {companyData.legal_name}<br /></Text>}
                                {companyData?.website && <Text><strong>Website:</strong> {companyData.website}<br /></Text>}
                            </div>
                        </div>
                    </Card>
                    
                    {/* Admin Summary */}
                    <Card size="small" title={<><UserOutlined /> Administrator</>} style={{ marginBottom: 12 }}>
                        <Text><strong>Name:</strong> {adminData?.name}</Text><br />
                        <Text><strong>Email:</strong> {adminData?.email}</Text>
                    </Card>
                    
                    {/* Divisions Summary */}
                    <Card size="small" title={<><ApartmentOutlined /> Divisions ({divisions.length})</>} style={{ marginBottom: 12 }}>
                        <Space wrap>
                            {divisions.map(d => (
                                <Tag key={d.code} color={d.color}>{d.code} - {d.name}</Tag>
                            ))}
                        </Space>
                    </Card>
                    
                    {/* Email Domains Summary */}
                    <Card size="small" title={<><MailOutlined /> Email Domains</>} style={{ marginBottom: 24 }}>
                        <Space wrap>
                            {emailDomains.map(d => (
                                <Tag key={d}>{d}</Tag>
                            ))}
                        </Space>
                    </Card>
                    
                    <Alert
                        message="Ready to Complete"
                        description="Click 'Complete Setup' to save your configuration and create the admin account. You can modify these settings later in the admin panel."
                        type="success"
                        showIcon
                        style={{ marginBottom: 24 }}
                    />
                    
                    <Row gutter={16}>
                        <Col span={12}>
                            <Button onClick={() => setCurrentStep(3)} block>
                                Back
                            </Button>
                        </Col>
                        <Col span={12}>
                            <Button 
                                type="primary" 
                                onClick={handleCompleteSetup} 
                                block 
                                loading={loading}
                                icon={<CheckCircleOutlined />}
                            >
                                Complete Setup
                            </Button>
                        </Col>
                    </Row>
                </>
            )}
        </Card>
    );

    // Render current step
    const renderStep = () => {
        switch (currentStep) {
            case 0: return <LicenseStep />;
            case 1: return <CompanyStep />;
            case 2: return <AdminStep />;
            case 3: return <DivisionsStep />;
            case 4: return <CompleteStep />;
            default: return null;
        }
    };

    return (
        <div style={{ 
            minHeight: '100vh', 
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            padding: '40px 20px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start'
        }}>
            <div style={{ maxWidth: 800, width: '100%' }}>
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: 32, color: 'white' }}>
                    <Title level={2} style={{ color: 'white', margin: 0 }}>
                        <SettingOutlined /> ProPackHub Setup
                    </Title>
                    <Text style={{ color: 'rgba(255,255,255,0.8)' }}>
                        Configure your installation in a few simple steps
                    </Text>
                </div>
                
                {/* Steps */}
                <Card style={{ marginBottom: 24 }}>
                    <Steps current={currentStep} size="small">
                        {steps.map((step, index) => (
                            <Step 
                                key={index} 
                                title={step.title} 
                                icon={step.icon}
                            />
                        ))}
                    </Steps>
                </Card>
                
                {/* Current Step Content */}
                {renderStep()}
            </div>
        </div>
    );
};

export default SetupWizard;
