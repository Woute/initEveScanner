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
    for (let id in systems) {
        let replacement = '';
        if (regionName == '') {
            title = 'New Eden';
            replacement = 'xlink:href="#def' + id + '" onclick="goTo(\'' + systems[id] + '/index\');" />'
        } else {
            title = regionName;
            replacement = 'xlink:href="#def' + id + '" onclick="goTo(\'' + systems[id] + '\');" oncontextmenu="setDestination(' + id + '); return false;" />'
        }
        input = input.replace(new RegExp('xlink:href="#def' + id + '" />'), replacement);
    }
    input = input.replace(/http:\/\/evemaps.dotlan.net\/system\//g, '');
    input = input.replace(/http:\/\/evemaps.dotlan.net\/map\//g, '../');
    input = input.replace(/" class="sys link-/g, '.html" class="sys link-');
    input = input.replace(/<g id="controls"[.\s\S]*\]\]><\/script>/m, '');
    input = input.replace(/onload="init\(evt\)"[^>]*>/, '>');
    input += '\n</html>';
    let header = '<!DOCTYPE html>\n<html>\n	<head>\n		<meta charset="utf-8" />\n		<meta content="True" name="Handheld">\n		<meta content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0">\n		<link rel="stylesheet" href="/resources/style/index.css" media="all"/>\n        <script src="/resources/scripts/common.js" type=text/javascript></script>\n		<title>' + title + '</title>\n	</head>\n   <input id="SSOButton" type="image" src="/resources/images/EVE_SSO_Login_Buttons_Large_Black.png" onclick="authSSO();"/>\n    ';
    input = header + input;
    return input;
}

function writeSystem(regionName, dir, id, data, system) {
    return new Promise(function(resolve, reject) {
        fs.writeFileAsync(dir + '/' + regionName + '/' + system + '.html', data, 'utf8')
        .then(() => {
            return resolve();
        })
        .catch(err => {
            reject(err);
        })
    })
}

function createSystems(regionName, dir, model, systems) {
    return new Promise(function(resolve, reject) {
        let promises = [];
        Promise.resolve(true)
        .then(() => {
            for (let i = 0 ; i < Object.keys(systems).length ; ++i) {
                let id = Object.keys(systems)[i];
                let name = systems[id];
                if (!name.match('/')) {
                    let data = model.replace('__title__', name);
                    promises.push(writeSystem(regionName, dir, id, data, name));
                }
            }
        })
        .then(() => {
            return Promise.all(promises);
        })
        .then(() => {
            return resolve();
        })
        .catch(err => {
            reject(err);
        })
    })
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
        url += '.dark.svg';
        Promise.resolve(true)
        .then(() => {
            if (regionName != '') {
                return fs.mkdirAsync(dir + '/' + regionName)
            }
        })
        .then(() => {
            return rp({ url:url });
        })
        .then(data => {
            systems = getSystems(data, regionName);
            let result = editIndex(data, regionName, systems);
            return fs.writeFileAsync(dir + '/' + regionName + '/index.html', result, 'utf8');
        })
        .then(() => {
            if (regionName != '') {
                return createSystems(regionName, dir, model, systems);
            }
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
