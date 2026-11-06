import { test, expect } from '../../fixtures/test';
import { ApiClient } from '../../api/api-client';
import { GroupSessions } from '../../api/models';

test.describe('Level 1 · GET /guest/groups/{id}/sessions — access and validation (API)', { tag: ['@level1', '@api'] }, () => {
  test('Group without participants returns participants: [] and total: 0', async ({ scenario, api }) => {
    const body = await ApiClient.json<GroupSessions>(await api.getSessions(scenario.groupId, scenario.ownerToken), 200);
    expect(body).toEqual({ participants: [], total: 0 });
  });

  test('Response follows the contract: participants with id, type, name, items, total, isSubmitted', async ({ scenario, api }) => {
    const dish = scenario.dish(0);
    const guest = await scenario.addGuest('Andrii', [{ dish, quantity: 2 }], true);

    const body = await api.getSessionsOrFail(scenario.groupId, scenario.ownerToken);
    expect(body.participants).toEqual([
      expect.objectContaining({
        id: guest.id,
        type: 'Guest',
        name: 'Andrii',
        isSubmitted: true,
        total: dish.price * 2,
        items: [expect.objectContaining({ quantity: 2, dish: expect.objectContaining({ id: dish.id, price: dish.price }) })],
      }),
    ]);
    expect(body.total).toBe(dish.price * 2);
  });

  test('Unauthenticated request is rejected with 401', async ({ scenario, api }) => {
    expect((await api.getSessions(scenario.groupId)).status()).toBe(401);
  });

  test('Guest session token is not accepted (401)', async ({ scenario, api }) => {
    const guest = await scenario.addGuest('Olena', [], false);
    expect((await api.getSessions(scenario.groupId, guest.token)).status()).toBe(401);
  });

  test('Another customer gets 403', async ({ scenario, stranger, api }) => {
    expect((await api.getSessions(scenario.groupId, stranger.tokens.idToken)).status()).toBe(403);
  });

  test('Waiter gets 403', async ({ scenario, waiter, api }) => {
    expect((await api.getSessions(scenario.groupId, waiter.tokens.idToken)).status()).toBe(403);
  });

  test('Non-existent group returns 404', async ({ stranger, api }) => {
    const response = await api.getSessions('00000000-0000-0000-0000-000000000000', stranger.tokens.idToken);
    expect(response.status()).toBe(404);
  });
});
