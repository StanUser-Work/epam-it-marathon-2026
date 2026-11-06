import { test, expect } from '../../fixtures/test';
import { money } from '../../data/money';
import { WaiterReservationsPage } from '../../pages/waiter-reservations.page';

test.describe('Level 3 · Owner removes a participant (UI)', { tag: ['@level3', '@ui'] }, () => {
  test('Removing one of several guests keeps the rest and recalculates the totals', async ({ scenario, groupOrderPage, api }) => {
    const [caesar, salmon, tomYum] = [scenario.dish(0), scenario.dish(1), scenario.dish(2)];
    await scenario.ownerPreOrder([{ dish: caesar, quantity: 1 }], true);
    await scenario.addGuest('Andrii', [{ dish: salmon, quantity: 2 }], true);
    await scenario.addGuest('Olena', [{ dish: tomYum, quantity: 1 }], true);

    await groupOrderPage.signInAs(scenario.owner);
    await groupOrderPage.open(scenario.reservationId);
    await expect(groupOrderPage.participants).toHaveCount(3);
    await expect(groupOrderPage.card('My Pre-Order').getByRole('button', { name: /Remove/ })).toHaveCount(0);

    // Andrii has already submitted his cart
    await groupOrderPage.removeGuest('Andrii');

    await expect(groupOrderPage.participants).toHaveCount(2);
    await expect(groupOrderPage.guestCard('Andrii')).toHaveCount(0);
    await expect(groupOrderPage.guestCard('Olena')).toBeVisible();
    await expect(groupOrderPage.consolidatedItem(salmon.name)).toHaveCount(0);
    await expect(groupOrderPage.grandTotal).toHaveText(money(caesar.price + tomYum.price));

    const sessions = await api.getSessionsOrFail(scenario.groupId, scenario.ownerToken);
    expect(sessions.participants.map((p) => p.name)).not.toContain('Andrii');
    expect(sessions.total).toBeCloseTo(caesar.price + tomYum.price);
  });

  test('Removing the last participant leaves the empty state', async ({ scenario, groupOrderPage }) => {
    await scenario.addGuest('Olena', [{ dish: scenario.dish(0), quantity: 1 }], false);

    await groupOrderPage.signInAs(scenario.owner);
    await groupOrderPage.open(scenario.reservationId);
    await groupOrderPage.removeGuest('Olena');

    await expect(groupOrderPage.emptyState).toBeVisible();
  });

  test('Cancel in the confirmation dialog keeps the guest', async ({ scenario, groupOrderPage }) => {
    await scenario.addGuest('Olena', [{ dish: scenario.dish(0), quantity: 1 }], false);

    await groupOrderPage.signInAs(scenario.owner);
    await groupOrderPage.open(scenario.reservationId);
    await groupOrderPage.removeButton('Olena').click();
    await groupOrderPage.dialog.getByRole('button', { name: 'Cancel' }).click();

    await expect(groupOrderPage.dialog).toHaveCount(0);
    await expect(groupOrderPage.guestCard('Olena')).toBeVisible();
  });

  test('End-to-end: guests order → Owner reviews → removes one → submits → waiter sees order without him', async ({
    isolatedScenario: scenario,
    isolatedLocation,
    groupOrderPage,
    browser,
  }) => {
    const [caesar, salmon, tomYum] = [scenario.dish(0), scenario.dish(1), scenario.dish(2)];
    await scenario.addGuest('Andrii', [{ dish: caesar, quantity: 2 }], true);
    await scenario.addGuest('Olena', [{ dish: caesar, quantity: 1 }, { dish: salmon, quantity: 1 }], true);
    await scenario.addGuest('Maksym', [{ dish: tomYum, quantity: 2 }], true);
    await scenario.ownerPreOrder([{ dish: salmon, quantity: 1 }], true);

    await groupOrderPage.signInAs(scenario.owner);
    await groupOrderPage.open(scenario.reservationId);
    await expect(groupOrderPage.participants).toHaveCount(4);
    await expect(groupOrderPage.consolidatedItem(tomYum.name)).toContainText('× 2');

    await groupOrderPage.removeGuest('Maksym');
    await expect(groupOrderPage.consolidatedItem(tomYum.name)).toHaveCount(0);
    await groupOrderPage.submitPreOrder();
    await expect(groupOrderPage.statusBadge).toHaveText('Sent to Restaurant');

    // the waiter works in a separate browser context
    const waiterContext = await browser.newContext();
    const waiterTab = await waiterContext.newPage();
    const waiterView = new WaiterReservationsPage(waiterTab);
    await waiterView.signInAs(isolatedLocation.waiter);
    await waiterView.open();
    await waiterView.openPreOrder(scenario.owner.lastName);

    await expect(waiterView.preOrderDish(caesar.name)).toContainText('Quantity: 3');
    await expect(waiterView.preOrderDish(salmon.name)).toContainText('Quantity: 2');
    await expect(waiterView.preOrderDish(tomYum.name)).toHaveCount(0);
    await waiterContext.close();
  });
});
