export function localPreviewAvailable(hostname: string, development: boolean) {
  return development && ['localhost', '127.0.0.1'].includes(hostname);
}

export function isLocalMonitoringPreview(pathname: string, search: string, hostname: string, development: boolean) {
  return localPreviewAvailable(hostname, development)
    && ['/monitoring/setup', '/admin/marketplaces'].includes(pathname)
    && new URLSearchParams(search).get('preview') === 'local';
}
