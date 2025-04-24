import { WsSql } from './sql/wsSql';
import { WSConfig } from './common/config';
import { WsConsumer } from './tmq/wsTmq';
declare let sqlConnect: (conf: WSConfig) => Promise<WsSql>;
declare let tmqConnect: (configMap: Map<string, string>) => Promise<WsConsumer>;
declare let setLogLevel: (level: string) => void;
declare let destroy: () => void;
export { sqlConnect, tmqConnect, setLogLevel, destroy };
//# sourceMappingURL=index.d.ts.map