import { test, expect } from '@playwright/test';
import { GroupOrderPage } from '../pages/group-order.page';

test.describe('@level2 Level 2: Submit Consolidated Pre-Order', () => {
  let groupOrderPage: GroupOrderPage;

  test.beforeEach(async ({ page }) => {
    groupOrderPage = new GroupOrderPage(page);
    await groupOrderPage.setupAuthorization();
    await groupOrderPage.setupDefaultRoutes('demo-reservation', 'group-1');
  });

  test('Owner successfully submits consolidated order: items merged, modal confirmed', async ({ page }) => {
    const mockData = {
      participants: [
        {
          id: 'owner-1',
          name: 'Yevhenii',
          type: 'Owner',
          isSubmitted: true,
          total: 180,
          items: [{ dish: { id: 'd1', name: 'Caesar Salad', price: 180 }, quantity: 1 }]
        },
        {
          id: 'guest-1',
          name: 'Andrii',
          type: 'Guest',
          isSubmitted: true,
          total: 360,
          items: [{ dish: { id: 'd1', name: 'Caesar Salad', price: 180 }, quantity: 2 }]
        }
      ],
      total: 540
    };

    await groupOrderPage.mockSessions(mockData, 'group-1');

    let submitCalled = false;
    await page.route('**/group-reservations/group-1/submit', async (route) => {
      submitCalled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ dishId: 'd1', quantity: 3 }])
      });
    });

    await groupOrderPage.goto('demo-reservation');

    const consolidatedSection = page.locator('.consolidated-section, .consolidated-orders, .summary-section');
    await expect(consolidatedSection).toBeVisible();
    await expect(consolidatedSection).toContainText('Caesar Salad');
    await expect(consolidatedSection).toContainText('3');

    await expect(groupOrderPage.submitButton).toBeEnabled();
    await groupOrderPage.submitButton.click();

    // Підтверджуємо модальне вікно
    await expect(groupOrderPage.modalConfirmButton).toBeVisible();
    await groupOrderPage.modalConfirmButton.click();

    expect(submitCalled).toBeTruthy();
    await expect(groupOrderPage.statusBadge).toHaveText('Sent to Restaurant');
  });

  test('Cannot submit when there are no submitted dishes (button disabled)', async () => {
    const mockData = {
      participants: [
        {
          id: 'guest-pending',
          name: 'Olena',
          type: 'Guest',
          isSubmitted: false,
          total: 180,
          items: [{ dish: { id: 'd1', name: 'Caesar Salad', price: 180 }, quantity: 1 }]
        }
      ],
      total: 0
    };

    await groupOrderPage.mockSessions(mockData, 'group-1');
    await groupOrderPage.goto('demo-reservation');

    await expect(groupOrderPage.submitButton).toBeDisabled();
  });

  test('API validation: Submit failure keeps state consistent', async ({ page }) => {
    const mockData = {
      participants: [
        {
          id: 'owner-1',
          name: 'Yevhenii',
          type: 'Owner',
          isSubmitted: true,
          total: 180,
          items: [{ dish: { id: 'd1', name: 'Caesar Salad', price: 180 }, quantity: 1 }]
        }
      ],
      total: 180
    };

    await groupOrderPage.mockSessions(mockData, 'group-1');

    await page.route('**/group-reservations/group-1/submit', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Order already submitted' })
      });
    });

    await groupOrderPage.goto('demo-reservation');
    await expect(groupOrderPage.submitButton).toBeEnabled();
    await groupOrderPage.submitButton.click();
    await groupOrderPage.modalConfirmButton.click();

    await expect(groupOrderPage.statusBadge).toHaveText('Collecting pre-orders');
  });
});