/**
 * useCrmOptions — shared hook to load customer + prospect lists
 * for searchable dropdowns in create modals (Task, Meeting, Call).
 *
 * Returns { customers, prospects, loading }
 * Each item: { value: id, label: "Name (Country)" }
 */
import { useState, useEffect } from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL ?? '';

export default function useCrmOptions(enabled = true) {
  const [customers, setCustomers] = useState([]);
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const token = localStorage.getItem('auth_token');
    const headers = { Authorization: `Bearer ${token}` };
    const get = (url) => axios.get(`${API}${url}`, { headers, timeout: 8000 }).catch(() => ({ data: { data: {} } }));

    Promise.all([
      get('/api/crm/my-customers'),
      get('/api/crm/my-prospects'),
    ]).then(([cRes, pRes]) => {
      const custs = cRes.data?.data?.customers || [];
      setCustomers(custs.map(c => ({
        value: c.id,
        label: `${c.customer_name}${c.country ? ` (${c.country})` : ''}`,
      })));
      const prsp = pRes.data?.data?.prospects || pRes.data?.data || [];
      setProspects((Array.isArray(prsp) ? prsp : []).map(p => ({
        value: p.id,
        label: `${p.customer_name || p.name}${p.country ? ` (${p.country})` : ''}`,
      })));
    }).finally(() => setLoading(false));
  }, [enabled]);

  return { customers, prospects, loading };
}
