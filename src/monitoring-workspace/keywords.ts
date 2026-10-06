/** Keep empty entries while editing so users can start a new phrase. */
export function splitSearchKeywords(value: string): string[] {
  return value.split(/,|\r\n?|\n/);
}
