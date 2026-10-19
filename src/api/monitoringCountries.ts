import { request } from './transport';
import { isRecord, requireResponse } from './validation';
import type { Country } from '../lib/countries';

export function parseMonitoringCountries(value: unknown): Country[] {
  requireResponse(Array.isArray(value), 'available monitoring countries');
  const seen = new Set<string>();
  return value.map(country => {
    requireResponse(isRecord(country) && typeof country.code === 'string' && /^[A-Z]{2}$/.test(country.code)
      && !seen.has(country.code) && typeof country.name === 'string' && country.name.trim().length > 0,
    'available monitoring country');
    seen.add(country.code);
    return { code: country.code, name: country.name };
  });
}

export async function getMonitoringCountries(signal?: AbortSignal): Promise<Country[]> {
  const value = await request<{ countries: unknown }>('/api/monitoring/countries', { signal });
  return parseMonitoringCountries(value.countries);
}
