/*
 * engineLoader.mjs — load the browser Global Liquidity engine in Node (ESM).
 *
 * js/globalLiquidityEngine.js is a classic browser script (sets self.GLIEngine);
 * the project is "type":"module" so it can't be imported directly. This wraps it
 * in a vm sandbox and returns the same object the browser gets — so the CLI
 * backtest AND the Railway server endpoint run the EXACT engine the phone page
 * runs. One source of truth, zero drift.
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENGINE_PATH = path.resolve(__dirname, '..', 'js', 'globalLiquidityEngine.js');

let _cached = null;

export function loadEngine() {
  if (_cached) return _cached;
  const code = fs.readFileSync(ENGINE_PATH, 'utf8');
  const sandbox = { self: {}, console, Date, Math, isNaN, Array, Object, JSON, parseFloat };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  if (!sandbox.self.GLIEngine) throw new Error('engineLoader: GLIEngine not found after eval');
  _cached = sandbox.self.GLIEngine;
  return _cached;
}
