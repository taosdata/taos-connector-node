export declare class TmqConfig {
    url: URL;
    user: string;
    password: string;
    group_id: string;
    client_id: string;
    offset_rest: string;
    topics?: Array<string>;
    auto_commit: boolean;
    auto_commit_interval_ms: number;
    timeout: number;
    constructor(wsConfig: Map<string, any>);
}
//# sourceMappingURL=config.d.ts.map