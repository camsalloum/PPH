export const COLUMNS = [
  { key: 'new', label: 'New', color: '#1890ff', bg: '#e6f7ff', count_key: 'new_count' },
  { key: 'in_progress', label: 'In Progress', color: '#fa8c16', bg: '#fff7e6', count_key: 'in_progress_count' },
  { key: 'converted', label: 'Converted', color: '#13c2c2', bg: '#e6fffb', count_key: 'converted_count' },
  { key: 'lost', label: 'Lost', color: '#f5222d', bg: '#fff1f0', count_key: 'lost_count' },
  { key: 'on_hold', label: 'On Hold', color: '#8c8c8c', bg: '#fafafa', count_key: 'on_hold_count' },
];

export const STAGNANT_THRESHOLDS = {
  new: 3,
  in_progress: 7,
  customer_registered: 14,
  qualified: 10,
  on_hold: 21,
};

export const STAGE_LABELS = {
  new_inquiry: { label: 'New Inquiry', color: '#2f54eb' },
  sar_pending: { label: 'SAR Pending', color: '#fa8c16' },
  qc_in_progress: { label: 'QC In Progress', color: '#1890ff' },
  qc_received: { label: 'QC Received', color: '#13c2c2' },
  cse_pending: { label: 'CSE Pending', color: '#722ed1' },
  cse_approved: { label: 'CSE Approved', color: '#52c41a' },
  estimation: { label: 'Estimation', color: '#f5222d' },
  quoted: { label: 'Quoted', color: '#13c2c2' },
  negotiating: { label: 'Negotiating', color: '#faad14' },
  price_accepted: { label: 'Price Accepted', color: '#52c41a' },
  preprod_sample: { label: 'Pre-prod Sample', color: '#1890ff' },
  preprod_sent: { label: 'Sample Sent', color: '#722ed1' },
  sample_approved: { label: 'Sample Approved', color: '#52c41a' },
  pi_sent: { label: 'PI Sent', color: '#fa8c16' },
  order_confirmed: { label: 'Order Confirmed', color: '#52c41a' },
  in_production: { label: 'In Production', color: '#1890ff' },
  ready_dispatch: { label: 'Ready to Dispatch', color: '#13c2c2' },
  delivered: { label: 'Delivered', color: '#52c41a' },
  closed: { label: 'Closed', color: '#8c8c8c' },
};

export const LOST_REASON_OPTIONS = [
  { value: 'price', label: 'Price too high' },
  { value: 'quality', label: 'Quality concerns' },
  { value: 'lead_time', label: 'Lead time' },
  { value: 'competition', label: 'Competition' },
  { value: 'customer_decision', label: 'Customer decision' },
  { value: 'specification', label: 'Specification mismatch' },
  { value: 'other', label: 'Other' },
];
