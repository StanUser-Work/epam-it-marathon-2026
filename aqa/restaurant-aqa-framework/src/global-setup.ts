import { request } from '@playwright/test';
import { IsolatedLocation } from './fixtures/group-scenario';
import { env } from './config/env';

/**
 * Creates a temporary location (tables, dishes, waiter) for this run, so the tests never depend on
 * or pollute data that people use manually. Skipped when LOCATION_ID is set explicitly in .env.
 */
export default async function globalSetup(): Promise<void> {
  if (process.env.LOCATION_ID) return;

  const context = await request.newContext();
  const location = await IsolatedLocation.create(context, 5);
  await context.dispose();

  const data = location.toJSON();
  process.env.RUN_LOCATION = JSON.stringify(data);
  process.env.RUN_LOCATION_ID = data.locationId;
  process.env.RUN_WAITER_EMAIL = data.waiter.email;
  process.env.RUN_WAITER_PASSWORD = data.waiter.password;
  console.log(`[setup] run location ${data.locationId} at ${env.apiBaseUrl}`);
}
