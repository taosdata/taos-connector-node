import { schemaless } from '../index';
import { SchemalessPrecision, SchemalessProtocol } from '../src/wsOptions';

let dsn = 'ws://root:taosdata@127.0.0.1:6041/test';
let ws = schemaless(dsn);

(async () => {
  try {
    await ws.connect();
    // line protocol
    let lines = [
      'measurement,host=host1 field1=2i,field2=2.0 1577837300000',
      'measurement,host=host1 field1=2i,field2=2.0 1577837400000',
      'measurement,host=host1 field1=2i,field2=2.0 1577837500000',
    ];
    await ws.insert(
      lines.join('\n'),
      SchemalessProtocol.LINE,
      SchemalessPrecision.MILLI_SECONDS,
      1000
    );
    // telnet protocol
    let telnet = [
      'meters.current 1648432611249 10.3 location=California.SanFrancisco group=2',
      'meters.current 1648432611250 12.6 location=California.SanFrancisco group=2',
      'meters.current 1648432611249 10.8 location=California.LosAngeles group=3',
      'meters.current 1648432611250 11.3 location=California.LosAngeles group=3',
      'meters.voltage 1648432611249 219 location=California.SanFrancisco group=2',
      'meters.voltage 1648432611250 218 location=California.SanFrancisco group=2',
      'meters.voltage 1648432611249 221 location=California.LosAngeles group=3',
      'meters.voltage 1648432611250 217 location=California.LosAngeles group=3',
    ];
    await ws.insert(
      telnet.join('\n'),
      SchemalessProtocol.TELNET,
      SchemalessPrecision.SECONDS
    );
    // json protocol
    let json = [
      `{
        "metric": "meters2.current",
        "timestamp": 1648432611249,
        "value": 10.3,
        "tags": {
            "location": "California.SanFrancisco",
            "groupid": 2
        }}`,
      `{
        "metric": "meters2.voltage",
        "timestamp": 1648432611249,
        "value": 219,
        "tags": {
            "location": "California.LosAngeles",
            "groupid": 1
        }}`,
      `{
        "metric": "meters2.current",
        "timestamp": 1648432611250,
        "value": 12.6,
        "tags": {
            "location": "California.SanFrancisco",
            "groupid": 2
        }}`,
      `{
        "metric": "meters2.voltage",
        "timestamp": 1648432611250,
        "value": 221,
        "tags": {
            "location": "California.LosAngeles",
            "groupid": 1
        }}`,
    ];
    ws.close();
  } catch (e) {
    console.error('error: ' + e);
    ws.close();
  }
})();
