import { TmqConfig } from './config';
import { TMQConstants, TMQMessageType } from './constant';
import { WSInterface } from '../client/wsInterface';
import { TaosResult } from '../common/taosResult';
import { ErrorCode, TaosResultError, WebSocketInterfaceError } from '../common/wsError';
import { AssignmentResp, PartitionsResp, SubscriptionResp, TaosTmqResult, TopicPartition, WSTmqFetchBlockResponse, WsPollResponse, WsTmqQueryResponse, parseTmpBlock} from './tmpResponse';

export class WsConsumer {
  private _wsInterface: WSInterface;
  private _req_id = 5000000;
  private _wsConfig:TmqConfig;
  private _topics?:string[];
  private _commitTime?:number;
  constructor(wsConfig:Map<string, any>) {
    this._wsConfig = new TmqConfig(wsConfig)
    console.log(this._wsConfig)
    this._wsInterface = new WSInterface(this._wsConfig.url);
    this._wsInterface.connect();
  }

  init():Promise<WsConsumer> {
    return new Promise((resolve, reject) => {
      this._wsInterface.Ready().then(()=>{resolve(this)}).catch((e: any)=>{reject(e)});
  })
  }

  static NewConsumer(wsConfig:Map<string, any>):Promise<WsConsumer> {
    if (wsConfig.size == 0 || !wsConfig.get(TMQConstants.WS_URL)) {
      throw new WebSocketInterfaceError(ErrorCode.ERR_INVALID_URL, 'invalid url, password or username needed.');
    }
    let wsConsumer = new WsConsumer(wsConfig);
    return wsConsumer.init()
 
  }

  Subscribe(topics: Array<string>): Promise<void> {
    if (!topics || topics.length == 0 ) {
      throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, 'WsTmq Subscribe params is error!');
    }

    let queryMsg = {
      action: TMQMessageType.Subscribe,
      args: {
        req_id    : this.getReqID(),
        user      :this._wsConfig.user,
        password   :this._wsConfig.password,
        group_id  :this._wsConfig.group_id,
        clien_id  :this._wsConfig.clien_id,
        topics    :topics,
        offset_rest:this._wsConfig.offset_rest,
        auto_commit:this._wsConfig.auto_commit,
        auto_commit_interval_ms: this._wsConfig.auto_commit_interval_ms
      },
    };
    this._topics = topics
    return this.execute(JSON.stringify(queryMsg));
  }

  Unsubscribe(): Promise<void> {
    let queryMsg = {
      action: TMQMessageType.Unsubscribe,
      args: {
        req_id    : this.getReqID(),
      },
    };
    return this.execute(JSON.stringify(queryMsg));
  }

  Poll(timeoutMs: number):Promise<Map<string, TaosResult>> {
    return new Promise(async (resolve, reject) => {
      try{
        if (this._wsConfig.auto_commit) {
          if (this._commitTime) {
            let currTime = new Date().getTime();
            let diff = Math.abs(currTime - this._commitTime);
            if (diff >= this._wsConfig.auto_commit_interval_ms) {
              await this.doCommit()
              this._commitTime = new Date().getTime();
            }
          } else {
            this._commitTime = new Date().getTime();
          }
        }
        resolve(await this.poll(timeoutMs)) 
      }catch(e:any){
        reject(new TaosResultError(e.code, e.message));
      }

    })
  }

  Assignment(topics?:string[]):Promise<Array<TopicPartition>> {
    return new Promise(async (resolve, reject) => {
      if (!topics || topics.length == 0) {
        topics = this._topics
      }

      let topicPartitions:TopicPartition[] = [];
      try{
        if (topics && topics.length > 0) {
          const allp:any[] = [];
          for (let i in topics) {
            allp.push(this.assignment(topics[i]));
          }
          let result = await Promise.all(allp)
          result.forEach(e => { 
            topicPartitions.push(...e);         
          })
          resolve(topicPartitions)
        }
        resolve(topicPartitions)
      }catch(e:any){
        reject(new TaosResultError(e.code, e.message));
      }
   });
  }

  Subscription():Promise<Array<string>> {
    return new Promise(async (resolve, reject) => {
      let queryMsg = {
        action: TMQMessageType.ListTopics,
        args: {
          req_id: this.getReqID(),
        },
      };
      try{
        let resp = await this.executeReturnAny(JSON.stringify(queryMsg));
        resolve(new SubscriptionResp(resp).topics) 
      }catch(e:any) {
        reject(new TaosResultError(e.code, e.message));
      }
    });
  }

  Commit():Promise<Array<TopicPartition>> {
    return new Promise(async (resolve, reject) => {
      try{
        await this.doCommit()
        resolve(await this.Assignment())
      }catch(e:any) {
        reject(new TaosResultError(e.code, e.message));
      }    
    })
  }

  private doCommit():Promise<void> {
    let queryMsg = {
      action: TMQMessageType.Commit,
      args: {
        req_id    : this.getReqID(),
        message_id:0
      },
    }; 
    return this.execute(JSON.stringify(queryMsg))
  }

  Commited(partitions:Array<TopicPartition>):Promise<any>{
    if (!partitions || partitions.length == 0 ) {
      throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, 'WsTmq Positions params is error!');
    }

    return new Promise(async (resolve, reject) => {
      let offsets: TopicPartition[] = new Array(partitions.length);
      for (let i = 0; i < partitions.length; i++) {
        offsets[i] = {
          topic: partitions[i].topic,
          vgroup_id: partitions[i].vgroup_id
        };
        offsets[i].vgroup_id = partitions[i].vgroup_id
      }
      console.log(offsets, "===>" ,partitions)
      let queryMsg = {
        action: TMQMessageType.Committed,
        args: {
          req_id    : this.getReqID(),
          topic_vgroup_ids:offsets
        },
      };
      try{
        let resp = await this.executeReturnAny(JSON.stringify(queryMsg));
        resolve(resp)
        // resolve(new PartitionsResp(resp).SetTopicPartitions(offsets)) 
      }catch(e:any) {
        reject(new TaosResultError(e.code, e.message));
      }
    });   
  }

  CommitOffsets(partitions:Array<TopicPartition>):Promise<Array<TopicPartition>> {
    if (!partitions || partitions.length == 0) {
      throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, 'WsTmq CommitOffsets params is error!');
    }

    return new Promise(async (resolve, reject) => {
      try{
        const allp:any[] = []
        partitions.forEach(e => { 
          allp.push(this.CommitOffset(e))         
        })
        await Promise.all(allp)
        resolve(await this.Commited(partitions))     
      }catch(e:any) {
        reject(new TaosResultError(e.code, e.message));
      }
    })
  }


  CommitOffset(partition:TopicPartition):Promise<void> {
    if (!partition) {
      throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, 'WsTmq CommitOffsets params is error!');
    }

    let queryMsg = {
      action: TMQMessageType.CommitOffset,
      args: {
        req_id    : this.getReqID(),
        group_id :partition.vgroup_id,
        topic    :partition.topic,
        offset   :partition.offset,
      },
    };
    return this.execute(JSON.stringify(queryMsg));

  
  }

  Positions(partitions:Array<TopicPartition>):Promise<Array<TopicPartition>> {
    if (!partitions || partitions.length == 0 ) {
      throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, 'WsTmq Positions params is error!');
    }

    return new Promise(async (resolve, reject) => {
      let offsets: TopicPartition[] = new Array(partitions.length);
      for (let i = 0; i < partitions.length; i++) {
        offsets[i] = {
          topic: partitions[i].topic,
          vgroup_id: partitions[i].vgroup_id
        };
        offsets[i].vgroup_id = partitions[i].vgroup_id
      }
      console.log(offsets, "===>" ,partitions)
      let queryMsg = {
        action: TMQMessageType.Position,
        args: {
          req_id    : this.getReqID(),
          topic_vgroup_ids:offsets
        },
      };
      try{
        let resp = await this.executeReturnAny(JSON.stringify(queryMsg));
        resolve(new PartitionsResp(resp).SetTopicPartitions(offsets)) 
      }catch(e:any) {
        reject(new TaosResultError(e.code, e.message));
      }
    });
  }

  Seek(partition:TopicPartition):Promise<void> {
    if (!partition) {
      throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, 'WsTmq Seek params is error!');
    }

    let queryMsg = {
      action: TMQMessageType.Seek,
      args: {
        req_id    : this.getReqID(),
        group_id :partition.vgroup_id,
        topic    :partition.topic,
        offset   :partition.offset,
      },
    };
    return this.execute(JSON.stringify(queryMsg));
  }

  SeekToBeginning(partitions:Array<TopicPartition>):Promise<void> {
    if (!partitions || partitions.length == 0) {
      throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, 'WsTmq SeekToBeginning params is error!');
    }  
    return this.seekToBeginOrEnd(partitions)
  }

  SeekToEnd(partitions:Array<TopicPartition>):Promise<void> {
    if (!partitions || partitions.length == 0) {
      throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, 'WsTmq SeekToEnd params is error!');
    } 

    return this.seekToBeginOrEnd(partitions, false)
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

  private async execute(queryMsg: string): Promise<void> {
    try {
      let resp = await this._wsInterface.exec(queryMsg);
      console.log('stmt execute result:', resp);
    } catch (e:any) {
      throw new TaosResultError(e.code, e.message);
    }
  }

  private async executeReturnAny(queryMsg: string): Promise<any> {
    try {
      return await this._wsInterface.exec(queryMsg, false);
    } catch (e:any) {
      console.log(e);
      throw new TaosResultError(e.code, e.message);
    }
  }

  private fetch(pollResp: WsPollResponse):Promise<WsTmqQueryResponse> {
      let fetchMsg = {
        action: 'fetch',
        args: {
          req_id: this.getReqID(),
          message_id:pollResp.message_id,
        },
      };

      return new Promise((resolve, reject) => {
        let jsonStr = JSON.stringify(fetchMsg);
        console.log('[wsQueryInterface.fetch.fetchMsg]===>' + jsonStr);
        this._wsInterface.exec(jsonStr, false).then((e: any) => {
            if (e.msg.code == 0) {
              resolve(new WsTmqQueryResponse(e));
            } else {
              reject(new WebSocketInterfaceError(e.code, e.message));
            }
          }).catch((e) => {reject(e);});
      });
  }

  private fetchBlockData(fetchResponse: WsTmqQueryResponse, taosResult: TaosResult):Promise<TaosResult> {
    let fetchMsg = {
      action: 'fetch_block',
      args: {
        req_id: fetchResponse.req_id,
        message_id: fetchResponse.message_id,
      },
    };

    return new Promise((resolve, reject) => {
      let jsonStr = JSON.stringify(fetchMsg);
      console.log('[wsQueryInterface.fetch.fetchMsg]===>' + jsonStr);
      this._wsInterface.sendMsg(jsonStr).then((e: any) => {
        resolve(parseTmpBlock(fetchResponse.rows, new WSTmqFetchBlockResponse(e), taosResult))
      }).catch((e) => {reject(e);});
    });
  }

  private async poll(timeoutMs: number): Promise<Map<string, TaosResult>> {
    let queryMsg = {
      action: TMQMessageType.Poll,
      args: {
        req_id    : this.getReqID(),
        blocking_time  :timeoutMs
      },
    };

    try {
      var taosResults: Map<string, TaosResult> = new Map();
      let resp = await this._wsInterface.exec(JSON.stringify(queryMsg), false);
     
      let pollResp = new WsPollResponse(resp)
      if (pollResp.have_message == false || pollResp.message_type != TMQMessageType.ResDataType) {
        return taosResults;
      }else{
        
        while (true) {
          let fetchResp = await this.fetch(pollResp)
          if (fetchResp.completed || fetchResp.rows == 0) {
            break;
          }
          let taosResult = taosResults.get(pollResp.topic + pollResp.vgroup_id)
          if (taosResult == null) {
            taosResult = new TaosTmqResult(fetchResp, pollResp)
            taosResults.set(pollResp.topic + pollResp.vgroup_id, taosResult)
          } else {
            taosResult.SetRowsAndTime(fetchResp.rows);
          }
          await this.fetchBlockData(fetchResp, taosResult)
          
        }
        return taosResults;
      }
    } catch (e :any) {
      console.log(e);
      throw new TaosResultError(e.code, e.message);
    }
  }

  private assignment(topic:string):Promise<Array<TopicPartition>> {
    return new Promise(async (resolve, reject) => {
      
      try{
        let queryMsg = {
          action: TMQMessageType.GetTopicAssignment,
          args: {
            req_id: this.getReqID(),
            topic: topic
          }
        }
        
        let resp = await this.executeReturnAny(JSON.stringify(queryMsg))
        let assignmentInfo = new AssignmentResp(resp, queryMsg.args.topic);
        resolve(assignmentInfo.topicPartition)
      }catch(e:any){
        reject(new TaosResultError(e.code, e.message));
      }
   });
  }

  private seekToBeginOrEnd(partitions:Array<TopicPartition>, bBegin:boolean = true):Promise<void> {
    return new Promise(async (resolve, reject) => {
      let topics: string[] = [];
      partitions.forEach(e => { 
        topics.push(e.topic)
      })
      try {
        let topicPartitions = await this.Assignment(topics)
        let itemMap = topicPartitions.reduce((map, obj)=> {
          map.set(obj.topic+'_'+obj.vgroup_id, obj)
          return map
        }, new Map<string, TopicPartition>());

        const allp:any[] = []
        for(let i in partitions) {
          if(itemMap.has(partitions[i].topic + '_' +partitions[i].vgroup_id)) {
            let topicPartition = itemMap.get(partitions[i].topic + '_' +partitions[i].vgroup_id)
            if (topicPartition) {
              if(bBegin) {
                topicPartition.offset = topicPartition.begin
              }else{
                topicPartition.offset = topicPartition.end
              }
              
              allp.push(this.Seek(topicPartition))
            }
          }
        }
        await Promise.all(allp)
        resolve()       
      }catch(e:any){
        reject(new TaosResultError(e.code, e.message));
      }
    })
  }

}
