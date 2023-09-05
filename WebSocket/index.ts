import { Schemaless } from './src/wsSchemaless';
import { TDengineWebSocket } from './src/tdengineWebsocket';

let connect = (url: string) => {
  return new TDengineWebSocket(url);
};

let schemaless = (url: string) => {
  return new Schemaless(url);
};

export { connect, schemaless };
