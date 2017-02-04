/*
    Racing+ Client
    for The Binding of Isaac: Afterbirth+
    (main process)
*/

// Log file location:
// %APPDATA%\..\Local\Programs\Racing+.log
// Log file location (for copy pasting into Discord):
// %APPDATA%\\..\Local\Programs\Racing+.log

// Settings file location:
// %APPDATA%\..\Local\Programs\settings.json
// Settings file location (for copy pasting into Discord):
// %APPDATA%\..\Local\Programs\settings.json

// Build:
// npm run dist --python="C:\Python27\python.exe"
// Build and upload to GitHub:
// npm run dist2 --python="C:\Python27\python.exe"

// Reinstall NPM dependencies:
// (ncu updates the package.json, so blow away everything and reinstall)
// ncu -a && rm -rf node_modules && npm install --python="C:\Python27\python.exe"

// To build Greenworks:
// (from: https://github.com/greenheartgames/greenworks)
// cd D:\Repositories\isaac-racing-client\node_modules\greenworks
// set HOME=C:\Users\james\.electron-gyp && node-gyp rebuild --target=1.4.14 --arch=x64 --dist-url=https://atom.io/download/atom-shell

// Count lines of code:
// cloc . --exclude-dir .git,dist,node_modules,css,fonts,words

'use strict';

// Imports
const electron       = require('electron');
const app            = electron.app;
const BrowserWindow  = electron.BrowserWindow;
const ipcMain        = electron.ipcMain;
const globalShortcut = electron.globalShortcut;
const autoUpdater    = require('electron-auto-updater').autoUpdater; // Import electron-builder's autoUpdater as opposed to the generic electron autoUpdater
                                                                     // See: https://github.com/electron-userland/electron-builder/wiki/Auto-Update
const execFile       = require('child_process').execFile;
const fork           = require('child_process').fork;
const fs             = require('fs');
const os             = require('os');
const path           = require('path');
const isDev          = require('electron-is-dev');
const tracer         = require('tracer');
const Raven          = require('raven');
const teeny          = require('teeny-conf');

// Constants
const assetsFolder = path.resolve(process.execPath, '..', '..', '..', '..', 'assets');

// Global variables
var mainWindow; // Keep a global reference of the window object
                // (otherwise the window will be closed automatically when the JavaScript object is garbage collected)
var childLogWatcher = null;
var childSteam = null;
var childIsaac = null;

/*
    Logging (code duplicated between main, renderer, and child processes because of require/nodeRequire issues)
*/

const log = tracer.console({
    format: "{{timestamp}} <{{title}}> {{file}}:{{line}} - {{message}}",
    dateformat: "ddd mmm dd HH:MM:ss Z",
    transport: function(data) {
        // #1 - Log to the JavaScript console
        console.log(data.output);

        // #2 - Log to a file
        let logFile = (isDev ? 'Racing+.log' : path.resolve(process.execPath, '..', '..', 'Racing+.log'));
        fs.appendFile(logFile, data.output + (process.platform === 'win32' ? '\r' : '') + '\n', function(err) {
            if (err) {
                throw err;
            }
        });
    }
});

// Get the version
let packageFileLocation = path.join(__dirname, 'package.json');
let packageFile = fs.readFileSync(packageFileLocation, 'utf8');
let version = 'v' + JSON.parse(packageFile).version;
log.info('Racing+ client', version, 'started!');

// Raven (error logging to Sentry)
Raven.config('https://0d0a2118a3354f07ae98d485571e60be:843172db624445f1acb86908446e5c9d@sentry.io/124813', {
    autoBreadcrumbs: true,
    release: version,
    environment: (isDev ? 'development' : 'production'),
    dataCallback: function(data) {
        log.error(data);
        return data;
    },
}).install();

/*
    Settings (on persistent storage)
*/

// Open the file that contains all of the user's settings
// (We use teeny-conf instead of localStorage because localStorage persists after uninstallation)
const settingsFile = (isDev ? 'settings.json' : path.resolve(process.execPath, '..', '..', 'settings.json'));
let settings = new teeny(settingsFile);
settings.loadOrCreateSync();

/*
    Subroutines
*/

function createWindow() {
    // Figure out what the window size and position should be
    if (typeof settings.get('window') === 'undefined') {
        // If this is the first run, create an empty window object
        settings.set('window', {});
        settings.saveSync();
    }
    let windowSettings = settings.get('window');

    // Width
    let width;
    if (windowSettings.hasOwnProperty('width')) {
        width = windowSettings.width;
    } else {
        width = (isDev ? 1610 : 1110);
    }

    // Height
    let height;
    if (windowSettings.hasOwnProperty('height')) {
        height = windowSettings.height;
    } else {
        height = 720;
    }

    // Create the browser window
    mainWindow = new BrowserWindow({
        x:      windowSettings.x,
        y:      windowSettings.y,
        width:  width,
        height: height,
        icon:   path.resolve(assetsFolder, 'img', 'favicon.png'),
        title:  'Racing+',
        frame:  false,
    });
    if (isDev === true) {
        mainWindow.webContents.openDevTools();
    }
    mainWindow.loadURL(`file://${__dirname}/index.html`);

    // Remove the taskbar flash state
    // (this is not currently used)
    mainWindow.once('focus', function() {
        mainWindow.flashFrame(false);
    });

    // Save the window size and position
    mainWindow.on('close', function() {
        let windowBounds = mainWindow.getBounds();

        // We have to re-get the settings, since the renderer process may have changed them
        // If so, our local copy of all of the settings is no longer current
        settings.loadOrCreateSync();
        settings.set('window', windowBounds);
        settings.saveSync();
    });

    // Dereference the window object when it is closed
    mainWindow.on('closed', function() {
        mainWindow = null;
    });
}

function autoUpdate() {
    // Now that the window is created, check for updates
    if (isDev === false) {
        autoUpdater.on('error', function(err) {
            log.error(err.message);
            Raven.captureException(err);
            mainWindow.webContents.send('autoUpdater', 'error');
        });

        autoUpdater.on('checking-for-update', function() {
            mainWindow.webContents.send('autoUpdater', 'checking-for-update');
        });

        autoUpdater.on('update-available', function() {
            mainWindow.webContents.send('autoUpdater', 'update-available');
        });

        autoUpdater.on('update-not-available', function() {
            mainWindow.webContents.send('autoUpdater', 'update-not-available');
        });

        autoUpdater.on('update-downloaded', function(e, notes, name, date, url) {
            mainWindow.webContents.send('autoUpdater', 'update-downloaded');
        });

        log.info('Checking for updates.');
        autoUpdater.checkForUpdates();
    }
}

function registerKeyboardHotkeys() {
    // Register global hotkeys
    const hotkeyIsaacFocus = globalShortcut.register('Alt+1', function() {
        if (process.platform === 'win32') { // This will return "win32" even on 64-bit Windows
            let pathToFocusIsaac = path.join(__dirname, 'assets', 'programs', 'focusIsaac', 'focusIsaac.exe');
            execFile(pathToFocusIsaac, function(error, stdout, stderr) {
                // We have to attach an empty callback to this or it does not work for some reason
            });
        }
    });
    if (!hotkeyIsaacFocus) {
        log.warn('Alt+1 hotkey registration failed.');
    }

    const hotkeyRacingPlusFocus = globalShortcut.register('Alt+2', function() {
        mainWindow.focus();
    });
    if (!hotkeyRacingPlusFocus) {
        log.warn('Alt+2 hotkey registration failed.');
    }

    const hotkeyReady = globalShortcut.register('Alt+R', function() {
        mainWindow.webContents.send('hotkey', 'ready');
    });
    if (!hotkeyReady) {
        log.warn('Alt+R hotkey registration failed.');
    }

    const hotkeyQuit = globalShortcut.register('Alt+Q', function() {
        mainWindow.webContents.send('hotkey', 'quit');
    });
    if (!hotkeyQuit) {
        log.warn('Alt+Q hotkey registration failed.');
    }

    const hotkeyBlckCndl = globalShortcut.register('Alt+C', function() {
        // Default to keyboard
        let controller = false;

        // We have to re-get the settings, since the renderer process may have changed them
        // If so, our local copy of all of the settings is no longer current
        settings.loadOrCreateSync();
        if (typeof settings.get('controller') !== 'undefined') {
            if (settings.get('controller') === true) {
                controller = true;
            }
        }

        if (process.platform === 'win32') { // This will return "win32" even on 64-bit Windows
            let pathToBlckCndl = path.join(__dirname, 'assets', 'programs', 'gameHotkeys', 'blckCndl' + (controller ? 'Controller' : '') + '.exe');
            execFile(pathToBlckCndl, function(error, stdout, stderr) {
                // We have to attach an empty callback to this or it does not work for some reason
            });
        }
    });
    if (!hotkeyBlckCndl) {
        log.warn('Alt+C hotkey registration failed.');
    }

    const hotkeyBlckCndlSeed = globalShortcut.register('Alt+V', function() {
        // Default to keyboard
        let controller = false;

        // We have to re-get the settings, since the renderer process may have changed them
        // If so, our local copy of all of the settings is no longer current
        settings.loadOrCreateSync();
        if (typeof settings.get('controller') !== 'undefined') {
            if (settings.get('controller') === true) {
                controller = true;
            }
        }

        if (process.platform === 'win32') { // This will return "win32" even on 64-bit Windows
            let pathToBlckCndlSeed = path.join(__dirname, 'assets', 'programs', 'gameHotkeys', 'blckCndlSeed' + (controller ? 'Controller' : '') + '.exe');
            execFile(pathToBlckCndlSeed, function(error, stdout, stderr) {
                // We have to attach an empty callback to this or it does not work for some reason
            });
        }
    });
    if (!hotkeyBlckCndlSeed) {
        log.warn('Alt+V hotkey registration failed.');
    }
}

/*
    Application handlers
*/

// Check to see if the application is already open
if (isDev === false) {
    const shouldQuit = app.makeSingleInstance((commandLine, workingDirectory) => {
        // A second instance of the program was opened, so just focus the existing window
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
    if (shouldQuit) {
        app.quit();
    }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', function() {
    createWindow();
    autoUpdate();
    registerKeyboardHotkeys();
});

// Quit when all windows are closed.
app.on('window-all-closed', function() {
    // On OS X it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', function() {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (mainWindow === null) {
        createWindow();
    }
});

app.on('will-quit', function() {
    // Unregister the global keyboard hotkeys
    globalShortcut.unregisterAll();

    // Tell the child processes to exit (in Node, they will live forever even if the parent closes)
    if (childSteam !== null) {
        childSteam.send('exit');
    }
    if (childLogWatcher !== null) {
        childLogWatcher.send('exit');
    }
    if (childIsaac !== null) {
        childIsaac.send('exit');
    }
});

/*
    IPC handlers
*/

ipcMain.on('asynchronous-message', function(event, arg1, arg2) {
    log.info('Main process recieved message:', arg1);

    if (arg1 === 'minimize') {
        mainWindow.minimize();

    } else if (arg1 === 'maximize') {
        if (mainWindow.isMaximized() === true) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }

    } else if (arg1 === 'close') {
        app.quit();

    } else if (arg1 === 'restart') {
        app.relaunch();
        app.quit();

    } else if (arg1 === 'quitAndInstall') {
        autoUpdater.quitAndInstall();

    } else if (arg1 === 'devTools') {
        mainWindow.webContents.openDevTools();

    } else if (arg1 === 'steam' && childSteam === null) {
        // Initialize the Greenworks API in a separate process because otherwise the game will refuse to open if Racing+ is open
        // (Greenworks uses the same AppID as Isaac, so Steam gets confused)
        if (isDev) {
            childSteam = fork('./steam');
        } else {
            // There are problems when forking inside of an ASAR archive
            // See: https://github.com/electron/electron/issues/2708
            childSteam = fork('./app.asar/steam', {
                cwd: path.join(__dirname, '..'),
            });
        }
        log.info('Started the Greenworks child process.');

        // Receive notifications from the child process
        childSteam.on('message', function(message) {
            // Pass the message to the renderer (browser) process
            mainWindow.webContents.send('steam', message);
        });

        // Track errors
        childSteam.on('error', function(err) {
            // Pass the error to the renderer (browser) process
            mainWindow.webContents.send('steam', 'error: ' + err);
        });

        // Track when the process exits
        childSteam.on('exit', function() {
            mainWindow.webContents.send('steam', 'exited');
        });

    } else if (arg1 === 'steamExit') {
        // The renderer has successfully authenticated and is now establishing a WebSocket connection, so we can kill the Greenworks process
        if (childSteam !== null) {
            childSteam.send('exit');
        }

    } else if (arg1 === 'logWatcher' && childLogWatcher === null) {
        // Start the log watcher in a separate process for performance reasons
        if (isDev) {
            childLogWatcher = fork('./log-watcher');
        } else {
            // There are problems when forking inside of an ASAR archive
            // See: https://github.com/electron/electron/issues/2708
            childLogWatcher = fork('./app.asar/log-watcher', {
                cwd: path.join(__dirname, '..'),
            });
        }
        log.info('Started the log watcher child process.');

        // Receive notifications from the child process
        childLogWatcher.on('message', function(message) {
            // Pass the message to the renderer (browser) process
            mainWindow.webContents.send('logWatcher', message);
        });

        // Track errors
        childLogWatcher.on('error', function(err) {
            // Pass the error to the renderer (browser) process
            mainWindow.webContents.send('logWatcher', 'error: ' + err);
        });

        // Feed the child the path to the Isaac log file
        childLogWatcher.send(arg2);

    } else if (arg1 === 'isaac') {
        // Start the Isaac launcher in a separate process for performance reasons
        if (isDev) {
            childIsaac = fork('./isaac');
        } else {
            // There are problems when forking inside of an ASAR archive
            // See: https://github.com/electron/electron/issues/2708
            childIsaac = fork('./app.asar/isaac', {
                cwd: path.join(__dirname, '..'),
            });
        }
        log.info('Started the Isaac launcher child process.');

        // Receive notifications from the child process
        childIsaac.on('message', function(message) {
            // Pass the message to the renderer (browser) process
            mainWindow.webContents.send('isaac', message);
        });

        // Track errors
        childIsaac.on('error', function(err) {
            // Pass the error to the renderer (browser) process
            mainWindow.webContents.send('isaac', 'error: ' + err);
        });

        // Feed the child the path to the Isaac mods directory and the "force" boolean
        childIsaac.send(arg2);

        // After being launched, Isaac will wrest control, so automatically switch focus back to the Racing+ client when this occurs
        if (process.platform === 'win32') { // This will return "win32" even on 64-bit Windows
            let pathToFocusRacing = path.join(__dirname, 'assets', 'programs', 'focusRacing+', 'focusRacing+.exe');
            execFile(pathToFocusRacing, function(error, stdout, stderr) {
                // We have to attach an empty callback to this or it does not work for some reason
            });
        } else if (process.platform === 'darwin') { // OS X
            // Try using "opn(pathToRacingPlusBinary)"
            // TODO
        } else {
            // Linux is not supported
        }
    }
});
