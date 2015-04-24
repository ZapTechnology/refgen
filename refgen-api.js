var path = require('path');
var fs = require('fs');
var toposort = require('toposort');

function findReferences(files, options) {
    if (!options.roots)
        options.roots = [];

    if (!options.filterReference)
        options.filterReference = function() { return true; };

    var referenceFinder = new ReferenceFinder(options, fs, path);
    var references = referenceFinder.findReferences(files);
    var sorted = sortReferences(references);

    sorted.verbose = sorted.map(referenceFinder.withRootInfo, referenceFinder);

    return sorted;
}

function sortReferences(references) {
    var nodes = Object.keys(references);

    var graph = nodes.map(function(f) {
        return references[f].map(function(r) {
            return [f, r];
        });
    });

    var edges = Array.prototype.concat.apply([], graph);
    var sorted = toposort.array(nodes, edges);
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
    findReferences: function (files) {
        var result = {};
        var stillToParse = files.map(this._realPath, this);

        while (stillToParse.length) {
            var next = stillToParse.pop();
            var references = this._searchFileForReferences(next);

            if (!this._options.limitToList)
                references
                    .filter(function(r) { return !result[r]; })
                    .forEach(function(r) { stillToParse.push(r); });

            result[next] = references;
        }

        return result;
    },

    _searchFileForReferences: function (filePath) {
        var contents = this._fs.readFileSync(filePath).toString();
        var matches = contents.match(this._referencePattern);

        if (!matches)
            return [];

        return matches
            .map(function(line) { return this._referencePattern.exec(line)[1]; }, this)
            .filter(function(referencePath) { return referencePath && this._options.filterReference(referencePath); }, this)
            .map(function(referencePath) { return this._getFileNameFromReference(referencePath, filePath); }, this);
    },

    get _referencePattern() {
        return /\/\/\/\s*<reference path="([^"]*)"\s?\/>/g;
    },

    _getFileNameFromReference: function (referencePath, sourcePath) {
        var fileSystemPath;
        if (referencePath[0] == '~') {
            var root = this._getRoot(sourcePath);
            fileSystemPath = this._realPath(root.path) + '/' + referencePath.substr(1);
        } else {
            var sourcePathFolder = sourcePath.split('/').slice(0, -1).join('/');
            var fileSystemPath = this._path.normalize(path.join(sourcePathFolder, referencePath));
        }
        try {
            return this._realPath(fileSystemPath);
        } catch (error) {
            if (error instanceof InvalidPathError) {
                throw new InvalidReferenceError(referencePath, sourcePath)
            }
        }
    },

    withRootInfo: function(path) {
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
        var realPath = this._realPath.bind(this);

        var root = roots
            .reduce(function(root, potentialRoot) {
                if (root)
                    return root;

                if (path.indexOf(realPath(potentialRoot.path)) === 0)
                    return potentialRoot;

                return null;
            }, null, this);

        if (!root)
            throw "No root found for " + path;

        return root;
    },

    _realPath: function (path) {
        if (this._cachedPaths[path])
            return this._cachedPaths[path];

        if (!this._fs.existsSync(path))
            throw new InvalidPathError(path);

        var realPath = this._fs.realpathSync(path)
            .replace(/\\/g, '/');

        var directory = this._path.dirname(realPath);
        var allFiles = fs.readdirSync(directory);

        if (allFiles.every(function(f) { return realPath.indexOf(f) == -1 }))
            throw new InvalidPathError(path);

        return this._cachedPaths[path] = realPath;
    }
};

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