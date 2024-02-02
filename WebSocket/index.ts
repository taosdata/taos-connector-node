import { WsSql } from './src/sql/wsSql'
import { WsStmt } from './src/stmt/wsStmt';
let connect = (url: string) => {
  return new WsSql(url);
};

let stmtConnect = (url:string) => {
    return new WsStmt(url);
}
export { connect, stmtConnect };
