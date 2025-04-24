export declare class WSConfig {
    private _user;
    private _password;
    private _db;
    private _url;
    private _timeout;
    private _token;
    constructor(url: string);
    getToken(): string | undefined | null;
    setToken(token: string): void;
    getUser(): string | undefined | null;
    setUser(user: string): void;
    getPwd(): string | undefined | null;
    setPwd(pws: string): void;
    getDb(): string | undefined | null;
    setDb(db: string): void;
    getUrl(): string;
    setUrl(url: string): void;
    setTimeOut(ms: number): void;
    getTimeOut(): number | undefined | null;
}
//# sourceMappingURL=config.d.ts.map