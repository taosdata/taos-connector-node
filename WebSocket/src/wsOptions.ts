export interface User {
  user?: string;
  passwd?: string;
}

export interface Uri {
  scheme: string;
  url?: string;
  host?: string | undefined | null;
  path: '/rest/sql/' | string;
  port?: number | undefined | null;
  query?: { [key: string]: string };
  fragment?: string | undefined | null;
}

export enum WsFunc {
  WS = '/rest/ws',
  SCHEMALESS = '/rest/schemaless',
  TMQ = '/rest/tmq',
  STMT = '/rest/stmt',
}

export enum SchemalessProtocol {
  UNKNOWN = 0,
  LINE = 1,
  TELNET = 2,
  JSON = 3,
}

export enum SchemalessPrecision {
  NOT_CONFIGURED = '',
  HOURS = 'h',
  MINUTES = 'm',
  SECONDS = 's',
  MILLI_SECONDS = 'ms',
  MICRO_SECONDS = 'u',
  NANO_SECONDS = 'ns',
}
