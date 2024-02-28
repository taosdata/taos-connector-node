import { WSInterface } from '../client/wsInterface';
import { WSConnResponse } from '../client/wsResponse';
import { WSConfig } from '../common/config';
import { GetUrl } from '../common/utils';
import { ErrorCode, TaosResultError, WebSocketInterfaceError } from '../common/wsError';
import { SchemalessMessageInfo } from './wsProto';

export const enum SchemalessProto {
	InfluxDBLineProtocol       = 1,
	OpenTSDBTelnetLineProtocol = 2,
	OpenTSDBJsonFormatProtocol = 3
}

export class WsSchemaless {
  private _wsInterface: WSInterface;
  private _req_id = 4000000;
  private lastAffected = 0;
  constructor(url: URL, timeout :number | undefined | null) {
    this._wsInterface = new WSInterface(url, timeout);
  }


  static NewConnector(wsConfig:WSConfig):Promise<WsSchemaless> {
      if (!wsConfig.GetUrl()) {
        throw new WebSocketInterfaceError(ErrorCode.ERR_INVALID_URL, 'invalid url, password or username needed.');
    }

    let url = GetUrl(wsConfig)
    let wsSchemaless = new WsSchemaless(url, wsConfig.GetTimeOut());
    return wsSchemaless.open(wsConfig.GetDb())
  }

  async open(database:string | null | undefined):Promise<WsSchemaless> {
    return new Promise((resolve, reject) => {
        this._wsInterface.connect(database).then(()=>{resolve(this)}).catch((e: any)=>{reject(e)});
    })
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
    return this._req_id;
  }

  private async execute(queryMsg: SchemalessMessageInfo): Promise<boolean> {
    try {
      queryMsg.args.req_id = this.getReqID();
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
