import React from 'react';
import EntityEmailThread from './EntityEmailThread';

/**
 * Shared email thread surface for CRM detail pages.
 * Current v1 supports customer-scoped threads and keeps a stable API for future
 * prospect/inquiry thread adapters without changing page-level integration.
 */
const EmailThreadView = ({ customerId, prospectId, inquiryId }) => {
  if (customerId) {
    return <EntityEmailThread customerId={customerId} title="Email Thread" />;
  }

  if (prospectId) {
    return <EntityEmailThread prospectId={prospectId} title="Prospect Thread" />;
  }

  if (inquiryId) {
    return <EntityEmailThread inquiryId={inquiryId} title="Inquiry Thread" />;
  }

  return <EntityEmailThread title="General Thread" />;
};

export default EmailThreadView;
