const certutils = require('./certutils');
const electron = require('electron');
const https = require('https');
const path = require('path');
const url = require('url');

const {app, ipcMain} = electron;
const BrowserWindow = electron.BrowserWindow;
const APP_PATH = app.getAppPath();

let mainWindow;

const buildCert = cert => `-----BEGIN CERTIFICATE-----\n${cert.raw.toString('base64')}\n-----END CERTIFICATE-----`;

const connect = hostname => {
  return new Promise((resolve) => {
    https.get(`https://${hostname}`).on('socket', (socket) => {
      socket.on('secureConnect', () => {
        const cert = socket.getPeerCertificate(true);
        const certData = {
          data: buildCert(cert),
          issuerCert: {
            data: buildCert(cert.issuerCertificate),
          },
        };
        resolve({certData, hostname});
      });
    });
  });
};

const verifyHosts = hostnames => {
  const certPromises = hostnames.map(hostname => connect(hostname));

  return Promise.all(certPromises)
    .then(objects => objects.forEach(({hostname, certData}) => {
      const result = certutils.verifyPinning(hostname, certData);
      mainWindow.webContents.send('result', {hostname, result});
    }));
}

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600
  });

  mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => mainWindow = null);

  mainWindow.loadURL(url.format({
    pathname: path.join(APP_PATH, 'index.html'),
    protocol: 'file:',
    slashes: true
  }));

  mainWindow.webContents.on('dom-ready', () => {
    const hostnames = [
      'app.wire.com',
      'prod-assets.wire.com',
      'prod-nginz-https.wire.com',
      'prod-nginz-ssl.wire.com',
      'wire.com',
    ];
    ipcMain.on('jquery-ready', () => mainWindow.webContents.send('hostnames', hostnames));
    ipcMain.on('start-verification', () => verifyHosts(hostnames));
    mainWindow.show();
  });
};

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
