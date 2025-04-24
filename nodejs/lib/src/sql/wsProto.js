"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchemalessProto = exports.Precision = void 0;
var Precision;
(function (Precision) {
    Precision["NOT_CONFIGURED"] = "";
    Precision["HOURS"] = "h";
    Precision["MINUTES"] = "m";
    Precision["SECONDS"] = "s";
    Precision["MILLI_SECONDS"] = "ms";
    Precision["MICRO_SECONDS"] = "u";
    Precision["NANO_SECONDS"] = "ns";
})(Precision || (exports.Precision = Precision = {}));
var SchemalessProto;
(function (SchemalessProto) {
    SchemalessProto[SchemalessProto["InfluxDBLineProtocol"] = 1] = "InfluxDBLineProtocol";
    SchemalessProto[SchemalessProto["OpenTSDBTelnetLineProtocol"] = 2] = "OpenTSDBTelnetLineProtocol";
    SchemalessProto[SchemalessProto["OpenTSDBJsonFormatProtocol"] = 3] = "OpenTSDBJsonFormatProtocol";
})(SchemalessProto || (exports.SchemalessProto = SchemalessProto = {}));
