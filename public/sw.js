// Installable app shell only. Nothing is cached, so school data is never stored on the device by this worker.
self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><p>You are offline. Reconnect and try again.</p>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )));
});
