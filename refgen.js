#!/usr/bin/env node

var program = require('commander');
var fs = require("fs");
var refgen = require("./refgen-api.js");

function collect(value, values) {
    return values.concat([value]);
}

program
    .usage('[options] <source>')
    .option('-o, --output <file>', 'Set the output file (default: references.js)', 'references.js')
    .option('-e, --extra <id>', 'Add an extra dependency', collect, [])
    .option('-a, --assembly <assembly>', 'Add an assembly reference', collect, [])
    .option('-x, --exclude <exclude>', 'Exclude references matching part of this', collect, [])
    .parse(process.argv);

var source = program.args[0];
var destination = program.output;

if (!source)
    program.help();

var getPattern = function () {
    return /\/\/\/\s*<reference path="([^\"]*)" \/>/g;
};
var root = nicePathTo(source);
var niceSavePath = destination;

if (fs.existsSync(destination)) {
    console.log("Output file exists, removing...");
    fs.unlinkSync(destination);
}

console.log("Reading: " + root);
console.log("Writing: " + niceSavePath);
console.log("Excludes: " + program.exclude.join(", "));

var start = +new Date();
var files = readDirectory(root).filter(isIncluded);

var references = refgen.findReferences(files, {
    limitToList: true,
    filterReference: function(reference) {
        var shouldInclude = program.exclude.every(function (exclusion) {
            return reference.indexOf(exclusion) === -1;
        });
        return shouldInclude;
    },
    roots: program.assembly.map(function(assembly) {
        return {
            "id": assembly,
            "path": source
        };
    })
});

var referencesJs = references.verbose.reduce(function(soFar, reference) {

    var relativeReference = createRelativeReference(reference);
    var assemblyReference = createAssemblyReferences(reference).join("\n");
    return soFar + relativeReference + "\n" + assemblyReference + "\n" + "\n";
}, '');

fs.writeFileSync(destination, referencesJs);

console.log("Sorted in " + (+new Date() - start) + 'ms');

function createRelativeReference(reference) {
    return '/// <reference path="~/' + reference.path + '" />';
}

function createAssemblyReferences(reference) {
    var scriptId = reference.path.replace(/\//g, '.');

    return program.assembly.map(function(assemblyName) {
        return '/// <reference name="' + scriptId + '" assembly="' + assemblyName + '" />';
    });
}

function readDirectory(path) {
    var dirContents = fs.readdirSync(path);

    var files = [];
    dirContents.forEach(function (filename) {
        var fullPath = nicePathTo(path + "/" + filename);

        if (filename == "." || filename == ".." || filename == "node_modules" || fullPath == niceSavePath)
            return;

        var stats = fs.statSync(fullPath);
        if (stats.isDirectory()) {
            files = files.concat(readDirectory(fullPath));
        } else
            files.push(toFile(fullPath));
    });

    return files;

    function toFile(f) {
        return f;
        return {
            directory: path,
            filename: f
        };
    }
}

function nicePathTo(file) {
    return fs.realpathSync(file)
        .replace(/\\/g, "/");
}

function isIncluded(file) {
    return file.indexOf('.js') != -1;
}