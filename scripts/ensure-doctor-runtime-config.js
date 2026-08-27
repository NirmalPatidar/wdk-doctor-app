#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const target = path.join(root, 'doctor.runtime.json')
const example = path.join(root, 'doctor.runtime.example.json')

if (!fs.existsSync(target)) {
  fs.copyFileSync(example, target)
  console.log('[doctor] Created doctor.runtime.json from doctor.runtime.example.json — edit it with your own package config.')
} else {
  console.log('[doctor] doctor.runtime.json already exists, leaving it as-is.')
}
