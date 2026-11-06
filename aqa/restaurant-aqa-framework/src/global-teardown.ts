import { request } from '@playwright/test';
import { IsolatedLocation } from './fixtures/group-scenario';

/** Removes the run location created in global-setup.ts (waiter binding, dishes, tables, location). */
export default async function globalTeardown(): Promise<void> {
  if (!process.env.RUN_LOCATION) return;

  const context = await request.newContext();
  await IsolatedLocation.restore(context, JSON.parse(process.env.RUN_LOCATION)).dispose();
  await context.dispose();
  console.log('[teardown] run location removed');
}
