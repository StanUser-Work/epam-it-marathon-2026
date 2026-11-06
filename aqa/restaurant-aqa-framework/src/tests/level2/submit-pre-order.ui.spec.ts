import { test, expect } from '../../fixtures/test';
import { money } from '../../data/money';

test.describe('Level 2 · Owner submits the consolidated pre-order (UI)', { tag: ['@level2', '@ui'] }, () => {
  test('Same dishes are merged, unsubmitted carts are skipped, order is sent to the restaurant', async ({ scenario, groupOrderPage, api }) => {
    const [caesar, salmon, tomYum] = [scenario.dish(0), scenario.dish(1), scenario.dish(2)];
    await scenario.ownerPreOrder([{ dish: caesar, quantity: 1 }], true);
    await scenario.addGuest('Andrii', [{ dish: caesar, quantity: 2 }, { dish: salmon, quantity: 1 }], true);
    await scenario.addGuest('Olena', [{ dish: salmon, quantity: 1 }], true);
    await scenario.addGuest('Maksym', [{ dish: tomYum, quantity: 3 }], false);

    await groupOrderPage.signInAs(scenario.owner);
    await groupOrderPage.open(scenario.reservationId);

    await expect(groupOrderPage.consolidatedItem(caesar.name)).toContainText('× 3');
    await expect(groupOrderPage.consolidatedItem(salmon.name)).toContainText('× 2');
    await expect(groupOrderPage.consolidatedItem(tomYum.name)).toHaveCount(0);
    await expect(groupOrderPage.grandTotal).toHaveText(money(caesar.price * 3 + salmon.price * 2));

    await groupOrderPage.submitPreOrder();

    await expect(groupOrderPage.toast('Pre-order sent to the restaurant')).toBeVisible();
    await expect(groupOrderPage.statusBadge).toHaveText('Sent to Restaurant');
    await expect(groupOrderPage.submitButton).toHaveCount(0);
    await expect(groupOrderPage.removeButton('Andrii')).toHaveCount(0);

    // state behind the UI: order SubmittedByCustomer with merged quantities, group Submitted
    const order = await api.orderOrFail(scenario.ownerToken, scenario.reservationId);
    expect(String(order.status)).toMatch(/SubmittedByCustomer|3/);
    const quantities = Object.fromEntries(order.orderItems.map((i) => [i.dish.id, i.quantity]));
    expect(quantities).toEqual({ [caesar.id]: 3, [salmon.id]: 2 });
    expect(await (await api.getStatus(scenario.groupId)).json()).toEqual(expect.objectContaining({ status: 'Submitted' }));
  });

  test('Waiter sees the submitted order with the composition confirmed by the Owner', async ({ isolatedScenario: scenario, isolatedLocation, waiterPage, api }) => {
    const [caesar, salmon] = [scenario.dish(0), scenario.dish(1)];
    await scenario.ownerPreOrder([{ dish: salmon, quantity: 1 }], true);
    await scenario.addGuest('Andrii', [{ dish: caesar, quantity: 2 }], true);
    await scenario.addGuest('Olena', [{ dish: caesar, quantity: 1 }], true);
    await api.submitGroupOrFail(scenario.groupId, scenario.reservationId, scenario.ownerToken);

    await waiterPage.signInAs(isolatedLocation.waiter);
    await waiterPage.open();
    await waiterPage.openPreOrder(scenario.owner.lastName);

    await expect(waiterPage.preOrderDishes()).toHaveCount(2);
    await expect(waiterPage.preOrderDish(caesar.name)).toContainText('Quantity: 3');
    await expect(waiterPage.preOrderDish(salmon.name)).toContainText('Quantity: 1');
  });

  test('Submit is disabled while no participant has submitted dishes', async ({ scenario, groupOrderPage }) => {
    await scenario.addGuest('Olena', [{ dish: scenario.dish(0), quantity: 1 }], false);

    await groupOrderPage.signInAs(scenario.owner);
    await groupOrderPage.open(scenario.reservationId);

    await expect(groupOrderPage.submitButton).toBeDisabled();
    await expect(groupOrderPage.grandTotal).toHaveText(money(0));
  });

  test('Owner without own pre-order gets the API message and can retry', async ({ scenario, groupOrderPage }) => {
    await scenario.addGuest('Andrii', [{ dish: scenario.dish(0), quantity: 1 }], true);

    await groupOrderPage.signInAs(scenario.owner);
    await groupOrderPage.open(scenario.reservationId);
    await groupOrderPage.submitPreOrder();

    await expect(groupOrderPage.toast('Order not found.')).toBeVisible();
    await expect(groupOrderPage.statusBadge).toHaveText('Collecting pre-orders');
    await expect(groupOrderPage.submitButton).toBeEnabled();
  });

  test('Already submitted group opens read-only', async ({ scenario, groupOrderPage, api }) => {
    await scenario.ownerPreOrder([{ dish: scenario.dish(0), quantity: 1 }], true);
    await scenario.addGuest('Andrii', [{ dish: scenario.dish(1), quantity: 1 }], true);
    await api.submitGroupOrFail(scenario.groupId, scenario.reservationId, scenario.ownerToken);

    await groupOrderPage.signInAs(scenario.owner);
    await groupOrderPage.open(scenario.reservationId);

    await expect(groupOrderPage.statusBadge).toHaveText('Sent to Restaurant');
    await expect(groupOrderPage.submitButton).toHaveCount(0);
    await expect(groupOrderPage.refreshButton).toHaveCount(0);
  });
});
