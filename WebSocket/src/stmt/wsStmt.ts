import { TaosResult } from '../common/taosResult';
import { WSInterface } from '../client/wsInterface';
import { WSConnResponse, WSQueryResponse } from '../client/wsResponse';
import { TaosResultError } from '../common/wsError';

export class WsStmt {
  private _wsInterface: WSInterface;
  private _req_id = 3000000;
  private stmt_id = 0;
  private lastAffected = 0;
  constructor(url: string) {
    this._wsInterface = new WSInterface(new URL(url));
  }

  Open(database?: string): Promise<WSConnResponse> {
    return this._wsInterface.connect(database);
  }

  State() {
    return this._wsInterface.getState();
  }

  Start(): Promise<boolean> {
    let queryMsg = {
      action: 'init',
      args: {
        req_id: this._req_id,
      },
    };

    return this.execute(queryMsg);
  }

  Prepare(sql: string): Promise<boolean> {
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

  SetTableName(tableName: string): Promise<boolean> {
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

  SetTags(tags: Array<any>): Promise<boolean> {
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

  BindParam(paramArray: Array<Array<any>>): Promise<boolean> {
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

  Batch(): Promise<boolean> {
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

  Exec(): Promise<boolean> {
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

  End(): Promise<boolean> {
    let queryMsg = {
      action: 'close',
      args: {
        req_id: this._req_id,
        stmt_id: this.stmt_id,
      },
    };
    let res = this.execute(queryMsg, false);
    this.stmt_id = 0;
    this.lastAffected = 0;
    return res;
  }

  Close() {
    this._wsInterface.close();
  }
  
  private getReqID() {
    if (this._req_id == Number.MAX_SAFE_INTEGER) {
      this._req_id = 3000000;
    } else {
      this._req_id += 1;
    }
  }

  private async execute(queryMsg: StmtMessageInfo, register: Boolean = true): Promise<boolean> {
    try {
      this.getReqID();
      queryMsg.args.req_id = this._req_id;
      let reqMsg = JSON.stringify(queryMsg);
      if (register) {
        let resp = await this._wsInterface.exec(reqMsg);
        this.stmt_id = resp.stmt_id;
        this.lastAffected = resp.affected_rows;
        console.log('stmt execute result:', resp);     
      }else{
        let resp = await this._wsInterface.execNoResp(reqMsg);
        console.log('stmt execute result:', resp);
      }
      return true;
    } catch (e) {
      console.log(e);
      throw new TaosResultError('stmt execute error: ' + queryMsg);
    }
  }


}
