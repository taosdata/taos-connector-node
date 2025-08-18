import { ErrorCode, TaosError } from "../common/wsError";
import { StmtBindParams } from "./wsParamsBase";

export class TableInfo {
    name: string | undefined | null;
    tags: StmtBindParams | undefined | null;
    params: Array<StmtBindParams>;

    constructor(name?: string) {
        this.name = name;
        this.params = [];
    }

    public getTableName(): string | undefined | null {
        return this.name;
    }

    public getTags(): StmtBindParams | undefined | null {
        return this.tags;
    }

    public getParams(): Array<StmtBindParams> | undefined | null {
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
    async setParams(params: StmtBindParams): Promise<void> {
        if (params) {
            this.params.push(params);
        } else {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "Table params is invalid!");
        }
    }
}