"use strict";
/// <reference types="cordova-plugin-file" />
/// <reference types="cordova" />
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const guards_1 = require("./guards");
// NATIVE API TODO:
// getPreferences
// syncPreferences
class Path {
    join(...paths) {
        let fullPath = paths.shift() || '';
        for (const path of paths) {
            if (fullPath && fullPath.slice(-1) !== '/') {
                fullPath += '/';
            }
            fullPath = path.slice(0, 1) !== '/' ? fullPath + path : fullPath + path.slice(1);
        }
        return fullPath;
    }
}
const path = new Path();
/**
 * LIVE UPDATE API
 *
 * The plugin API for the live updates feature.
 */
class IonicDeploy {
    constructor(parent) {
        this._PREFS_KEY = '_ionicDeploySavedPrefs';
        this._fileManager = new FileManager();
        this.FILE_CACHE = 'ionic_snapshot_files';
        this.MANIFEST_CACHE = 'ionic_manifests';
        this.SNAPSHOT_CACHE = 'ionic_built_snapshots';
        this.PLUGIN_VERSION = '5.0.0';
        this._parent = parent;
        this._savedPreferences = new Promise((resolve, reject) => {
            try {
                const prefsString = localStorage.getItem(this._PREFS_KEY);
                if (!prefsString) {
                    cordova.exec(prefs => {
                        resolve(prefs);
                        this._syncPrefs();
                    }, reject, 'IonicCordovaCommon', 'getPreferences');
                    return;
                }
                const savedPreferences = JSON.parse(prefsString);
                resolve(savedPreferences);
            }
            catch (e) {
                reject(e.message);
            }
        });
    }
    getFileCacheDir() {
        return path.join(cordova.file.cacheDirectory, this.FILE_CACHE);
    }
    getManifestCacheDir() {
        return path.join(cordova.file.dataDirectory, this.MANIFEST_CACHE);
    }
    getSnapshotCacheDir(versionId) {
        return path.join(cordova.file.dataDirectory, this.SNAPSHOT_CACHE, versionId);
    }
    _syncPrefs(prefs = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            const currentPrefs = yield this._savedPreferences;
            if (currentPrefs) {
                Object.assign(currentPrefs, prefs);
            }
            localStorage.setItem(this._PREFS_KEY, JSON.stringify(currentPrefs));
            return currentPrefs;
        });
    }
    init(config, success, failure) {
        console.warn('This function has been deprecated in favor of IonicCordova.delpoy.configure.');
        this.configure(config).then(result => success(), err => {
            typeof err === 'string' ? failure(err) : failure(err.message);
        });
    }
    configure(config) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!guards_1.isPluginConfig(config)) {
                throw new Error('Invalid Config Object');
            }
            // TODO: make sure the user can't overwrite protected things
            Object.assign(yield this._savedPreferences, config);
            return new Promise((resolve, reject) => {
                this._syncPrefs();
            });
        });
    }
    check(success, failure) {
        console.warn('This function has been deprecated in favor of IonicCordova.delpoy.checkForUpdate.');
        this.checkForUpdate().then(result => success(String(result.available)), err => {
            typeof err === 'string' ? failure(err) : failure(err.message);
        });
    }
    checkForUpdate() {
        return __awaiter(this, void 0, void 0, function* () {
            const savedPreferences = yield this._savedPreferences;
            const appInfo = yield this._parent.getAppDetails();
            const endpoint = `${savedPreferences.host}/apps/${savedPreferences.appId}/channels/check-device`;
            const device_details = {
                binary_version: appInfo.bundleVersion,
                platform: appInfo.platform,
                snapshot: savedPreferences.currentVersionId
            };
            const body = {
                channel_name: savedPreferences.channel,
                app_id: savedPreferences.appId,
                device: device_details,
                plugin_version: this.PLUGIN_VERSION,
                manifest: true
            };
            const resp = yield fetch(endpoint, {
                method: 'POST',
                headers: new Headers({
                    'Content-Type': 'application/json'
                }),
                body: JSON.stringify(body)
            });
            let jsonResp;
            if (resp.status < 500) {
                jsonResp = yield resp.json();
            }
            if (resp.ok) {
                const checkDeviceResp = jsonResp.data;
                if (checkDeviceResp.available && checkDeviceResp.url) {
                    const prefs = yield this._savedPreferences;
                    prefs.availableUpdate = checkDeviceResp;
                    this._syncPrefs();
                }
                return checkDeviceResp;
            }
            throw new Error(`Error Status ${resp.status}: ${jsonResp ? jsonResp.error.message : yield resp.text()}`);
        });
    }
    download(success, failure) {
        console.warn('This function has been deprecated in favor of IonicCordova.delpoy.downloadUpdate.');
        this.downloadUpdate().then(result => success(result), err => {
            typeof err === 'string' ? failure(err) : failure(err.message);
        });
    }
    downloadUpdate() {
        return __awaiter(this, void 0, void 0, function* () {
            const prefs = yield this._savedPreferences;
            if (prefs.availableUpdate && prefs.availableUpdate.available && prefs.availableUpdate.url && prefs.availableUpdate.snapshot) {
                const { manifestBlob, fileBaseUrl } = yield this._fetchManifest(prefs.availableUpdate.url);
                const manifestString = yield this._fileManager.getFile(this.getManifestCacheDir(), this._getManifestName(prefs.availableUpdate.snapshot), true, manifestBlob);
                const manifestJson = JSON.parse(manifestString);
                yield this._downloadFilesFromManifest(fileBaseUrl, manifestJson);
                prefs.pendingUpdate = prefs.availableUpdate.snapshot;
                delete prefs.availableUpdate;
                yield this._syncPrefs();
                return 'true';
            }
            throw new Error('No available updates');
        });
    }
    _getManifestName(versionId) {
        return versionId + '-manifest.json';
    }
    _downloadFilesFromManifest(baseUrl, manifest) {
        return __awaiter(this, void 0, void 0, function* () {
            return Promise.all(manifest.map((file) => __awaiter(this, void 0, void 0, function* () {
                const alreadyExists = yield this._fileManager.fileExists(this.getFileCacheDir(), this._cleanHash(file.integrity));
                if (alreadyExists) {
                    console.log(`file ${file.href} with hash ${file.integrity} already exists`);
                    return;
                }
                else {
                    console.log(`file ${file.href} with hash ${file.integrity} didn't exist`);
                }
                // if it's 0 size file just create it
                if (file.size === 0) {
                    return this._fileManager.getFile(this.getFileCacheDir(), this._cleanHash(file.integrity), true, new Blob());
                }
                // otherwise get it from internets
                const base = new URL(baseUrl);
                const newUrl = new URL(file.href, baseUrl);
                newUrl.search = base.search;
                return fetch(newUrl.toString(), {
                    method: 'GET',
                    integrity: file.integrity,
                }).then((resp) => __awaiter(this, void 0, void 0, function* () {
                    return this._fileManager.getFile(this.getFileCacheDir(), this._cleanHash(file.integrity), true, yield resp.blob());
                }));
            })));
        });
    }
    _cleanHash(metadata) {
        const hashes = metadata.split(' ');
        return hashes[0].replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    }
    _fetchManifest(url) {
        return __awaiter(this, void 0, void 0, function* () {
            const resp = yield fetch(url, {
                method: 'GET',
                redirect: 'follow',
            });
            return {
                manifestBlob: yield resp.blob(),
                fileBaseUrl: resp.url
            };
        });
    }
    extract(success, failure) {
        console.warn('This function has been deprecated in favor of IonicCordova.delpoy.extractUpdate.');
        this.extractUpdate().then(result => success(result), err => {
            typeof err === 'string' ? failure(err) : failure(err.message);
        });
    }
    extractUpdate() {
        return __awaiter(this, void 0, void 0, function* () {
            const prefs = yield this._savedPreferences;
            if (!prefs.pendingUpdate) {
                throw new Error('No pending update to extract');
            }
            const versionId = prefs.pendingUpdate;
            const manifestString = yield this._fileManager.getFile(this.getManifestCacheDir(), this._getManifestName(versionId));
            const manifest = JSON.parse(manifestString);
            const snapshotDir = this.getSnapshotCacheDir(versionId);
            try {
                const dirEntry = yield this._fileManager.getDirectory(snapshotDir, false);
                console.log(`directory found for snapshot ${versionId} deleting`);
                yield (new Promise((resolve, reject) => dirEntry.removeRecursively(resolve, reject)));
            }
            catch (e) {
                console.log('No directory found for snapshot no need to delete');
            }
            yield Promise.all(manifest.map((file) => __awaiter(this, void 0, void 0, function* () {
                const splitPath = file.href.split('/');
                const fileName = splitPath.pop();
                let path;
                if (splitPath.length > 0) {
                    path = splitPath.join('/');
                }
                path = snapshotDir + (path ? ('/' + path) : '');
                if (fileName) {
                    return this._fileManager.copyTo(this.getFileCacheDir(), this._cleanHash(file.integrity), path, fileName);
                }
                throw new Error('No file name found');
            })));
            prefs.updateReady = prefs.pendingUpdate;
            delete prefs.pendingUpdate;
            yield this._syncPrefs();
            return 'true';
        });
    }
    redirect(success, failure) {
        console.warn('This function has been deprecated in favor of IonicCordova.delpoy.reloadApp.');
        this.reloadApp().then(result => success(result), err => {
            typeof err === 'string' ? failure(err) : failure(err.message);
        });
    }
    reloadApp() {
        return __awaiter(this, void 0, void 0, function* () {
            const prefs = yield this._savedPreferences;
            // const cordovaResp = await (new Promise<string>( (resolve, reject) => {
            //   if (prefs.updateReady) {
            //     cordova.exec(
            //       resolve,
            //       reject,
            //       'IonicCordovaCommon',
            //       'reloadApp',
            //       [`${this.getSnapshotCacheDir(prefs.updateReady)}/index.html`]
            //     );
            //   } else {
            //     reject("No update available for reload");
            //   }
            // }));
            if (prefs.updateReady) {
                const snapshotDir = this.getSnapshotCacheDir(prefs.updateReady);
                yield this._swizzleCordovaReference(snapshotDir);
                const newLocation = new URL(`${snapshotDir}/index.html`);
                console.log(`Redirecting window to ${newLocation}`);
                window.location.pathname = newLocation.pathname;
                console.log('deleting update ready key');
                delete prefs.updateReady;
                return 'true';
            }
            else {
                throw new Error('No update available for reload');
            }
        });
    }
    _swizzleCordovaReference(snapshotDir) {
        return __awaiter(this, void 0, void 0, function* () {
            const parser = new DOMParser();
            const indexFile = yield this._fileManager.getFile(snapshotDir, `index.html`);
            const parsedIndexFile = parser.parseFromString(indexFile, 'text/html');
            const scripts = parsedIndexFile.getElementsByTagName('script');
            Array.from(scripts).forEach((script) => {
                if (script.src.indexOf('cordova.js') > -1) {
                    const fileUrl = new URL(`${cordova.file.applicationDirectory}/www/cordova.js`);
                    const srcUrl = new URL(window.location.origin);
                    srcUrl.pathname = fileUrl.pathname;
                    script.src = srcUrl.href;
                }
            });
            const s = new XMLSerializer();
            const htmlString = s.serializeToString(parsedIndexFile);
            yield this._fileManager.getFile(snapshotDir, 'index.html', true, new Blob([htmlString], { type: 'text/html' }));
        });
    }
    info(success, failure) {
        console.warn('This function has been deprecated in favor of IonicCordova.delpoy.getCurrentVersion.');
        this.getCurrentVersion().then(result => success(result), err => {
            typeof err === 'string' ? failure(err) : failure(err.message);
        });
    }
    getCurrentVersion() {
        return __awaiter(this, void 0, void 0, function* () {
            const versionId = (yield this._savedPreferences).currentVersionId;
            if (typeof versionId === 'string') {
                return this.getVersionById(versionId);
            }
            throw new Error('No current version applied.');
        });
    }
    getVersionById(versionId) {
        return __awaiter(this, void 0, void 0, function* () {
            // TODO: Implement
            // cordova.exec(success, failure, 'IonicDeploy', 'info');
            return {
                deploy_uuid: 'TODO',
                versionId: 'TODO',
                channel: 'todo',
                binary_version: 'todo',
                binaryVersion: 'todo'
            };
        });
    }
    getVersions(success, failure) {
        console.warn('This function has been deprecated in favor of IonicCordova.delpoy.getAvailableVersions.');
        this.getAvailableVersions().then(results => success(results.map(result => result.versionId)), err => {
            typeof err === 'string' ? failure(err) : failure(err.message);
        });
    }
    getAvailableVersions() {
        return __awaiter(this, void 0, void 0, function* () {
            // TODO: Implement
            // cordova.exec(success, failure, 'IonicDeploy', 'getVersions');
            return [{
                    deploy_uuid: 'TODO',
                    versionId: 'TODO',
                    channel: 'todo',
                    binary_version: 'todo',
                    binaryVersion: 'todo'
                }];
        });
    }
    deleteVersion(versionId, success, failure) {
        console.warn('This function has been deprecated in favor of IonicCordova.delpoy.deleteVersionById.');
        this.deleteVersionById(versionId).then(result => success(result), err => {
            typeof err === 'string' ? failure(err) : failure(err.message);
        });
    }
    deleteVersionById(versionId) {
        return __awaiter(this, void 0, void 0, function* () {
            // TODO: Implement
            // cordova.exec(success, failure, 'IonicDeploy', 'deleteVersion', [version]);
            return 'Implement me please';
        });
    }
    sync(syncOptions = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            // TODO:
            // const updateMethod = syncOptions.updateMethod || this._savedPreferences.updateMethod;
            // await checkForUpdate();
            // if update available and not stored locally
            //   await downloadUpdate();
            //   await extractUpdate();
            //   if updateMethod === 'auto'
            //     await reloadApp();
            yield this.checkForUpdate();
            yield this.downloadUpdate();
            yield this.extractUpdate();
            yield this.reloadApp();
            return {
                deploy_uuid: 'TODO',
                versionId: 'TODO',
                channel: 'todo',
                binary_version: 'todo',
                binaryVersion: 'todo'
            };
        });
    }
}
class FileManager {
    getDirectory(path, createDirectory = true) {
        return new Promise((resolve, reject) => {
            resolveLocalFileSystemURL(path, entry => entry.isDirectory ? resolve(entry) : reject(), () => __awaiter(this, void 0, void 0, function* () {
                const components = path.split('/');
                const child = components.pop();
                const parent = (yield this.getDirectory(components.join('/'), createDirectory));
                parent.getDirectory(child, { create: createDirectory }, resolve, reject);
            }));
        });
    }
    resolvePath() {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                resolveLocalFileSystemURL(cordova.file.dataDirectory, (rootDirEntry) => {
                    resolve(rootDirEntry);
                }, reject);
            });
        });
    }
    readFile(fileEntry) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                fileEntry.file((file) => {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        resolve(reader.result);
                    };
                    reader.readAsText(file);
                }, reject);
            });
        });
    }
    getFile(path, fileName, createFile = false, dataBlob) {
        return __awaiter(this, void 0, void 0, function* () {
            const fileEntry = yield this.getFileEntry(path, fileName, createFile, dataBlob);
            return this.readFile(fileEntry);
        });
    }
    getFileEntry(path, fileName, createFile = false, dataBlob) {
        return __awaiter(this, void 0, void 0, function* () {
            if (createFile && !dataBlob) {
                throw new Error('Must provide file blob if createFile is true');
            }
            const dirEntry = yield this.getDirectory(path, createFile);
            return new Promise((resolve, reject) => {
                dirEntry.getFile(fileName, { create: createFile, exclusive: false }, (fileEntry) => __awaiter(this, void 0, void 0, function* () {
                    if (dataBlob) {
                        yield this.writeFile(fileEntry, dataBlob);
                    }
                    console.log(fileEntry.nativeURL);
                    resolve(fileEntry);
                }), reject);
            });
        });
    }
    fileExists(path, fileName) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.getFileEntry(path, fileName);
                return true;
            }
            catch (e) {
                return false;
            }
        });
    }
    copyTo(oldPath, oldFileName, newPath, newFileName) {
        return __awaiter(this, void 0, void 0, function* () {
            const fileEntry = yield this.getFileEntry(oldPath, oldFileName);
            const newDirEntry = yield this.getDirectory(newPath);
            return new Promise((resolve, reject) => {
                fileEntry.copyTo(newDirEntry, newFileName, resolve, reject);
            });
        });
    }
    writeFile(fileEntry, dataBlob) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                fileEntry.createWriter((fileWriter) => {
                    fileWriter.onwriteend = resolve;
                    fileWriter.onerror = (e) => {
                        reject(e.toString());
                    };
                    fileWriter.write(dataBlob);
                });
            });
        });
    }
}
/**
 * BASE API
 *
 * All features of the Ionic Cordova plugin are registered here, along with some low level error tracking features used
 * by the monitoring service.
 */
class IonicCordova {
    constructor() {
        this.deploy = new IonicDeploy(this);
    }
    getAppInfo(success, failure) {
        console.warn('This function has been deprecated in favor of IonicCordova.getAppDetails.');
        this.getAppDetails().then(result => success(result), err => {
            typeof err === 'string' ? failure(err) : failure(err.message);
        });
    }
    getAppDetails() {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                cordova.exec(resolve, reject, 'IonicCordovaCommon', 'getAppInfo');
            });
        });
    }
}
const instance = new IonicCordova();
module.exports = instance;
