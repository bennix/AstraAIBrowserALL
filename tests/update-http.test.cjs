const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { ElectronHttpExecutor } = require('electron-updater/out/electronHttpExecutor');
const { guardRedirectAbortErrors } = require('../src/update-http.cjs');

function request() {
  const value = new EventEmitter();
  value.abort = () => value.emit('error', Error('net::ERR_CONNECTION_CLOSED'));
  return value;
}

test('redirect abort errors do not reject the new download and cross-origin credentials are stripped', () => {
  const executor = new ElectronHttpExecutor();
  guardRedirectAbortErrors(executor);
  const errors = [], first = request();
  let next;
  executor.addErrorAndTimeoutHandlers(first, error => errors.push(error));
  executor.addRedirectHandlers(first, {
    protocol: 'https:', hostname: 'github.com', path: '/asset',
    headers: { Authorization: 'private-test-token', Cookie: 'private-test-cookie' }
  }, error => errors.push(error), 0, options => { next = options; });
  first.emit('redirect', 302, 'GET', 'https://release-assets.githubusercontent.com/asset.zip');
  assert.equal(errors.length, 0);
  assert.equal(next.hostname, 'release-assets.githubusercontent.com');
  assert.equal(next.headers.Authorization, undefined);
  assert.equal(next.headers.Cookie, undefined);
  const final = request();
  executor.addErrorAndTimeoutHandlers(final, error => errors.push(error));
  final.emit('error', Error('actual download failure'));
  assert.equal(errors.length, 1);
  assert.equal(errors[0].message, 'actual download failure');
});

test('redirect limits still fail and patching twice is idempotent', () => {
  const executor = new ElectronHttpExecutor();
  executor.maxRedirects = 1;
  guardRedirectAbortErrors(executor);
  const handler = executor.addErrorAndTimeoutHandlers;
  guardRedirectAbortErrors(executor);
  assert.equal(executor.addErrorAndTimeoutHandlers, handler);
  const errors = [];
  function hop(options, count) {
    const value = request();
    executor.addErrorAndTimeoutHandlers(value, error => errors.push(error));
    executor.addRedirectHandlers(value, options, error => errors.push(error), count,
      next => hop(next, 0)); // The library's legacy callback loses its counter.
    value.emit('redirect', 302, 'GET', 'https://github.com/loop');
  }
  hop({ protocol: 'https:', hostname: 'github.com', path: '/loop' }, 0);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /Too many redirects/);
});
