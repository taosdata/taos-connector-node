import { WSQueryResponse } from './wsQueryResponse'

interface Meta {
    name: string,
    type: number,
    length: number,
}

export class TDengineResult {
    metaArr: Array<Meta>;
    dataArr: Array<Array<any>>;

    constructor(res: WSQueryResponse, data: Array<any>) {
        this.metaArr = new Array(res.fields_count);
        for (let i = 0; i < res.fields_count; i++) {
            this.metaArr.push({
                name: res.fields_names[i],
                type: res.fields_types[i],
                length: res.fields_lengths[i]
            })
        }
        this.dataArr = data;
    }

    // output
    display() {
        this.metaArr.forEach((m: Meta) => {
            console.log(`${m.name} ${m.type} (${m.length})|\t`)
        })
        this.dataArr.forEach(data => {
            data.forEach(d => {
                console.log(`${d}|\t`)
            })
        })
    }

}