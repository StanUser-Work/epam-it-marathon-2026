import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from './base.page';

/** Owner screen of the group pre-order: /reservations/:reservationId/group-order */
export class GroupOrderPage extends BasePage {
  readonly heading: Locator;
  readonly statusBadge: Locator;
  readonly participants: Locator;
  readonly warning: Locator;
  readonly emptyState: Locator;
  readonly consolidated: Locator;
  readonly grandTotal: Locator;
  readonly submitButton: Locator;
  readonly refreshButton: Locator;
  readonly dialog: Locator;
  readonly errorState: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole('heading', { level: 1, name: 'Group Pre-Order' });
    this.statusBadge = page.locator('.title-row .badge');
    this.participants = page.getByRole('main').getByRole('listitem').filter({ has: page.getByRole('article') });
    this.warning = page.getByRole('alert');
    this.emptyState = page.getByText(/Participants haven.t added any dishes yet/);
    this.consolidated = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Consolidated pre-order' }) });
    this.grandTotal = page.locator('.grand-total .total-amount');
    this.submitButton = page.getByRole('button', { name: 'Submit Pre-Order' });
    this.refreshButton = page.getByRole('button', { name: 'Refresh' });
    this.dialog = page.getByRole('dialog');
    this.errorState = page.locator('.state-container.error');
  }

  async open(reservationId: string): Promise<void> {
    await this.page.goto(`/reservations/${reservationId}/group-order`);
    await expect(this.heading.or(this.errorState)).toBeVisible({ timeout: 60_000 });
  }

  /** Card by its title: "My Pre-Order", "Guest: Olena", "Owner: Yevhenii". */
  card(title: string): Locator {
    return this.page.getByRole('article').filter({ has: this.page.getByRole('heading', { level: 2, name: title, exact: true }) });
  }

  guestCard(name: string): Locator {
    return this.card(`Guest: ${name}`);
  }

  cardSubtotal(card: Locator): Locator {
    return card.locator('.subtotal');
  }

  cardItem(card: Locator, dishName: string): Locator {
    return card.getByRole('listitem').filter({ hasText: dishName });
  }

  consolidatedItem(dishName: string): Locator {
    return this.consolidated.getByRole('listitem').filter({ hasText: dishName });
  }

  removeButton(guestName: string): Locator {
    return this.page.getByRole('button', { name: `Remove ${guestName}` });
  }

  async refresh(): Promise<void> {
    await this.refreshButton.click();
  }

  async submitPreOrder(): Promise<void> {
    await this.submitButton.click();
    await expect(this.dialog).toBeVisible();
    await this.dialog.getByRole('button', { name: 'Submit', exact: true }).click();
  }

  async removeGuest(guestName: string): Promise<void> {
    await this.removeButton(guestName).click();
    await expect(this.dialog).toContainText(`remove ${guestName}`);
    await this.dialog.getByRole('button', { name: 'Remove Guest' }).click();
  }
}
