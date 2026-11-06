import { test, expect } from '../../fixtures/test';
import { ApiClient } from '../../api/api-client';

const UNKNOWN_ID = '00000000-0000-0000-0000-000000000000';

async function errorText(response: { json(): Promise<unknown> }): Promise<string> {
  const body = (await response.json()) as Record<string, string>;
  return body.error ?? body.message ?? '';
}

test.describe('Level 2 · GET /reservations/{id}/guest-session-id (API)', { tag: ['@level2', '@api'] }, () => {
  test('Owner gets the id of own session, the id is stable', async ({ scenario, api }) => {
    const first = await ApiClient.json<{ guestSessionId: string }>(await api.getOwnerSessionId(scenario.reservationId, scenario.ownerToken), 200);
    const second = await ApiClient.json<{ guestSessionId: string }>(await api.getOwnerSessionId(scenario.reservationId, scenario.ownerToken), 200);
    expect(first.guestSessionId).toBeTruthy();
    expect(second.guestSessionId).toBe(first.guestSessionId);
  });

  test('Another customer gets 403, unauthenticated 401, unknown reservation 404', async ({ scenario, stranger, api }) => {
    expect((await api.getOwnerSessionId(scenario.reservationId, stranger.tokens.idToken)).status()).toBe(403);
    expect((await api.getOwnerSessionId(scenario.reservationId)).status()).toBe(401);
    expect((await api.getOwnerSessionId(UNKNOWN_ID, stranger.tokens.idToken)).status()).toBe(404);
  });
});

test.describe('Level 2 · POST /group-reservations/{id}/submit — cannot submit (API)', { tag: ['@level2', '@api'] }, () => {
  test('No submitted cart → 400', async ({ scenario, api }) => {
    await scenario.ownerPreOrder([{ dish: scenario.dish(0), quantity: 1 }], false);
    await scenario.addGuest('Olena', [{ dish: scenario.dish(1), quantity: 1 }], false);

    const response = await api.submitGroup(scenario.groupId, scenario.reservationId, scenario.ownerToken);
    expect(response.status()).toBe(400);
    expect(await errorText(response)).toBe('No submitted sessions found.');
  });

  test('Order of the reservation not found → 400', async ({ scenario, api }) => {
    await scenario.addGuest('Andrii', [{ dish: scenario.dish(0), quantity: 1 }], true);

    const response = await api.submitGroup(scenario.groupId, scenario.reservationId, scenario.ownerToken);
    expect(response.status()).toBe(400);
    expect(await errorText(response)).toBe('Order not found.');
  });

  test('Group reservation does not exist → 404', async ({ scenario, api }) => {
    const response = await api.submitGroup(UNKNOWN_ID, scenario.reservationId, scenario.ownerToken);
    expect(response.status()).toBe(404);
  });

  test('Reservation does not exist → 404', async ({ scenario, api }) => {
    const response = await api.submitGroup(scenario.groupId, UNKNOWN_ID, scenario.ownerToken);
    expect(response.status()).toBe(404);
  });

  test('Repeated submit of an already submitted group → 400', async ({ scenario, api }) => {
    await scenario.ownerPreOrder([{ dish: scenario.dish(0), quantity: 1 }], true);
    await api.submitGroupOrFail(scenario.groupId, scenario.reservationId, scenario.ownerToken);

    const response = await api.submitGroup(scenario.groupId, scenario.reservationId, scenario.ownerToken);
    expect(response.status()).toBe(400);
    expect(await errorText(response)).toBe('Group reservation was submitted.');
  });

  test('Submit not by the Owner → 403, unauthenticated → 401', async ({ scenario, stranger, waiter, api }) => {
    await scenario.ownerPreOrder([{ dish: scenario.dish(0), quantity: 1 }], true);

    expect((await api.submitGroup(scenario.groupId, scenario.reservationId, stranger.tokens.idToken)).status()).toBe(403);
    expect((await api.submitGroup(scenario.groupId, scenario.reservationId, waiter.tokens.idToken)).status()).toBe(403);
    expect((await api.submitGroup(scenario.groupId, scenario.reservationId)).status()).toBe(401);

    // nothing was submitted by the rejected calls
    expect(await (await api.getStatus(scenario.groupId)).json()).toEqual(expect.objectContaining({ status: 'Open' }));
  });

  test('Successful submit returns dishes merged by dishId', async ({ scenario, api }) => {
    const [a, b] = [scenario.dish(0), scenario.dish(1)];
    await scenario.ownerPreOrder([{ dish: a, quantity: 1 }], true);
    await scenario.addGuest('Andrii', [{ dish: a, quantity: 2 }, { dish: b, quantity: 1 }], true);
    await scenario.addGuest('Olena', [{ dish: b, quantity: 4 }], false);

    const result = await api.submitGroupOrFail(scenario.groupId, scenario.reservationId, scenario.ownerToken);
    expect(result).toEqual(expect.arrayContaining([{ dishId: a.id, quantity: 3 }, { dishId: b.id, quantity: 1 }]));
    expect(result).toHaveLength(2);
  });
});
