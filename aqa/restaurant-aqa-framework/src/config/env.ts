import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} is not set. Copy .env.example to .env and fill it in.`);
  }
  return value.replace(/\/+$/, '');
}

export const env = {
  get frontendUrl(): string {
    return required('FRONTEND_URL');
  },
  get apiBaseUrl(): string {
    return required('API_BASE_URL');
  },
  /** Location of the run: created by global setup (RUN_LOCATION_ID) unless LOCATION_ID is given explicitly. */
  get locationId(): string {
    return process.env.LOCATION_ID || required('RUN_LOCATION_ID');
  },
  get waiterEmail(): string {
    return process.env.LOCATION_ID ? required('WAITER_EMAIL') : required('RUN_WAITER_EMAIL');
  },
  get waiterPassword(): string {
    return process.env.LOCATION_ID ? required('WAITER_PASSWORD') : required('RUN_WAITER_PASSWORD');
  },
  /** Password used for customers registered by the tests (Cognito policy: upper, lower, digit, symbol). */
  get customerPassword(): string {
    return process.env.TEST_USER_PASSWORD || 'Aqa#Pass2026';
  },
};
