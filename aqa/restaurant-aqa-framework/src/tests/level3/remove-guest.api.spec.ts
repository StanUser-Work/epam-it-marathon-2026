import { test, expect } from '../../fixtures/test';
import { ApiClient } from '../../api/api-client';
import { GroupScenario } from '../../fixtures/group-scenario';
import { GroupSessions } from '../../api/models';

test.describe('Level 3 · DELETE /guest/groups/{id}/sessions/{sessionId} (API)', { tag: ['@level3', '@api'] }, () => {
  test('Removing a guest returns the updated snapshot; the removed guest no longer counts', async ({ scenario, api }) => {
    const [a, b] = [scenario.dish(0), scenario.dish(1)];
    const andrii = await scenario.addGuest('Andrii', [{ dish: a, quantity: 2 }], true);
    await scenario.addGuest('Olena', [{ dish: b, quantity: 1 }], false);

    const body = await ApiClient.json<GroupSessions>(await api.removeGuest(scenario.groupId, andrii.id, scenario.ownerToken), 200);
    expect(body.participants.map((p) => p.name)).toEqual(['Olena']);
    expect(body.total).toBe(b.price);
  });

  test('Removing the last participant returns an empty group', async ({ scenario, api }) => {
    const olena = await scenario.addGuest('Olena', [{ dish: scenario.dish(0), quantity: 1 }], true);
    const body = await ApiClient.json<GroupSessions>(await api.removeGuest(scenario.groupId, olena.id, scenario.ownerToken), 200);
    expect(body).toEqual({ participants: [], total: 0 });
  });

  test('Participant of another group → 400 and nothing is removed', async ({ scenario, request, api }) => {
    const other = await GroupScenario.create(request);
    try {
      const strangerGuest = await other.addGuest('Iryna', [{ dish: other.dish(0), quantity: 1 }], true);

      const response = await api.removeGuest(scenario.groupId, strangerGuest.id, scenario.ownerToken);
      expect(response.status()).toBe(400);

      const otherSessions = await api.getSessionsOrFail(other.groupId, other.ownerToken);
      expect(otherSessions.participants.map((p) => p.id)).toContain(strangerGuest.id);
    } finally {
      await other.cleanup();
    }
  });

  test('Participant that does not exist → 404', async ({ scenario, api }) => {
    const response = await api.removeGuest(scenario.groupId, '00000000-0000-0000-0000-000000000000', scenario.ownerToken);
    expect(response.status()).toBe(404);
  });

  test('Removal not by the Owner → 403, unauthenticated → 401', async ({ scenario, stranger, waiter, api }) => {
    const olena = await scenario.addGuest('Olena', [], false);

    expect((await api.removeGuest(scenario.groupId, olena.id, stranger.tokens.idToken)).status()).toBe(403);
    expect((await api.removeGuest(scenario.groupId, olena.id, waiter.tokens.idToken)).status()).toBe(403);
    expect((await api.removeGuest(scenario.groupId, olena.id)).status()).toBe(401);
    expect((await api.getSessionsOrFail(scenario.groupId, scenario.ownerToken)).participants).toHaveLength(1);
  });

  test("Owner's own session cannot be removed → 400", async ({ scenario, api }) => {
    const { guestSessionId } = await ApiClient.json<{ guestSessionId: string }>(
      await api.getOwnerSessionId(scenario.reservationId, scenario.ownerToken),
      200,
    );
    expect((await api.removeGuest(scenario.groupId, guestSessionId, scenario.ownerToken)).status()).toBe(400);
  });

  test('Removal after the group was submitted → 400', async ({ scenario, api }) => {
    await scenario.ownerPreOrder([{ dish: scenario.dish(0), quantity: 1 }], true);
    const olena = await scenario.addGuest('Olena', [{ dish: scenario.dish(1), quantity: 1 }], true);
    await api.submitGroupOrFail(scenario.groupId, scenario.reservationId, scenario.ownerToken);

    expect((await api.removeGuest(scenario.groupId, olena.id, scenario.ownerToken)).status()).toBe(400);
  });
});
