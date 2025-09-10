
export class FieldBindParams {
    params: any[];
    dataType: string;
    typeLen: number;
    columnType: number;
    constructor(params:any[], dataType:string, typeLen:number, columnType:number) {
        this.params = [...params];
        this.dataType = dataType;
        this.typeLen = typeLen;
        this.columnType = columnType;
    }
}