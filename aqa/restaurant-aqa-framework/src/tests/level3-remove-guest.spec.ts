import { test, expect } from '@playwright/test';
import { GroupOrderPage } from '../pages/group-order.page';

test.describe('@level3 Level 3: Remove Guest from Group Pre-Order', () => {
  let groupOrderPage: GroupOrderPage;

  test.beforeEach(async ({ page }) => {
    groupOrderPage = new GroupOrderPage(page);
    await groupOrderPage.setupAuthorization();
    await groupOrderPage.setupDefaultRoutes('demo-reservation', 'group-1');
  });

  test('Owner sees "Remove Guest" button for guests only (never for Owner)', async () => {
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
          total: 180,
          items: [{ dish: { id: 'd1', name: 'Caesar Salad', price: 180 }, quantity: 1 }]
        }
      ],
      total: 360
    };

    await groupOrderPage.mockSessions(mockData, 'group-1');
    await groupOrderPage.goto('demo-reservation');

    const removeAndriiBtn = groupOrderPage.getRemoveButtonForGuest('Andrii');
    await expect(removeAndriiBtn).toBeVisible();

    const ownerCard = groupOrderPage.getParticipantCard('My Pre-Order');
    await expect(ownerCard.locator('button.btn-remove-guest')).toHaveCount(0);
  });

  test('Owner confirms removal in dialog: guest is removed and total recalculates', async ({ page }) => {
    const initialData = {
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
          total: 180,
          items: [{ dish: { id: 'd1', name: 'Caesar Salad', price: 180 }, quantity: 1 }]
        }
      ],
      total: 360
    };

    const afterRemovalData = {
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

    await groupOrderPage.mockSessions(initialData, 'group-1');

    let deleteApiCalled = false;
    await page.route('**/guest/groups/group-1/sessions/guest-1', async (route) => {
      deleteApiCalled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(afterRemovalData)
      });
    });

    await groupOrderPage.goto('demo-reservation');
    await expect(groupOrderPage.participantsList).toHaveCount(2);

    await groupOrderPage.getRemoveButtonForGuest('Andrii').click();
    await expect(groupOrderPage.modalConfirmButton).toBeVisible();

    await groupOrderPage.modalConfirmButton.click();

    expect(deleteApiCalled).toBeTruthy();
    await expect(groupOrderPage.participantsList).toHaveCount(1);
    await expect(groupOrderPage.grandTotal).toContainText('180');
  });

  test('API validation: Removing non-existent participant returns error feedback', async ({ page }) => {
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
          total: 180,
          items: [{ dish: { id: 'd1', name: 'Caesar Salad', price: 180 }, quantity: 1 }]
        }
      ],
      total: 360
    };

    await groupOrderPage.mockSessions(mockData, 'group-1');

    await page.route('**/guest/groups/group-1/sessions/guest-1', async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Participant not found' })
      });
    });

    await groupOrderPage.goto('demo-reservation');
    await expect(groupOrderPage.participantsList).toHaveCount(2);
    await groupOrderPage.getRemoveButtonForGuest('Andrii').click();
    await groupOrderPage.modalConfirmButton.click();

    await expect(groupOrderPage.participantsList).toHaveCount(2);
  });
});