
import { Uri,User,FetchOptions } from "./options";
import fetch from 'node-fetch'; 

export class TDResRequest {
    uri: Uri;
    options: FetchOptions;
    user:User;

    constructor(url: Uri, user:User) {
        this.uri = url;
        this.user = user;
        this.options = {
            method: 'POST',
            body:'',
            headers:{'Authorization':this._token()}
        }
    }

    _makeUrl(): string {
        let url = `${this.uri.schema}://${this.uri.host}:${this.uri.port}${this.uri.path}`
        if ((this.uri.query != null)||(this.uri.query != undefined)){
            let queryParams = ``
        }
        if ((this.uri.fragment != null)||(this.uri.fragment != undefined)){

        }
        return url;
    }
    _token(): string {
        return`Basic ${Buffer.from(`${this.user.user}:${this.user.passwd}`).toString('base64')}`
    }
    _body(command:string):void{
        this.options.body = command;
    }
    request(command:string): Promise<any> {
        this._body(command);
        return fetch(this._makeUrl(), this.options);
    }
}


