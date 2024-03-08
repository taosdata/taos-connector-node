export interface SchemalessMessageInfo {
    action: string;
    args: SchemalessParamsInfo;
}

export interface SchemalessParamsInfo {
    req_id?: number | undefined | null;
    protocol: number;
    ttl?: number;
    precision: string;
    data: string;
}

