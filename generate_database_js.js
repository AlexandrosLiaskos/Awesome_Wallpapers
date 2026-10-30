#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, 'wallpapers_database.json');
const jsPath = path.join(__dirname, 'wallpapers_database.js');

const rawJson = fs.readFileSync(jsonPath, 'utf8').trim();
JSON.parse(rawJson); // Validate JSON syntax
const jsContent = `window.WALLPAPERS_DATA = ${rawJson};\n`;

fs.writeFileSync(jsPath, jsContent, 'utf8');
console.log('Successfully generated wallpapers_database.js from wallpapers_database.json');
