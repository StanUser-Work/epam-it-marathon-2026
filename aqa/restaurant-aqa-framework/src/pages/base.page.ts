import { Page } from '@playwright/test';
import { TestUser } from '../api/models';

export abstract class BasePage {
  constructor(protected readonly page: Page) {}

  /**
   * Opens the app as an already signed-in user: tokens are obtained through the API (data preparation)
   * and written into localStorage exactly as the app's AuthenticationService stores them after /signin.
   */
  async signInAs(user: TestUser): Promise<void> {
    await this.page.addInitScript(
      ({ tokens, profile }) => {
        window.localStorage.setItem('auth', JSON.stringify(tokens));
        window.localStorage.setItem('user', JSON.stringify(profile));
      },
      { tokens: user.tokens, profile: user.profile },
    );
  }

  toast(text: string | RegExp) {
    return this.page.getByText(text).first();
  }
}
