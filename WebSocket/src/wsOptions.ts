interface Options {

}


export interface User {
    user?: string;
    passwd?: string;
}

export interface Uri {
    scheme: string;
    url?: string;
    host?: string | undefined | null;
    path: '/rest/sql/' | string;
    port?: number | undefined | null;
    query?: { [key: string]: string };
    fragment?: string | undefined | null;
}


let url: URL = new URL('https://root:taosdata@gw.us-east-1.aws.cloud.tdengine.com:6041/rest/sql/?token=9da2fda0b141e3c85064cdcca90ea9357c9bd790');
console.log(url)
let origin = url.origin;
let pathname = url.pathname;
let search = url.search;
console.log(origin.concat(pathname).concat(search));
let data = url.pathname.split('/')[3]
console.log( url.pathname.split('/'))


function checkURL(url:URL){
    // Assert is cloud url
    if(!url.search.includes('?token=')){
        if(!(url.username||url.password)){
            throw new Error("invalid url, password or username needed.")
        }
    }
}
checkURL(url)