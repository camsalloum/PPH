import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export function useSalesCube({ division = 'FP', groupId, year, enabled = true }) {
  return useQuery({
    queryKey: ['salesCube', division, groupId, year],
    queryFn: async () => {
      const token = localStorage.getItem('auth_token');
      const params = { year };
      if (groupId && groupId !== 'all') params.group_id = groupId;
      const res = await axios.get(`${API_BASE_URL}/api/crm/dashboard/stats`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
        timeout: 15000,
      });
      return res.data;
    },
    staleTime: 5 * 60 * 1000,    // 5 min — matches server cache TTL
    gcTime: 10 * 60 * 1000,      // keep in cache 10 min after unmount
    placeholderData: (prev) => prev, // show prev data while loading
    enabled,
    retry: 1,
  });
}
