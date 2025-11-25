const {
    defineConfig,
    globalIgnores,
} = require("eslint/config");

const tsParser = require("@typescript-eslint/parser");
const typescriptEslintEslintPlugin = require("@typescript-eslint/eslint-plugin");
const simpleImportSort = require("eslint-plugin-simple-import-sort");
const jestFormatting = require("eslint-plugin-jest-formatting");
const jest = require("eslint-plugin-jest");
const unusedImports = require("eslint-plugin-unused-imports");
const rxjs = require("eslint-plugin-rxjs");
const globals = require("globals");
const js = require("@eslint/js");

const {
    FlatCompat,
} = require("@eslint/eslintrc");

const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

module.exports = defineConfig([{
    languageOptions: {
        parser: tsParser,
        sourceType: "module",

        parserOptions: {
            project: "tsconfig.json",
            tsconfigRootDir: __dirname,
        },

        globals: {
            ...globals.node,
            ...globals.jest,
        },
    },

    plugins: {
        "@typescript-eslint": typescriptEslintEslintPlugin,
        "simple-import-sort": simpleImportSort,
        "jest-formatting": jestFormatting,
        jest,
        "unused-imports": unusedImports,
        rxjs,
    },

    extends: compat.extends(
        "plugin:@typescript-eslint/recommended",
        "plugin:jest/recommended",
        "plugin:jest/style",
        "plugin:jest-formatting/strict",
        "plugin:prettier/recommended",
    ),

    rules: {
        "@typescript-eslint/consistent-type-imports": "error",

        "jest/consistent-test-it": ["error", {
            fn: "test",
            withinDescribe: "test",
        }],

        "jest/expect-expect": ["error", {
            assertFunctionNames: ["expect", "request.**.expect"],
        }],

        "jest-formatting/padding-around-all": 2,
        "no-console": "error",

        "no-restricted-imports": ["error", {
            paths: [{
                name: ".",
                message: "Do not import from own index",
            }, {
                name: "..",
                message: "Do not import from own index",
            }, {
                name: "./",
                message: "Do not import from own index",
            }],
        }],

        "require-await": "error",
        "simple-import-sort/exports": "error",

        "simple-import-sort/imports": ["error", {
            groups: [["^\\u0000"], ["^node:"], ["^@?\\w"], ["^"], ["^\\."]],
        }],
    },
}, globalIgnores(["**/.eslintrc.js"])]);
