import { useEffect, useState } from 'react';
import { getMonitoringCountries } from '../api/monitoringCountries';
import type { Country } from '../lib/countries';

export function useMonitoringCountries() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void getMonitoringCountries(controller.signal).then(value => {
      if (!controller.signal.aborted) { setCountries(value); setReady(true); }
    }).catch(error => {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Available countries could not be loaded');
    });
    return () => controller.abort();
  }, []);
  return { countries, ready, error };
}
