import { test, expect } from '@playwright/test';
import { GroupOrderPage } from '../pages/group-order.page';

test.describe('@level1 Level 1: View Group Pre-Order Participants', () => {
  let groupOrderPage: GroupOrderPage;

  test.beforeEach(async ({ page }) => {
    groupOrderPage = new GroupOrderPage(page);
    await groupOrderPage.setupAuthorization();
    await groupOrderPage.setupDefaultRoutes('demo-reservation', 'group-1');
  });

  test('Owner sees participants, items, individual totals and grand total', async () => {
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
    await groupOrderPage.goto('demo-reservation');

    await expect(groupOrderPage.pageTitle).toContainText('Group Pre-Order');
    await expect(groupOrderPage.statusBadge).toHaveText('Collecting pre-orders');
    await expect(groupOrderPage.participantsList).toHaveCount(2);

    const ownerCard = groupOrderPage.getParticipantCard('My Pre-Order');
    await expect(ownerCard).toBeVisible();
    await expect(ownerCard).toContainText('Caesar Salad');
    await expect(ownerCard).toContainText('180');

    const guestCard = groupOrderPage.getParticipantCard('Andrii');
    await expect(guestCard).toBeVisible();
    await expect(guestCard).toContainText('360');

    await expect(groupOrderPage.grandTotal).toContainText('540');
  });

  test('Guest who has not submitted cart displays "Still choosing" and warning banner', async () => {
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
          id: 'guest-pending',
          name: 'Olena',
          type: 'Guest',
          isSubmitted: false,
          total: 200,
          items: [{ dish: { id: 'd2', name: 'Pasta', price: 200 }, quantity: 1 }]
        }
      ],
      total: 180
    };

    await groupOrderPage.mockSessions(mockData, 'group-1');
    await groupOrderPage.goto('demo-reservation');

    const olenaCard = groupOrderPage.getParticipantCard('Olena');
    await expect(olenaCard).toContainText('Still choosing');

    await expect(groupOrderPage.warningBanner).toBeVisible();
    await expect(groupOrderPage.warningBanner).toContainText("1 participant hasn't submitted their cart yet");

    await expect(groupOrderPage.grandTotal).toContainText('180');
  });

  test('Empty group displays message when no dishes have been added', async () => {
    const mockData = {
      participants: [],
      total: 0
    };

    await groupOrderPage.mockSessions(mockData, 'group-1');
    await groupOrderPage.goto('demo-reservation');

    await expect(groupOrderPage.emptyState).toBeVisible();
    await expect(groupOrderPage.emptyState).toContainText('Participants haven’t added any dishes yet');
  });

  test('API validation: Non-existent group or error handling', async ({ page }) => {
    await page.route('**/reservations/invalid-reservation-999/invite-token', async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Reservation not found' }),
      });
    });

    await groupOrderPage.goto('invalid-reservation-999');
    const errorContainer = page.locator('.state-container.error');
    await expect(errorContainer).toBeVisible();
    await expect(errorContainer).toContainText('Try again');
  });
});