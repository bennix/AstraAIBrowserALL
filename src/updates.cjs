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
    require('./update-http.cjs').guardRedirectAbortErrors(autoUpdater.httpExecutor);
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    const result = await autoUpdater.checkForUpdates();
    if (!result?.isUpdateAvailable) {
      await dialog.showMessageBox({
        message: 'Astra Browser 已是最新版本',
        detail: '当前安装版本：'+app.getVersion()+'\n最新可用版本：'+(result?.updateInfo?.version||app.getVersion())
      });
      return;
    }
    const { response } = await dialog.showMessageBox({
      message: `Astra Browser ${result.updateInfo.version} is available.`,
      detail: '当前安装版本：'+app.getVersion()+'\n更新版本：'+result.updateInfo.version,
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
