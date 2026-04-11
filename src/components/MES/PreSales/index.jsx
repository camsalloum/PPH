/**
 * PresalesInquiries — Main module container
 * Routes:
 *   /crm/inquiries          → InquiryBoard (Kanban)
 *   /crm/inquiries/new      → InquiryCapture (wizard)
 *   /crm/inquiries/:id      → InquiryDetail
 */

import React from 'react';
import { Routes, Route } from 'react-router-dom';
import InquiryBoard from './InquiryBoard';
import InquiryCapture from './InquiryCapture';
import InquiryDetail from './InquiryDetail';

export default function PresalesInquiries() {
  return (
    <Routes>
      <Route index            element={<InquiryBoard />} />
      <Route path="new"       element={<InquiryCapture />} />
      <Route path=":id"       element={<InquiryDetail />} />
    </Routes>
  );
}

// Named re-exports for convenience
export { InquiryBoard, InquiryCapture, InquiryDetail };
