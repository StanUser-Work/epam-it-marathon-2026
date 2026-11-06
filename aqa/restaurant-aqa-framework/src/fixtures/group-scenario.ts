import { APIRequestContext, expect } from '@playwright/test';
import { ApiClient } from '../api/api-client';
import { Dish, GroupInvite, GuestSession, Reservation, TestUser } from '../api/models';
import { env } from '../config/env';
import { isoNoMillis, randomFutureSlot, randomLetters, uniqueCustomer } from '../data/test-data';

export async function registerCustomer(api: ApiClient): Promise<TestUser> {
  const customer = uniqueCustomer();
  const password = env.customerPassword;
  await ApiClient.json(await api.register(customer.firstName, customer.lastName, customer.email, password), 200);
  const tokens = await api.signInOrFail(customer.email, password);
  const profile = await api.meOrFail(tokens.idToken);
  return { ...customer, password, tokens, profile };
}

export async function signInWaiter(api: ApiClient): Promise<TestUser> {
  // waiter of the run location (refreshed tokens), see global-setup.ts
  const tokens = await api.signInOrFail(env.waiterEmail, env.waiterPassword);
  const profile = await api.meOrFail(tokens.idToken);
  return {
    email: env.waiterEmail,
    password: env.waiterPassword,
    firstName: profile.firstName,
    lastName: profile.lastName,
    tokens,
    profile,
  };
}

/**
 * One group pre-order: a fresh Owner, a reservation for `guestCount` people and its group.
 * Guests join through the invite link flow (public guest API), exactly like the UI does.
 * `cleanup()` cancels the reservation, so the run does not leave active data behind.
 */
export class GroupScenario {
  readonly guests: GuestSession[] = [];

  private constructor(
    readonly api: ApiClient,
    readonly owner: TestUser,
    readonly reservation: Reservation,
    readonly invite: GroupInvite,
    readonly dishes: Dish[],
  ) {}

  get reservationId(): string {
    return this.reservation.id;
  }

  get groupId(): string {
    return this.invite.GroupReservationId;
  }

  get ownerToken(): string {
    return this.owner.tokens.idToken;
  }

  dish(index: number): Dish {
    return this.dishes[index % this.dishes.length];
  }

  static async create(
    request: APIRequestContext,
    options: { guestCount?: number; owner?: TestUser; locationId?: string } = {},
  ): Promise<GroupScenario> {
    const { guestCount = 5, owner, locationId = env.locationId } = options;
    const api = new ApiClient(request);
    const user = owner ?? (await registerCustomer(api));
    const dishes = await api.dishesOrFail(locationId);
    expect(dishes.length, 'seeded dishes at LOCATION_ID').toBeGreaterThan(1);

    let reservation: Reservation | undefined;
    for (let attempt = 0; attempt < 6 && !reservation; attempt++) {
      const { start, end } = randomFutureSlot();
      const tables = await api.availableTablesOrFail(user.tokens.idToken, guestCount, isoNoMillis(start), locationId);
      const table = tables.find((t) => t.capacity >= guestCount);
      if (!table) continue;
      const response = await api.createReservation(user.tokens.idToken, table.id, isoNoMillis(start), isoNoMillis(end), guestCount);
      if (response.status() === 201 || response.status() === 200) {
        reservation = (await response.json()) as Reservation;
      }
    }
    expect(reservation, 'a free table for the test reservation').toBeDefined();

    const invite = await api.inviteOrFail(user.tokens.idToken, reservation!.id);
    return new GroupScenario(api, user, reservation!, invite, dishes);
  }

  /** Guest joins via invite, adds dishes and optionally submits the cart. */
  async addGuest(name: string, items: { dish: Dish; quantity: number }[], submit: boolean): Promise<GuestSession> {
    const guest = await this.api.joinGroupOrFail(this.groupId, name);
    for (const { dish, quantity } of items) {
      await this.api.addGuestDishOrFail(guest, dish.id, quantity);
    }
    if (submit) await this.api.submitGuestCartOrFail(guest);
    this.guests.push(guest);
    return guest;
  }

  /** Owner's own pre-order (the reservation order). Required by the backend for the group submit. */
  async ownerPreOrder(items: { dish: Dish; quantity: number }[], submit: boolean): Promise<void> {
    await this.api.createOwnerOrderOrFail(
      this.ownerToken,
      this.reservationId,
      items.map(({ dish, quantity }) => ({ dishId: dish.id, quantity })),
    );
    if (submit) await this.api.submitOwnerOrderOrFail(this.ownerToken, this.reservationId);
  }

  async cleanup(): Promise<void> {
    await this.api.cancelReservation(this.ownerToken, this.reservationId).catch(() => undefined);
  }
}

/**
 * A temporary restaurant location with one table, three dishes and its own waiter.
 * Used by the waiter UI checks: the waiter dashboard then lists only this test's reservation,
 * independent of anything else in the environment. Everything is removed in `dispose()`.
 */
export class IsolatedLocation {
  private constructor(
    private readonly api: ApiClient,
    readonly locationId: string,
    readonly tableIds: string[],
    readonly dishIds: string[],
    readonly waiter: TestUser,
  ) {}

  /** Serializable description, passed from global setup to workers and teardown. */
  toJSON() {
    return { locationId: this.locationId, tableIds: this.tableIds, dishIds: this.dishIds, waiter: this.waiter };
  }

  static restore(request: APIRequestContext, data: ReturnType<IsolatedLocation['toJSON']>): IsolatedLocation {
    return new IsolatedLocation(new ApiClient(request), data.locationId, data.tableIds, data.dishIds, data.waiter);
  }

  static async create(request: APIRequestContext, tableCount = 1): Promise<IsolatedLocation> {
    const api = new ApiClient(request);
    const location = await api.createLocationOrFail(`AQA ${randomLetters(6)} Street 1`);
    const tableIds: string[] = [];
    for (let number = 1; number <= tableCount; number++) {
      tableIds.push((await api.createTableOrFail(location.id, number, 6)).id);
    }
    const dishes = [];
    for (const [name, price] of [['Garden Salad', 12], ['Pumpkin Soup', 9.5], ['Berry Tart', 7]] as const) {
      dishes.push(await api.createDishOrFail(location.id, `${name} ${randomLetters(4)}`, price));
    }
    const waiter = await registerCustomer(api);
    await api.addWaiterOrFail(waiter.email, location.id);
    // re-sign in: the Waiter group is in the token only after it was added
    const tokens = await api.signInOrFail(waiter.email, waiter.password);
    const profile = await api.meOrFail(tokens.idToken);
    expect(profile.role).toBe('Waiter');
    return new IsolatedLocation(api, location.id, tableIds, dishes.map((d) => d.id), { ...waiter, tokens, profile });
  }

  async dispose(): Promise<void> {
    // the location's own waiter has the rights to delete tables; the binding is removed last
    const { idToken } = await this.api.signInOrFail(this.waiter.email, this.waiter.password);
    for (const id of this.dishIds) await this.api.deleteDish(id, idToken);
    for (const id of this.tableIds) await this.api.deleteTable(id, idToken);
    const response = await this.api.deleteLocation(this.locationId, idToken);
    if (!response.ok()) console.warn(`[cleanup] location ${this.locationId}: ${response.status()} ${await response.text()}`);
    await this.api.removeWaiter(this.waiter.email, this.locationId);
  }
}
