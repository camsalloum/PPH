/**
 * Shared constants for InquiryDetail sub-components.
 */
import {
  FileTextOutlined, ExperimentOutlined,
  SafetyCertificateOutlined, CheckCircleOutlined,
  DollarOutlined, ToolOutlined, FileDoneOutlined,
  CarOutlined, FlagOutlined,
} from '@ant-design/icons';

export const STATUS_CONFIG = {
  new:                 { color: '#1890ff', bg: '#e6f7ff', label: 'New' },
  in_progress:         { color: '#fa8c16', bg: '#fff7e6', label: 'In Progress' },
  customer_registered: { color: '#722ed1', bg: '#f9f0ff', label: 'Registered' },
  qualified:           { color: '#52c41a', bg: '#f6ffed', label: 'Qualified' },
  converted:           { color: '#13c2c2', bg: '#e6fffb', label: 'Converted' },
  lost:                { color: '#f5222d', bg: '#fff1f0', label: 'Lost' },
  on_hold:             { color: '#8c8c8c', bg: '#fafafa', label: 'On Hold' },
};

export const SOURCE_LABELS = {
  manager_tip: 'Manager Tip', customer_visit: 'Customer Visit', website: 'Website',
  exhibition: 'Exhibition', phone_call: 'Phone Call', whatsapp: 'WhatsApp',
  email: 'Email', referral: 'Referral', prospect_list: 'Prospect List', other: 'Other',
};

export const CTYPE_LABELS = {
  new: 'New Company', existing: 'Existing Customer', prospect: 'From Prospect List',
};

export const ATTACHMENT_TYPE_LABELS = {
  tds: 'TDS', email: 'Email', artwork: 'Artwork', sample_photo: 'Sample Photo',
  specification: 'Specification', document: 'Document', other: 'Other',
};

export const SAMPLE_STATUS_CONFIG = {
  registered:      { color: 'blue',       label: 'Registered' },
  sent_to_qc:      { color: 'orange',     label: 'Sent to QC' },
  received_by_qc:  { color: 'purple',     label: 'Received by QC' },
  testing:         { color: 'processing',  label: 'Testing' },
  tested:          { color: 'cyan',        label: 'Tested' },
  approved:        { color: 'green',       label: 'Approved' },
  rejected:        { color: 'red',         label: 'Rejected' },
};

export const ACTIVITY_LABELS = {
  inquiry_created:       'Inquiry Created',
  status_changed:        'Status Changed',
  attachment_uploaded:    'Attachment Uploaded',
  attachment_deleted:     'Attachment Deleted',
  prospect_registered:   'Prospect Registered',
  prospect_approved:     'Prospect Approved',
  prospect_rejected:     'Prospect Rejected',
  sample_registered:     'Sample Registered',
  sample_status_changed: 'Sample Status Changed',
  qc_result_submitted:   'QC Result Submitted',
  moq_check_added:       'MOQ Check Added',
  moq_status_changed:    'MOQ Status Updated',
  material_check_added:  'Material Check Added',
  material_status_changed: 'Material Status Updated',
  presales_cleared:      'Pre-Sales Cleared',
  presales_clearance_revoked: 'Clearance Revoked',
  presales_phase_changed: 'Phase Changed',
  submitted_to_qc:       'Submitted to QC',
  samples_recalled:      'Samples Recalled from QC',
  qc_batch_received:     'QC Batch Received',
  qc_analysis_saved:     'QC Analysis Saved',
  qc_analysis_updated:   'QC Analysis Updated',
  cse_generated:         'CSE Report Generated',
  cse_qc_manager_approved: 'QC Manager Approved',
  cse_production_approved: 'Production Manager Approved',
  cse_revision_requested: 'Revision Requested',
  cse_rejected:          'CSE Rejected',
  quotation_created:     'Quotation Created',
  quotation_updated:     'Quotation Updated',
  quotation_approved:    'Quotation Approved',
  quotation_sent:        'Quotation Sent to Customer',
  customer_response:     'Customer Response Received',
  preprod_sample_requested: 'Pre-prod Sample Requested',
  preprod_status_changed: 'Pre-prod Sample Status Changed',
  preprod_customer_response: 'Pre-prod Customer Response',
  pi_created:            'Proforma Invoice Created',
  pi_sent:               'Proforma Invoice Sent',
  pi_cancelled:          'Proforma Invoice Cancelled',
  order_confirmed:       'Order Confirmed (PO Received)',
  production_started:    'Production Started',
  ready_for_dispatch:    'Ready for Dispatch',
  delivered:             'Order Delivered',
  inquiry_closed:        'Inquiry Closed',
  stage_changed:         'Stage Changed',
};

export const PRESALES_PHASES = [
  { key: 'inquiry',    label: 'Inquiry & Registration', icon: <FileTextOutlined /> },
  { key: 'sample_qc',  label: 'Sample & QC Review',     icon: <ExperimentOutlined /> },
  { key: 'clearance',  label: 'Pre-Sales Clearance',    icon: <SafetyCertificateOutlined /> },
  { key: 'cleared',    label: 'Cleared',                icon: <CheckCircleOutlined /> },
];

/* ── Full lifecycle phases (used by LifecycleStepper) ── */
export const LIFECYCLE_PHASES = [
  { key: 'inquiry',     label: 'Inquiry',        icon: <FileTextOutlined /> },
  { key: 'sample_qc',   label: 'Sample & QC',    icon: <ExperimentOutlined /> },
  { key: 'clearance',   label: 'Clearance',      icon: <SafetyCertificateOutlined /> },
  { key: 'quotation',   label: 'Quotation',      icon: <DollarOutlined /> },
  { key: 'preprod',     label: 'Pre-prod',       icon: <ToolOutlined /> },
  { key: 'order',       label: 'Order & PI',     icon: <FileDoneOutlined /> },
  { key: 'production',  label: 'Production',     icon: <ToolOutlined /> },
  { key: 'delivery',    label: 'Delivery',       icon: <CarOutlined /> },
  { key: 'closed',      label: 'Closed',         icon: <FlagOutlined /> },
];

/** Map inquiry_stage → lifecycle phase key */
export const STAGE_TO_PHASE = {
  sar_pending:      'inquiry',
  qc_in_progress:   'sample_qc',
  cse_pending:      'clearance',
  cse_approved:     'clearance',
  estimation:       'quotation',
  quoted:           'quotation',
  negotiating:      'quotation',
  price_accepted:   'quotation',
  preprod_sample:   'preprod',
  preprod_sent:     'preprod',
  sample_approved:  'preprod',
  pi_sent:          'order',
  order_confirmed:  'order',
  in_production:    'production',
  ready_dispatch:   'delivery',
  delivered:        'delivery',
  closed:           'closed',
  lost:             'closed',
  on_hold:          'inquiry',
};
