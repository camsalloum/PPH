import React, { useEffect, useState } from 'react';
import { App, Button, Col, Form, Input, InputNumber, Modal, Row, Select, Upload } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { fetchCountries } from '../../services/countriesService';
import { API_BASE, getAuthHeaders } from './fieldVisitUtils';

const EXPENSE_CATEGORIES = [
  { value: 'flight', label: 'Flight' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'transport', label: 'Ground Transport' },
  { value: 'meals', label: 'Meals & Entertainment' },
  { value: 'visa', label: 'Visa / Entry Fees' },
  { value: 'parking', label: 'Parking / Tolls' },
  { value: 'gift', label: 'Customer Gift' },
  { value: 'communication', label: 'Communication / SIM' },
  { value: 'fuel', label: 'Fuel' },
  { value: 'conference', label: 'Conference / Exhibition' },
  { value: 'other', label: 'Other' },
];

const MAJOR_CURRENCIES = ['AED', 'USD', 'EUR', 'GBP', 'SAR', 'KWD', 'BHD', 'QAR', 'OMR', 'INR', 'CNY'];

const normalizeCountryKey = (value) => String(value || '').trim().toLowerCase();

const FieldVisitExpenseModal = ({ open, tripId, onClose, onSaved }) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [fxRates, setFxRates] = useState({ AED: 1 });
  const [baseCurrency, setBaseCurrency] = useState('AED');
  const [currencyOptions, setCurrencyOptions] = useState(MAJOR_CURRENCIES);
  const [fileList, setFileList] = useState([]);
  const [basePreview, setBasePreview] = useState(null);

  useEffect(() => {
    if (!open) return;
    let mounted = true;

    const buildCurrencyOptions = ({ currencies, countries, trip }) => {
      const codeSet = new Set(MAJOR_CURRENCIES);

      (Array.isArray(currencies) ? currencies : []).forEach((curr) => {
        const code = String(curr?.code || '').trim().toUpperCase();
        if (code) codeSet.add(code);
      });

      const countryToCurrency = new Map();
      (Array.isArray(countries) ? countries : []).forEach((countryRow) => {
        const code = String(countryRow?.currency_code || '').trim().toUpperCase();
        if (!code) return;

        const keys = [
          countryRow?.country_name,
          countryRow?.country_code_2,
          countryRow?.country_code_3,
        ]
          .map(normalizeCountryKey)
          .filter(Boolean);

        keys.forEach((key) => countryToCurrency.set(key, code));
      });

      const tripCountryKeys = new Set();
      const destinationCountries = Array.isArray(trip?.destination_countries) ? trip.destination_countries : [];

      destinationCountries.forEach((entry) => {
        if (typeof entry === 'string') {
          const key = normalizeCountryKey(entry);
          if (key) tripCountryKeys.add(key);
          return;
        }

        if (entry && typeof entry === 'object') {
          [entry.country, entry.country_name, entry.code, entry.country_code_2, entry.country_code_3]
            .map(normalizeCountryKey)
            .filter(Boolean)
            .forEach((key) => tripCountryKeys.add(key));
        }
      });

      (Array.isArray(trip?.stops) ? trip.stops : []).forEach((stop) => {
        [stop?.stop_country, stop?.country, stop?.country_code_2, stop?.country_code_3]
          .map(normalizeCountryKey)
          .filter(Boolean)
          .forEach((key) => tripCountryKeys.add(key));
      });

      tripCountryKeys.forEach((countryKey) => {
        const currencyCode = countryToCurrency.get(countryKey);
        if (currencyCode) codeSet.add(currencyCode);
      });

      const tripCurrencies = [];
      const tripCurrencySet = new Set();
      tripCountryKeys.forEach((countryKey) => {
        const currencyCode = countryToCurrency.get(countryKey);
        if (!currencyCode || tripCurrencySet.has(currencyCode)) return;
        tripCurrencySet.add(currencyCode);
        tripCurrencies.push(currencyCode);
      });

      const majorFirst = MAJOR_CURRENCIES.filter((code) => codeSet.has(code));
      const extras = [...codeSet]
        .filter((code) => !MAJOR_CURRENCIES.includes(code))
        .sort((a, b) => a.localeCompare(b));

      const tailCodes = [...majorFirst, ...extras].filter((code) => !tripCurrencySet.has(code));
      return [...tripCurrencies, ...tailCodes];
    };

    const loadExpenseReferences = async () => {
      const headers = getAuthHeaders();
      const [fxRes, currencyRes, countryRes, tripRes] = await Promise.allSettled([
        axios.get(`${API_BASE}/api/crm/field-trips/fx-rates`, { headers }),
        axios.get(`${API_BASE}/api/currency/list`, { headers }),
        fetchCountries({ active: true, withCurrency: true }).then(c => ({ data: { countries: c } })),
        axios.get(`${API_BASE}/api/crm/field-trips/${tripId}`, { headers }),
      ]);

      if (!mounted) return;

      if (fxRes.status === 'fulfilled' && fxRes.value?.data?.data) {
        const base = String(fxRes.value?.data?.base_currency || 'AED').toUpperCase();
        setBaseCurrency(base);
        setFxRates(fxRes.value.data.data);
      }

      const currencies = currencyRes.status === 'fulfilled' ? currencyRes.value?.data?.currencies : [];
      const countries = countryRes.status === 'fulfilled' ? countryRes.value?.data?.countries : [];
      const trip = tripRes.status === 'fulfilled' ? tripRes.value?.data?.data : null;

      const mergedOptions = buildCurrencyOptions({ currencies, countries, trip });
      setCurrencyOptions(mergedOptions.length ? mergedOptions : MAJOR_CURRENCIES);
    };

    loadExpenseReferences().catch(() => {
      if (!mounted) return;
      setBaseCurrency('AED');
      setFxRates({ AED: 1 });
      setCurrencyOptions(MAJOR_CURRENCIES);
    });

    return () => {
      mounted = false;
    };
  }, [form, open, tripId]);

  useEffect(() => {
    if (!open) return;
    const currentCurrency = form.getFieldValue('currency');
    if (!currentCurrency || !currencyOptions.includes(currentCurrency)) {
      form.setFieldsValue({ currency: baseCurrency });
    }
  }, [baseCurrency, currencyOptions, form, open]);

  const handleValuesChange = (_, all) => {
    const { amount, currency = baseCurrency } = all;
    if (amount && fxRates[currency]) {
      setBasePreview((parseFloat(amount) * (fxRates[currency] || 1)).toFixed(2));
    } else {
      setBasePreview(null);
    }
  };

  const handleSave = async () => {
    let vals;
    try { vals = await form.validateFields(); } catch { return; }
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('category', vals.category);
      formData.append('amount', String(vals.amount));
      formData.append('currency', vals.currency || 'AED');
      formData.append('expense_date', vals.expense_date ? dayjs(vals.expense_date).format('YYYY-MM-DD') : '');
      formData.append('description', vals.description || '');
      formData.append('notes', vals.notes || '');
      if (fileList[0]?.originFileObj) {
        formData.append('receipt', fileList[0].originFileObj);
      }
      await axios.post(
        `${API_BASE}/api/crm/field-trips/${tripId}/expenses/multi-currency`,
        formData,
        { headers: { ...getAuthHeaders(), 'Content-Type': 'multipart/form-data' } }
      );
      message.success('Expense saved');
      form.resetFields();
      setFileList([]);
      setBasePreview(null);
      if (onSaved) onSaved();
      onClose();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to save expense');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Add Expense"
      open={open}
      onCancel={onClose}
      onOk={handleSave}
      confirmLoading={saving}
      okText="Save Expense"
      width={520}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" initialValues={{ currency: baseCurrency }} onValuesChange={handleValuesChange}>
        <Form.Item name="category" label="Category" rules={[{ required: true, message: 'Select a category' }]}>
          <Select options={EXPENSE_CATEGORIES} placeholder="Select category" />
        </Form.Item>

        <Row gutter={12}>
          <Col span={14}>
            <Form.Item name="amount" label="Amount" rules={[{ required: true, message: 'Enter amount' }]}>
              <InputNumber style={{ width: '100%' }} min={0} precision={2} placeholder="0.00" />
            </Form.Item>
          </Col>
          <Col span={10}>
            <Form.Item name="currency" label="Currency">
              <Select options={currencyOptions.map(c => ({ value: c, label: c }))} />
            </Form.Item>
          </Col>
        </Row>

        {basePreview && (
          <div style={{ marginTop: -8, marginBottom: 12, color: '#1677ff', fontSize: 13 }}>
            ≈ {baseCurrency} {basePreview} (rate: {fxRates[form.getFieldValue('currency')] || 1})
          </div>
        )}

        <Form.Item name="expense_date" label="Date">
          <Input type="date" />
        </Form.Item>

        <Form.Item name="description" label="Description">
          <Input placeholder="e.g. Riyadh Airport taxi to hotel" />
        </Form.Item>

        <Form.Item name="notes" label="Notes (optional)">
          <Input.TextArea rows={2} placeholder="Any additional context" />
        </Form.Item>

        <Form.Item label="Receipt / Bill Upload">
          <Upload.Dragger
            beforeUpload={() => false}
            fileList={fileList}
            onChange={({ fileList: fl }) => setFileList(fl.slice(-1))}
            accept="image/*,application/pdf"
            maxCount={1}
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p style={{ fontSize: 13 }}>Click or drag receipt here (jpg, png, pdf — max 10MB)</p>
          </Upload.Dragger>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default FieldVisitExpenseModal;
