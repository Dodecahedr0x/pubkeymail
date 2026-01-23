import { apiRequest } from './client';

export interface ForwardingRule {
  id: number;
  userId: number;
  destinationEmail: string;
  enabled: boolean;
  verified: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function getForwardingRules() {
  return apiRequest<{ rules: ForwardingRule[] }>('/forwarding/rules');
}

export async function createForwardingRule(data: { destinationEmail: string }) {
  return apiRequest<{ rule: ForwardingRule }>(
    '/forwarding/rules',
    { method: 'POST', body: JSON.stringify(data) }
  );
}

export async function updateForwardingRule(id: number, data: { enabled?: boolean }) {
  return apiRequest<{ rule: ForwardingRule }>(
    `/forwarding/rules/${id}`,
    { method: 'PUT', body: JSON.stringify(data) }
  );
}

export async function deleteForwardingRule(id: number) {
  return apiRequest<{ success: boolean }>(
    `/forwarding/rules/${id}`,
    { method: 'DELETE' }
  );
}
