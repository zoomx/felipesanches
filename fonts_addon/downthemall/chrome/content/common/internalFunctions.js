/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is DownThemAll.
 *
 * The Initial Developers of the Original Code are
 * Federico Parodi and Stefano Verna
 * Portions created by the Initial Developer are Copyright (C) 2004
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Federico Parodi <jimmy2k@gmail.com>
 *   Stefano Verna <stefano.verna@gmail.com>
 *   Nils Maier <MaierMan@web.de>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

/* dTa-only code! - DO NOT include in overlays or such! */

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;
const ctor = Components.Constructor;
const module = Cu.import;
const Exception = Components.Exception;

const FileFactory = new ctor('@mozilla.org/file/local;1', 'nsILocalFile', 'initWithPath');
const SoundFactory = new ctor('@mozilla.org/sound;1', 'nsISound', 'play');
const CryptoHash = new ctor("@mozilla.org/security/hash;1", "nsICryptoHash");
	
// shared state defines

Components.utils.import("resource://dta/constants.jsm", this);

const DTA = {
	showPreferences: function(pane) DTA.Mediator.showPreferences(window, pane)
};
Components.utils.import("resource://dta/api.jsm", DTA);

DTA.__defineGetter__('Mediator', function() {
	delete DTA.Mediator;
	DTA.Mediator = {
		open: function DTA_Mediator_open(url, ref) {
			this.openUrl(window, url, ref);
		}
	};
	Components.utils.import('resource://dta/support/mediator.jsm', DTA.Mediator);
	return DTA.Mediator;
});

const Debug = DTA.Debug;
const Preferences = DTA.Preferences;

/**
 * Get DOM Element(s) by Id. Missing ids are silently ignored!
 * 
 * @param ids
 *          One of more Ids
 * @return Either the element when there was just one parameter, or an array of
 *         elements.
 */
function $() {
	if (arguments.length == 1) {
		return document.getElementById(arguments[0]);
	}
	let elements = [];
	for (let i = 0, e = arguments.length; i < e; ++i) {
		let element = document.getElementById(arguments[i]);
		if (element) {
			elements.push(element);
		}
		else {
			Debug.logString("requested a non-existing element: " + id);
		}
	}
	return elements;
}

var Utils = {
	/**
	 * Opens up a directory picker and returns the user selected path.
	 * 
	 * @param predefined
	 *          The starting path to display when dialog opens up
	 * @text text The description text to be displayed
	 * @return A string containing the user selected path, or false if user
	 *         cancels the dialog.
	 */
	FilePicker: Components.Constructor('@mozilla.org/filepicker;1', 'nsIFilePicker', 'init'),
	askForDir: function (predefined, text) {
		try {
			// nsIFilePicker object
			predefined = predefined ? predefined.trim() : '';
			let nsIFilePicker = Ci.nsIFilePicker;
			let fp = new Utils.FilePicker(window, text, nsIFilePicker.modeGetFolder);
			fp.appendFilters(nsIFilePicker.filterAll);
		
			// locate current directory
			var dest = this.validateDir(predefined);
			if (dest) {
				fp.displayDirectory = dest;
			}
		
			// open file picker
			var res = fp.show();
	
			if (res == nsIFilePicker.returnOK) {
				return fp.file.path.addFinalSlash();
			}
		}
		catch (ex) {
			Debug.log("Utils.askForDir():", ex);
		}
		return false;
	},
	/**
	 * Performs all the needed controls to see if the specified path is valid, is
	 * creable and writable and his drive has some free disk space.
	 * 
	 * @param path
	 *          The path to test
	 * @return a nsILocalFile to the specified path if it's valid, false if it
	 *         wasn't
	 */
	validateDir: function(path) {
		let directory = null;
		if (!(path instanceof Ci.nsILocalFile)) {
			if (!path || !String(path).trim().length) {
				return false;
			}
			directory = new FileFactory(path);
		}
		else {
			directory = path.clone();
		}
		if (!directory) {
			return false;
		}
		try {
			// look for the first directory that exists.
			let parent = directory.clone();
			while (parent && !parent.exists()) {
				parent = parent.parent;
			}
			if (parent) {
				// from nsIFile
				parent = parent.QueryInterface(Ci.nsILocalFile);
				// we look for a directory that is writable and has some disk-space
				if (parent.isDirectory() && parent.isReadable() && parent.isWritable()) {
					try {
						return parent.diskSpaceAvailable ? directory : false;
					}
					catch (ex) {
						// Solaris compat: #889
						return directory;
					}
				}
			}
		}
		catch(ex) {
			Debug.log('Utils.validateDir()', ex);
		}
		return false;
	},
	/**
	 * Gets the disk-space available for a nsILocalFile. Here, because
	 * diskSpaceAvailable requires valid path and/or path to be a directory
	 * 
	 * @param file
	 *          Valid nsILocalFile
	 * @return the disk-space available to the caller
	 * @author Nils
	 */
	getFreeDisk: function(file) {
		while (file) {
			if (file.exists() && file.isDirectory()) {
				try {
					return file.diskSpaceAvailable;
				}
				catch (ex) {
					// Solaris compat: #889
					// As we cannot get a correct value simply return max int64_t
					return 9223372036854775807;
				}					
			}
			file = file.parent;
		}
		return 0;
	},
	/**
	 * Play a sound file (if prefs allow to do so)
	 * 
	 * @param name
	 *          Name of the sound (corresponding to the pref name and the file
	 *          name of desired sound)
	 */
	playSound: function(name) {
		
		try {
			var xulRuntime = Components.classes["@mozilla.org/xre/app-info;1"]
				.getService(Ci.nsIXULRuntime);
			if (/linux|sun|bsd|aix|hp|dragonfly|irix/i.test(xulRuntime.OS) && /64/.test(xulRuntime.XPCOMABI)) {
				throw new Components.Exception("*nix 64 - freeze problems");
			}
			
			if (Preferences.getExt("sounds." + name, false)) {
				new SoundFactory(("chrome://dta/skin/sounds/" + name + ".wav").toURI());
			}
		}
		catch(ex) {
			Debug.log("Playing " + name + " sound failed", ex);
		}
	},

	formatKBytes: function U_formatKBytes(aNumber, decimalPlace) {
		aNumber = Number(aNumber) / 1024;
		
		if (!isFinite(aNumber)) {
			return 'NaN';
		}
		return _('sizeKB', [aNumber.toFixed(arguments.length > 1 ? decimalPlace : 1)]);
	},

	formatConflictName: function U_formatConflictName(basename, conflicts) {
		if (!conflicts) {
			return basename;
		}
		let ext = '', pos = basename.lastIndexOf('.');
		if (pos != -1) {
			ext = basename.slice(pos);
			basename = basename.slice(0, pos);
		}
		return basename + '_' + Utils.formatNumber(conflicts) + ext;
	}
};

(function() {
	function createFormatter(units, scale) {
		const sunits = units;
		const nunits = sunits.length;
		const s = scale;
		return function(val, decimalPlace) {
			val = Number(val);
			if (!isFinite(val)) {
				return 'NaN';
			}
			let unit = sunits[0];
			for (let i = 1; val > s && i < nunits; ++i) {
				val /= 1024;
				unit = sunits[i];
			}
			decimalPlace = arguments.length > 1 ? decimalPlace : unit[1];
			return _(unit[0], [val.toFixed(decimalPlace)]);			
		}
	}
	Utils.formatBytes = createFormatter([['sizeB', 0], ['sizeKB', 1], ['sizeMB', 2], ['sizeGB', 2], ['sizeTB', 3]], 875);
	Utils.formatSpeed = createFormatter([['sizeBs', 0], ['sizeKBs', 1], ['sizeMBs', 1], ['sizeGBs', 2]], 1023);
})();

Components.utils.import('resource://dta/utils.jsm', Utils);
const SYSTEMSLASH = Utils.SYSTEMSLASH;


//XXX Copy from utils.jsm
//XXX Cannot use directly; yields NS_ERROR_INVALID_VALUE then
for each (let copy in ["setNewGetter", "ServiceGetter", "InstanceGetter", "bind"]) {
	eval(Utils[copy].toSource());
}

ServiceGetter(this, "IOService", "@mozilla.org/network/io-service;1", "nsIIOService2");

Utils.extendString(String);

/**
 * Get the icon URI corresponding to an URI (special mac handling)
 * 
 * @author Nils
 * @author Stefano
 * @param link
 *          Some sort of DTA.URL, nsIURI or string to get the icon for
 * @param metalink
 *          Is it a metalink?
 * @param size
 *          The desired iconsize;
 * @return String containing the icon URI
 */
function getIcon(link, metalink, size) {
	let _favIcons = null;
	try {
		_favIcons = Cc['@mozilla.org/browser/favicon-service;1']
       .getService(Ci.nsIFaviconService);
	}
	catch (ex) {
		Debug.log("FavIcon Service not available", ex);
	}
	return (getIcon = function(link, metalink, size) {

		if (metalink) {
			return "chrome://dta/skin/icons/metalink.png";
		}
		if (typeof(size) != 'number') {
			size = 16;
		}
		try {
			let url = link;
			if (link instanceof DTA.URL) {
				url = link.url;
			}
			else if (link instanceof Ci.nsIURI) {
				url = link.QueryInterface(Ci.nsIURL);
			}
			else if (link && link.url) {
				url = link.url;
			}
			if (typeof url == 'string' || url instanceof String) {
				try {
					url = url.toURL();
				}
				catch (ex) { /* no op */ }
			}
			if (url && url instanceof Ci.nsIURL) {
				if (_favIcons && /(?:\/|html?|aspx?|php\d?)$|\/[^.]*$/i.test(url.filePath)) {
					let icon = _favIcons.getFaviconImageForPage(url);
					if (icon.spec == _favIcons.defaultFavicon.spec) {
						let host = url.clone().QueryInterface(Ci.nsIURL);
						host.ref = host.query = host.filePath = "";
						icon = _favIcons.getFaviconImageForPage(host);
					}
					return icon.spec;
				}
				url = url.spec;
			}
			let ext = url.getExtension();
			return "moz-icon://file." + (ext ? '.' + ext : '') + "?size=" + size;
		}
		catch (ex) {
			Debug.log("updateIcon: failed to grab icon", ex);
		}
		return "moz-icon://foo.html?size=" + size;
	})(link, metalink, size);
}

/**
 * Get a (formatted) locale property string.
 * 
 * @param stringId
 *          Id of desired string corresponding to the .properties file(s)
 * @param ...
 *          Optional. Format parameters
 * @return String for given Name
 * @throws Exception
 *           if stringID is not found or before the dialog was initialized
 * @author Nils
 */
setNewGetter(this, "_", function() {
	let bundles = new Utils.StringBundles(document);
	return function() {
		if (arguments.length == 1) {
			return bundles.getString(arguments[0]);
		}
		return bundles.getFormattedString.apply(bundles, arguments);
	} 
});

InstanceGetter(this, "converter", "@mozilla.org/intl/scriptableunicodeconverter", "nsIScriptableUnicodeConverter");

/**
 * Convert a value into a hash
 * 
 * @param data
 *          Data to hash. Either an nsInputStream or String-castable.
 * @param algorithm
 *          Optional. Either a number or a string referring to an nsICryptoHash
 *          function. (default: sha1)
 * @param encoding
 *          Optional. One of: HASH_HEX (0), HASH_BIN(1), HASH_B64 (2) (default:
 *          HASH_HEX)
 * @param datalen
 *          Optional, only for streams. Length of data to hash (default: hash
 *          whole stream)
 * @return A string representing the hash a in given encoding.
 * @author Nils
 */
const HASH_HEX = 0x0;
const HASH_BIN = 0x1;
const HASH_B64 = 0x2;
function hash(value, algorithm, encoding, datalen) {
	var ch = new CryptoHash();
	if (!algorithm) {
		algorithm = ch.SHA1;
	}
	if (!encoding) {
		encoding = HASH_HEX;
	}
	if (typeof(algorithm) == 'string' || algorithm instanceof String) {
		ch.initWithString(algorithm);
	} 
	else {
		ch.init(algorithm);
	}
	if (value instanceof Ci.nsIInputStream) {
		datalen = Number(datalen);
		ch.updateFromStream(value, datalen > 0 ? datalen : 0xffffffff);
	}
	else {
		converter.charset = 'utf8';		
		value = converter.convertToByteArray(Utils.atos(value), {});
		ch.update(value, value.length);
	}
	var rv = ch.finish(encoding == HASH_B64);
	if (encoding == HASH_HEX) {
		rv = Utils.hexdigest(rv);
	}
	return rv;
}


setNewGetter(
	this,
	"DefaultDownloadsDirectory",
	function() Cc["@mozilla.org/download-manager;1"].getService(Ci.nsIDownloadManager).defaultDownloadsDirectory
);