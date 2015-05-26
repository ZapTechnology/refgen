var path = require('path');
var fs = require('fs');
var toposort = require('toposort');

function findReferences(files, options) {
    if (!options.roots)
        options.roots = [];

    if (!options.filterReference)
        options.filterReference = function() { return true; };

    var referenceFinder = new ReferenceFinder(options, fs, path);
    var references = referenceFinder.findReferences(files, options.extraDependencies);
    var sorted = sortReferences(references);

    sorted.verbose = sorted.map(referenceFinder.generateVerbose, referenceFinder);

    return sorted;
}

function sortReferences(references) {
    var sourceFiles = Object.keys(references);

    var graph = sourceFiles.map(function(sourceFile) {
        return references[sourceFile].map(function(reference) {
            return [sourceFile, reference];
        });
    });

    var edges = Array.prototype.concat.apply([], graph);
    var sorted = toposort.array(sourceFiles, edges);
    sorted.reverse();
    return sorted;
}

function ReferenceFinder(options, fs, path) {
    this._options = options;
    this._fs = fs;
    this._path = path;
    this._cachedPaths = {};
}
ReferenceFinder.prototype = {
    findReferences: function (files, extraDependencies) {
        extraDependencies = extraDependencies || {};
        var result = {};
        var stillToParse = files.map(this._realPath, this);
        stillToParse.forEach(function(f) { result[f] = []; });

        var normalizedExtraDependencies = {};
        Object.keys(extraDependencies).forEach(function(key) {
            normalizedExtraDependencies[this._realPath(key)] = extraDependencies[key].map(this._realPath, this);
        }, this);

        while (stillToParse.length) {
            var currentFile = stillToParse.pop();
            var references = this._searchFileForReferences(currentFile, normalizedExtraDependencies);

            references = references.concat(normalizedExtraDependencies[currentFile] || []);

            if (!this._options.limitToList)
                references
                    .filter(function(r) { return !result[r]; })
                    .forEach(function(r) {
                        result[r] = [];
                        stillToParse.push(r);
                    });

            result[currentFile] = references;
        }

        return result;
    },

    _searchFileForReferences: function (filePath) {
        var contents = this._fs.readFileSync(filePath).toString();

        var pattern = this._referencePattern();

        var referencedFiles = [];
        var match;
        while ((match = pattern.exec(contents))) {
            var referencePath = match[1];
            if (this._options.filterReference(referencePath))
                referencedFiles.push(this._getFileNameFromReference(filePath, referencePath));
        }

        return referencedFiles;
    },

    _referencePattern: function() {
        // Captures Foo in <reference path="Foo" />
        return /\/\/\/\s*<reference path="([^"]*)"\s?\/>/g;
    },

    _getFileNameFromReference: function (sourceFilePath, referencePath) {
        var fileSystemPath;
        if (referencePath[0] == '~') {
            var root = this._getRoot(sourceFilePath);
            fileSystemPath = this._realPath(root.path) + '/' + referencePath.substr(1);
        } else {
            var sourceFileFolder = this._path.dirname(sourceFilePath);
            fileSystemPath = this._path.normalize(this._path.join(sourceFileFolder, referencePath));
        }

        try {
            return this._realPath(fileSystemPath);
        } catch (error) {
            if (error instanceof InvalidPathError) {
                throw new InvalidReferenceError(referencePath, sourceFilePath)
            }
        }
    },

    generateVerbose: function(path) {
        var root = this._getRoot(path);
        var rootPath = this._realPath(root.path);

        return {
            rootId: root.id,
            path: path.replace(rootPath + '/', ''),
            filePath: path
        };
    },

    _getRoot: function(path) {
        var roots = this._options.roots;

        for (var i=0; i < roots.length; i++) {
            var root = roots[i];
            if (path.indexOf(this._realPath(root.path)) === 0)
                return root;
        }

        throw new RootNotFoundError(path);
    },

    _realPath: function (path) {
        if (this._cachedPaths[path])
            return this._cachedPaths[path];

        if (!this._fs.existsSync(path))
            throw new InvalidPathError(path);

        var realPath = this._fs.realpathSync(path)
            .replace(/\\/g, '/');

        this._ensurePathIsCorrectCase(realPath);

        return this._cachedPaths[path] = realPath;
    },

    _ensurePathIsCorrectCase: function(path) {
        var directory = this._path.dirname(path);

        // Throw errors for incorrect casing, since realpathSync returns files with the same
        // case that was passed into it.
        var fileIsDifferentCase = this._fs.readdirSync(directory).every(function (f) {
            return path.indexOf(f) == -1
        });
        if (fileIsDifferentCase)
            throw new InvalidPathError(path);
    }
};

function RootNotFoundError(path) {
    this.name = "RootNotFoundError";
    this.message = "No root found for: " + path;
    this.path = path;
}
RootNotFoundError.prototype = Error.prototype;

function InvalidPathError(path) {
    this.name = "InvalidPathError";
    this.message = "Invalid path: " + path;
    this.path = path;
}
InvalidPathError.prototype = Error.prototype;

function InvalidReferenceError(referencePath, fromPath) {
    this.name = "InvalidReferenceError";
    this.message = "Invalid reference : " + referencePath + "\n    "
    + "referenced from " + fromPath;
}
InvalidReferenceError.prototype = Error.prototype;

module.exports = {
    findReferences: findReferences
};
