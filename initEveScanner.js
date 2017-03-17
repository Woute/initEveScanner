'use strict';
let Promise = require('bluebird');
let rp = require('request-promise');
let fs = Promise.promisifyAll(require('fs'));

function getSystems(input, regionName) {
    let systems = {};
    let title = '';
	/// Reads the user input line by line and convert it to a JavaScript Object
	let lines = input.split('<symbol id="def');
    let nameRegex = /.*<a xlink:href="http:\/\/evemaps.dotlan.net\/map\/([^"]+).*/
    let nameRegex2 = /.*<a xlink:href="http:\/\/evemaps.dotlan.net\/system\/([^"]+).*/
    for (let i = 1 ; i < lines.length - 1 ; i++) {
        let id = lines[i].substr(0, lines[i].indexOf('"'));
        if (nameRegex.test(lines[i])) {
            systems[id] = '/' + nameRegex.exec(lines[i])[1];
        } else if (nameRegex2.test(lines[i])) {
            systems[id] = nameRegex2.exec(lines[i])[1];
        }
    }
    return systems;
}

function editIndex(input, regionName, systems) {
	let title = '';
    for (let id in systems) {
        let replacement = '';
        if (regionName == '') {
            title = 'New Eden';
            replacement = 'xlink:href="#def' + id + '" onclick="goTo(\'' + systems[id] + '\'); return false;" />'
        } else {
            title = regionName;
            replacement = 'xlink:href="#def' + id + '" onclick="goTo(\'system\', \'' + regionName + '/' + systems[id] + '\'); return false;" oncontextmenu="setDestination(' + id + '); return false;" />'
        }
        input = input.replace(new RegExp('xlink:href="#def' + id + '" />'), replacement);
    }
    input = input.replace(/http:\/\/evemaps.dotlan.net\/system\//g, 'javascript:goTo(\'system\', \'' + regionName + '/');
    if (regionName == '') {
		input = input.replace(/http:\/\/evemaps.dotlan.net\/map\//g, '/');
		input = input.replace(/" class="sys link-/g, '.html" class="sys link-');
	} else {
		input = input.replace(/http:\/\/evemaps.dotlan.net\/map\//g, 'javascript:goTo(\'system\', \'');
		input = input.replace(/" class="sys link-/g, '\');" class="sys link-');
	}
    input = input.replace(/<g id="controls"[.\s\S]*\]\]><\/script>/m, '');
    input = input.replace(/onload="init\(evt\)"[^>]*>/, '>');
    input += '\n</html>';
    let scripts = '		<script src="/resources/scripts/common.js" type=text/javascript></script>\n';
    scripts += '		<script src="/resources/scripts/index.js" type=text/javascript></script>\n';
    let sidebar = '\n<input id="SSOButton" type="image" src="/resources/images/EVE_SSO_Login_Buttons_Large_Black.png" onclick="authSSO();"/>';
    sidebar += '\n<div id="credentials">\n	<input id="clientID" type="text" placeholder="Your clientID" /><br />';
    sidebar += '\n	<input id="secret" type="text" placeholder="Your secret" /><br />';
    sidebar += '\n	<button id="readCredentials" type="button" onclick="readCredentials();">Save</button>\n</div>\n\n';
    if (regionName != '') {
		scripts += '		<script src="/resources/scripts/region.js" type=text/javascript></script>\n';
	}
    let header = '<!DOCTYPE html>\n<html>\n	<head>\n		<meta charset="utf-8" />\n		<meta content="True" name="Handheld">\n		<meta content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0">\n		<link rel="stylesheet" href="/resources/style/index.css" media="all"/>\n' + scripts + '		<title>' + title + '</title>\n	</head>\n' + sidebar;
    input = header + input;
    return input;
}

function createRegion(regionName, dir, model) {
    return new Promise(function(resolve, reject) {
        let url = 'http://evemaps.dotlan.net/svg/';
        let systems = {};
        if (regionName == '') {
            url += 'New_Eden';
        } else {
            url += regionName;
        }
        let filename = dir + '/index.html';
        if (regionName != '') {
			filename = dir + '/' + regionName + '.html';
		}
        url += '.dark.svg';
        Promise.resolve(true)
        .then(() => {
			if (fs.existsSync(filename)) {
				return fs.unlinkAsync(filename);
			}
		})
        .then(() => {
            return rp({ url:url });
        })
        .then(data => {
            systems = getSystems(data, regionName);
            let result = editIndex(data, regionName, systems);
            return fs.writeFileAsync(filename, result, 'utf8');
        })
        .then(() => {
            resolve();
        })
        .catch(err => {
            reject(err);
        })
    })
}

function main() {
    if (process.argv.length != 3) {
        console.log('Usage : node populateEveScanner.js pathToEveScannerDirectory');
        return false;
    }
    let dir = process.argv[2];
    let url = 'http://evemaps.dotlan.net/svg/New_Eden.dark.svg';
    let regions = {};
    let promises = [];
    rp({ url:url })
    .then(data => {
        let lines = data.split('<symbol id="def');
        let nameRegex = /.*<a xlink:href="http:\/\/evemaps.dotlan.net\/map\/([^"]+).*/
        for (let i = 1 ; i < lines.length - 2 ; i++) {
            let id = lines[i].substr(0, lines[i].indexOf('"'));
            if (nameRegex.test(lines[i])) {
                regions[id] = nameRegex.exec(lines[i])[1];
            }
        }
    })
    .then(() => {
        return fs.readFileAsync(dir + '/model.html', 'utf8');
    })
    .then(model => {
        promises.push(createRegion('', dir));
        for (let id in regions) {
            promises.push(createRegion(regions[id], dir, model));
        }
	})
    .then(() => {
        return Promise.all(promises);
    })
    .then(() => {
        process.exit(0);
    })
    .catch(err => {
        console.log(err);
        process.exit(1);
    })
}

main();
