import { TMQConstants } from "./constant";

export class TmqConfig {
    // req_id: number;
    url: URL;
    user: string;
    password: string;
    group_id: string;
    client_id: string;
    offset_rest: string;
    topics?: Array<string>;
    auto_commit: boolean;
    auto_commit_interval_ms: number;
    timeout:number;
    sql_url: URL | undefined | null;
  

    constructor(wsConfig:Map<string, any>) {
        this.url = new URL(wsConfig.get(TMQConstants.WS_URL));
        this.user = wsConfig.get(TMQConstants.CONNECT_USER);
        this.password = wsConfig.get(TMQConstants.CONNECT_PASS);
        this.group_id = wsConfig.get(TMQConstants.GROUP_ID);
        this.client_id = wsConfig.get(TMQConstants.CLIENT_ID);
        this.offset_rest = wsConfig.get(TMQConstants.AUTO_OFFSET_RESET);
        this.auto_commit = wsConfig.get(TMQConstants.ENABLE_AUTO_COMMIT);
        
        if (!this.auto_commit) {
            this.auto_commit = false;
        }

        this.auto_commit_interval_ms = wsConfig.get(TMQConstants.AUTO_COMMIT_INTERVAL_MS);
        if (!this.auto_commit_interval_ms) {
            this.auto_commit_interval_ms = 5 * 1000;
        }

        this.timeout = wsConfig.get(TMQConstants.CONNECT_MESSAGE_TIMEOUT);
        if (!this.timeout) {
            this.timeout = 5000;
        }

        if (this.url) {
            if (this.user) {
                this.url.username = this.user;
            }else{
                this.user = this.url.username;
            }
            if (this.password) {
                this.url.password = this.password;
                
            }else{
                this.password = this.url.password;
            }
            
            this.sql_url = new URL(this.url);
            this.sql_url.pathname = '/ws';
            this.url.pathname = '/rest/tmq'
        }

    }

}