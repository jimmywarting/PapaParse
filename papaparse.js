/* @license
Papa Parse
v5.3.0 - forked
https://github.com/mholt/PapaParse
License: MIT
*/

(function(root, factory)
{
	/* globals define */
	if (typeof define === 'function' && define.amd) {
		// AMD. Register as an anonymous module.
		define([], factory);
	} else if (typeof module === 'object' && typeof exports !== 'undefined') {
		// Node. Does not work with strict CommonJS, but
		// only CommonJS-like environments that support module.exports,
		// like Node.
		module.exports = factory()
	} else {
		// Browser globals (root is window)
		root.Papa = factory()
	}
}(this, function moduleFactory() {

	var Papa = {
		parse: CsvToJson,
		unparse: JsonToCsv,
		RECORD_SEP: String.fromCharCode(30),
		UNIT_SEP: String.fromCharCode(31),
		BYTE_ORDER_MARK: '\ufeff',
		BAD_DELIMITERS: ['\r', '\n', '"', '\ufeff'],

		// Configurable chunk sizes for local and remote files, respectively
		LocalChunkSize: 1024 * 1024 * 10,	// 10 MB
		RemoteChunkSize: 1024 * 1024 * 5,	// 5 MB
		DefaultDelimiter: ','			// Used if not specified and detection fails
	}

	function CsvToJson(_input, _config = {}) {
		var dynamicTyping = _config.dynamicTyping || false
		if (isFunction(dynamicTyping)) {
			_config.dynamicTypingFunction = dynamicTyping
			// Will be filled on first row call
			dynamicTyping = {}
		}
		_config.dynamicTyping = dynamicTyping

		_config.transform = isFunction(_config.transform) ? _config.transform : false

    return new ChunkStreamer(_config).stream(_input)
	}

	function JsonToCsv(_input, _config) {
		// Default configuration

		/** whether to surround every datum with quotes */
		var _quotes = false

		/** whether to write headers */
		var _writeHeader = true

		/** delimiting character(s) */
		var _delimiter = ','

		/** newline character(s) */
		var _newline = '\r\n'

		/** quote character */
		var _quoteChar = '"'

		/** escaped quote character, either "" or <config.escapeChar>" */
		var _escapedQuote = _quoteChar + _quoteChar

		/** whether to skip empty lines */
		var _skipEmptyLines = false

		/** the columns (keys) we expect when we unparse objects */
		var _columns = null

		/** whether to prevent outputting cells that can be parsed as formulae by spreadsheet software (Excel and LibreOffice) */
		var _escapeFormulae = false

		unpackConfig()

		var quoteCharRegex = new RegExp(escapeRegExp(_quoteChar), 'g')

		if (Array.isArray(_input)) {
			var data = !_input.length || Array.isArray(_input[0])
			  ? serialize(null, _input, _skipEmptyLines)
				: typeof _input[0] === 'object'
				  ? serialize(_columns || Object.keys(_input[0]), _input, _skipEmptyLines)
				  : 0
			if (data) return [...data].join('')
		}

		// Default (any valid paths should return before this)
		throw new Error('Unable to serialize unrecognized input')

		function unpackConfig() {
			if (typeof _config !== 'object') return

			if (typeof _config.delimiter === 'string'
                && !Papa.BAD_DELIMITERS.filter(function(value) { return _config.delimiter.includes(value) }).length)
			{
				_delimiter = _config.delimiter
			}

			if (typeof _config.quotes === 'boolean'
				|| typeof _config.quotes === 'function'
				|| Array.isArray(_config.quotes))
				_quotes = _config.quotes;

			if (typeof _config.skipEmptyLines === 'boolean'
				|| typeof _config.skipEmptyLines === 'string')
				_skipEmptyLines = _config.skipEmptyLines;

			if (typeof _config.newline === 'string')
				_newline = _config.newline

			if (typeof _config.quoteChar === 'string')
				_quoteChar = _config.quoteChar

			if (typeof _config.header === 'boolean')
				_writeHeader = _config.header

			if (Array.isArray(_config.columns)) {

				if (_config.columns.length === 0) throw new Error('Option columns is empty')

				_columns = _config.columns
			}

			if (_config.escapeChar !== undefined) {
				_escapedQuote = _config.escapeChar + _quoteChar;
			}

			if (typeof _config.escapeFormulae === 'boolean')
				_escapeFormulae = _config.escapeFormulae;
		}

		/** The double for loop that iterates the data and writes out a CSV string including header row */
		function * serialize (fields, data, skipEmptyLines) {
			var hasHeader = Array.isArray(fields) && fields.length > 0
			var dataKeyedByField = !(Array.isArray(data[0]))

			// If there a header row, write it first
			if (hasHeader && _writeHeader) {
				for (var i = 0; i < fields.length; i++) {
					if (i > 0) yield _delimiter
					yield safe(fields[i], i)
				}
				if (data.length > 0) yield _newline
			}

			// Then write out the data
			for (var row = 0; row < data.length; row++) {
				var maxCol = hasHeader ? fields.length : data[row].length;
				var emptyLine = false;
				var nullLine = hasHeader ? Object.keys(data[row]).length === 0 : data[row].length === 0;
				if (skipEmptyLines && !hasHeader) {
					emptyLine = skipEmptyLines === 'greedy' ? data[row].join('').trim() === '' : data[row].length === 1 && data[row][0].length === 0;
				}
				if (skipEmptyLines === 'greedy' && hasHeader) {
					var line = []
					for (var c = 0; c < maxCol; c++) {
						var cx = dataKeyedByField ? fields[c] : c
						line.push(data[row][cx])
					}
					emptyLine = line.join('').trim() === ''
				}
				if (!emptyLine) {
					for (var col = 0; col < maxCol; col++) {
						if (col > 0 && !nullLine) yield _delimiter
						var colIdx = hasHeader && dataKeyedByField ? fields[col] : col
						yield safe(data[row][colIdx], col)
					}
					if (row < data.length - 1 && (!skipEmptyLines || (maxCol > 0 && !nullLine))) {
						yield _newline
					}
				}
			}
		}

		/** Encloses a value around quotes if needed (makes a value safe for CSV insertion) */
		function safe(str, col) {
			if (typeof str === 'undefined' || str === null)
				return '';

			if (str.constructor === Date)
				return JSON.stringify(str).slice(1, 25)

			if (_escapeFormulae === true && typeof str === "string" && (str.match(/^[=+\-@].*$/) !== null)) {
				str = "'" + str;
			}

			var escapedQuoteStr = str.toString().replace(quoteCharRegex, _escapedQuote);

			var needsQuotes = (typeof _quotes === 'boolean' && _quotes)
							|| (typeof _quotes === 'function' && _quotes(str, col))
							|| (Array.isArray(_quotes) && _quotes[col])
							|| hasAny(escapedQuoteStr, Papa.BAD_DELIMITERS)
							|| escapedQuoteStr.indexOf(_delimiter) > -1
							|| escapedQuoteStr.charAt(0) === ' '
							|| escapedQuoteStr.charAt(escapedQuoteStr.length - 1) === ' ';

			return needsQuotes ? _quoteChar + escapedQuoteStr + _quoteChar : escapedQuoteStr;
		}

		function hasAny(str, substrings) {
			for (var i = 0; i < substrings.length; i++)
				if (str.indexOf(substrings[i]) > -1)
					return true;
			return false;
		}
	}

	/** ChunkStreamer is the base prototype for various streamer implementations. */
	function ChunkStreamer(config = {}) {
		this._finished = true
		this._completed = false
		this._halted = false
		this._input = null
		this._baseIndex = 0
		this._partialLine = ''
		this._rowCount = 0
		this._start = 0
		this._completeResults = {
			data: [],
			errors: [],
			meta: {}
		}

		// Deep-copy the config so we can edit it
		var configCopy = copy(config)
		configCopy.chunkSize = parseInt(configCopy.chunkSize)	// parseInt VERY important so we don't concatenate strings!
		if (!config.step && !config.chunk)
			configCopy.chunkSize = null  // disable Range header if not streaming; bad values break IIS - see issue #196
		this._handle = new ParserHandle(configCopy)
		this._handle.streamer = this
		this._config = configCopy	// persist the copy to the caller

		this.stream = function(chunk, isFakeChunk) {
			// Rejoin the line we likely just split in two by chunking the file
			var aggregate = this._partialLine + chunk;
			this._partialLine = '';

			var results = this._handle.parse(aggregate, this._baseIndex, !this._finished);

			if (results && results.data) {
				this._rowCount += results.data.length
			}

			var finishedIncludingPreview = true

			if (isFunction(this._config.chunk) && !isFakeChunk) {
				this._config.chunk(results, this._handle)
				results = undefined
				this._completeResults = undefined
			}

			if (!this._config.step && !this._config.chunk) {
				this._completeResults.data = this._completeResults.data.concat(results.data)
				this._completeResults.errors = this._completeResults.errors.concat(results.errors)
				this._completeResults.meta = results.meta
			}

			if (!this._completed && finishedIncludingPreview && isFunction(this._config.complete)) {
				this._config.complete(this._completeResults, this._input)
				this._completed = true
			}

			return results
		}

		this._sendError = function(error) {
			if (isFunction(this._config.error))
				this._config.error(error)
		}
	}


	// One goal is to minimize the use of regular expressions...
	var MAX_FLOAT = Math.pow(2, 53)
	var MIN_FLOAT = -MAX_FLOAT
	var FLOAT = /^\s*-?(\d+\.?|\.\d+|\d+\.\d+)(e[-+]?\d+)?\s*$/
	var ISO_DATE = /(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))/

	function guessLineEndings (input, quoteChar) {
		input = input.substring(0, 1024 * 1024)	// max length 1 MB
		// Replace all the text inside quotes
		var re = new RegExp(escapeRegExp(quoteChar) + '([^]*?)' + escapeRegExp(quoteChar), 'gm');
		input = input.replace(re, '')

		var r = input.split('\r')
		var n = input.split('\n')

		var nAppearsFirst = (n.length > 1 && n[0].length < r[0].length)

		if (r.length === 1 || nAppearsFirst)
			return '\n'

		var numWithN = 0;
		for (var i = 0; i < r.length; i++)
		{
			if (r[i][0] === '\n')
				numWithN++;
		}

		return numWithN >= r.length / 2 ? '\r\n' : '\r';
	}

	function testFloat (s) {
		if (FLOAT.test(s)) {
			var floatValue = parseFloat(s)
			return floatValue > MIN_FLOAT && floatValue < MAX_FLOAT
		}
		return false
	}

	function addError (_results, type, code, msg, row) {
		var error = {
			type: type,
			code: code,
			message: msg
		}
		if (row !== undefined) {
			error.row = row
		}
		_results.errors.push(error)
	}

	function testEmptyLine (s, skipEmptyLines) {
		return skipEmptyLines === 'greedy' ? s.join('').trim() === '' : s.length === 1 && s[0].length === 0;
	}

	// Use one ParserHandle per entire CSV file or string
	class ParserHandle {
		#parser = null // The core parser being used
		#input = null // The input being parsed
		#config = null

		constructor (_config) {
			var self = this

			var _rowCounter = 0  // Number of rows that have been parsed so far
			var _delimiterError  // Temporary state between delimiter detection and processing results
			var _parser          // The core parser being used
			var _fields = []     // Fields are from the header row of the input, if there is one
			var _results = {     // The last results returned from the parser
				data: [],
				errors: [],
				meta: {}
			}

			this.#config = _config

			if (isFunction(_config.step)) {
				var userStep = _config.step
				_config.step = function(results) {
					var _stepCounter = 0 // Number of times step was called (number of rows parsed)
					_results = results

					if (needsHeaderRow()) {
						processResults()
					} else {
						// only call user's step function after header row

						processResults()

						// It's possbile that this line was empty and there's no row here after all
						if (_results.data.length === 0) return

						_stepCounter += results.data.length;
						_results.data = _results.data[0]
						userStep(_results, self)
					}
				}
			}

			/**
			 * Parses input. Most users won't need, and shouldn't mess with, the baseIndex
			 * and ignoreLastRow parameters. They are used by streamers (wrapper functions)
			 * when an input comes in multiple chunks, like from a file.
			 */
			this.parse = function(input, baseIndex, ignoreLastRow) {
				const config = this.#config
				var quoteChar = config.quoteChar || '"'
				if (!config.newline)
					config.newline = guessLineEndings(input, quoteChar)

				_delimiterError = false
				if (!config.delimiter) {
					var delimGuess = guessDelimiter(input, config.newline, config.skipEmptyLines, config.comments, config.delimitersToGuess);
					if (delimGuess.successful)
						config.delimiter = delimGuess.bestDelimiter;
					else {
						_delimiterError = true;	// add error after parsing (otherwise it would be overwritten)
						config.delimiter = Papa.DefaultDelimiter
					}
					_results.meta.delimiter = config.delimiter
				} else if (isFunction(config.delimiter)) {
					config.delimiter = config.delimiter(input)
					_results.meta.delimiter = config.delimiter
				}

				var parserConfig = copy(config)
				if (config.preview && config.header)
					parserConfig.preview++	// to compensate for header row

				this.#input = input
				this.#parser = _parser = new Parser(parserConfig)
				_results = _parser.parse(input, baseIndex, ignoreLastRow)
				processResults()
				return (_results || { meta: {} })
			}

			function processResults() {
				if (_results && _delimiterError) {
					addError(_results, 'Delimiter', 'UndetectableDelimiter', 'Unable to auto-detect delimiting character; defaulted to \'' + Papa.DefaultDelimiter + '\'');
					_delimiterError = false
				}

				if (_config.skipEmptyLines)
				{
					for (var i = 0; i < _results.data.length; i++)
						if (testEmptyLine(_results.data[i], _config.skipEmptyLines))
							_results.data.splice(i--, 1);
				}

				if (needsHeaderRow())
					fillHeaderFields();

				return applyHeaderAndDynamicTypingAndTransformation();
			}

			function needsHeaderRow() {
				return _config.header && _fields.length === 0
			}

			function fillHeaderFields() {
				if (!_results) return

				function addHeader(header, i) {
					if (isFunction(_config.transformHeader)) {
						header = _config.transformHeader(header, i)
					}
					_fields.push(header)
				}

				if (Array.isArray(_results.data[0])) {
					for (var i = 0; needsHeaderRow() && i < _results.data.length; i++) {
						_results.data[i].forEach(addHeader)
					}

					_results.data.splice(0, 1)
				} else {
					// if _results.data[0] is not an array, we are in a step where _results.data is the row.
					_results.data.forEach(addHeader)
				}
			}

			function shouldApplyDynamicTyping(field) {
				// Cache function values to avoid calling it for each row
				if (_config.dynamicTypingFunction && _config.dynamicTyping[field] === undefined) {
					_config.dynamicTyping[field] = _config.dynamicTypingFunction(field);
				}
				return (_config.dynamicTyping[field] || _config.dynamicTyping) === true;
			}

			function parseDynamic(field, value)
			{
				if (shouldApplyDynamicTyping(field))
				{
					if (value === 'true' || value === 'TRUE')
						return true;
					else if (value === 'false' || value === 'FALSE')
						return false;
					else if (testFloat(value))
						return parseFloat(value);
					else if (ISO_DATE.test(value))
						return new Date(value);
					else
						return (value === '' ? null : value);
				}
				return value;
			}

			function applyHeaderAndDynamicTypingAndTransformation()
			{
				if (!_results || (!_config.header && !_config.dynamicTyping && !_config.transform))
					return _results;

				function processRow(rowSource, i) {
					var row = _config.header ? {} : [];

					var j;
					for (j = 0; j < rowSource.length; j++) {
						var field = j;
						var value = rowSource[j];

						if (_config.header)
							field = j >= _fields.length ? '__parsed_extra' : _fields[j];

						if (_config.transform)
							value = _config.transform(value,field);

						value = parseDynamic(field, value);

						if (field === '__parsed_extra') {
							row[field] = row[field] || [];
							row[field].push(value);
						}
						else
							row[field] = value;
					}


					if (_config.header) {
						if (j > _fields.length)
							addError(_results, 'FieldMismatch', 'TooManyFields', 'Too many fields: expected ' + _fields.length + ' fields but parsed ' + j, _rowCounter + i);
						else if (j < _fields.length)
							addError(_results, 'FieldMismatch', 'TooFewFields', 'Too few fields: expected ' + _fields.length + ' fields but parsed ' + j, _rowCounter + i);
					}

					return row;
				}

				var incrementBy = 1;
				if (!_results.data.length || Array.isArray(_results.data[0])) {
					_results.data = _results.data.map(processRow);
					incrementBy = _results.data.length;
				} else {
					_results.data = processRow(_results.data, 0)
				}

				if (_config.header && _results.meta)
					_results.meta.fields = _fields

				_rowCounter += incrementBy
				return _results
			}

			function guessDelimiter(input, newline, skipEmptyLines, comments, delimitersToGuess) {
				var bestDelim, bestDelta, fieldCountPrevRow, maxFieldCount;

				delimitersToGuess = delimitersToGuess || [',', '\t', '|', ';', Papa.RECORD_SEP, Papa.UNIT_SEP];

				for (var i = 0; i < delimitersToGuess.length; i++) {
					var delim = delimitersToGuess[i];
					var delta = 0, avgFieldCount = 0, emptyLinesCount = 0;
					fieldCountPrevRow = undefined;

					var preview = new Parser({
						comments: comments,
						delimiter: delim,
						newline: newline,
						preview: 10
					}).parse(input)

					for (var j = 0; j < preview.data.length; j++) {
						if (skipEmptyLines && testEmptyLine(preview.data[j], _config.skipEmptyLines)) {
							emptyLinesCount++;
							continue;
						}
						var fieldCount = preview.data[j].length;
						avgFieldCount += fieldCount;

						if (typeof fieldCountPrevRow === 'undefined') {
							fieldCountPrevRow = fieldCount;
							continue;
						}
						else if (fieldCount > 0) {
							delta += Math.abs(fieldCount - fieldCountPrevRow);
							fieldCountPrevRow = fieldCount;
						}
					}

					if (preview.data.length > 0)
						avgFieldCount /= (preview.data.length - emptyLinesCount);

					if ((typeof bestDelta === 'undefined' || delta <= bestDelta)
						&& (typeof maxFieldCount === 'undefined' || avgFieldCount > maxFieldCount) && avgFieldCount > 1.99) {
						bestDelta = delta;
						bestDelim = delim;
						maxFieldCount = avgFieldCount;
					}
				}

				_config.delimiter = bestDelim;

				return {
					successful: !!bestDelim,
					bestDelimiter: bestDelim
				}
			}
		}
	}


	/** https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions */
	function escapeRegExp(string) {
		return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // $& means the whole matched string
	}

  /** The core parser implements speedy and correct CSV parsing */
	class Parser {
		constructor (config = {}) {
			// Unpack the config object
			var {delimiter: delim, newline, comments, step, fastMode, preview} = config
			var quoteChar
			/** Allows for no quoteChar by setting quoteChar to undefined in config */
			if (config.quoteChar === undefined) {
				quoteChar = '"'
			} else {
				quoteChar = config.quoteChar
			}
			var escapeChar = quoteChar
			if (config.escapeChar !== undefined) {
				escapeChar = config.escapeChar
			}

			// Delimiter must be valid
			if (typeof delim !== 'string'
				|| Papa.BAD_DELIMITERS.indexOf(delim) > -1)
				delim = ','

			// Comment character must be valid
			if (comments === delim)
				throw new Error('Comment character same as delimiter')
			else if (comments === true)
				comments = '#'
			else if (typeof comments !== 'string'
				|| Papa.BAD_DELIMITERS.indexOf(comments) > -1)
				comments = false

			// Newline must be valid: \r, \n, or \r\n
			if (newline !== '\n' && newline !== '\r' && newline !== '\r\n')
				newline = '\n'

			// We're gonna need these at the Parser scope
			var cursor = 0

			this.parse = function(input, baseIndex, ignoreLastRow) {
				// For some reason, in Chrome, this speeds things up (!?)
				if (typeof input !== 'string')
					throw new Error('Input must be a string')

				// We don't need to compute some of these every time parse() is called,
				// but having them in a more local scope seems to perform better
				var inputLen = input.length,
				    delimLen = delim.length,
				    newlineLen = newline.length,
						commentsLen = comments.length

				var stepIsFunction = isFunction(step)

				// Establish starting state
				cursor = 0
				var data = [],
						errors = [],
						row = [],
						lastCursor = 0

				if (!input)
					return returnable()

				if (fastMode || (fastMode !== false && input.indexOf(quoteChar) === -1)) {
					var rows = input.split(newline);
					for (var i = 0; i < rows.length; i++) {
						row = rows[i];
						cursor += row.length;
						if (i !== rows.length - 1)
							cursor += newline.length;
						else if (ignoreLastRow)
							return returnable();
						if (comments && row.substring(0, commentsLen) === comments)
							continue;
						if (stepIsFunction)
						{
							data = [];
							pushRow(row.split(delim));
							doStep();
						}
						else
							pushRow(row.split(delim));
						if (preview && i >= preview)
						{
							data = data.slice(0, preview);
							return returnable(true);
						}
					}
					return returnable();
				}

				var nextDelim = input.indexOf(delim, cursor);
				var nextNewline = input.indexOf(newline, cursor);
				var quoteCharRegex = new RegExp(escapeRegExp(escapeChar) + escapeRegExp(quoteChar), 'g');
				var quoteSearch = input.indexOf(quoteChar, cursor);

				// Parser loop
				for (;;) {
					// Field has opening quote
					if (input[cursor] === quoteChar) {
						// Start our search for the closing quote where the cursor is
						quoteSearch = cursor;

						// Skip the opening quote
						cursor++;

						for (;;) {
							// Find closing quote
							quoteSearch = input.indexOf(quoteChar, quoteSearch + 1);

							// No other quotes are found - no other delimiters
							if (quoteSearch === -1) {
								if (!ignoreLastRow) {
									// No closing quote... what a pity
									errors.push({
										type: 'Quotes',
										code: 'MissingQuotes',
										message: 'Quoted field unterminated',
										row: data.length,	// row has yet to be inserted
										index: cursor
									});
								}
								return finish();
							}

							// Closing quote at EOF
							if (quoteSearch === inputLen - 1) {
								var value = input.substring(cursor, quoteSearch).replace(quoteCharRegex, quoteChar);
								return finish(value);
							}

							// If this quote is escaped, it's part of the data; skip it
							// If the quote character is the escape character, then check if the next character is the escape character
							if (quoteChar === escapeChar &&  input[quoteSearch + 1] === escapeChar) {
								quoteSearch++;
								continue;
							}

							// If the quote character is not the escape character, then check if the previous character was the escape character
							if (quoteChar !== escapeChar && quoteSearch !== 0 && input[quoteSearch - 1] === escapeChar) {
								continue;
							}

							if (nextDelim !== -1 && nextDelim < (quoteSearch + 1)) {
								nextDelim = input.indexOf(delim, (quoteSearch + 1));
							}
							if (nextNewline !== -1 && nextNewline < (quoteSearch + 1)) {
								nextNewline = input.indexOf(newline, (quoteSearch + 1));
							}
							// Check up to nextDelim or nextNewline, whichever is closest
							var checkUpTo = nextNewline === -1 ? nextDelim : Math.min(nextDelim, nextNewline);
							var spacesBetweenQuoteAndDelimiter = extraSpaces(checkUpTo);

							// Closing quote followed by delimiter or 'unnecessary spaces + delimiter'
							if (input[quoteSearch + 1 + spacesBetweenQuoteAndDelimiter] === delim)
							{
								row.push(input.substring(cursor, quoteSearch).replace(quoteCharRegex, quoteChar));
								cursor = quoteSearch + 1 + spacesBetweenQuoteAndDelimiter + delimLen;

								// If char after following delimiter is not quoteChar, we find next quote char position
								if (input[quoteSearch + 1 + spacesBetweenQuoteAndDelimiter + delimLen] !== quoteChar)
								{
									quoteSearch = input.indexOf(quoteChar, cursor);
								}
								nextDelim = input.indexOf(delim, cursor);
								nextNewline = input.indexOf(newline, cursor);
								break;
							}

							var spacesBetweenQuoteAndNewLine = extraSpaces(nextNewline);

							// Closing quote followed by newline or 'unnecessary spaces + newLine'
							if (input.substring(quoteSearch + 1 + spacesBetweenQuoteAndNewLine, quoteSearch + 1 + spacesBetweenQuoteAndNewLine + newlineLen) === newline)
							{
								row.push(input.substring(cursor, quoteSearch).replace(quoteCharRegex, quoteChar));
								saveRow(quoteSearch + 1 + spacesBetweenQuoteAndNewLine + newlineLen);
								nextDelim = input.indexOf(delim, cursor);	// because we may have skipped the nextDelim in the quoted field
								quoteSearch = input.indexOf(quoteChar, cursor);	// we search for first quote in next line

								if (stepIsFunction) {
									doStep()
								}

								if (preview && data.length >= preview)
									return returnable(true);

								break;
							}


							// Checks for valid closing quotes are complete (escaped quotes or quote followed by EOF/delimiter/newline) -- assume these quotes are part of an invalid text string
							errors.push({
								type: 'Quotes',
								code: 'InvalidQuotes',
								message: 'Trailing quote on quoted field is malformed',
								row: data.length,	// row has yet to be inserted
								index: cursor
							});

							quoteSearch++;
							continue;

						}

						continue;
					}

					// Comment found at start of new line
					if (comments && row.length === 0 && input.substring(cursor, cursor + commentsLen) === comments)
					{
						if (nextNewline === -1)	// Comment ends at EOF
							return returnable();
						cursor = nextNewline + newlineLen;
						nextNewline = input.indexOf(newline, cursor);
						nextDelim = input.indexOf(delim, cursor);
						continue;
					}

					// Next delimiter comes before next newline, so we've reached end of field
					if (nextDelim !== -1 && (nextDelim < nextNewline || nextNewline === -1))
					{
						// we check, if we have quotes, because delimiter char may be part of field enclosed in quotes
						if (quoteSearch > nextDelim) {
							// we have quotes, so we try to find the next delimiter not enclosed in quotes and also next starting quote char
							var nextDelimObj = getNextUnquotedDelimiter(nextDelim, quoteSearch, nextNewline);

							// if we have next delimiter char which is not enclosed in quotes
							if (nextDelimObj && typeof nextDelimObj.nextDelim !== 'undefined') {
								nextDelim = nextDelimObj.nextDelim;
								quoteSearch = nextDelimObj.quoteSearch;
								row.push(input.substring(cursor, nextDelim));
								cursor = nextDelim + delimLen;
								// we look for next delimiter char
								nextDelim = input.indexOf(delim, cursor);
								continue;
							}
						} else {
							row.push(input.substring(cursor, nextDelim));
							cursor = nextDelim + delimLen;
							nextDelim = input.indexOf(delim, cursor);
							continue;
						}
					}

					// End of row
					if (nextNewline !== -1)
					{
						row.push(input.substring(cursor, nextNewline));
						saveRow(nextNewline + newlineLen);

						if (stepIsFunction) {
							doStep();
						}

						if (preview && data.length >= preview)
							return returnable(true);

						continue;
					}

					break;
				}


				return finish();

				function pushRow(row)
				{
					data.push(row);
					lastCursor = cursor;
				}

				/**
				 * checks if there are extra spaces after closing quote and given index without any text
				 * if Yes, returns the number of spaces
				 */
				function extraSpaces(index) {
					var spaceLength = 0;
					if (index !== -1) {
						var textBetweenClosingQuoteAndIndex = input.substring(quoteSearch + 1, index);
						if (textBetweenClosingQuoteAndIndex && textBetweenClosingQuoteAndIndex.trim() === '') {
							spaceLength = textBetweenClosingQuoteAndIndex.length;
						}
					}
					return spaceLength;
				}

				/**
				 * Appends the remaining input from cursor to the end into
				 * row, saves the row, calls step, and returns the results.
				 */
				function finish(value) {
					if (ignoreLastRow) return returnable()
					if (typeof value === 'undefined') value = input.substring(cursor)
					row.push(value)
					cursor = inputLen
					pushRow(row)
					if (stepIsFunction) doStep()
					return returnable()
				}

				/**
				 * Appends the current row to the results. It sets the cursor
				 * to newCursor and finds the nextNewline. The caller should
				 * take care to execute user's step function and check for
				 * preview and end parsing if necessary.
				 */
				function saveRow(newCursor) {
					cursor = newCursor;
					pushRow(row);
					row = [];
					nextNewline = input.indexOf(newline, cursor);
				}

				/** Returns an object with the results, errors, and meta. */
				function returnable(stopped) {
					return {
						data,
						errors,
						meta: {
							delimiter: delim,
							linebreak: newline,
							truncated: !!stopped,
							cursor: lastCursor + (baseIndex || 0)
						}
					}
				}

				/** Executes the user's step function and resets data & errors. */
				function doStep () {
					step(returnable())
					data = []
					errors = []
				}

				/** Gets the delimiter character, which is not inside the quoted field */
				function getNextUnquotedDelimiter(nextDelim, quoteSearch, newLine) {
					var result = {
						nextDelim: undefined,
						quoteSearch: undefined
					}
					// get the next closing quote character
					var nextQuoteSearch = input.indexOf(quoteChar, quoteSearch + 1);

					// if next delimiter is part of a field enclosed in quotes
					if (nextDelim > quoteSearch && nextDelim < nextQuoteSearch && (nextQuoteSearch < newLine || newLine === -1)) {
						// get the next delimiter character after this one
						var nextNextDelim = input.indexOf(delim, nextQuoteSearch);

						// if there is no next delimiter, return default result
						if (nextNextDelim === -1) {
							return result;
						}
						// find the next opening quote char position
						if (nextNextDelim > nextQuoteSearch) {
							nextQuoteSearch = input.indexOf(quoteChar, nextQuoteSearch + 1);
						}
						// try to get the next delimiter position
						result = getNextUnquotedDelimiter(nextNextDelim, nextQuoteSearch, newLine);
					} else {
						result = {
							nextDelim: nextDelim,
							quoteSearch: quoteSearch
						};
					}

					return result;
				}
			}

			/** Gets the cursor position */
			this.getCharIndex = () => cursor
		}
	}

	/** Makes a deep copy of an array or object (mostly) */
	function copy (obj) {
		if (typeof obj !== 'object' || obj === null) return obj;
		var cpy = Array.isArray(obj) ? [] : {}
		for (var key in obj) cpy[key] = copy(obj[key])
		return cpy
	}

	function isFunction(func) {
		return typeof func === 'function'
  }

	Papa.StringStreamer = ChunkStreamer
	// Exposed for testing and development only
	Papa.Parser = Parser
	Papa.ParserHandle = ParserHandle

  return Papa
}))


// module.exports = moduleFactory()
