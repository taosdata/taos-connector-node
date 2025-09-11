import { ErrorCode, TaosError } from "../common/wsError";
import { StmtBindParams } from "./wsParamsBase";
import JSONBig from 'json-bigint';

export class TableInfo {
    name: string | undefined | null;
    tags: StmtBindParams | undefined | null;
    params?: StmtBindParams;

    constructor(name?: string) {
        this.name = name;
    }

    public getTableName(): string | undefined | null {
        return this.name;
    }

    public getTags(): StmtBindParams | undefined | null {
        return this.tags;
    }

    public getParams(): StmtBindParams | undefined | null {
        return this.params;
    }

    public setTableName(name: string): void {
        if (name && name.length > 0) {
            this.name = name;
        } else {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "Table name is invalid!");
        }
    }
    async setTags(paramsArray:StmtBindParams): Promise<void> {
        if (paramsArray) {
            this.tags = paramsArray;
        } else {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "Table tags is invalid!");
        }
    }
    async setParams(bindParams: StmtBindParams): Promise<void> {
        if (!this.params) {
            this.params = bindParams;
        } else {
            if (bindParams._fieldParams) {
                this.params.mergeParams(bindParams);
            }
        }
    }
}