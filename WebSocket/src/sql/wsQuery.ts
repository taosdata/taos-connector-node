// import { TaosResult } from '../common/taosResult';
// import { WSInterface } from '../client/wsInterface'
// import { WsConsumer } from '../tmq/wsTmq';
// import { WSQueryResponse } from '../client/wsResponse';
// export async function execute(sql: string, wsInterface: WSInterface): Promise<TaosResult> {
//     let taosResult;
//     let wsQueryResponse:WSQueryResponse = await wsInterface.exec(sql);
//     try {
//         taosResult = new TaosResult(wsQueryResponse);
//         if (wsQueryResponse.is_update == true) {
//             return taosResult;
//         } else {
//             while (true) {
//                 let wsFetchResponse = await wsInterface.fetch(wsQueryResponse)
//                 console.log("[wsQuery.execute.wsFetchResponse]==>\n")
//                 console.log(wsFetchResponse)
//                 console.log(typeof BigInt(8))
//                 console.log(typeof wsFetchResponse.timing)
//                 if (wsFetchResponse.completed == true) {
//                     break;
//                 } else {
//                     taosResult.SetRowsAndTime(wsFetchResponse.rows, wsFetchResponse.timing)
//                     this.getReqID();
//                     let fetchBlockMsg = {
//                       action: 'fetch_block',
//                       args: {
//                         req_id: this._req_id,
//                         id: fetchResponse.id,
//                       },
//                     };
//                     let tmp: TaosResult = await wsInterface.fetchBlock(wsFetchResponse, taosResult)
//                     taosResult = tmp;
//                 }
//             }
//             return taosResult;
//         }
//     } finally {
//         wsInterface.freeResult(wsQueryResponse)
//     }
// }