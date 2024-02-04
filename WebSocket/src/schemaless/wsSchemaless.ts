import { WSInterface } from '../client/wsInterface';
import { WSConnResponse } from '../client/wsResponse';
import { TaosResultError } from '../common/wsError';
import { SchemalessProto, SchemalessMessageInfo } from './wsProto';

export class WsSchemaless {
  private _wsInterface: WSInterface;
  private _req_id = 4000000;
  private lastAffected = 0;
  constructor(url: string) {
    this._wsInterface = new WSInterface(new URL(url));
  }

  Open(database?: string): Promise<WSConnResponse> {
    return this._wsInterface.connect(database);
  }

  //  precision: 1b(纳秒), 1u(微秒)，1a(毫秒)，1s(秒)，1m(分)，1h(小时)，1d(天), 1w(周)。
  Insert(lines: Array<string>, protocol: SchemalessProto, precision: string, ttl: number): Promise<boolean> {
    let data = '';
    if (!lines || lines.length == 0 || !protocol) {
      throw new TaosResultError('WsSchemaless Insert params is error!');
    }

    lines.forEach((element, index) => {
      data += element;
      if (index < lines.length - 1) {
        data += '\n';
      }
    });

    let queryMsg = {
      action: 'insert',
      args: {
        protocol: protocol,
        precision: precision,
        data: data,
        ttl: ttl,
      },
    };
    return this.execute(queryMsg);
  }

  Close() {
    this._wsInterface.close();
  }

  private getReqID() {
    if (this._req_id == Number.MAX_SAFE_INTEGER) {
      this._req_id = 4000000;
    } else {
      this._req_id += 1;
    }
  }

  private async execute(queryMsg: SchemalessMessageInfo): Promise<boolean> {
    try {
      this.getReqID();
      queryMsg.args.req_id = this._req_id;
      let reqMsg = JSON.stringify(queryMsg);
      let resp = await this._wsInterface.exec(reqMsg);
      console.log('stmt execute result:', resp);
      return true;
    } catch (e) {
      console.log(e);
      throw new TaosResultError('stmt execute error: ' + queryMsg);
    }
  }
}
