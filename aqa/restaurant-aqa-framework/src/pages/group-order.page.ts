import { Page, Locator, expect } from '@playwright/test';

function generateValidJwt(role: string = 'Customer'): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    sub: 'demo-user-id',
    name: 'Yevhenii',
    email: 'yevhenii@example.com',
    'cognito:groups': [role],
    iat: now,
    exp: now + 86400 * 30
  })).toString('base64url');
  return `${header}.${payload}.signature`;
}

export class GroupOrderPage {
  readonly page: Page;
  readonly pageTitle: Locator;
  readonly statusBadge: Locator;
  readonly grandTotal: Locator;
  readonly submitButton: Locator;
  readonly refreshButton: Locator;
  readonly participantsList: Locator;
  readonly emptyState: Locator;
  readonly warningBanner: Locator;
  readonly modalConfirmButton: Locator;
  readonly modalCancelButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageTitle = page.locator('.page-header h1');
    this.statusBadge = page.locator('.page-header .badge');
    this.grandTotal = page.locator('.grand-total .total-amount');
    this.submitButton = page.locator('button.btn-submit, button.submit-btn, button:has-text("Submit Pre-Order")');
    this.refreshButton = page.locator('button.btn-refresh');
    this.participantsList = page.locator('ul.participants > li.participant-item');
    this.emptyState = page.locator('.state-container.empty');
    this.warningBanner = page.locator('.warning-banner');
    this.modalConfirmButton = page.locator('app-modal button.btn-primary, app-modal button.btn-danger, app-modal button:has-text("Submit"), app-modal button:has-text("Remove")');
    this.modalCancelButton = page.locator('app-modal button.btn-secondary, app-modal button:has-text("Cancel")');
  }

  async setupAuthorization() {
    const validToken = generateValidJwt('Customer');
    const authData = {
      idToken: validToken,
      accessToken: validToken
    };
    const userData = {
      id: 'demo-user-id',
      email: 'yevhenii@example.com',
      firstName: 'Yevhenii',
      lastName: 'Owner',
      role: 'Customer'
    };

    await this.page.addInitScript(({ auth, user }) => {
      localStorage.setItem('auth', JSON.stringify(auth));
      localStorage.setItem('user', JSON.stringify(user));
    }, { auth: authData, user: userData });
  }

  async setupDefaultRoutes(reservationId: string = 'demo-reservation', groupId: string = 'group-1') {
    await this.page.route('**/*', async (route) => {
      const url = route.request().url();

      if (url.includes(`/reservations/${reservationId}/invite-token`)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ token: 'test-token-123' })
        });
      }

      if (url.includes('/guest/invites/')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            GroupReservationId: groupId,
            LocationAddress: '48 Rustaveli Avenue',
            MaxGuestCount: 5,
            StartTime: '2026-10-30T16:00:00Z',
            EndTime: '2026-10-30T17:30:00Z'
          })
        });
      }

      if (url.includes(`/reservations/${reservationId}/guest-session-id`)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ guestSessionId: 'owner-1' })
        });
      }

      if (url.includes(`/guest/groups/${groupId}/status`)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'Open' })
        });
      }

      if (url.includes('/dishes/popular') || url.includes('/locations')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([])
        });
      }

      return route.continue();
    });
  }

  async goto(reservationId: string = 'demo-reservation') {
    await this.page.goto(`/reservations/${reservationId}/group-order`);
    await this.page.waitForLoadState('domcontentloaded');
  }

  async mockSessions(sessionsData: any, groupId: string = 'group-1') {
    await this.page.route(`**/guest/groups/${groupId}/sessions`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(sessionsData),
      });
    });
  }

  getParticipantCard(nameOrType: string) {
    return this.participantsList.filter({ hasText: nameOrType });
  }

  getRemoveButtonForGuest(name: string) {
    return this.page.locator(`button[aria-label="Remove ${name}"], li.participant-item:has-text("${name}") button.btn-remove-guest`);
  }
}