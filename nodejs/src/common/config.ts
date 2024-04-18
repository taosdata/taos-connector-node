export class WSConfig {
    private _user: string | undefined | null;
    private _password: string | undefined | null;
    private _db: string | undefined | null;
    private _url: string;
    private _timeout:number| undefined | null;
    private _token:string | undefined | null;

    constructor(url:string) {
        this._url = url;
    }

    public GetToken(): string | undefined | null {
        return this._token;
    }
    public SetToken(token: string) {
        this._token = token;
    }

    public GetUser(): string | undefined | null {
        return this._user;
    }
    public SetUser(user: string) {
        this._user = user;
    }

    public GetPwd(): string | undefined | null {
        return this._password;
    }
    public SetPwd(pws:string) {
        this._password = pws;
    }

    public GetDb(): string | undefined | null {
        return this._db;
    }
    public SetDb(db: string) {
        this._db = db;
    }

    public GetUrl(): string {
        return this._url;
    }

    public SetUrl(url: string) {
        this._url = url;
    }
    
    public SetTimeOut(ms : number) {
        this._timeout = ms
    }
    public GetTimeOut(): number | undefined | null {
        return this._timeout
    }

    
}
