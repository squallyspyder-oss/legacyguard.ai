"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.viewport = exports.metadata = void 0;
exports.default = RootLayout;
const jsx_runtime_1 = require("react/jsx-runtime");
const google_1 = require("next/font/google");
require("./globals.css");
const Providers_1 = __importDefault(require("./Providers"));
const inter = (0, google_1.Inter)({
    subsets: ["latin"],
    variable: "--font-inter",
    display: "swap",
});
const jetbrainsMono = (0, google_1.JetBrains_Mono)({
    subsets: ["latin"],
    variable: "--font-jetbrains",
    display: "swap",
});
exports.metadata = {
    title: "LegacyGuard | AI Security Platform",
    description: "Plataforma de seguranca com IA para sistemas legados. Orquestracao multi-agente, sandbox isolado, e compliance automatizado.",
    keywords: ["AI", "security", "legacy systems", "COBOL", "orchestration", "DevSecOps"],
    authors: [{ name: "LegacyGuard" }],
    icons: {
        icon: "/favicon.svg",
    },
};
exports.viewport = {
    themeColor: "#0c0f16",
    width: "device-width",
    initialScale: 1,
};
function RootLayout({ children, }) {
    return ((0, jsx_runtime_1.jsx)("html", { lang: "pt-BR", className: "dark", children: (0, jsx_runtime_1.jsx)("body", { className: `${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`, children: (0, jsx_runtime_1.jsx)(Providers_1.default, { children: children }) }) }));
}
