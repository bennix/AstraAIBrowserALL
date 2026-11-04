const { app, dialog } = require('electron');

let checking = false;

async function checkForUpdate() {
  if (!app.isPackaged) {
    await dialog.showMessageBox({ message: 'Updates are available in installed builds.' });
    return;
  }
  if (checking) return;
  checking = true;
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    const result = await autoUpdater.checkForUpdates();
    if (!result?.isUpdateAvailable) {
      await dialog.showMessageBox({ message: 'Astra Browser is up to date.' });
      return;
    }
    const { response } = await dialog.showMessageBox({
      message: `Astra Browser ${result.updateInfo.version} is available.`,
      buttons: ['Download', 'Later'],
      cancelId: 1
    });
    if (response !== 0) return;
    await autoUpdater.downloadUpdate();
    const install = await dialog.showMessageBox({
      message: 'The update is ready.',
      buttons: ['Install and Restart', 'Later'],
      cancelId: 1
    });
    if (install.response === 0) autoUpdater.quitAndInstall();
  } catch (error) {
    await dialog.showMessageBox({
      type: 'error',
      message: 'Unable to update Astra Browser.',
      detail: error.message
    });
  } finally {
    checking = false;
  }
}

module.exports = { checkForUpdate };
