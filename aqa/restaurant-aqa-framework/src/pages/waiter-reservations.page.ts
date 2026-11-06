import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from './base.page';

/** Waiter dashboard (/waiter-reservations) and the waiter pre-order page it opens. */
export class WaiterReservationsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async open(): Promise<void> {
    await this.page.goto('/waiter-reservations');
    await expect(this.page.getByText(/You have \d+ reservations?/)).toBeVisible({ timeout: 60_000 });
  }

  /** Reservation card of a customer (the card shows "Customer <First> <Last>"). */
  reservationCard(customerFullName: string): Locator {
    return this.page.locator('li.card').filter({ hasText: customerFullName });
  }

  async openPreOrder(customerFullName: string): Promise<void> {
    const card = this.reservationCard(customerFullName);
    await expect(card).toBeVisible({ timeout: 60_000 });
    await card.getByRole('button', { name: 'Pre-order', exact: true }).click();
    await expect(this.page.getByRole('heading', { name: /Pre-order of/ })).toBeVisible();
  }

  /** Dish card on the waiter pre-order page. */
  preOrderDish(dishName: string): Locator {
    return this.page.locator('app-dish-card').filter({ hasText: dishName });
  }

  preOrderDishes(): Locator {
    return this.page.locator('app-dish-card');
  }
}
