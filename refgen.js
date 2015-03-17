var program = require('commander');
var toposort = require("toposort");
var fs = require("fs");

function collect(value, values) {
    return values.concat([value]);
}

program
    .usage('[options] <source>')
    .option('-o, --output <file>', 'Set the output file (default: references.js)', 'references.js')
    .option('-e, --extra <id>', 'Add an extra dependency', collect, [])
    .option('-a, --assembly <assembly>', 'Add an assembly reference', collect, [])
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

var start = +new Date();
var files = readDirectory(root).filter(isIncluded);
console.log("  Read " + files.length + " file(s) in " + (+new Date() - start) + 'ms');

start = +new Date();
var dependencies = files.map(getEdges);
var edges = flatten(dependencies);
console.log("  Found " + dependencies.length + " edges in " + (+new Date() - start) + 'ms');

start = +new Date();
var sorted = toposort.array(files.map(function(f) { return f.filename; }), edges).reverse();
console.log("Sorted in " + (+new Date() - start) + 'ms');

function createRelativeReference(path) {
    var relativeToRootPath = path.replace(root + "/", "");
    return '/// <reference path="~/' + relativeToRootPath + '" />';
}

function createAssemblyReferences(path) {
    var relativeToRootPath = path.replace(root + "/", "");
    var scriptId = relativeToRootPath.replace(/\//g, '.');

    return program.assembly.map(function(assemblyName) {
        return '/// <reference name="' + scriptId + '" assembly="' + assemblyName + '" />';
    });
}

var referencesJs = sorted.reduce(function (soFar, path) {
    var relativeReference = createRelativeReference(path);
    var assemblyReference = createAssemblyReferences(path).join("\n");

    return soFar + relativeReference + "\n" + assemblyReference + "\n" + "\n";
}, '');

referencesJs += program.extra.reduce(function(soFar, extra) {
    return soFar + '/// <reference path="' + extra + '" />' + "\n";
}, '');

fs.writeFileSync(destination, referencesJs);

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
    return file.filename.indexOf('.js') != -1;
}

function getEdges(file) {
    var contents = fs.readFileSync(file.filename).toString();
    var matches = contents.match(getPattern());

    if (!matches)
        return [];

    var dependencies = matches.map(function (line) {
        var match = getPattern().exec(line)
        var fullPath = match[1].indexOf("~") == -1
            ? file.directory + "/" + match[1]
            : match[1].replace("~", root);

        if (!fs.existsSync(fullPath)) {
            console.warn("Warning: Dependency: " + fullPath + " does not exist!\n   (from " + file.filename + ")");
            return null;
        }

        return nicePathTo(fullPath);
    }).filter(function(f) { return f != null });

    return dependencies.map(function (d) {
        return [file.filename, d];
    })
}

function flatten(v) {
    return Array.prototype.concat.apply([], v);
}