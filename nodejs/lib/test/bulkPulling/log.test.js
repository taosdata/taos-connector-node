"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const log_1 = __importStar(require("../../src/common/log"));
describe('log level print', () => {
    test('normal connect', async () => {
        log_1.default.info('log level is info');
        log_1.default.debug('log level is debug');
        log_1.default.error('log level is error');
        let isLevel = log_1.default.isLevelEnabled("info");
        expect(isLevel).toEqual(true);
        (0, log_1.setLevel)("debug");
        log_1.default.debug('log level is debug');
        isLevel = log_1.default.isLevelEnabled("debug");
        expect(isLevel).toEqual(true);
        (0, log_1.setLevel)("error");
        log_1.default.error('log level is error');
        log_1.default.debug('log level is debug');
        isLevel = log_1.default.isLevelEnabled("error");
        expect(isLevel).toEqual(true);
    });
});
