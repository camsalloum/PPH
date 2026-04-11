import React, { useCallback, useEffect, useState } from 'react';
import { App, Button, Empty, List, Modal, Select, Space, Spin, Tag, Typography } from 'antd';
import { ArrowRightOutlined, PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import dayjs from 'dayjs';

const { Text } = Typography;
const API_BASE = import.meta.env.VITE_API_URL ?? '';

const STATUS_COLORS = {
  planning: 'default',
  confirmed: 'blue',
  in_progress: 'gold',
  completed: 'green',
  cancelled: 'red',
};

const CustomerFieldVisits = ({ customerId }) => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [addVisible, setAddVisible] = useState(false);
  const [adding, setAdding] = useState(false);
  const [candidateTrips, setCandidateTrips] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState(null);

  const loadCandidateTrips = useCallback(async () => {
    const token = localStorage.getItem('auth_token');
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const [planningRes, confirmedRes] = await Promise.allSettled([
        axios.get(`${API_BASE}/api/crm/field-trips`, { headers, params: { status: 'planning', limit: 100 } }),
        axios.get(`${API_BASE}/api/crm/field-trips`, { headers, params: { status: 'confirmed', limit: 100 } }),
      ]);

      const planning = planningRes.status === 'fulfilled' ? (planningRes.value?.data?.data || []) : [];
      const confirmed = confirmedRes.status === 'fulfilled' ? (confirmedRes.value?.data?.data || []) : [];
      const merged = [...planning, ...confirmed];
      const unique = Array.from(new Map(merged.map((t) => [t.id, t])).values());

      setCandidateTrips(unique.map((t) => ({
        value: t.id,
        label: `${t.title} (${t.status || 'planning'})`,
      })));
    } catch (_) {
      setCandidateTrips([]);
    }
  }, []);

  const loadTrips = useCallback(async () => {
    if (!customerId) {
      setItems([]);
      setLoading(false);
      return;
    }

    const token = localStorage.getItem('auth_token');
    const headers = { Authorization: `Bearer ${token}` };

    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/crm/field-trips`, {
        headers,
        params: { customerId, limit: 20 },
      });

      const trips = Array.isArray(res.data?.data) ? res.data.data : [];
      if (trips.length === 0) {
        setItems([]);
        return;
      }

      const detailSettled = await Promise.allSettled(
        trips.map((trip) => axios.get(`${API_BASE}/api/crm/field-trips/${trip.id}`, { headers }))
      );

      const enriched = trips.map((trip, idx) => {
        const detail = detailSettled[idx]?.status === 'fulfilled'
          ? detailSettled[idx].value?.data?.data
          : null;
        const stops = Array.isArray(detail?.stops) ? detail.stops : [];
        const customerStops = stops.filter((s) => Number(s.customer_id) === Number(customerId));
        const latestStop = customerStops.sort((a, b) => {
          const aDate = dayjs(a.visit_date || '1900-01-01').valueOf();
          const bDate = dayjs(b.visit_date || '1900-01-01').valueOf();
          return bDate - aDate;
        })[0] || null;

        return {
          ...trip,
          customerStopCount: customerStops.length,
          latestStop,
        };
      });

      setItems(enriched);
    } catch (_) {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  const addCustomerToTrip = async () => {
    if (!selectedTripId) {
      message.warning('Select a trip first.');
      return;
    }

    const token = localStorage.getItem('auth_token');
    const headers = { Authorization: `Bearer ${token}` };
    setAdding(true);
    try {
      const customerRes = await axios.get(`${API_BASE}/api/crm/customers/${customerId}`, { headers }).catch(() => null);
      const customer = customerRes?.data?.data || {};

      await axios.post(
        `${API_BASE}/api/crm/field-trips/${selectedTripId}/stops`,
        {
          stop_type: 'customer',
          customer_id: customerId,
          latitude: customer.latitude || null,
          longitude: customer.longitude || null,
          address_snapshot: [
            customer.address_line1,
            customer.city,
            customer.primary_country || customer.country,
          ].filter(Boolean).join(', '),
          duration_mins: 60,
          objectives: 'Added from customer profile',
        },
        { headers }
      );

      message.success('Customer added to trip stop list.');
      setAddVisible(false);
      setSelectedTripId(null);
      loadTrips();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to add customer to trip');
    } finally {
      setAdding(false);
    }
  };

  useEffect(() => {
    loadTrips();
  }, [loadTrips]);

  if (loading) return <Spin />;

  if (items.length === 0) {
    return (
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No field visits linked to this customer yet.">
        <Space wrap>
          <Button type="primary" onClick={() => navigate('/crm/visits/new')}>Plan a Visit</Button>
          <Button
            icon={<PlusOutlined />}
            onClick={() => {
              setAddVisible(true);
              loadCandidateTrips();
            }}
          >
            Add to Existing Trip
          </Button>
        </Space>
      </Empty>
    );
  }

  return (
    <>
      <Space style={{ width: '100%', justifyContent: 'flex-end', marginBottom: 8 }}>
        <Button
          icon={<PlusOutlined />}
          onClick={() => {
            setAddVisible(true);
            loadCandidateTrips();
          }}
        >
          Add to Existing Trip
        </Button>
      </Space>

      <List
        size="small"
        dataSource={items}
        renderItem={(trip) => (
          <List.Item
            actions={[
              <Button key="open" type="link" icon={<ArrowRightOutlined />} onClick={() => navigate(`/crm/visits/${trip.id}`)}>
                Open
              </Button>,
            ]}
          >
            <List.Item.Meta
              title={
                <Space wrap>
                  <Text strong>{trip.title}</Text>
                  <Tag color={STATUS_COLORS[trip.status] || 'default'}>{trip.status}</Tag>
                  <Tag color="blue">Stops: {trip.customerStopCount || 0}</Tag>
                  {trip.latestStop?.outcome_status ? (
                    <Tag color={trip.latestStop.outcome_status === 'visited' ? 'green' : trip.latestStop.outcome_status === 'no_show' ? 'red' : 'orange'}>
                      {trip.latestStop.outcome_status}
                    </Tag>
                  ) : null}
                </Space>
              }
              description={
                <Space direction="vertical" size={0}>
                  <Text type="secondary">
                    {trip.departure_date ? dayjs(trip.departure_date).format('DD MMM YYYY') : '-'} to {trip.return_date ? dayjs(trip.return_date).format('DD MMM YYYY') : '-'}
                  </Text>
                  {trip.latestStop ? (
                    <Text type="secondary">
                      Latest visit: {trip.latestStop.visit_date ? dayjs(trip.latestStop.visit_date).format('DD MMM YYYY') : 'TBD'}
                      {trip.latestStop.outcome_notes ? ` | ${String(trip.latestStop.outcome_notes).slice(0, 120)}` : ''}
                    </Text>
                  ) : null}
                </Space>
              }
            />
          </List.Item>
        )}
      />

      <Modal
        title="Add Customer To Existing Trip"
        open={addVisible}
        onCancel={() => {
          setAddVisible(false);
          setSelectedTripId(null);
        }}
        onOk={addCustomerToTrip}
        confirmLoading={adding}
        okText="Add Stop"
      >
        <Select
          style={{ width: '100%' }}
          placeholder="Select planning/confirmed trip"
          value={selectedTripId}
          onChange={setSelectedTripId}
          options={candidateTrips}
          showSearch
          optionFilterProp="label"
        />
      </Modal>
    </>
  );
};

export default CustomerFieldVisits;
