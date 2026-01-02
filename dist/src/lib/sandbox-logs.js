"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sandboxLogEmitter = void 0;
exports.emitSandboxLog = emitSandboxLog;
const events_1 = require("events");
exports.sandboxLogEmitter = new events_1.EventEmitter();
function emitSandboxLog(event) {
    exports.sandboxLogEmitter.emit('log', event);
}
