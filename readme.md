refgen
======

    Usage: refgen [options] <source>

    Options:

        -h, --help                 output usage information
        -o, --output <file>        Set the output file (default: references.js)
        -e, --extra <id>           Add an extra dependency
        -a, --assembly <assembly>  Add an assembly reference

Description
-----------

refgen scans a folder recursively for javascript files, and generates a correctly references file by following
<reference> tags in the documents

Example Usage
-------------
    node refgen -o scripts/references.js -e extra1.js -e extra2.js -a ReferencedAssembly scripts/