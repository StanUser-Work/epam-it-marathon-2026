/** Same format as Angular `currency` pipe with default USD / en-US: $1,234.50 */
export function money(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
