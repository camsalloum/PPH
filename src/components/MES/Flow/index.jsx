/**
 * Flow module — sub-routes under /mes/flow
 *
 * Routes:
 *   /mes/flow          → Job list (JobFlowTracker)
 *   /mes/flow/dept     → Department dashboard
 *   /mes/flow/job/:id  → Job detail (navigated via state, but URL-addressable)
 */

import React from 'react';
import { Routes, Route } from 'react-router-dom';
import JobFlowTracker from './JobFlowTracker';
import DeptDashboard from './DeptDashboard';
import CreateJobModal from './CreateJobModal';

export default function FlowModule() {
  return (
    <Routes>
      <Route index element={<JobFlowTracker />} />
      <Route path="dept" element={<DeptDashboard />} />
    </Routes>
  );
}

export { JobFlowTracker, DeptDashboard, CreateJobModal };
