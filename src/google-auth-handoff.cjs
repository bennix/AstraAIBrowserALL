function googleAppUrl(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return false;
    if (!['google.com', 'youtube.com'].some(host => u.hostname === host || u.hostname.endsWith('.' + host))) return false;
    if (['accounts.google.com', 'accounts.youtube.com'].includes(u.hostname)) return false;
    // Keep cookie handoffs, verification and OAuth callbacks in their native window.
    return !/^\/(?:accounts|signin|o\/oauth2|oauth|sorry|challenge|CheckCookie)(?:\/|$)/i.test(u.pathname);
  } catch { return false; }
}

module.exports = function watchGoogleAccountPopup(source, initialUrl, popup, openTab) {
  let login;
  try { login = new URL(initialUrl); } catch { return; }
  if (!googleAppUrl(source) || login.protocol !== 'https:' || login.hostname !== 'accounts.google.com' ||
      login.username || login.password || login.port) return;
  const wc = popup.webContents;
  let busy = false;
  const finish = async () => {
    if (busy || popup.isDestroyed() || wc.isDestroyed()) return;
    const target = wc.getURL();
    if (!googleAppUrl(target)) return;
    busy = true;
    try {
      // Keep authuser and all other routing parameters; the new tab shares the session.
      const loaded = await openTab(target);
      if (loaded === false) { busy = false; return; }
      wc.removeListener('did-finish-load', finish);
      if (!popup.isDestroyed()) popup.close();
    } catch { busy = false; } // A failed tab load must not discard the signed-in window.
  };
  wc.on('did-finish-load', finish);
  popup.once('closed', () => wc.removeListener('did-finish-load', finish));
};
module.exports.googleAppUrl = googleAppUrl;
