
import { Uri, User, FetchOptions } from "./options";
import fetch from 'node-fetch';
import { Console } from "console";

export class TDResRequest {
    uri: Uri;
    options: FetchOptions;
    user: User;
    queryParams='';
    hashFragment='';

    constructor(uri: Uri, user: User) {
        this.uri = uri;
        this.user = user;

        // if uri.url exists,and that is a cloud url(means token exist)
        if ((uri.query != null && uri.query['token'] != undefined) || (uri.query != undefined && uri.query['token'] != undefined)) {
            this.options = {
                method: 'POST',
                body: '',
                headers: {},
            }
        } else {
            this.options = {
                method: 'POST',
                body: '',
                headers: { 'Authorization': this._token() },
            }
        }
    }

    _makeUrl():string{
        let url='';
        if (this.uri.url){
           this._constructUrlWithInput();
        }else{
           //do nothing 
        }
        url = `${this.uri.scheme}://${this.uri.host}:${this.uri.port}${this.uri.path}`
        
        if (this.uri.query) {
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
        if(this.queryParams){
            url += this.queryParams;
        }
        
        if ((this.uri.fragment != null) || (this.uri.fragment != undefined)) {
            if (this.uri.fragment.slice(0, 1) == '#') {
                url += this.uri.fragment
            } else {
                url += '#' + this.uri.fragment;
            }
        }
        if(this.hashFragment){
            url += this.hashFragment;
        }

        console.log(`url:${url}`);
        return url;
    }
    // if user input url
    _constructUrlWithInput() {
        if (this.uri.url) {
            let urlObj = new URL(this.uri.url);
            if (urlObj.protocol) {
                this.uri.scheme = urlObj.protocol.slice(0, urlObj.protocol.length - 1);;
            }
            if (urlObj.hostname) {
                this.uri.host = urlObj.hostname;
            }
            if (urlObj.pathname!='/') {
                this.uri.path = urlObj.pathname;
            }
            if (urlObj.search){
                this.queryParams = urlObj.search;
            }
            if (urlObj.hash){
                this.hashFragment = urlObj.hash;
            }
        }
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


