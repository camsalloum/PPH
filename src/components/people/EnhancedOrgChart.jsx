/**
 * Enhanced Organization Chart Component
 * Level-based horizontal layout with optional reporting lines
 * Date: December 26, 2025
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Card, Button, Modal, Space, message, Tag, Avatar, Typography,
  Descriptions, Spin, Switch, Select, Tooltip, Row, Col
} from 'antd';
import {
  ApartmentOutlined, UserOutlined, ZoomInOutlined, ZoomOutOutlined,
  ExpandOutlined, ReloadOutlined, MailOutlined, TeamOutlined
} from '@ant-design/icons';
import axios from 'axios';

const { Text } = Typography;
const { Option } = Select;

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

// Level-based colors (higher level = more prominent)
const LEVEL_COLORS = {
  8: { bg: '#fff1f0', border: '#cf1322', text: '#cf1322', label: 'C-Level' },
  7: { bg: '#fff7e6', border: '#fa8c16', text: '#d46b08', label: 'Executive' },
  6: { bg: '#e6f7ff', border: '#1890ff', text: '#0050b3', label: 'Sr. Mgmt' },
  5: { bg: '#f6ffed', border: '#52c41a', text: '#389e0d', label: 'Mid Mgmt' },
  4: { bg: '#f9f0ff', border: '#722ed1', text: '#531dab', label: 'Jr. Mgmt' },
  3: { bg: '#e6fffb', border: '#13c2c2', text: '#006d75', label: 'Sr. Prof' },
  2: { bg: '#fff0f6', border: '#eb2f96', text: '#c41d7f', label: 'Prof' },
  1: { bg: '#fafafa', border: '#8c8c8c', text: '#595959', label: 'Entry' }
};

const EnhancedOrgChart = ({ compact = false }) => {
  const [orgData, setOrgData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [zoom, setZoom] = useState(0.85);
  const [showRoles, setShowRoles] = useState(true);
  const [showLines, setShowLines] = useState(true);
  const [filterDepartment, setFilterDepartment] = useState(null);
  const chartRef = useRef(null);
  const nodeRefs = useRef({});

  const departments = [...new Set(orgData.filter(e => e.department).map(e => e.department))];

  // Fetch org chart data
  const fetchOrgChart = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await axios.get(
        `${API_BASE_URL}/api/unified-users/org-chart`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        const flatData = flattenTree(response.data.orgChart);
        setOrgData(flatData);
      }
    } catch (error) {
      console.error('Error fetching org chart:', error);
      message.error('Failed to load organization chart');
    } finally {
      setLoading(false);
    }
  }, []);

  const flattenTree = (nodes, result = []) => {
    nodes.forEach(node => {
      result.push(node);
      if (node.children && node.children.length > 0) {
        flattenTree(node.children, result);
      }
    });
    return result;
  };

  useEffect(() => {
    fetchOrgChart();
  }, [fetchOrgChart]);

  // Group employees by level
  const groupByLevel = (employees) => {
    const filtered = filterDepartment
      ? employees.filter(e => e.department === filterDepartment)
      : employees;

    const levels = {};
    filtered.forEach(emp => {
      const level = emp.designation_level || 1;
      if (!levels[level]) levels[level] = [];
      levels[level].push(emp);
    });

    // Sort each level by name
    Object.keys(levels).forEach(lvl => {
      levels[lvl].sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
    });

    return levels;
  };

  // Get reporting relationships for drawing lines
  const getReportingLines = () => {
    const lines = [];
    orgData.forEach(emp => {
      if (emp.reports_to) {
        const manager = orgData.find(m => m.id === emp.reports_to);
        if (manager) {
          lines.push({ from: manager.id, to: emp.id });
        }
      }
    });
    return lines;
  };

  const levelGroups = groupByLevel(orgData);
  const sortedLevels = Object.keys(levelGroups).sort((a, b) => parseInt(b) - parseInt(a));
  const reportingLines = getReportingLines();
  const totalActive = orgData.length;

  // Employee card component
  const EmployeeCard = ({ person }) => {
    const level = person.designation_level || 1;
    const colors = LEVEL_COLORS[level] || LEVEL_COLORS[1];
    const nodeWidth = compact ? 150 : 180;

    return (
      <div
        ref={el => nodeRefs.current[person.id] = el}
        className="org-node"
        onClick={() => {
          setSelectedPerson(person);
          setDetailModalVisible(true);
        }}
        style={{
          width: nodeWidth,
          padding: compact ? '8px 10px' : '12px 14px',
          backgroundColor: colors.bg,
          border: `2px solid ${colors.border}`,
          borderRadius: 10,
          cursor: 'pointer',
          boxShadow: '0 3px 10px rgba(0,0,0,0.08)',
          transition: 'all 0.3s ease',
          position: 'relative',
          margin: '0 8px'
        }}
      >
        {/* Level badge */}
        <div
          style={{
            position: 'absolute',
            top: -8,
            right: -8,
            backgroundColor: colors.border,
            color: '#fff',
            borderRadius: '50%',
            width: 22,
            height: 22,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            fontWeight: 'bold',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}
        >
          L{level}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Avatar
            src={person.photo_url}
            icon={<UserOutlined />}
            size={compact ? 32 : 40}
            style={{
              backgroundColor: colors.border,
              border: '2px solid #fff',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontWeight: 600,
              fontSize: compact ? 11 : 12,
              color: '#262626',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {person.full_name}
            </div>
            <Text
              type="secondary"
              style={{
                fontSize: compact ? 9 : 10,
                display: 'block',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              {person.designation_name || 'No title'}
            </Text>
            {showRoles && person.system_role && (
              <Tag
                size="small"
                style={{
                  marginTop: 3,
                  fontSize: 8,
                  padding: '0 4px',
                  backgroundColor: '#fff',
                  borderColor: colors.border,
                  color: colors.text
                }}
              >
                {person.system_role.replace(/_/g, ' ').toUpperCase()}
              </Tag>
            )}
          </div>
        </div>

        {person.department && (
          <div style={{
            marginTop: 6,
            fontSize: 9,
            color: '#8c8c8c',
            display: 'flex',
            alignItems: 'center',
            gap: 3
          }}>
            <TeamOutlined /> {person.department}
          </div>
        )}

        {/* Reports to indicator */}
        {person.reports_to && (
          <div
            style={{
              position: 'absolute',
              top: -6,
              left: 8,
              backgroundColor: '#52c41a',
              color: '#fff',
              borderRadius: 6,
              padding: '1px 5px',
              fontSize: 8,
              fontWeight: 500
            }}
          >
            ↑
          </div>
        )}
      </div>
    );
  };

  // State for SVG reporting lines - must be at top level
  const [linePositions, setLinePositions] = useState([]);

  // Calculate line positions
  useEffect(() => {
    if (!showLines || reportingLines.length === 0) {
      setLinePositions([]);
      return;
    }

    const calculateLines = () => {
      const newLines = [];
      const container = chartRef.current;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();

      reportingLines.forEach(({ from, to }) => {
        const fromNode = nodeRefs.current[from];
        const toNode = nodeRefs.current[to];

        if (fromNode && toNode) {
          const fromRect = fromNode.getBoundingClientRect();
          const toRect = toNode.getBoundingClientRect();

          const fromX = (fromRect.left + fromRect.width / 2 - containerRect.left) / zoom;
          const fromY = (fromRect.bottom - containerRect.top) / zoom;
          const toX = (toRect.left + toRect.width / 2 - containerRect.left) / zoom;
          const toY = (toRect.top - containerRect.top) / zoom;

          newLines.push({ fromX, fromY, toX, toY });
        }
      });

      setLinePositions(newLines);
    };

    const timer = setTimeout(calculateLines, 100);
    return () => clearTimeout(timer);
  }, [orgData, zoom, filterDepartment, showLines, reportingLines]);

  // SVG lines component (no hooks inside)
  const ReportingLinesSVG = () => {
    if (!showLines || linePositions.length === 0) return null;

    return (
      <svg
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 0
        }}
      >
        {linePositions.map((line, idx) => (
          <g key={idx}>
            {/* Curved line */}
            <path
              d={`M ${line.fromX} ${line.fromY} 
                  C ${line.fromX} ${line.fromY + 30}, 
                    ${line.toX} ${line.toY - 30}, 
                    ${line.toX} ${line.toY}`}
              fill="none"
              stroke="#91d5ff"
              strokeWidth="2"
              strokeDasharray="5,3"
            />
            {/* Arrow at end */}
            <circle cx={line.toX} cy={line.toY} r="4" fill="#1890ff" />
          </g>
        ))}
      </svg>
    );
  };

  return (
    <div className="enhanced-org-chart">
      {/* Controls */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space>
              <Text strong><ApartmentOutlined /> Organization Chart</Text>
              <Tag color="green">{totalActive} active</Tag>
              {reportingLines.length > 0 && (
                <Tag color="blue">{reportingLines.length} reporting lines</Tag>
              )}
            </Space>
          </Col>
          <Col>
            <Space>
              <span>Roles:</span>
              <Switch checked={showRoles} onChange={setShowRoles} size="small" />
              <span>Lines:</span>
              <Switch checked={showLines} onChange={setShowLines} size="small" />
              <Select
                placeholder="Department"
                allowClear
                size="small"
                style={{ width: 130 }}
                value={filterDepartment}
                onChange={setFilterDepartment}
              >
                {departments.map(d => (
                  <Option key={d} value={d}>{d}</Option>
                ))}
              </Select>
              <Button.Group size="small">
                <Tooltip title="Zoom Out">
                  <Button icon={<ZoomOutOutlined />} onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} />
                </Tooltip>
                <Tooltip title="Reset">
                  <Button icon={<ExpandOutlined />} onClick={() => setZoom(0.85)} />
                </Tooltip>
                <Tooltip title="Zoom In">
                  <Button icon={<ZoomInOutlined />} onClick={() => setZoom(z => Math.min(1.5, z + 0.1))} />
                </Tooltip>
              </Button.Group>
              <Tooltip title="Refresh">
                <Button icon={<ReloadOutlined />} size="small" onClick={fetchOrgChart} loading={loading} />
              </Tooltip>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Legend */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Text type="secondary">Levels:</Text>
          {Object.entries(LEVEL_COLORS).reverse().map(([level, colors]) => (
            <Tag
              key={level}
              style={{
                backgroundColor: colors.bg,
                borderColor: colors.border,
                color: colors.text
              }}
            >
              L{level}: {colors.label}
            </Tag>
          ))}
        </Space>
      </Card>

      {/* Chart Area */}
      <Card
        style={{
          minHeight: 500,
          overflow: 'auto',
          backgroundColor: '#f8f9fa',
          backgroundImage: 'linear-gradient(#e9ecef 1px, transparent 1px), linear-gradient(90deg, #e9ecef 1px, transparent 1px)',
          backgroundSize: '20px 20px'
        }}
      >
        <Spin spinning={loading}>
          <div
            ref={chartRef}
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'top center',
              padding: 30,
              minHeight: 400,
              position: 'relative'
            }}
          >
            <ReportingLinesSVG />

            {sortedLevels.length > 0 ? (
              <div style={{ position: 'relative', zIndex: 1 }}>
                {sortedLevels.map(level => (
                  <div key={level} style={{ marginBottom: 40 }}>
                    {/* Level header */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      marginBottom: 15,
                      paddingLeft: 10
                    }}>
                      <Tag
                        style={{
                          backgroundColor: LEVEL_COLORS[level]?.bg,
                          borderColor: LEVEL_COLORS[level]?.border,
                          color: LEVEL_COLORS[level]?.text,
                          fontWeight: 'bold'
                        }}
                      >
                        Level {level} - {LEVEL_COLORS[level]?.label || 'Other'}
                      </Tag>
                      <div style={{
                        flex: 1,
                        height: 1,
                        backgroundColor: LEVEL_COLORS[level]?.border || '#d9d9d9',
                        marginLeft: 10,
                        opacity: 0.3
                      }} />
                    </div>

                    {/* Employees in this level - horizontal row */}
                    <div style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      justifyContent: 'center',
                      gap: 16,
                      padding: '0 20px'
                    }}>
                      {levelGroups[level].map(person => (
                        <EmployeeCard key={person.id} person={person} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 80 }}>
                <ApartmentOutlined style={{ fontSize: 64, color: '#d9d9d9' }} />
                <div style={{ marginTop: 20 }}>
                  <Text type="secondary" style={{ fontSize: 16 }}>
                    No employees found.
                    <br />
                    Add employees in Employee Management.
                  </Text>
                </div>
              </div>
            )}
          </div>
        </Spin>
      </Card>

      {/* Person Detail Modal */}
      <Modal
        title={
          <Space>
            <Avatar
              src={selectedPerson?.photo_url}
              icon={<UserOutlined />}
              size={48}
              style={{
                backgroundColor: LEVEL_COLORS[selectedPerson?.designation_level || 1]?.border
              }}
            />
            <div>
              <div style={{ fontWeight: 600 }}>{selectedPerson?.full_name}</div>
              <Text type="secondary" style={{ fontSize: 13 }}>
                {selectedPerson?.designation_name}
              </Text>
            </div>
          </Space>
        }
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailModalVisible(false)}>
            Close
          </Button>
        ]}
        width={500}
      >
        {selectedPerson && (
          <Descriptions column={1} bordered size="small" style={{ marginTop: 16 }}>
            <Descriptions.Item label="Full Name">
              {selectedPerson.full_name}
            </Descriptions.Item>
            <Descriptions.Item label="Designation">
              <Space>
                {selectedPerson.designation_name || '—'}
                <Tag color="blue">Level {selectedPerson.designation_level || '?'}</Tag>
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="Department">
              {selectedPerson.department || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Email">
              {selectedPerson.email ? (
                <a href={`mailto:${selectedPerson.email}`}>
                  <MailOutlined /> {selectedPerson.email}
                </a>
              ) : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="System Role">
              {selectedPerson.system_role ? (
                <Tag color="green">
                  {selectedPerson.system_role.replace(/_/g, ' ').toUpperCase()}
                </Tag>
              ) : (
                <Text type="secondary">No system access</Text>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Reports To">
              {selectedPerson.reports_to ? (
                (() => {
                  const manager = orgData.find(m => m.id === selectedPerson.reports_to);
                  return manager ? (
                    <Tag color="orange">{manager.full_name}</Tag>
                  ) : '—';
                })()
              ) : (
                <Text type="secondary">No reporting line set</Text>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Divisions">
              {selectedPerson.divisions && selectedPerson.divisions.length > 0 ? (
                <Space wrap>
                  {selectedPerson.divisions.map((d, i) => (
                    <Tag key={i} color="purple">{d}</Tag>
                  ))}
                </Space>
              ) : '—'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      <style>{`
        .org-node:hover {
          box-shadow: 0 6px 20px rgba(0,0,0,0.15) !important;
          transform: translateY(-2px);
        }
        .enhanced-org-chart .ant-card-body {
          padding: 16px;
        }
      `}</style>
    </div>
  );
};

export default EnhancedOrgChart;
