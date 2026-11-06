import { APIRequestContext, APIResponse, expect } from '@playwright/test';
import { env } from '../config/env';
import {
  ConsolidatedDish,
  Dish,
  GroupInvite,
  GroupSessions,
  GuestSession,
  OrderResponse,
  Reservation,
  Tokens,
  UserProfile,
} from './models';

type Body = Record<string, unknown> | unknown[] | undefined;

/**
 * Thin client over the deployed API Gateway stage.
 * Every method returns the raw APIResponse so tests can assert status codes (negative scenarios),
 * and `*OrFail` helpers unwrap the JSON for data preparation.
 */
export class ApiClient {
  constructor(private readonly request: APIRequestContext) {}

  private url(path: string): string {
    return `${env.apiBaseUrl}${path}`;
  }

  /**
   * Sends a request; transient throttling of the environment (Lambda concurrency limit → API Gateway
   * `{"message":"Internal server error"}`, 429/502/503/504) is retried with backoff so it does not
   * masquerade as a functional failure. Application errors (`{"error": ...}`) are never retried.
   */
  async send(method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH', path: string, token?: string, body?: Body): Promise<APIResponse> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    let response!: APIResponse;
    for (let attempt = 1; attempt <= 4; attempt++) {
      response = await this.request.fetch(this.url(path), { method, headers, data: body, timeout: 60_000 });
      if (!(await ApiClient.isTransient(response))) return response;
      await new Promise((resolve) => setTimeout(resolve, 1_000 * attempt));
    }
    return response;
  }

  private static async isTransient(response: APIResponse): Promise<boolean> {
    if ([429, 502, 503, 504].includes(response.status())) return true;
    if (response.status() !== 500) return false;
    const text = await response.text();
    return text.includes('"message"') && text.includes('Internal server error');
  }

  static async json<T>(response: APIResponse, expectedStatus: number | number[] = [200, 201]): Promise<T> {
    const allowed = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
    const text = await response.text();
    expect(allowed, `${response.url()} -> ${response.status()} ${text}`).toContain(response.status());
    return (text ? JSON.parse(text) : undefined) as T;
  }

  // ---------- Auth ----------
  register(firstName: string, lastName: string, email: string, password: string) {
    return this.send('POST', '/register', undefined, { firstName, lastName, email, password, confirmPassword: password });
  }

  signIn(email: string, password: string) {
    return this.send('POST', '/signin', undefined, { email, password });
  }

  async signInOrFail(email: string, password: string): Promise<Tokens> {
    const body = await ApiClient.json<Tokens>(await this.signIn(email, password), 200);
    return { idToken: body.idToken, accessToken: body.accessToken };
  }

  async meOrFail(token: string): Promise<UserProfile> {
    return ApiClient.json<UserProfile>(await this.send('GET', '/me', token), 200);
  }

  // ---------- Menu & tables ----------
  async dishesOrFail(locationId = env.locationId): Promise<Dish[]> {
    const body = await ApiClient.json<unknown>(await this.send('GET', `/locations/${locationId}/dishes`), 200);
    const list = Array.isArray(body) ? body : ((body as Record<string, unknown>).content ?? (body as Record<string, unknown>).items ?? []);
    return list as Dish[];
  }

  async availableTablesOrFail(
    token: string,
    guests: number,
    startTime: string,
    locationId = env.locationId,
  ): Promise<{ id: string; capacity: number; tableNumber: number }[]> {
    const query = `locationId=${locationId}&capacity=${guests}&startTime=${encodeURIComponent(startTime)}`;
    return ApiClient.json(await this.send('GET', `/available-tables?${query}`, token), 200);
  }

  // ---------- Restaurant set-up (used by isolated test locations) ----------
  async createLocationOrFail(address: string): Promise<{ id: string }> {
    return ApiClient.json(
      await this.send('POST', '/locations', undefined, {
        address,
        description: 'Temporary location created by e2e tests',
        totalCapacity: 6,
        averageOccupancy: '0%',
        rating: 5,
      }),
      [200, 201],
    );
  }

  async createTableOrFail(locationId: string, tableNumber: number, capacity: number): Promise<{ id: string }> {
    return ApiClient.json(await this.send('POST', '/tables', undefined, { locationId, tableNumber, capacity }), [200, 201]);
  }

  async createDishOrFail(locationId: string, name: string, price: number): Promise<Dish> {
    return ApiClient.json(
      await this.send('POST', '/dishes', undefined, {
        name,
        description: 'Dish created by e2e tests',
        dishType: 'MainCourse',
        price,
        weight: '300 g',
        calories: '300 kcal',
        proteins: '10 g',
        fats: '10 g',
        carbohydrates: '30 g',
        vitamins: 'A',
        state: 'Available',
        locationIds: [locationId],
      }),
      [200, 201],
    );
  }

  async addWaiterOrFail(email: string, locationId: string): Promise<void> {
    await ApiClient.json(await this.send('POST', '/waiters', undefined, { email, locationId }), 200);
  }

  removeWaiter(email: string, locationId: string) {
    return this.send('DELETE', '/waiters', undefined, { email, locationId });
  }

  deleteDish(dishId: string, token: string) {
    return this.send('DELETE', `/dishes/${dishId}`, token);
  }

  /** Requires the Waiter role. */
  deleteTable(tableId: string, token: string) {
    return this.send('DELETE', `/tables/${tableId}`, token);
  }

  deleteLocation(locationId: string, token: string) {
    return this.send('DELETE', `/locations/${locationId}?force=true`, token);
  }

  // ---------- Reservations ----------
  createReservation(token: string, tableId: string, startTime: string, endTime: string, guestCount: number) {
    return this.send('POST', '/reservations', token, { tableId, startTime, endTime, guestCount });
  }

  cancelReservation(token: string, reservationId: string) {
    return this.send('DELETE', '/reservations', token, { id: reservationId });
  }

  async inviteOrFail(token: string, reservationId: string): Promise<GroupInvite> {
    const { token: inviteToken } = await ApiClient.json<{ token: string }>(
      await this.send('GET', `/reservations/${reservationId}/invite-token`, token),
      200,
    );
    return ApiClient.json<GroupInvite>(await this.send('GET', `/guest/invites/${inviteToken}`), 200);
  }

  // ---------- Guests (invite link flow) ----------
  async joinGroupOrFail(groupReservationId: string, guestName: string): Promise<GuestSession> {
    const body = await ApiClient.json<Record<string, string>>(
      await this.send('POST', '/guest/sessions', undefined, { groupReservationId, guestName }),
      [200, 201],
    );
    return { id: body.SessionId ?? body.sessionId, token: body.SessionToken ?? body.sessionToken, name: guestName };
  }

  async addGuestDishOrFail(guest: GuestSession, dishId: string, quantity: number): Promise<void> {
    await ApiClient.json(await this.send('POST', `/guest/sessions/${guest.id}/dishes`, guest.token, { dishId, quantity }), 200);
  }

  async removeGuestDishOrFail(guest: GuestSession, dishId: string, quantity: number): Promise<void> {
    await ApiClient.json(await this.send('DELETE', `/guest/sessions/${guest.id}/dishes`, guest.token, { dishId, quantity }), 200);
  }

  async submitGuestCartOrFail(guest: GuestSession): Promise<void> {
    await ApiClient.json(await this.send('POST', `/guest/sessions/${guest.id}/submit`, guest.token), 200);
  }

  // ---------- Owner pre-order (regular order of the reservation) ----------
  async createOwnerOrderOrFail(token: string, reservationId: string, items: { dishId: string; quantity: number }[]): Promise<void> {
    await ApiClient.json(await this.send('POST', '/orders', token, { reservationId, orderItems: items }), [200, 201]);
  }

  async submitOwnerOrderOrFail(token: string, reservationId: string): Promise<void> {
    await ApiClient.json(await this.send('POST', `/orders/${reservationId}/submit`, token), 200);
  }

  getOrder(token: string, reservationId: string) {
    return this.send('GET', `/orders/${reservationId}`, token);
  }

  // ---------- Group pre-order (homework endpoints) ----------
  getSessions(groupReservationId: string, token?: string) {
    return this.send('GET', `/guest/groups/${groupReservationId}/sessions`, token);
  }

  async getSessionsOrFail(groupReservationId: string, token: string): Promise<GroupSessions> {
    return ApiClient.json<GroupSessions>(await this.getSessions(groupReservationId, token), 200);
  }

  getOwnerSessionId(reservationId: string, token?: string) {
    return this.send('GET', `/reservations/${reservationId}/guest-session-id`, token);
  }

  getStatus(groupReservationId: string) {
    return this.send('GET', `/guest/groups/${groupReservationId}/status`);
  }

  submitGroup(groupReservationId: string, reservationId: string, token?: string) {
    return this.send('POST', `/group-reservations/${groupReservationId}/submit`, token, { reservationId });
  }

  async submitGroupOrFail(groupReservationId: string, reservationId: string, token: string): Promise<ConsolidatedDish[]> {
    return ApiClient.json<ConsolidatedDish[]>(await this.submitGroup(groupReservationId, reservationId, token), 200);
  }

  removeGuest(groupReservationId: string, guestSessionId: string, token?: string) {
    return this.send('DELETE', `/guest/groups/${groupReservationId}/sessions/${guestSessionId}`, token);
  }

  async orderOrFail(token: string, reservationId: string): Promise<OrderResponse> {
    return ApiClient.json<OrderResponse>(await this.getOrder(token, reservationId), 200);
  }
}

export type { Reservation };
