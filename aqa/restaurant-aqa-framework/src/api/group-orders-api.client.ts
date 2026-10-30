import { APIRequestContext, expect } from '@playwright/test';

export interface Dish {
  id: string;
  name: string;
  price: number;
}

export interface ParticipantItem {
  dish: Dish;
  quantity: number;
}

export interface Participant {
  id: string;
  name: string;
  type: 'Owner' | 'Guest';
  isSubmitted: boolean;
  total: number;
  items: ParticipantItem[];
}

export interface GroupSessionsResponse {
  participants: Participant[];
  total: number;
}

export class GroupOrdersApiClient {
  constructor(private request: APIRequestContext, private baseUrl: string = process.env.API_BASE_URL || 'http://localhost:5000/api') {}

  async getSessions(reservationId: string, token?: string) {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return await this.request.get(`${this.baseUrl}/guest/groups/${reservationId}/sessions`, { headers });
  }

  async submitGroupOrder(reservationId: string, token?: string) {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return await this.request.post(`${this.baseUrl}/guest/groups/${reservationId}/submit`, { headers });
  }

  async removeGuest(reservationId: string, guestSessionId: string, token?: string) {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return await this.request.delete(`${this.baseUrl}/guest/groups/${reservationId}/sessions/${guestSessionId}`, { headers });
  }
}