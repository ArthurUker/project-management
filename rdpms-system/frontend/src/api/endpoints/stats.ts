import { get, requestPaged } from '../request';

export interface StatsQuery {
  startDate?: string;
  endDate?: string;
  projectId?: string;
}

export const statsAPI = {
  dashboard: () => get<unknown>('/stats/dashboard'),
  projects: (params?: StatsQuery) =>
    requestPaged<unknown>({ method: 'GET', url: '/stats/projects', params }),
  workload: (userId: string) => get<unknown>(`/stats/users/${userId}/workload`),
  reports: (params?: StatsQuery) =>
    requestPaged<unknown>({ method: 'GET', url: '/stats/reports', params }),
};
