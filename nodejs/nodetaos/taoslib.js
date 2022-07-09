const ref = require('ref-napi');
const ffi = require('ffi-napi');
const ArrayType = require('ref-array-di')(ref);
const Struct = require('ref-struct-di')(ref);
const os = require('os');

if ('win32' == os.platform()) {
    taoslibname = 'taos';
} else {
    taoslibname = 'libtaos';
}

var clientVersion = ffi.Library(taoslibname, {
    'taos_get_client_info': ['string', []],
});

function getCleintVersion() {
    return clientVersion.taos_get_client_info().slice(0, 1)
}

// Define TaosField structure
var char_arr = ArrayType(ref.types.char);
var TaosField = Struct({
    'name': char_arr,
});
TaosField.fields.name.type.size = 65;
TaosField.defineProperty('type', ref.types.uint8);
TaosField.defineProperty('bytes', ref.types.int32);

// Define stmt taps_field_e
var TaosFiled_E = Struct({
    'name':char_arr,
    'type':ref.types.int8,
    'precision':ref.types.uint8,
    'scale':ref.types.uint8,
    'bytes':ref.types.uint32,  
  })

var smlLine = ArrayType(ref.coerceType('char *'))

ref.types.char_ptr = ref.refType(ref.types.char);
ref.types.void_ptr = ref.refType(ref.types.void);
ref.types.void_ptr2 = ref.refType(ref.types.void_ptr);

var libtaos = ffi.Library(taoslibname, {
    'taos_options': [ref.types.int, [ref.types.int, ref.types.void_ptr]],

    //TAOS *taos_connect(char *ip, char *user, char *pass, char *db, int port)
    'taos_connect': [ref.types.void_ptr, [ref.types.char_ptr, ref.types.char_ptr, ref.types.char_ptr, ref.types.char_ptr, ref.types.int]],
    //void taos_close(TAOS *taos)
    'taos_close': [ref.types.void, [ref.types.void_ptr]],
    //int *taos_fetch_lengths(TAOS_RES *res);
    'taos_fetch_lengths': [ref.types.void_ptr, [ref.types.void_ptr]],
    //int taos_query(TAOS *taos, char *sqlstr)
    'taos_query': [ref.types.void_ptr, [ref.types.void_ptr, ref.types.char_ptr]],
    //int taos_affected_rows(TAOS_RES *res)
    'taos_affected_rows': [ref.types.int, [ref.types.void_ptr]],
    //int taos_fetch_block(TAOS_RES *res, TAOS_ROW *rows)
    'taos_fetch_block': [ref.types.int, [ref.types.void_ptr, ref.types.void_ptr]],
    //int taos_num_fields(TAOS_RES *res);
    'taos_num_fields': [ref.types.int, [ref.types.void_ptr]],
    //TAOS_ROW taos_fetch_row(TAOS_RES *res)
    //TAOS_ROW is void **, but we set the return type as a reference instead to get the row
    'taos_fetch_row': [ref.refType(ref.types.void_ptr2), [ref.types.void_ptr]],
    'taos_print_row': [ref.types.int, [ref.types.char_ptr, ref.types.void_ptr, ref.types.void_ptr, ref.types.int]],
    //int taos_result_precision(TAOS_RES *res)
    'taos_result_precision': [ref.types.int, [ref.types.void_ptr]],
    //void taos_free_result(TAOS_RES *res)
    'taos_free_result': [ref.types.void, [ref.types.void_ptr]],
    //int taos_field_count(TAOS *taos)
    'taos_field_count': [ref.types.int, [ref.types.void_ptr]],
    //TAOS_FIELD *taos_fetch_fields(TAOS_RES *res)
    'taos_fetch_fields': [ref.refType(TaosField), [ref.types.void_ptr]],
    //int taos_errno(TAOS *taos)
    'taos_errno': [ref.types.int, [ref.types.void_ptr]],
    //char *taos_errstr(TAOS *taos)
    'taos_errstr': [ref.types.char_ptr, [ref.types.void_ptr]],
    //void taos_stop_query(TAOS_RES *res);
    'taos_stop_query': [ref.types.void, [ref.types.void_ptr]],
    //char *taos_get_server_info(TAOS *taos);
    'taos_get_server_info': [ref.types.char_ptr, [ref.types.void_ptr]],
    //char *taos_get_client_info();
    'taos_get_client_info': [ref.types.char_ptr, []],

    // ========================ASYNC QUERY==========================
    // void taos_query_a(TAOS *taos, char *sqlstr, void (*fp)(void *, TAOS_RES *, int), void *param)
    'taos_query_a': [ref.types.void, [ref.types.void_ptr, ref.types.char_ptr, ref.types.void_ptr, ref.types.void_ptr]],
    // void taos_fetch_rows_a(TAOS_RES *res, void (*fp)(void *param, TAOS_RES *, int numOfRows), void *param);
    'taos_fetch_rows_a': [ref.types.void, [ref.types.void_ptr, ref.types.void_ptr, ref.types.void_ptr]],
    // TAOS_ROW *taos_result_block(TAOS_RES *res);
    'taos_result_block': [ref.types.void_ptr2, [ref.types.void_ptr]],
    
    // void taos_fetch_raw_block_a(TAOS_RES *res, __taos_async_fn_t fp, void *param);
    'taos_fetch_raw_block_a':[ref.types.void,[ref.types.void_ptr,ref.types.void_ptr,ref.types.void_ptr]]
    
    //const void *taos_get_raw_block(TAOS_RES *res);
    ,'taos_get_raw_block':[ref.types.void_ptr,[ref.types.void_ptr]]
    
    // Subscription using TMQ instead

    //======================== Schemaless ==========================
    //TAOS_RES* taos_schemaless_insert(TAOS* taos, char* lines[], int numLines, int protocol，int precision)
    // 'taos_schemaless_insert': [ref.types.void_ptr, [ref.types.void_ptr, ref.types.char_ptr, ref.types.int, ref.types.int, ref.types.int]]
    ,'taos_schemaless_insert': [ref.types.void_ptr, [ref.types.void_ptr, smlLine, 'int', 'int', 'int']]

    //====================================stmt APIs===============================
    // TAOS_STMT* taos_stmt_init(TAOS *taos)
    , 'taos_stmt_init': [ref.types.void_ptr, [ref.types.void_ptr]]

    // int taos_stmt_prepare(TAOS_STMT *stmt, const char *sql, unsigned long length)
    , 'taos_stmt_prepare': [ref.types.int, [ref.types.void_ptr, ref.types.char_ptr, ref.types.ulong]]

    // int taos_stmt_set_tbname_tags(TAOS_STMT* stmt, const char* name, TAOS_MULTI_BIND* tags)
    , 'taos_stmt_set_tbname_tags': [ref.types.int, [ref.types.void_ptr, ref.types.char_ptr, ref.types.void_ptr]]

    // int taos_stmt_set_tbname(TAOS_STMT* stmt, const char* name)
    , 'taos_stmt_set_tbname': [ref.types.int, [ref.types.void_ptr, ref.types.char_ptr]]

    // int taos_stmt_set_sub_tbname(TAOS_STMT* stmt, const char* name)
    , 'taos_stmt_set_sub_tbname': [ref.types.int, [ref.types.void_ptr, ref.types.char_ptr]]

    // int taos_stmt_get_tag_fields(TAOS_STMT *stmt, int *fieldNum, TAOS_FIELD_E **fields);
    , 'taos_stmt_get_tag_fields': [ref.types.int, [ref.types.void_ptr, ref.refType(ref.types.int), ref.types.void_ptr2]]

    // int taos_stmt_get_col_fields(TAOS_STMT *stmt, int *fieldNum, TAOS_FIELD_E **fields);
    , 'taos_stmt_get_col_fields': [ref.types.int, [ref.types.void_ptr, ref.refType(ref.types.int), ref.types.void_ptr2]]

    // int taos_stmt_is_insert(TAOS_STMT *stmt, int *insert);
    , 'taos_stmt_is_insert': [ref.types.int, [ref.types.void_ptr, ref.refType(ref.types.int)]]

    // int taos_stmt_num_params(TAOS_STMT *stmt, int *nums);
    , 'taos_stmt_num_params': [ref.types.int, [ref.types.void_ptr, ref.refType(ref.types.int)]]

    // int taos_stmt_get_param(TAOS_STMT *stmt, int idx, int *type, int *bytes);
    , 'taos_stmt_get_param': [ref.types.int, [ref.types.void_ptr, ref.refType(ref.types.int), ref.refType(ref.types.int), ref.refType(ref.types.int)]]

    // int taos_stmt_bind_param_batch(TAOS_STMT* stmt, TAOS_MULTI_BIND* bind) 
    , 'taos_stmt_bind_param_batch': [ref.types.int, [ref.types.void_ptr, ref.types.void_ptr]]

    // int taos_stmt_bind_single_param_batch(TAOS_STMT* stmt, TAOS_MULTI_BIND* bind, int colIdx)  
    , 'taos_stmt_bind_single_param_batch': [ref.types.int, [ref.types.void_ptr, ref.types.void_ptr, ref.types.int]]

    // int taos_stmt_add_batch(TAOS_STMT *stmt)
    , 'taos_stmt_add_batch': [ref.types.int, [ref.types.void_ptr]]

    // int taos_stmt_execute(TAOS_STMT *stmt) 
    , 'taos_stmt_execute': [ref.types.int, [ref.types.void_ptr]]

    // TAOS_RES* taos_stmt_use_result(TAOS_STMT *stmt)  
    , 'taos_stmt_use_result': [ref.types.void_ptr, [ref.types.void_ptr]]

    // int taos_stmt_close(TAOS_STMT *stmt) 
    , 'taos_stmt_close': [ref.types.int, [ref.types.void_ptr]]

    // char * taos_stmt_errstr(TAOS_STMT *stmt)
    , 'taos_stmt_errstr': [ref.types.char_ptr, [ref.types.void_ptr]]

    // int taos_stmt_affected_rows(TAOS_STMT *stmt);
    , 'taos_stmt_affected_rows': [ref.types.int, [ref.types.void_ptr]]

    // int taos_stmt_affected_rows_once(TAOS_STMT *stmt);
    , 'taos_stmt_affected_rows_once': [ref.types.int, [ref.types.void_ptr]]

    // int taos_load_table_info(TAOS *taos, const char* tableNameList)
    , 'taos_load_table_info': [ref.types.int, [ref.types.void_ptr, ref.types.char_ptr]]

    // =======new 2022/07/07=====
    //int taos_fetch_raw_block(TAOS_RES *res, int *numOfRows, void **pData);
    , 'taos_fetch_raw_block': [ref.types.int, [ref.types.void_ptr, 'void*', 'void**']]
    // ,'taos_fetch_raw_block':[ref.types.int,[ref.types.void_ptr,'int *',ref.refType(ref.refType(ref.types.void_ptr))]]

    //taos_validate_sql(TAOS *taos, const char *sql);
    , 'taos_validate_sql': [ref.types.int, [ref.types.void_ptr, ref.types.char_ptr]]

    //char *taos_get_server_info(TAOS *taos);
    , 'taos_get_server_info': [ref.types.char_ptr, [ref.types.void_ptr]]

    //char *taos_get_client_info();
    , 'taos_get_client_info': [ref.types.char_ptr, []]

    //TSDB_SERVER_STATUS taos_check_server_status(const char *fqdn, int port, char *details, int maxlen);
    ,'taos_check_server_status':[ref.types.int,[ref.types.char_ptr,ref.types.int,ref.types.char_ptr,ref.types.int]]
    
    /* --------------------------TMQ INTERFACE------------------------------- */
    // tmq_list_t *tmq_list_new();
    ,'tmq_list_new':[ref.types.void_ptr,[]]

    // int32_t tmq_list_append(tmq_list_t *, const char *);
    ,'tmq_list_append':[ref.types.int32,[ref.types.void_ptr,ref.types.char_ptr]]

    // void tmq_list_destroy(tmq_list_t *);
    ,'tmq_list_destroy':[ref.types.void,[ref.types.void_ptr]]

    // int32_t tmq_list_get_size(const tmq_list_t *);
    ,'tmq_list_get_size':[ref.types.int32,[ref.types.void_ptr]]

    // char **tmq_list_to_c_array(const tmq_list_t *);
    ,'tmq_list_to_c_array':[ref.refType(ref.types.char_ptr),[ref.types.void_ptr]]
    
    //const char *tmq_err2str(int32_t code);
    ,'tmq_err2str':[ref.types.char_ptr,[ref.types.int32]]

    /* ------------------------TMQ CONSUMER INTERFACE------------------------ */
    // tmq_t *tmq_consumer_new(tmq_conf_t *conf, char *errstr, int32_t errstrLen);
    ,'tmq_consumer_new':[ref.types.void_ptr,[ref.types.void_ptr,ref.types.char_ptr,ref.types.int32]]

    // int32_t tmq_subscribe(tmq_t *tmq, const tmq_list_t *topic_list);
    ,'tmq_subscribe':[ref.types.int32,[ref.types.void_ptr,ref.types.void_ptr]]

    // int32_t tmq_unsubscribe(tmq_t *tmq);
    ,'tmq_unsubscribe':[ref.types.int32,[ref.types.void_ptr]]

    // int32_t tmq_subscription(tmq_t *tmq, tmq_list_t **topics);
    ,'tmq_subscription':[ref.types.int32,[ref.types.void_ptr,ref.types.void_ptr2]]

    // TAOS_RES *tmq_consumer_poll(tmq_t *tmq, int64_t timeout);
    ,'tmq_consumer_poll':[ref.types.void_ptr,[ref.types.void_ptr,ref.types.int64]]

    // int32_t tmq_consumer_close(tmq_t *tmq);
    ,'tmq_consumer_close':[ref.types.int32,[ref.types.void_ptr]]

    // int32_t tmq_commit_sync(tmq_t *tmq, const TAOS_RES *msg);
    ,'tmq_commit_sync':[ref.types.int32,[ref.types.void_ptr,ref.types.void_ptr]]

    // void tmq_commit_async(tmq_t *tmq, const TAOS_RES *msg, tmq_commit_cb *cb, void *param);
    ,'tmq_commit_async':[ref.types.void,[ref.types.void_ptr,ref.types.void_ptr,ref.types.void_ptr,ref.types.void_ptr]]
    
    /* ----------------------TMQ CONFIGURATION INTERFACE---------------------- */
    // tmq_conf_t *tmq_conf_new();
    ,'tmq_conf_new':[ref.types.void_ptr,[]]

    // tmq_conf_res_t tmq_conf_set(tmq_conf_t *conf, const char *key, const char *value);
    ,'tmq_conf_set':[ref.types.int,[ref.types.void_ptr,ref.types.char_ptr,ref.types.char_ptr]]

    // void tmq_conf_destroy(tmq_conf_t *conf);
    ,'tmq_conf_destroy':[ref.types.void,[ref.types.void_ptr]]

    // void tmq_conf_set_auto_commit_cb(tmq_conf_t *conf, tmq_commit_cb *cb, void *param);
    ,'tmq_conf_set_auto_commit_cb':[ref.types.void,[ref.types.void_ptr,ref.types.void_ptr,ref.types.void_ptr]]
    
    /* -------------------------TMQ MSG HANDLE INTERFACE---------------------- */
    // tmq_res_t tmq_get_res_type(TAOS_RES *res);
    ,'tmq_get_res_type':[ref.types.int,[ref.types.void_ptr]]
    
    // int32_t tmq_get_raw_meta(TAOS_RES *res, void **raw_meta, int32_t *raw_meta_len);
    ,'tmq_get_raw_meta':[ref.types.int32,[ref.types.void_ptr,ref.types.void_ptr2,'int *']]
    
    // const char *tmq_get_topic_name(TAOS_RES *res);
    ,'tmq_get_topic_name':[ref.types.char_ptr,[ref.types.void_ptr]]
    
    // const char *tmq_get_db_name(TAOS_RES *res);
    ,'tmq_get_db_name':[ref.types.char_ptr,[ref.types.void_ptr]]

    // int32_t tmq_get_vgroup_id(TAOS_RES *res);
    ,'tmq_get_vgroup_id':[ref.types.int32,[ref.types.void_ptr]]

    // const char *tmq_get_table_name(TAOS_RES *res);
    ,'tmq_get_table_name':[ref.types.char_ptr,[ref.types.void_ptr]]

});

module.exports = libtaos;
