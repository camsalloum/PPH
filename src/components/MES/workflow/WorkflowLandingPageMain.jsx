import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import axios from 'axios';
import MESNotificationBell from '../../common/MESNotificationBell';
import {
  DEPTS,
  QUICK_LINKS,
  STAGES,
  getRoleMesConfig,
  v,
} from './constants';
import { FlowRow, VConnector } from './FlowPrimitives';
import DetailPanel from './DetailPanel';
import '../WorkflowLandingPage.css';

const WorkflowLandingPageMain = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const outlet = useOutlet();
  const location = useLocation();
  const isSubRoute = location.pathname.replace(/\/$/, '') !== '/mes';
  const roleConfig = useMemo(() => getRoleMesConfig(user), [user]);

  const [activeDept, setActiveDept] = useState(roleConfig.defaultDept);
  const [selectedBox, setSelectedBox] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

  const [companySettings, setCompanySettings] = useState({ companyName: '', logoUrl: null, divisions: [] });
  useEffect(() => {
    const load = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/api/settings/company`);
        if (res.data.success) {
          setCompanySettings({
            companyName: res.data.settings.companyName || '',
            logoUrl: res.data.settings.logoUrl || null,
            divisions: res.data.settings.divisions || [],
          });
        }
      } catch {
        // Silent fallback to default labels.
      }
    };
    load();
  }, [API_BASE_URL]);

  const divisionLabel = useMemo(() => {
    const userDivs = user?.divisions || [];
    const allDivs = companySettings.divisions;
    const activeCode = userDivs[0] || (allDivs[0] && allDivs[0].code) || '';
    if (activeCode) return `MES — ${activeCode}`;
    return 'MES';
  }, [user, companySettings.divisions]);

  useEffect(() => {
    setActiveDept(roleConfig.defaultDept);
    setSelectedBox(null);
  }, [roleConfig.defaultDept]);

  const [jobStats, setJobStats] = useState({ active: 0, error: 0 });
  useEffect(() => {
    let cancelled = false;

    const fetchStats = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        const res = await axios.get(`${API_BASE_URL}/api/mes/flow/dashboard`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelled && res.data?.success) {
          const stats = res.data.data.job_stats || {};
          setJobStats({
            active: (stats.active || 0) + (stats.in_progress || 0),
            error: stats.on_hold || 0,
          });
        }
      } catch {
        // Silent fallback to last values.
      }
    };

    fetchStats();
    const timer = setInterval(fetchStats, 60000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [API_BASE_URL]);

  const visibleDepts = useMemo(
    () => Object.entries(DEPTS).filter(([key]) => roleConfig.allowedDepts.includes(key)),
    [roleConfig.allowedDepts]
  );

  const allQuickLinks = useMemo(() => Object.values(QUICK_LINKS), []);
  const enabledLinkIds = useMemo(() => new Set(roleConfig.quickLinkIds), [roleConfig.quickLinkIds]);
  const ownDeptSet = useMemo(() => new Set(roleConfig.ownDepts), [roleConfig.ownDepts]);
  const renderedStages = STAGES;

  const switchDept = (key) => {
    if (key === 'all') {
      if (!roleConfig.allowAllDepartments) return;
    } else if (!ownDeptSet.has(key)) {
      return;
    }
    setActiveDept(key);
    setSelectedBox(null);
  };

  return (
    <div className={`mes-root ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
      {sidebarOpen && <div className="sb-overlay" onClick={() => setSidebarOpen(false)} />}

      <aside className="mes-sidebar">
        <div className="sb-brand">
          {companySettings.logoUrl && (
            <img
              src={`${API_BASE_URL}${companySettings.logoUrl}`}
              alt={companySettings.companyName}
              className="sb-logo"
            />
          )}
          <div className="sb-titles">
            <div className="sb-app">{companySettings.companyName || 'Company'}</div>
            <div className="sb-mod">{divisionLabel}</div>
          </div>
          <button className="sb-collapse-btn" onClick={() => setSidebarOpen(false)} title="Collapse sidebar">‹</button>
        </div>

        <div className="sb-divider" />
        <div className="sb-section">DEPARTMENT FILTER</div>

        {roleConfig.allowAllDepartments && (
          <button className={`sb-btn ${activeDept === 'all' ? 'sb-btn--active' : ''}`} onClick={() => switchDept('all')}>
            <span className="sb-dot" style={{ background: v('--dept-all') }} />
            <span>All Departments</span>
            <span className="sb-count">17</span>
          </button>
        )}

        {visibleDepts.map(([key, dept]) => {
          const count = renderedStages.flatMap((stage) => stage.rows.flat()).filter((box) => box.depts.includes(key)).length;
          const canSelect = ownDeptSet.has(key);
          return (
            <button
              key={key}
              className={`sb-btn ${activeDept === key ? 'sb-btn--active' : ''} ${!canSelect ? 'sb-btn--locked' : ''}`}
              style={activeDept === key ? { '--ac': v(dept.colorVar), '--ab': v(dept.bgVar) } : {}}
              onClick={() => canSelect && switchDept(key)}
              disabled={!canSelect}
              title={canSelect ? '' : `${dept.label} — view only`}
            >
              <span className="sb-dot" style={{ background: v(dept.colorVar) }} />
              <span>{dept.label}</span>
              <span className="sb-count">{canSelect ? count : '🔒'}</span>
            </button>
          );
        })}

        <div className="sb-divider" />
        <div className="sb-section">QUICK LINKS</div>

        {allQuickLinks.map((link) => {
          const linkEnabled = enabledLinkIds.has(link.id);
          return (
            <button
              key={link.id}
              className={`sb-btn ${!linkEnabled ? 'sb-btn--locked' : ''}`}
              onClick={() => linkEnabled && link.route && navigate(link.route)}
              disabled={!linkEnabled}
              title={linkEnabled ? '' : 'Not available for your department'}
            >
              <span className="sb-dot" style={{ background: link.color }} />
              <span>{link.label}</span>
              <span className="sb-count">{linkEnabled ? link.badge : '🔒'}</span>
            </button>
          );
        })}

        <div className="sb-divider" />
        <div className="sb-section">LEGEND</div>
        <div className="sb-legend-item"><span className="leg-gate">⚑</span>PPS Quality Gate</div>
        <div className="sb-legend-item"><span className="leg-par">⚡</span>Parallel Process</div>
        <div className="sb-legend-item"><span className="leg-arr">——›</span>Process Flow</div>

        <div className="sb-spacer" />
      </aside>

      <main className={`mes-main ${selectedBox ? 'mes-main--with-panel' : ''}`}>
        <div className="mes-topbar">
          <button className="mes-back-btn" onClick={() => navigate('/modules')} title="Back to Home">←</button>
          <button className="mob-menu-btn" onClick={() => setSidebarOpen((value) => !value)} title="Toggle sidebar">☰</button>
          {!sidebarOpen && (
            <button className="sb-expand-btn" onClick={() => setSidebarOpen(true)} title="Open sidebar">M ›</button>
          )}

          <div className="tb-left">
            <span className="tb-title">{roleConfig.title}</span>
            <span className="tb-sub">{roleConfig.subtitle}</span>
          </div>

          <div className="tb-status-bar">
            <button
              className="tb-status-item tb-status--ok"
              onClick={() => navigate('/mes/flow')}
              style={{ cursor: 'pointer', background: 'none', border: 'none' }}
            >
              <span className="tb-status-dot" />JOBS {jobStats.active}
            </button>
            <span className={`tb-status-item ${jobStats.error > 0 ? 'tb-status--err' : 'tb-status--ok'}`}>
              <span className="tb-status-dot" />HOLD {jobStats.error}
            </span>
          </div>

          {activeDept !== 'all' && (
            <div className="tb-active-dept">
              <span
                className="tb-active-label"
                style={{
                  background: v(DEPTS[activeDept]?.bgVar),
                  color: v(DEPTS[activeDept]?.colorVar),
                  borderColor: v(DEPTS[activeDept]?.colorVar),
                }}
              >
                <span className="tb-active-dot" style={{ background: v(DEPTS[activeDept]?.colorVar) }} />
                {DEPTS[activeDept]?.label}
                {roleConfig.allowAllDepartments && (
                  <button className="tb-clear-dept" onClick={() => switchDept('all')}>✕</button>
                )}
              </span>
            </div>
          )}
          <MESNotificationBell />
        </div>

        {isSubRoute ? (
          <div className="mes-scroll">
            <React.Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#999' }}>Loading…</div>}>
              {outlet}
            </React.Suspense>
          </div>
        ) : (
          <>
            <div className="mes-scroll">
              <div className="mes-canvas">
                {renderedStages.map((stage, stageIndex) => (
                  <React.Fragment key={stage.id}>
                    {stageIndex > 0 && <VConnector />}

                    <div
                      className={[
                        'swimlane',
                        stage.critical ? 'swimlane--critical' : '',
                        stage.parallel ? 'swimlane--parallel' : '',
                      ].join(' ')}
                    >
                      <div className={`sl-badge ${stage.critical ? 'sl-badge--critical' : ''}`}>
                        {stage.label}
                        {stage.critical && <span className="sl-meta sl-meta--critical">CRITICAL PATH</span>}
                        {stage.parallel && <span className="sl-meta sl-meta--parallel">PARALLEL</span>}
                      </div>

                      <div className={`sl-body ${stage.parallel ? 'sl-body--parallel' : ''}`}>
                        {stage.rows.map((row, rowIndex) => {
                          const rowKey = row.map((box) => box.id).join('|') || `${stage.id}-row-${rowIndex}`;
                          return (
                            <React.Fragment key={rowKey}>
                              {stage.parallel && rowIndex > 0 && (
                                <div className="parallel-sep">
                                  <div className="par-line" />
                                  <span className="par-tag">⚡ PARALLEL TRACK</span>
                                  <div className="par-line" />
                                </div>
                              )}
                              <FlowRow
                                boxes={row}
                                activeDept={activeDept}
                                selectedBox={selectedBox}
                                onSelect={setSelectedBox}
                              />
                            </React.Fragment>
                          );
                        })}
                      </div>
                    </div>
                  </React.Fragment>
                ))}

                <div className="canvas-hint">
                  {activeDept !== 'all' ? (
                    <span
                      className="hint-pill hint-pill--dept"
                      style={{
                        background: v(DEPTS[activeDept]?.bgVar),
                        color: v(DEPTS[activeDept]?.colorVar),
                        borderColor: v(DEPTS[activeDept]?.colorVar),
                      }}
                    >
                      Showing <strong>{DEPTS[activeDept]?.label}</strong> phases only — others are disabled
                    </span>
                  ) : (
                    <span className="hint-pill">Click any phase box to view details &amp; forms</span>
                  )}
                </div>
              </div>
            </div>

            {selectedBox && (
              <DetailPanel
                box={selectedBox}
                onClose={() => setSelectedBox(null)}
                onNavigate={navigate}
                userDept={roleConfig.defaultDept}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default WorkflowLandingPageMain;
