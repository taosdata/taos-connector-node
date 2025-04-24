"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WSConfig = void 0;
class WSConfig {
    constructor(url) {
        this._url = url;
    }
    getToken() {
        return this._token;
    }
    setToken(token) {
        this._token = token;
    }
    getUser() {
        return this._user;
    }
    setUser(user) {
        this._user = user;
    }
    getPwd() {
        return this._password;
    }
    setPwd(pws) {
        this._password = pws;
    }
    getDb() {
        return this._db;
    }
    setDb(db) {
        this._db = db;
    }
    getUrl() {
        return this._url;
    }
    setUrl(url) {
        this._url = url;
    }
    setTimeOut(ms) {
        this._timeout = ms;
    }
    getTimeOut() {
        return this._timeout;
    }
}
exports.WSConfig = WSConfig;
