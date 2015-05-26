refgen
======

Command Line
------------
  Usage: `refgen [options] <source>`

  Options:

    -h, --help                 output usage information
    -o, --output <file>        Set the output file (default: references.js)
    -e, --extra <id>           Add an extra dependency
    -a, --assembly <assembly>  Specify the assembly name
    -x, --exclude <exclude>    Exclude references containing string

Library
-------
    var refgen = require('refgen');
    refGen.findDependencies(files, options);

Example

    refGen.findDependencies(['Scripts/App.js'] {
      filterReference: function(ref) { return ref.indexOf('ExludeMe') == -1; },
      roots: [{ id: 'rootId', path: 'Path/To/Root' }]
      extraDependencies { 'relativePath': ['extraDependency1', 'extraDependency2'] }
      limitToList: false
    });

The following options are available:

*  **filterReference**: Custom filter on whether to include a reference.  Default: `true` functor
*  **roots**: Array of roots to support `~/` references. Default: `[]`
*  **limitToList**: Only sort given list, do not follow references.  Default: `false`
*  **extraDependencies**: Add extra dependencies to files.  All paths should be relative.  Default: `{}`


Description
-----------

refgen scans a folder recursively for javascript files, and generates a correctly references file by following
<reference> tags in the documents

Example Usage
-------------
    node refgen -o scripts/references.js -e extra1.js -e extra2.js -a ReferencedAssembly scripts/