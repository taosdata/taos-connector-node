
import { Uri, User, FetchOptions } from "./options";
import fetch from 'node-fetch';

export class TDResRequest {
    uri: Uri;
    options: FetchOptions;
    user: User;

    constructor(url: Uri, user: User) {
        this.uri = url;
        this.user = user;
        if(url.cloudUri==null ||url.cloudUri ==undefined ){
            this.options = {
                method: 'POST',
                body: '',
                headers: { 'Authorization': this._token() }
            }      
        }else{
            this.options = {
                method: 'POST',
                body: '',
                headers:{},
            }  
        }   
    }

    _makeUrl(): string {
        let url = '';
            // console.log("_makeUrl():"+JSON.stringify(this.uri));
        if (this.uri.cloudUri != null || this.uri.cloudUri != undefined) {
            // console.log(JSON.stringify(this.uri));
            url = `${this.uri.schema}://${this.uri.cloudUri}${this.uri.path}`
        } else {
            console.log(JSON.stringify(this.uri));
            url = `${this.uri.schema}://${this.uri.host}:${this.uri.port}${this.uri.path}`
        }
        if ((this.uri.query != null) || (this.uri.query != undefined)) {
            url += '?'
            Object.keys(this.uri.query).forEach(
                key => {
                    if (this.uri.query != null && (this.uri.query[key] != null || this.uri.query[key] != undefined)) {
                        url += key + "=" + this.uri.query[key] + "&"
                    }
                }
            )
            // remove last "&"
            url = url.slice(0, url.length - 1);
            // console.log("query param:"+url)
        }
        if ((this.uri.fragment != null) || (this.uri.fragment != undefined)) {
            if (this.uri.fragment.slice(0, 1) == '#') {
                url += this.uri.fragment
            } else {
                url += '#' + this.uri.fragment;
            }
        }
        // console.log(`url:${url}`);
        return url;
    }
    _token(): string {
        return `Basic ${Buffer.from(`${this.user.user}:${this.user.passwd}`).toString('base64')}`
    }
    _body(command: string): void {
        this.options.body = command;
    }

    request(command: string): Promise<any> {
        this._body(command);
        return fetch(this._makeUrl(), this.options);
    }
}


