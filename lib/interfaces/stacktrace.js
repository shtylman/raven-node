// sentry.interfaces.Stacktrace

// builtin
var fs = require('fs');

// vendor
var stacktrace = require('stack-trace');

module.exports = function(err, cb) {
    parseStack(err, function(e, frames) {
        return cb(e, { frames: frames });
    });
};

module.exports.key = 'sentry.interfaces.Stacktrace';

// lines of context around error line
var LINES_OF_CONTEXT = 7;

var parseStack = function (err, cb) {

    // per sentry docs:
    // frames should be sorted with the most recent caller being the last in the list.
    var frames = [];

    // cache file content to avoid re-fetching for context
    var cache = {};

    var callsites = stacktrace.parse(err);

    var count = callsites.length - 1;
    (function next(err) {
        if (err) {
            return cb(err);
        }

        // done
        if (count < 0) {
            return cb(null, frames);
        }

        var callsite = callsites[count--];

        var frame = {
            function: callsite.getFunctionName(),
            filename: callsite.getFileName(),
            lineno: callsite.getLineNumber()
        };

        // sentry does not like null for lineno
        // so we explicitly check and unset it if we don't have it
        if (!frame.lineno) {
            delete frame.lineno;
        }

        frames.push(frame);

        var filename = frame.filename;

        // node internals don't look like absolute or relative paths
        if (!filename || (filename[0] !== '/' && filename[0] !== '.')) {
            return next();
        }

        var cached = cache[filename];
        if (cached) {
            parseLines(cached.split('\n'));
            return next();;
        }

        var source = fs.readFile(filename, 'utf8', function(err, source) {
            if (err) {
                // skip if we can't find the file
                if (err.code === 'ENOENT') {
                    return next();
                }

                return next(err);
            }

            cache[filename] = source;
            parseLines(source.split('\n'));
            return next();
        });

        function parseLines(lines) {
            frame.pre_context = lines.slice(Math.max(0, frame.lineno-(LINES_OF_CONTEXT+1)), frame.lineno-1);
            frame.context_line = lines[frame.lineno-1];
            frame.post_context = lines.slice(frame.lineno, frame.lineno+LINES_OF_CONTEXT);
        }
    })();
};

module.exports.parseStack = parseStack;

