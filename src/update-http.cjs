// Electron 45 can report ERR_CONNECTION_CLOSED when the updater deliberately
// aborts a request after a redirect. Ignore errors only on that abandoned request.
// The library still prepares the next request and strips cross-origin credentials.
const patched = new WeakSet();

function guardRedirectAbortErrors(executor) {
  if (patched.has(executor)) return;
  const abandoned = new WeakSet();
  const redirects = new WeakMap();
  const attachErrors = executor.addErrorAndTimeoutHandlers.bind(executor);
  const attachRedirects = executor.addRedirectHandlers.bind(executor);

  executor.addErrorAndTimeoutHandlers = (request, reject, timeout) => {
    attachErrors(request, error => {
      if (!abandoned.has(request)) reject(error);
    }, timeout);
  };
  executor.addRedirectHandlers = (request, options, reject, count, handler) => {
    const currentCount = redirects.get(options) ?? count;
    request.prependListener('redirect', () => abandoned.add(request));
    attachRedirects(request, options, reject, currentCount, nextOptions => {
      redirects.set(nextOptions, currentCount + 1);
      handler(nextOptions);
    });
  };
  patched.add(executor);
}

module.exports = { guardRedirectAbortErrors };
