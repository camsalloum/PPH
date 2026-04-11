/**
 * MESModule — Top-level MES container with sub-routing.
 *
 * Routes:
 *   /mes               → WorkflowLandingPage (overview)
 *   /mes/flow/*        → Flow module (job tracker, dept dashboard)
 *   /mes/inquiries/*   → Pre-Sales inquiries (board, capture, detail)
 *   /mes/qc/scan/:num  → QC Scan page (QR code landing)
 */

import React from 'react';
import { Navigate, Routes, Route } from 'react-router-dom';
import WorkflowLandingPage from './WorkflowLandingPage';

// Lazy-load sub-modules
const FlowModule = React.lazy(() => import('./Flow'));
const PresalesInquiries = React.lazy(() => import('./PreSales'));
const QCScanPage = React.lazy(() => import('./PreSales/QCScanPage'));
const MyPipeline = React.lazy(() => import('./PreSales/MyPipeline'));
const QCDashboard = React.lazy(() => import('./QC/QCDashboard'));
const QCSampleAnalysis = React.lazy(() => import('./QC/QCSampleAnalysis'));
const CSEApprovalQueue = React.lazy(() => import('./QC/CSEApprovalQueue'));
const CSEApprovalPage = React.lazy(() => import('./QC/CSEApprovalPage'));
const NCRManagement = React.lazy(() => import('./QC/NCRManagement'));
const QCTemplateAdmin = React.lazy(() => import('./QC/QCTemplateAdmin'));
const WinLossAnalytics = React.lazy(() => import('./PreSales/WinLossAnalytics'));
const JobCardList = React.lazy(() => import('./PreSales/JobCardList'));
const EstimationQueue = React.lazy(() => import('./PreSales/EstimationQueue'));
const EstimationCalculator = React.lazy(() => import('./PreSales/EstimationCalculator'));
const ProcurementDashboard = React.lazy(() => import('./PreSales/ProcurementDashboard'));
const RawMaterialsRouter = React.lazy(() => import('./RawMaterials/RawMaterialsRouter'));
const MasterDataHub = React.lazy(() => import('./MasterData/MasterDataHub'));
const BOMConfigurator = React.lazy(() => import('./MasterData/BOMConfigurator'));

class MESErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(_err, _info) { /* intentionally silent */ }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <p style={{ color: '#ff4d4f', marginBottom: 12 }}>Failed to load this section.</p>
          <button onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function MESModule() {
  return (
    <MESErrorBoundary>
    <React.Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#999' }}>Loading…</div>}>
      <Routes>
        {/* WorkflowLandingPage acts as layout — renders sidebar + outlet for sub-routes */}
        <Route element={<WorkflowLandingPage />}>
          <Route index element={null} />
          <Route path="raw-materials" element={<RawMaterialsRouter />} />
          <Route path="qc/incoming-rm" element={<Navigate to="/mes/raw-materials?mode=qc" replace />} />
          <Route path="qc/test-parameters" element={<Navigate to="/mes/raw-materials?mode=qc#test-parameters" replace />} />
          <Route path="qc/certificates" element={<Navigate to="/mes/raw-materials?mode=qc#certificates" replace />} />
        </Route>
        <Route path="flow/*" element={<FlowModule />} />
        <Route path="pipeline" element={<MyPipeline />} />
        <Route path="inquiries/*" element={<PresalesInquiries />} />
        <Route path="qc" element={<QCDashboard />} />
        <Route path="qc/samples/:sampleId" element={<QCSampleAnalysis />} />
        <Route path="qc/cse/:cseId" element={<CSEApprovalPage />} />
        <Route path="qc/ncr" element={<NCRManagement />} />
        <Route path="qc/templates" element={<QCTemplateAdmin />} />
        <Route path="analytics" element={<WinLossAnalytics />} />
        <Route path="job-cards" element={<JobCardList />} />
        <Route path="estimation" element={<EstimationQueue />} />
        <Route path="estimation/:inquiryId" element={<EstimationCalculator />} />
        <Route path="procurement" element={<ProcurementDashboard />} />
        <Route path="master-data" element={<MasterDataHub />} />
        <Route path="master-data/bom/:productGroupId" element={<BOMConfigurator />} />
        <Route path="approvals" element={<CSEApprovalQueue />} />
        <Route path="qc/scan/:sampleNumber" element={<QCScanPage />} />
        <Route path="*" element={<Navigate to="/mes" replace />} />
      </Routes>
    </React.Suspense>
    </MESErrorBoundary>
  );
}
