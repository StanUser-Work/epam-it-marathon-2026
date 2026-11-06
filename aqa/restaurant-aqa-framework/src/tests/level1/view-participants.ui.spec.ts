import { test, expect } from '../../fixtures/test';
import { money } from '../../data/money';

test.describe('Level 1 · Owner views group participants (UI)', { tag: ['@level1', '@ui'] }, () => {
  test('Owner sees every participant, their dishes, quantities and subtotals', async ({ scenario, groupOrderPage, api }) => {
    const [caesar, salmon, tomYum] = [scenario.dish(0), scenario.dish(1), scenario.dish(2)];
    await scenario.ownerPreOrder([{ dish: caesar, quantity: 1 }], true);
    await scenario.addGuest('Andrii', [{ dish: caesar, quantity: 2 }, { dish: salmon, quantity: 1 }], true);
    await scenario.addGuest('Olena', [{ dish: tomYum, quantity: 1 }], false);

    await groupOrderPage.signInAs(scenario.owner);
    await groupOrderPage.open(scenario.reservationId);

    await expect(groupOrderPage.statusBadge).toHaveText('Collecting pre-orders');
    await expect(groupOrderPage.participants).toHaveCount(3);

    const own = groupOrderPage.card('My Pre-Order');
    await expect(groupOrderPage.cardItem(own, caesar.name)).toContainText('× 1');
    await expect(groupOrderPage.cardSubtotal(own)).toContainText(money(caesar.price));

    const andrii = groupOrderPage.guestCard('Andrii');
    await expect(andrii).toContainText('Submitted');
    await expect(groupOrderPage.cardItem(andrii, caesar.name)).toContainText('× 2');
    await expect(groupOrderPage.cardItem(andrii, caesar.name)).toContainText(money(caesar.price * 2));
    await expect(groupOrderPage.cardItem(andrii, salmon.name)).toContainText('× 1');
    await expect(groupOrderPage.cardSubtotal(andrii)).toContainText(money(caesar.price * 2 + salmon.price));

    // API: total = sum of participant totals
    const sessions = await api.getSessionsOrFail(scenario.groupId, scenario.ownerToken);
    expect(sessions.total).toBeCloseTo(sessions.participants.reduce((sum, p) => sum + p.total, 0));

    // Grand Total = consolidated order = submitted carts only (Olena is not included yet)
    await expect(groupOrderPage.grandTotal).toHaveText(money(caesar.price * 3 + salmon.price));
  });

  test('Participant who has not submitted the cart and participant without dishes are listed with a mark', async ({ scenario, groupOrderPage }) => {
    await scenario.ownerPreOrder([{ dish: scenario.dish(0), quantity: 1 }], true);
    await scenario.addGuest('Olena', [{ dish: scenario.dish(2), quantity: 1 }], false);
    await scenario.addGuest('Taras', [], false);

    await groupOrderPage.signInAs(scenario.owner);
    await groupOrderPage.open(scenario.reservationId);

    const olena = groupOrderPage.guestCard('Olena');
    await expect(olena).toContainText('Still choosing');
    const taras = groupOrderPage.guestCard('Taras');
    await expect(taras).toContainText('Still choosing');
    await expect(taras).toContainText('No dishes yet');
    await expect(groupOrderPage.warning).toContainText("2 participants haven't submitted their cart yet");
  });

  test('Grand total follows the guest cart: change is visible after refresh', async ({ scenario, groupOrderPage, api }) => {
    const [caesar, tomYum] = [scenario.dish(0), scenario.dish(2)];
    await scenario.ownerPreOrder([{ dish: caesar, quantity: 1 }], true);
    const olena = await scenario.addGuest('Olena', [{ dish: tomYum, quantity: 1 }], false);

    await groupOrderPage.signInAs(scenario.owner);
    await groupOrderPage.open(scenario.reservationId);
    await expect(groupOrderPage.grandTotal).toHaveText(money(caesar.price));
    const totalBefore = (await api.getSessionsOrFail(scenario.groupId, scenario.ownerToken)).total;

    // guest changes and submits her cart in another browser
    await api.addGuestDishOrFail(olena, tomYum.id, 2);
    await api.submitGuestCartOrFail(olena);

    await groupOrderPage.refresh();
    const card = groupOrderPage.guestCard('Olena');
    await expect(groupOrderPage.cardItem(card, tomYum.name)).toContainText('× 3');
    await expect(card).toContainText('Submitted');
    await expect(groupOrderPage.grandTotal).toHaveText(money(caesar.price + tomYum.price * 3));

    const totalAfter = (await api.getSessionsOrFail(scenario.groupId, scenario.ownerToken)).total;
    expect(totalAfter - totalBefore).toBeCloseTo(tomYum.price * 2);
  });

  test('Group nobody has joined yet shows the empty state', async ({ scenario, groupOrderPage }) => {
    await groupOrderPage.signInAs(scenario.owner);
    await groupOrderPage.open(scenario.reservationId);

    await expect(groupOrderPage.emptyState).toBeVisible();
    await expect(groupOrderPage.participants).toHaveCount(0);
  });
});
