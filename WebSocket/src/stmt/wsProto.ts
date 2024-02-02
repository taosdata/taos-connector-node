interface StmtMessageInfo {
  action: string;
  args: StmtParamsInfo;
}

interface StmtParamsInfo {
  req_id: number;
  sql?: string | undefined | null;
  stmt_id?: number | undefined | null;
  name?: string | undefined | null;
  tags?: Array<any> | undefined | null;
  paramArray?: Array<Array<any>> | undefined | null;
}
