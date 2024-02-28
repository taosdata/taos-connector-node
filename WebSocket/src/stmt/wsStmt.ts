import { WSInterface } from '../client/wsInterface';
import { ErrorCode, TDWebSocketClientError, TaosResultError, WebSocketInterfaceError } from '../common/wsError';
import { WSConfig } from '../common/config'
import { GetUrl } from '../common/utils';
import { WsStmtQueryResponse, StmtMessageInfo } from './wsProto';

export class WsStmtConnect {
  private _wsInterface: WSInterface | null;
  private _config:WSConfig;
  private _bClose = false
  constructor(wsConfig: WSConfig) {
    let url = GetUrl(wsConfig)
    this._config = wsConfig
    this._wsInterface = new WSInterface(url, wsConfig.GetTimeOut());
  }

  static NewConnector(wsConfig:WSConfig):WsStmtConnect {
    if (!wsConfig.GetUrl()) {
      throw new WebSocketInterfaceError(ErrorCode.ERR_INVALID_URL, 'invalid url, password or username needed.');
    }
    return new WsStmtConnect(wsConfig); 
  }

  Init() : Promise<WsStmt> {
    return this.open()
  }

  private async open():Promise<WsStmt> {
    return new Promise(async (resolve, reject) => {
      if (this._wsInterface) {
        try{
          await this._wsInterface.connect(this._config.GetDb());
          let wsStmt = new WsStmt(this._wsInterface);
          await wsStmt.Init();
          this._bClose = false;
          resolve(wsStmt);
        } catch(e) {
          console.error(e)
          reject(e);
        }
      }else{
        reject(new TDWebSocketClientError(ErrorCode.ERR_CONNECTION_CLOSED, "stmt connect closed"));
      }
    });
  }

  Close() {
    if (!this._bClose && this._wsInterface) {
      this._wsInterface.close();
      this._bClose = true
    }
  }

}

export class WsStmt {
  private _wsInterface: WSInterface;
  private _req_id = 3000000;
  private stmt_id: number | undefined | null;
  private lastAffected: number | undefined | null;
  constructor(wsInterface: WSInterface) {
    this._wsInterface = wsInterface;
  }

  Init(): Promise<void> {
    let queryMsg = {
      action: 'init',
      args: {
        req_id: this._req_id,
      },
    };

    return this.execute(queryMsg);
  }

  Prepare(sql: string): Promise<void> {
    let queryMsg = {
      action: 'prepare',
      args: {
        req_id: this._req_id,
        sql: sql,
        stmt_id: this.stmt_id,
      },
    };

    return this.execute(queryMsg);
  }

  SetTableName(tableName: string): Promise<void> {
    let queryMsg = {
      action: 'set_table_name',
      args: {
        req_id: this._req_id,
        name: tableName,
        stmt_id: this.stmt_id,
      },
    };
    return this.execute(queryMsg);
  }

  SetTags(tags: Array<any>): Promise<void> {
    let queryMsg = {
      action: 'set_tags',
      args: {
        req_id: this._req_id,
        tags: tags,
        stmt_id: this.stmt_id,
      },
    };
    return this.execute(queryMsg);
  }

  BindParam(paramArray: Array<Array<any>>): Promise<void> {
    let queryMsg = {
      action: 'bind',
      args: {
        req_id: this._req_id,
        columns: paramArray,
        stmt_id: this.stmt_id,
      },
    };
    return this.execute(queryMsg);
  }

  Batch(): Promise<void> {
    let queryMsg = {
      action: 'add_batch',
      args: {
        req_id: this._req_id,
        stmt_id: this.stmt_id,
      },
    };
    return this.execute(queryMsg);
  }

  /**
   * return client version.
   */
  Version(): Promise<string> {
    return this._wsInterface.version();
  }

  Exec(): Promise<void> {
    let queryMsg = {
      action: 'exec',
      args: {
        req_id: this._req_id,
        stmt_id: this.stmt_id,
      },
    };
    return this.execute(queryMsg);
  }

  GetLastAffected() {
    return this.lastAffected;
  }

  Close(): Promise<void> {
    let queryMsg = {
      action: 'close',
      args: {
        req_id: this._req_id,
        stmt_id: this.stmt_id,
      },
    };
    return this.execute(queryMsg, false);
  }
  
  private getReqID() {
    if (this._req_id == Number.MAX_SAFE_INTEGER) {
      this._req_id = 3000000;
    } else {
      this._req_id += 1;
    }
    return this._req_id;
  }

  private async execute(queryMsg: StmtMessageInfo, register: Boolean = true): Promise<void> {
    try {
      queryMsg.args.req_id = this.getReqID();
      let reqMsg = JSON.stringify(queryMsg);
      if (register) {
        let result = await this._wsInterface.execReturnAny(reqMsg);
        let resp = new WsStmtQueryResponse(result)
        if (resp.stmt_id) {
          this.stmt_id = resp.stmt_id;
        }

        if (resp.affected) {
          this.lastAffected = resp.affected
        }
        
        console.log('stmt execute result:', resp);     
      }else{
        let resp = await this._wsInterface.execNoResp(reqMsg);
        this.stmt_id = null
        this.lastAffected = null
        console.log('stmt execute result:', resp);
      }
      return
    } catch (e) {
      console.log(e);
      throw new TaosResultError('stmt execute error: ' + queryMsg);
    }
  }


}
