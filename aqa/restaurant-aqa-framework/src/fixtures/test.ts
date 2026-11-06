import { test as base } from '@playwright/test';
import { ApiClient } from '../api/api-client';
import { TestUser } from '../api/models';
import { GroupOrderPage } from '../pages/group-order.page';
import { WaiterReservationsPage } from '../pages/waiter-reservations.page';
import { GroupScenario, IsolatedLocation, registerCustomer, signInWaiter } from './group-scenario';

type Fixtures = {
  api: ApiClient;
  /** Fresh owner + reservation + group; cancelled after the test. */
  scenario: GroupScenario;
  /** Another customer who is not the owner of `scenario`. */
  stranger: TestUser;
  waiter: TestUser;
  /** Location with its own waiter, for checks on the waiter dashboard. */
  isolatedLocation: IsolatedLocation;
  /** Group pre-order created in `isolatedLocation`. */
  isolatedScenario: GroupScenario;
  groupOrderPage: GroupOrderPage;
  waiterPage: WaiterReservationsPage;
};

export const test = base.extend<Fixtures>({
  api: async ({ request }, use) => {
    await use(new ApiClient(request));
  },

  scenario: async ({ request }, use) => {
    const scenario = await GroupScenario.create(request);
    await use(scenario);
    await scenario.cleanup();
  },

  stranger: async ({ api }, use) => {
    await use(await registerCustomer(api));
  },

  waiter: async ({ api }, use) => {
    await use(await signInWaiter(api));
  },

  isolatedLocation: async ({ request }, use) => {
    const location = await IsolatedLocation.create(request);
    await use(location);
    await location.dispose();
  },

  isolatedScenario: async ({ request, isolatedLocation }, use) => {
    const scenario = await GroupScenario.create(request, { locationId: isolatedLocation.locationId });
    await use(scenario);
    await scenario.cleanup();
  },

  groupOrderPage: async ({ page }, use) => {
    await use(new GroupOrderPage(page));
  },

  waiterPage: async ({ page }, use) => {
    await use(new WaiterReservationsPage(page));
  },
});

export { expect } from '@playwright/test';
