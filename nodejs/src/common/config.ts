export class WSConfig {
    private _user: string | undefined | null;
    private _password: string | undefined | null;
    private _db: string | undefined | null;
    private _url: string;
    private _timeout:number| undefined | null;
    private _token:string | undefined | null;
    private _timezone:string | undefined | null;

    constructor(url:string) {
        this._url = url;
    }

    public getToken(): string | undefined | null {
        return this._token;
    }
    public setToken(token: string) {
        this._token = token;
    }

    public getUser(): string | undefined | null {
        return this._user;
    }
    public setUser(user: string) {
        this._user = user;
    }

    public getPwd(): string | undefined | null {
        return this._password;
    }
    public setPwd(pws:string) {
        this._password = pws;
    }

    public getDb(): string | undefined | null {
        return this._db;
    }
    public setDb(db: string) {
        this._db = db;
    }

    public getUrl(): string {
        return this._url;
    }

    public setUrl(url: string) {
        this._url = url;
    }
    
    public setTimeOut(ms : number) {
        this._timeout = ms
    }
    public getTimeOut(): number | undefined | null {
        return this._timeout
    }
    public setTimezone(timezone: string) {
        this._timezone = timezone;
    }
    public getTimezone(): string | undefined | null {
        return this._timezone;
    }
}
