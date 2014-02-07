
/*
 * 
 *
 * Copyright (c) 2009 Jörn Zaefferer
 *
 * Dual licensed under the MIT and GPL licenses:
 *   http://www.opensource.org/licenses/mit-license.php
 *   http://www.gnu.org/licenses/gpl.html
 *
 * With small modifications by Alfonso Gómez-Arzola.
 * See changelog for details.
 *
 */

// $.noConflict();

;(function($) {

$.fn.extend({
	autocomplete: function(urlOrData, options) {
		var isUrl = typeof urlOrData == "string";
		options = $.extend({}, $.Autocompleter.defaults, {
			url: isUrl ? urlOrData : null,
			data: isUrl ? null : urlOrData,
			delay: isUrl ? $.Autocompleter.defaults.delay : 10,
			max: options && !options.scroll ? 10 : 150,
			noRecord: "No Records."
		}, options);

		// if highlight is set to false, replace it with a do-nothing function
		options.highlight = options.highlight || function(value) { return value; };

		// if the formatMatch option is not specified, then use formatItem for backwards compatibility
		options.formatMatch = options.formatMatch || options.formatItem;

		return this.each(function() {
			new $.Autocompleter(this, options);
		});
	},
	result: function(handler) {
		return this.bind("result", handler);
	},
	search: function(handler) {
		return this.trigger("search", [handler]);
	},
	flushCache: function() {
		return this.trigger("flushCache");
	},
	setOptions: function(options){
		return this.trigger("setOptions", [options]);
	},
	unautocomplete: function() {
		return this.trigger("unautocomplete");
	}
});

$.Autocompleter = function(input, options) {

	var KEY = {
		UP: 38,
		DOWN: 40,
		DEL: 46,
		TAB: 9,
		RETURN: 13,
		ESC: 27,
		COMMA: 188,
		PAGEUP: 33,
		PAGEDOWN: 34,
		BACKSPACE: 8
	};

	var globalFailure = null;
	if(options.failure != null && typeof options.failure == "function") {
	  globalFailure = options.failure;
	}

	// Create $ object for input element
	var $input = $(input).attr("autocomplete", "off").addClass(options.inputClass);

	var timeout;
	var previousValue = "";
	var cache = $.Autocompleter.Cache(options);
	var hasFocus = 0;
	var lastKeyPressCode;
	var config = {
		mouseDownOnSelect: false
	};
	var select = $.Autocompleter.Select(options, input, selectCurrent, config);

	var blockSubmit;

	// prevent form submit in opera when selecting with return key
  navigator.userAgent.indexOf("Opera") != -1 && $(input.form).bind("submit.autocomplete", function() {
		if (blockSubmit) {
			blockSubmit = false;
			return false;
		}
	});

	// older versions of opera don't trigger keydown multiple times while pressed, others don't work with keypress at all
	$input.bind((navigator.userAgent.indexOf("Opera") != -1 && !'KeyboardEvent' in window ? "keypress" : "keydown") + ".autocomplete", function(event) {
		// a keypress means the input has focus
		// avoids issue where input had focus before the autocomplete was applied
		hasFocus = 1;
		// track last key pressed
		lastKeyPressCode = event.keyCode;
		switch(event.keyCode) {

			case KEY.UP:
				if ( select.visible() ) {
					event.preventDefault();
					select.prev();
				} else {
					onChange(0, true);
				}
				break;

			case KEY.DOWN:
				if ( select.visible() ) {
					event.preventDefault();
					select.next();
				} else {
					onChange(0, true);
				}
				break;

			case KEY.PAGEUP:
				if ( select.visible() ) {
  				event.preventDefault();
					select.pageUp();
				} else {
					onChange(0, true);
				}
				break;

			case KEY.PAGEDOWN:
				if ( select.visible() ) {
  				event.preventDefault();
					select.pageDown();
				} else {
					onChange(0, true);
				}
				break;

			// matches also semicolon
			case options.multiple && $.trim(options.multipleSeparator) == "," && KEY.COMMA:
			case KEY.TAB:
			case KEY.RETURN:
				if( selectCurrent() ) {
					// stop default to prevent a form submit, Opera needs special handling
					event.preventDefault();
					blockSubmit = true;
					return false;
				}
				break;

			case KEY.ESC:
				select.hide();
				break;

			default:
				clearTimeout(timeout);
				timeout = setTimeout(onChange, options.delay);
				break;
		}
	}).focus(function(){
		// track whether the field has focus, we shouldn't process any
		// results if the field no longer has focus
		hasFocus++;
	}).blur(function() {
	  hasFocus = 0;
		if (!config.mouseDownOnSelect) {
			hideResults();
		}
	}).click(function() {
		// show select when clicking in a focused field
		// but if clickFire is true, don't require field
		// to be focused to begin with; just show select
		if( options.clickFire ) {
		  if ( !select.visible() ) {
  			onChange(0, true);
  		}
		} else {
		  if ( hasFocus++ > 1 && !select.visible() ) {
  			onChange(0, true);
  		}
		}
	}).bind("search", function() {
		// TODO why not just specifying both arguments?
		var fn = (arguments.length > 1) ? arguments[1] : null;
		function findValueCallback(q, data) {
			var result;
			if( data && data.length ) {
				for (var i=0; i < data.length; i++) {
					if( data[i].result.toLowerCase() == q.toLowerCase() ) {
						result = data[i];
						break;
					}
				}
			}
			if( typeof fn == "function" ) fn(result);
			else $input.trigger("result", result && [result.data, result.value]);
		}
		$.each(trimWords($input.val()), function(i, value) {
			request(value, findValueCallback, findValueCallback);
		});
	}).bind("flushCache", function() {
		cache.flush();
	}).bind("setOptions", function() {
		$.extend(true, options, arguments[1]);
		// if we've updated the data, repopulate
		if ( "data" in arguments[1] )
			cache.populate();
	}).bind("unautocomplete", function() {
		select.unbind();
		$input.unbind();
		$(input.form).unbind(".autocomplete");
	});


	function selectCurrent() {
		var selected = select.selected();
		if( !selected )
			return false;

		var v = selected.result;
		previousValue = v;

		if ( options.multiple ) {
			var words = trimWords($input.val());
			if ( words.length > 1 ) {
				var seperator = options.multipleSeparator.length;
				var cursorAt = $(input).selection().start;
				var wordAt, progress = 0;
				$.each(words, function(i, word) {
					progress += word.length;
					if (cursorAt <= progress) {
						wordAt = i;
						return false;
					}
					progress += seperator;
				});
				words[wordAt] = v;
				// TODO this should set the cursor to the right position, but it gets overriden somewhere
				//$.Autocompleter.Selection(input, progress + seperator, progress + seperator);
				v = words.join( options.multipleSeparator );
			}
			v += options.multipleSeparator;
		}

		$input.val(v);
		hideResultsNow();
		$input.trigger("result", [selected.data, selected.value]);
		return true;
	}

	function onChange(crap, skipPrevCheck) {
		if( lastKeyPressCode == KEY.DEL ) {
			select.hide();
			return;
		}

		var currentValue = $input.val();

		if ( !skipPrevCheck && currentValue == previousValue )
			return;

		previousValue = currentValue;

		currentValue = lastWord(currentValue);
		if ( currentValue.length >= options.minChars) {
			$input.addClass(options.loadingClass);
			if (!options.matchCase)
				currentValue = currentValue.toLowerCase();
			request(currentValue, receiveData, hideResultsNow);
		} else {
			stopLoading();
			select.hide();
		}
	};

	function trimWords(value) {
		if (!value)
			return [""];
		if (!options.multiple)
			return [$.trim(value)];
		return $.map(value.split(options.multipleSeparator), function(word) {
			return $.trim(value).length ? $.trim(word) : null;
		});
	}

	function lastWord(value) {
		if ( !options.multiple )
			return value;
		var words = trimWords(value);
		if (words.length == 1)
			return words[0];
		var cursorAt = $(input).selection().start;
		if (cursorAt == value.length) {
			words = trimWords(value)
		} else {
			words = trimWords(value.replace(value.substring(cursorAt), ""));
		}
		return words[words.length - 1];
	}

	// fills in the input box w/the first match (assumed to be the best match)
	// q: the term entered
	// sValue: the first matching result
	function autoFill(q, sValue){
		// autofill in the complete box w/the first match as long as the user hasn't entered in more data
		// if the last user key pressed was backspace, don't autofill
		if( options.autoFill && (lastWord($input.val()).toLowerCase() == q.toLowerCase()) && lastKeyPressCode != KEY.BACKSPACE ) {
			// fill in the value (keep the case the user has typed)
			$input.val($input.val() + sValue.substring(lastWord(previousValue).length));
			// select the portion of the value not typed by the user (so the next character will erase)
			$(input).selection(previousValue.length, previousValue.length + sValue.length);
		}
	};

	function hideResults() {
		clearTimeout(timeout);
		timeout = setTimeout(hideResultsNow, 200);
	};

	function hideResultsNow() {
		var wasVisible = select.visible();
		select.hide();
		clearTimeout(timeout);
		stopLoading();
		if (options.mustMatch) {
			// call search and run callback
			$input.search(
				function (result){
					// if no value found, clear the input box
					if( !result ) {
						if (options.multiple) {
							var words = trimWords($input.val()).slice(0, -1);
							$input.val( words.join(options.multipleSeparator) + (words.length ? options.multipleSeparator : "") );
						}
						else {
							$input.val( "" );
							$input.trigger("result", null);
						}
					}
				}
			);
		}
	};

	function receiveData(q, data) {
		if ( data && data.length && hasFocus ) {
			stopLoading();
			select.display(data, q);
			autoFill(q, data[0].value);
			select.show();
		} else {
			hideResultsNow();
		}
	};

	function request(term, success, failure) {
		if (!options.matchCase)
			term = term.toLowerCase();
		var data = cache.load(term);
		// recieve the cached data
		if (data) {
			if(data.length)	{
				success(term, data);
			}
			else{
				var parsed = options.parse && options.parse(options.noRecord) || parse(options.noRecord);	
				success(term,parsed);
			}
		// if an AJAX url has been supplied, try loading the data now
		} else if( (typeof options.url == "string") && (options.url.length > 0) ){

			var extraParams = {
				timestamp: +new Date()
			};
			$.each(options.extraParams, function(key, param) {
				extraParams[key] = typeof param == "function" ? param() : param;
			});

			$.ajax({
				// try to leverage ajaxQueue plugin to abort previous requests
				mode: "abort",
				// limit abortion to this input
				port: "autocomplete" + input.name,
				dataType: options.dataType,
				url: options.url,
				data: $.extend({
					q: lastWord(term),
					limit: options.max
				}, extraParams),
				success: function(data) {
					var parsed = options.parse && options.parse(data) || parse(data);
					cache.add(term, parsed);
					success(term, parsed);
				}
			});
		} else {
			// if we have a failure, we need to empty the list -- this prevents the the [TAB] key from selecting the last successful match
			select.emptyList();
			if(globalFailure != null) {
        globalFailure();
      }
      else {
        failure(term);
			}
		}
	};

	function parse(data) {
		var parsed = [];
		var rows = data.split("\n");
		for (var i=0; i < rows.length; i++) {
			var row = $.trim(rows[i]);
			if (row) {
				row = row.split("|");
				parsed[parsed.length] = {
					data: row,
					value: row[0],
					result: options.formatResult && options.formatResult(row, row[0]) || row[0]
				};
			}
		}
		return parsed;
	};

	function stopLoading() {
		$input.removeClass(options.loadingClass);
	};

};

$.Autocompleter.defaults = {
	inputClass: "FDES_ac_input",
	resultsClass: "FDES_ac_results",
	loadingClass: "FDES_ac_loading",
	minChars: 1,
	delay: 400,
	matchCase: false,
	matchSubset: true,
	matchContains: false,
	cacheLength: 100,
	max: 1000,
	mustMatch: false,
	extraParams: {},
	selectFirst: true,
	formatItem: function(row) { return row[0]; },
	formatMatch: null,
	autoFill: false,
	width: 0,
	multiple: false,
	multipleSeparator: " ",
	inputFocus: true,
	clickFire: false,
	highlight: function(value, term) {
		return value.replace(new RegExp("(?![^&;]+;)(?!<[^<>]*)(" + term.replace(/([\^\$\(\)\[\]\{\}\*\.\+\?\|\\])/gi, "\\$1") + ")(?![^<>]*>)(?![^&;]+;)", "gi"), "<strong>$1</strong>");
	},
    scroll: true,
    scrollHeight: 180,
    scrollJumpPosition: true
};

$.Autocompleter.Cache = function(options) {

	var data = {};
	var length = 0;

	function matchSubset(s, sub) {
		if (!options.matchCase)
			s = s.toLowerCase();
		var i = s.indexOf(sub);
		if (options.matchContains == "word"){
			i = s.toLowerCase().search("\\b" + sub.toLowerCase());
		}
		if (i == -1) return false;
		return i == 0 || options.matchContains;
	};

	function add(q, value) {
		if (length > options.cacheLength){
			flush();
		}
		if (!data[q]){
			length++;
		}
		data[q] = value;
	}

	function populate(){
		if( !options.data ) return false;
		// track the matches
		var stMatchSets = {},
			nullData = 0;

		// no url was specified, we need to adjust the cache length to make sure it fits the local data store
		if( !options.url ) options.cacheLength = 1;

		// track all options for minChars = 0
		stMatchSets[""] = [];

		// loop through the array and create a lookup structure
		for ( var i = 0, ol = options.data.length; i < ol; i++ ) {
			var rawValue = options.data[i];
			// if rawValue is a string, make an array otherwise just reference the array
			rawValue = (typeof rawValue == "string") ? [rawValue] : rawValue;

			var value = options.formatMatch(rawValue, i+1, options.data.length);
			if ( typeof(value) === 'undefined' || value === false )
				continue;

			var firstChar = value.charAt(0).toLowerCase();
			// if no lookup array for this character exists, look it up now
			if( !stMatchSets[firstChar] )
				stMatchSets[firstChar] = [];

			// if the match is a string
			var row = {
				value: value,
				data: rawValue,
				result: options.formatResult && options.formatResult(rawValue) || value
			};

			// push the current match into the set list
			stMatchSets[firstChar].push(row);

			// keep track of minChars zero items
			if ( nullData++ < options.max ) {
				stMatchSets[""].push(row);
			}
		};

		// add the data items to the cache
		$.each(stMatchSets, function(i, value) {
			// increase the cache size
			options.cacheLength++;
			// add to the cache
			add(i, value);
		});
	}

	// populate any existing data
	setTimeout(populate, 25);

	function flush(){
		data = {};
		length = 0;
	}

	return {
		flush: flush,
		add: add,
		populate: populate,
		load: function(q) {
			if (!options.cacheLength || !length)
				return null;
			/*
			 * if dealing w/local data and matchContains than we must make sure
			 * to loop through all the data collections looking for matches
			 */
			if( !options.url && options.matchContains ){
				// track all matches
				var csub = [];
				// loop through all the data grids for matches
				for( var k in data ){
					// don't search through the stMatchSets[""] (minChars: 0) cache
					// this prevents duplicates
					if( k.length > 0 ){
						var c = data[k];
						$.each(c, function(i, x) {
							// if we've got a match, add it to the array
							if (matchSubset(x.value, q)) {
								csub.push(x);
							}
						});
					}
				}
				return csub;
			} else
			// if the exact item exists, use it
			if (data[q]){
				return data[q];
			} else
			if (options.matchSubset) {
				for (var i = q.length - 1; i >= options.minChars; i--) {
					var c = data[q.substr(0, i)];
					if (c) {
						var csub = [];
						$.each(c, function(i, x) {
							if (matchSubset(x.value, q)) {
								csub[csub.length] = x;
							}
						});
						return csub;
					}
				}
			}
			return null;
		}
	};
};

$.Autocompleter.Select = function (options, input, select, config) {
	var CLASSES = {
		ACTIVE: "FDES_ac_over"
	};

	var listItems,
		active = -1,
		data,
		term = "",
		needsInit = true,
		element,
		list;

	// Create results
	function init() {
		if (!needsInit)
			return;
		element = $("<div/>")
		.hide()
		.addClass(options.resultsClass)
		.css("position", "absolute")
		.css("z-index", "999999999")
		.appendTo(document.body)
		.hover(function(event) {
		  // Browsers except FF do not fire mouseup event on scrollbars, resulting in mouseDownOnSelect remaining true, and results list not always hiding.
		  if($(this).is(":visible")) {
		    input.focus();
		  }
		  config.mouseDownOnSelect = false;
		});

		list = $("<ul/>").appendTo(element).mouseover( function(event) {
			if(target(event).nodeName && target(event).nodeName.toUpperCase() == 'LI') {
	            active = $("li", list).removeClass(CLASSES.ACTIVE).index(target(event));
			    $(target(event)).addClass(CLASSES.ACTIVE);
	        }
		}).click(function(event) {
			$(target(event)).addClass(CLASSES.ACTIVE);
			select();
			if( options.inputFocus )
			  input.focus();
			return false;
		}).mousedown(function() {
			config.mouseDownOnSelect = true;
		}).mouseup(function() {
			config.mouseDownOnSelect = false;
		});

		if( options.width > 0 )
			element.css("width", options.width);

		needsInit = false;
	}

	function target(event) {
		var element = event.target;
		while(element && element.tagName != "LI")
			element = element.parentNode;
		// more fun with IE, sometimes event.target is empty, just ignore it then
		if(!element)
			return [];
		return element;
	}

	function moveSelect(step) {
		listItems.slice(active, active + 1).removeClass(CLASSES.ACTIVE);
		movePosition(step);
        var activeItem = listItems.slice(active, active + 1).addClass(CLASSES.ACTIVE);
        if(options.scroll) {
            var offset = 0;
            listItems.slice(0, active).each(function() {
				offset += this.offsetHeight;
			});
            if((offset + activeItem[0].offsetHeight - list.scrollTop()) > list[0].clientHeight) {
                list.scrollTop(offset + activeItem[0].offsetHeight - list.innerHeight());
            } else if(offset < list.scrollTop()) {
                list.scrollTop(offset);
            }
        }
	};

	function movePosition(step) {
		if (options.scrollJumpPosition || (!options.scrollJumpPosition && !((step < 0 && active == 0) || (step > 0 && active == listItems.size() - 1)) )) {
			active += step;
			if (active < 0) {
				active = listItems.size() - 1;
			} else if (active >= listItems.size()) {
				active = 0;
			}
		}
	}


	function limitNumberOfItems(available) {
		return options.max && options.max < available
			? options.max
			: available;
	}

	function fillList() {
		list.empty();
		var g_search = $("<li/>").html('<img alt="" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAyFpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDUuNS1jMDE0IDc5LjE1MTQ4MSwgMjAxMy8wMy8xMy0xMjowOToxNSAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RSZWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZVJlZiMiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIENDIChXaW5kb3dzKSIgeG1wTU06SW5zdGFuY2VJRD0ieG1wLmlpZDo3QjE2MThDQjY2MkMxMUUzOEQzQkJBN0RCRURDQ0NBMSIgeG1wTU06RG9jdW1lbnRJRD0ieG1wLmRpZDo3QjE2MThDQzY2MkMxMUUzOEQzQkJBN0RCRURDQ0NBMSI+IDx4bXBNTTpEZXJpdmVkRnJvbSBzdFJlZjppbnN0YW5jZUlEPSJ4bXAuaWlkOjdCMTYxOEM5NjYyQzExRTM4RDNCQkE3REJFRENDQ0ExIiBzdFJlZjpkb2N1bWVudElEPSJ4bXAuZGlkOjdCMTYxOENBNjYyQzExRTM4RDNCQkE3REJFRENDQ0ExIi8+IDwvcmRmOkRlc2NyaXB0aW9uPiA8L3JkZjpSREY+IDwveDp4bXBtZXRhPiA8P3hwYWNrZXQgZW5kPSJyIj8+lwlxHgAABelJREFUeNp8VmtsVEUU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" />&#x5728;Google&#x641c;&#x7d22; <strong>' + term + '</strong>').prependTo(list)[0];
		var g_data = {"data" : {"name":"hah","tags":"ttt","value":"http://www.google.com/search?q="+ term},"value":"b","result":"c"}
		$.data(g_search, "ac_data", g_data);
		var b_search = $("<li/>").html('<img alt="" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAABmJLR0QAAAAAAAD5Q7t/AAAACXBIWXMAAA7EAAAOxAGVKw4bAAACEElEQVR42rWWu0sDQRDG8+fYKVYWFjYiNmojaKeNiIVgIdhoITY2plBBQQQFCwtFtBACNiL4QMVSBAXjI/GR+EhiYog5f7JhGTbK7cbcMcXl4zLfzHwzsxvyPK+x+aam/rrqhluchwLyrjlC6u34NOdV9cGh8lwi8AJ4bAmIpa3zvq4hurTyLvFU+iuRKPyXAC9SpJOzUiXnFt6gBBkZe/4XwcZWWoo2Op4AjOxkJGhk5kYQnnmRvnr6HgAHhh7LwQoJKIX0NTj8BIgkEoTPjSAWL1AZVe7Lq7z0tbL6Uw1CluD6ZtqBAO9a1dn5V5DJqaT6SeDZXBFkdS2lvXf3xN1ERkYZ3flFHvDgKEtOhviUiwLSZmRJEBOTyf3DrD9BS/udTYfIjFW/YrzQYD4E+mtlxGhog4vcZ1GDlFF+Txl9CDq6YvIPujLSEVnqiWPQjAXnQyCHCLXVMpCqKmtqvSWhcgIK4N+m25EMAiKacoGGRt10/1CrxeU3A3QbNDgI9q91TxB0kZy73b0PBwJiN5qq3GhQtXGprcrYloDetzzsFIfbLsL7r3X/y9BM9q4/QQUHNXrYEhjr3tLIGMGtCFgPld0h9PQFkgFG11kRkKmTwnq2HUQu3w2+ps4ihzlgJmk+Dq/e/gdewtMvnFyAGPSsIGawtiFKruxHkMrvRdW5eFX96khHlQgCv/wGfX3/BjJdMSAo8aZEAAAAAElFTkSuQmCC" />&#x5728;&#x767e;&#x5ea6;&#x641c;&#x7d22; <strong>' + term + '</strong>').prependTo(list)[0];
		var b_data = {"data" : {"name":"hah","tags":"ttt","value":"http://www.baidu.com/s?wd="+term},"value":"b","result":"c"}
		$.data(b_search, "ac_data", b_data);


		var max = limitNumberOfItems(data.length);
		for (var i=0; i < max; i++) {
			 console.log(data[i]);

			if (!data[i])
				continue;
			var formatted = options.formatItem(data[i].data, i+1, max, data[i].value, term);
			if ( formatted === false )
				continue;
			var li = $("<li/>").html( options.highlight(formatted, term) ).addClass(i%2 == 0 ? "ac_even" : "ac_odd").appendTo(list)[0];
			$.data(li, "ac_data", data[i]);
		}
		listItems = list.find("li");
		if ( options.selectFirst ) {
			listItems.slice(0, 1).addClass(CLASSES.ACTIVE);
			active = 0;
		}
		// apply bgiframe if available
		if ( $.fn.bgiframe )
			list.bgiframe();
	}

	return {
		display: function(d, q) {
			init();
			data = d;
			term = q;
			fillList();
		},
		next: function() {
			moveSelect(1);
		},
		prev: function() {
			moveSelect(-1);
		},
		pageUp: function() {
			if (active != 0 && active - 8 < 0) {
				moveSelect( -active );
			} else {
				moveSelect(-8);
			}
		},
		pageDown: function() {
			if (active != listItems.size() - 1 && active + 8 > listItems.size()) {
				moveSelect( listItems.size() - 1 - active );
			} else {
				moveSelect(8);
			}
		},
		hide: function() {
			element && element.hide();
			listItems && listItems.removeClass(CLASSES.ACTIVE);
			active = -1;
		},
		visible : function() {
			return element && element.is(":visible");
		},
		current: function() {
			return this.visible() && (listItems.filter("." + CLASSES.ACTIVE)[0] || options.selectFirst && listItems[0]);
		},
		show: function() {
			var offset = $(input).offset();
			element.css({
				width: typeof options.width == "string" || options.width > 0 ? options.width : $(input).width(),
				top: offset.top + input.offsetHeight,
				left: offset.left
			}).show();
            if(options.scroll) {
                list.scrollTop(0);
                list.css({
					maxHeight: options.scrollHeight,
					overflow: 'auto'
				});

                if(navigator.userAgent.indexOf("MSIE") != -1 && typeof document.body.style.maxHeight === "undefined") {
					var listHeight = 0;
					listItems.each(function() {
						listHeight += this.offsetHeight;
					});
					var scrollbarsVisible = listHeight > options.scrollHeight;
                    list.css('height', scrollbarsVisible ? options.scrollHeight : listHeight );
					if (!scrollbarsVisible) {
						// IE doesn't recalculate width when scrollbar disappears
						listItems.width( list.width() - parseInt(listItems.css("padding-left")) - parseInt(listItems.css("padding-right")) );
					}
                }

            }
		},
		selected: function() {

			var selected = listItems && listItems.filter("." + CLASSES.ACTIVE).removeClass(CLASSES.ACTIVE);
			console.log(selected.data('ac_data'))
			return selected && selected.length && $.data(selected[0], "ac_data");
		},
		emptyList: function (){
			list && list.empty();
		},
		unbind: function() {
			element && element.remove();
		}
	};
};

$.fn.selection = function(start, end) {
	if (start !== undefined) {
		return this.each(function() {
			if( this.createTextRange ){
				var selRange = this.createTextRange();
				if (end === undefined || start == end) {
					selRange.move("character", start);
					selRange.select();
				} else {
					selRange.collapse(true);
					selRange.moveStart("character", start);
					selRange.moveEnd("character", end);
					selRange.select();
				}
			} else if( this.setSelectionRange ){
				this.setSelectionRange(start, end);
			} else if( this.selectionStart ){
				this.selectionStart = start;
				this.selectionEnd = end;
			}
		});
	}
	var field = this[0];
	if ( field.createTextRange ) {
		var range = document.selection.createRange(),
			orig = field.value,
			teststring = "<->",
			textLength = range.text.length;
		range.text = teststring;
		var caretAt = field.value.indexOf(teststring);
		field.value = orig;
		this.selection(caretAt, caretAt + textLength);
		return {
			start: caretAt,
			end: caretAt + textLength
		}
	} else if( field.selectionStart !== undefined ){
		return {
			start: field.selectionStart,
			end: field.selectionEnd
		}
	}
};

})(jQuery);




var FDES = {
	closeWrap : function($){

		$('#FDESsideInput').keydown(function(event) {
      if ( event.which == 27 ) {
         $('#FDESSideWrap').removeClass('fadeInRightBig').addClass('fadeOutRightBig');
       }
    });

    $('#closeesWrapLink').click(function(event) {
      event.preventDefault();
       $('#FDESSideWrap').removeClass('fadeInRightBig').addClass('fadeOutRightBig');
    });



	},

	autoCompleteEvent : function($,$dom,array){
    console.log(array)

		$dom.autocomplete(array, {
				width :300,
		    minChars: 0, //表示在自动完成激活之前填入的最小字符
		    max: 20, //表示列表里的条目数
		    autoFill: false, //表示自动填充
		    mustMatch: false, //表示必须匹配条目,文本框里输入的内容,必须是data参数里的数据,如果不匹配,文本框就被清空
		    matchContains: true, //表示包含匹配,相当于模糊匹配
		    scrollHeight: 300, //表示列表显示高度,默认高度为180

		    formatItem: function (row) {
		    	if(row.tags !== undefined){
		    		return '<span class="tags">'+ row.tags +'</span>' + row.name;
		    	}else{
		    		return false;
		    	}
		        
		    },
		    formatMatch: function (row) {
		        return '<span class="tags">'+ row.tags +'</span>' + row.name;
		    },
		    formatResult: function (row) {
		         return row.name
		    }		    
		});
		$dom.result(function(event, data, formatted){
			//console.log(data,formatted);
			window.open (data.link);
		});
	},
	getData2 : function($){
		$.ajax({  
			dataType:'script',  
			scriptCharset:'utf-8',////////  
			url:'http://127.0.0.1/qs/source2.js',  
			success:function(){
				var data = fd_source2.data;
				console.log(data,fd_source2.data);
				var newObj = {items:[]};
        var newObjTie = [];
				for(var i in data){
					
					var temp = {
						level1Name : i
					}

					var newObj2 = [];
					
					for(var j in data[i]){
						var temp2 = {
							level2Name : j,
							level2Data : null
						}

						var newObj3 = [];
						for(var k in data[i][j]){
							var temp3 = {
								tags : data[i][j][k].tags,
								name : data[i][j][k].name,
								link : data[i][j][k].link
							}
							newObj3.push(temp3);
							newObjTie.push(temp3)
						}

						temp2.level2Data = newObj3;


						newObj2.push(temp2);
					}
					console.log(newObj2);

					temp.level1Data = newObj2;


					newObj.items.push(temp);

				}

        var html = FDES.toHtml($,newObj);
				$('#FDESSideBd').html(html);
        






				FDES.unfoldEvent($);
        FDES.autoCompleteEvent($,$("#FDESsideInput"),newObjTie);
				console.log(newObj);
        FDES.toHtml($,newObj);


			}  
		}) 		
	},
  toHtml : function($,newObj){
    var listHtml = '<ul id="FDESList" class="FDES_list">';
    console.log(newObj)
    for(var i in newObj.items){

      var level2Html = '<li class="FDES_level1_item"><h3 class="FDES_level1_title">'+ newObj.items[i].level1Name +'<i></i></h3><div class="FDES_level2_item">';
      var list = '';
      for(var j in newObj.items[i].level1Data){
        var level2 = newObj.items[i].level1Data[j];
        var level3ListHtml = '<h4 class="FDES_level2_title">'+ level2.level2Name +'</h4><ul class="FDES_level3">';

        for(var k in level2.level2Data){
          level3ListHtml += '<li class="FDES_level3_item"><a target="_blank" title="'+ level2.level2Data[k].name +'" href="'+ level2.level2Data[k].link +'">'+ level2.level2Data[k].name +'</a></li>';
        }
        level3ListHtml += '</ul>';
        list += level3ListHtml;
      }

      level2Html += list +'</div></li>';
      listHtml += level2Html;

    }
    listHtml += '</ul>';

    return listHtml;
  },
	unfoldEvent: function ($){
    var $last;
    var lastName = "";
		$('#FDESList').click( function(event) {
			
			if(event.target.nodeName == 'H3' ||  event.target.nodeName == 'SPAN' || event.target.nodeName == 'I'){
        if(event.target.nodeName == 'H3'){
          var target = $(event.target);
        }else if(event.target.nodeName == 'SPAN'){
          var target = $(event.target).parent();
        }else if(event.target.nodeName == 'I'){
          var target = $(event.target).parent();
        }
        
        var innerText = target.text().split('..');
        var thisName = innerText[0];
        var foldName = innerText[1];

        var levelTitle2Nums = target.next().find('.FDES_level2_title').length;

        var level2Height = levelTitle2Nums % 2  == 0 ? (55*(levelTitle2Nums/2)) :  (55 * Math.ceil(levelTitle2Nums/2));

        // 判断这次点击的跟上一次点击是否同一个
        if(thisName !== lastName){
          target.next().toggleClass('level2_unfold');
          target.next().css({height:level2Height+'px'});

          target.addClass('FDES_level1_title_unfold');
          if(!$last){
            $last = target;
            
          }else{
            $last.find('.FDESList_up').remove();

            $last.next().find('h4').removeClass('fold');
            $last.next().find('ul').removeClass('unfold'); 
            $last.next().css({height:0});
            $last.removeClass('FDES_level1_title_unfold');
            $last.next().removeClass('level2_unfold');
            
            $last = target;
          }          
        }else{
          if(foldName == undefined){
            target.toggleClass('FDES_level1_title_unfold');
            if(target.next().hasClass('level2_unfold')){
              target.next().css({height:0});
            }else{
              target.next().css({height:level2Height+'px'});
            }
            target.next().toggleClass('level2_unfold');
          }else{
            target.next().css({height:level2Height+'px'});
          }

          target.next().find('h4').removeClass('fold');
          target.next().find('ul').removeClass('unfold');
          target.find('.FDESList_up').remove();
        }

        lastName = thisName;

			}
      
			if(event.target.nodeName == 'H4'){
				var typeName = $(event.target).text();

        var level3ItemNums = $(event.target).next().find('li').length;

        var level3Height = level3ItemNums * 55;
        $(event.target).parent().css({height:level3Height + 'px'});

				if($(event.target).parent().prev().find('.FDESList_up').length > 0){
					$(event.target).parent().prev().find('.FDESList_up').remove();
				}else{
					$(event.target).parent().prev().append('<span class="FDESList_up">.. /'+ typeName +'</span>');
				}
				
				$(event.target).parent().find('h4').addClass('fold');
				$(event.target).next().toggleClass('unfold');
			}



		});
	},
	insertSideWrap : function($){
		if($('#FDESSideWrap').length > 0){
			$('#FDESSideWrap').removeClass('fadeOutRightBig').addClass('fadeInRightBig');
		}else{
			$('body').append('<div class="FDES_side_wrap" id="FDESSideWrap"><div class="FDES_side_hd"><input placeholder="&#x641c;&#x7d22;&#x524d;&#x7aef;&#x8d44;&#x6e90;" id="FDESsideInput" type="text"/></div><div class="FDES_side_bd" id="FDESSideBd"></div><a href="javascript:;" id="closeesWrapLink" class="FDES_close_link">&times;</a></div>');
			$('#FDESSideWrap').addClass('fadeInRightBig');
      $('#FDESsideInput').focus();
			this.getData2($);
      this.closeWrap($);

		}		
	},
	init : function($){

		this.insertSideWrap($);
	}
}