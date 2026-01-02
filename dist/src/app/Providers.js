"use strict";
"use client";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Providers;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("next-auth/react");
function Providers({ children }) {
    return (0, jsx_runtime_1.jsx)(react_1.SessionProvider, { children: children });
}
