/**
 * @license
 * Copyright 2019 The Emscripten Authors
 * SPDX-License-Identifier: MIT
 */

// === Auto-generated postamble setup entry stuff ===
#if HAS_MAIN // Only if user is exporting a C main(), we will generate a run() function that can be used to launch main.
function run() {
#if MEMORYPROFILER
  emscriptenMemoryProfiler.onPreloadComplete();
#endif

  <<< ATMAINS >>>
#if PROXY_TO_PTHREAD
  // User requested the PROXY_TO_PTHREAD option, so call a stub main which
  // pthread_create()s a new thread that will call the user's real main() for
  // the application.
  var ret = __emscripten_proxy_main();
#else
  var ret = _main();

#if EXIT_RUNTIME
  <<< ATEXITS >>>
#if PTHREADS
  PThread.terminateAllThreads();
#endif

#endif

#if EXIT_RUNTIME

#if ASSERTIONS
  runtimeExited = true;
#endif

  _proc_exit(ret);
#endif
#endif // PROXY_TO_PTHREAD

#if STACK_OVERFLOW_CHECK
  checkStackCookie();
#endif
  <<< ATPOSTRUNS >>>
}
#endif

function initRuntime(wasmExports) {
#if ASSERTIONS || SAFE_HEAP || USE_ASAN || MODULARIZE
  runtimeInitialized = true;
#endif

#if PTHREADS
  PThread.tlsInitFunctions.push(wasmExports['_emscripten_tls_init']);
  if (ENVIRONMENT_IS_PTHREAD) return;
#endif

#if WASM_WORKERS
  if (ENVIRONMENT_IS_WASM_WORKER) return _wasmWorkerInitializeRuntime();
#endif

#if STACK_OVERFLOW_CHECK
  _emscripten_stack_init();
#if STACK_OVERFLOW_CHECK >= 2
  setStackLimits();
#endif
  writeStackCookie();
#endif

  <<< ATINITS >>>

#if hasExportedSymbol('__wasm_call_ctors')
  wasmExports['__wasm_call_ctors']();
#endif

  <<< ATPOSTCTORS >>>
}

// Initialize wasm (asynchronous)

#if SINGLE_FILE && WASM == 1 && !WASM2JS
Module['wasm'] = base64Decode('<<< WASM_BINARY_DATA >>>');
#endif

#if LibraryManager.has('libexports.js')
// emscripten_get_exported_function() requires wasmExports to be defined in the
// outer scope.
var wasmExports;
#endif

#if PTHREADS
var wasmModule;
#endif

#if PTHREADS || WASM_WORKERS
function loadModule() {
  assignWasmImports();
#endif

var imports = {
#if MINIFY_WASM_IMPORTED_MODULES
  'a': wasmImports,
#else // MINIFY_WASM_IMPORTED_MODULES
  'env': wasmImports,
  '{{{ WASI_MODULE_NAME }}}': wasmImports,
#endif // MINIFY_WASM_IMPORTED_MODULES
};

#if MINIMAL_RUNTIME_STREAMING_WASM_INSTANTIATION
// https://caniuse.com/#feat=wasm and https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WebAssembly/instantiateStreaming
#if MIN_FIREFOX_VERSION < 58 || MIN_CHROME_VERSION < 61 || MIN_SAFARI_VERSION < 150000 || ENVIRONMENT_MAY_BE_NODE
#if ASSERTIONS && !WASM2JS
// Module['wasm'] should contain a typed array of the Wasm object data, or a
// precompiled WebAssembly Module.
assert(WebAssembly.instantiateStreaming || Module['wasm'], 'Must load WebAssembly Module in to variable Module.wasm before adding compiled output .js script to the DOM');
#endif
(WebAssembly.instantiateStreaming
#if ENVIRONMENT_MAY_BE_NODE
  // Node's fetch API cannot be used for local files, so we cannot use instantiateStreaming
  && !ENVIRONMENT_IS_NODE
#endif
  ? WebAssembly.instantiateStreaming(fetch('{{{ TARGET_BASENAME }}}.wasm'), imports)
  : WebAssembly.instantiate(Module['wasm'], imports)).then((output) => {
#else
WebAssembly.instantiateStreaming(fetch('{{{ TARGET_BASENAME }}}.wasm'), imports).then((output) => {
#endif

#else // Non-streaming instantiation
#if ASSERTIONS && !WASM2JS
// Module['wasm'] should contain a typed array of the Wasm object data, or a
// precompiled WebAssembly Module.
assert(Module['wasm'], 'Must load WebAssembly Module in to variable Module.wasm before adding compiled output .js script to the DOM');
#endif

<<< ATMODULES >>>

{{{ exportJSSymbols() }}}

WebAssembly.instantiate(Module['wasm'], imports).then((output) => {
#endif

#if !LibraryManager.has('libexports.js')
  // If not using the emscripten_get_exported_function() API, keep the
  // `wasmExports` variable in local scope to this instantiate function to save
  // code size.  (otherwise access it without to export it to outer scope)
  var
#endif
  // WebAssembly instantiation API gotcha: if Module['wasm'] above was a typed
  // array, then the output object will have an output.instance and
  // output.module objects. But if Module['wasm'] is an already compiled
  // WebAssembly module, then output is the WebAssembly instance itself.
  // Depending on the build mode, Module['wasm'] can mean a different thing.
#if MINIMAL_RUNTIME_STREAMING_WASM_COMPILATION || MINIMAL_RUNTIME_STREAMING_WASM_INSTANTIATION || PTHREADS
  // https://caniuse.com/#feat=wasm and https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WebAssembly/instantiateStreaming
#if MIN_FIREFOX_VERSION < 58 || MIN_CHROME_VERSION < 61 || MIN_SAFARI_VERSION < 150000 || ENVIRONMENT_MAY_BE_NODE || PTHREADS
  // In pthreads, Module['wasm'] is an already compiled WebAssembly.Module. In
  // that case, 'output' is a WebAssembly.Instance.
  // In main thread, Module['wasm'] is either a typed array or a fetch stream.
  // In that case, 'output.instance' is the WebAssembly.Instance.
  wasmExports = (output.instance || output).exports;
#else
  wasmExports = output.exports;
#endif
#else
  wasmExports = output.instance.exports;
#endif

#if MEMORY64 || CAN_ADDRESS_2GB
  wasmExports = applySignatureConversions(wasmExports);
#endif

#if USE_OFFSET_CONVERTER
#if PTHREADS
  if (!ENVIRONMENT_IS_PTHREAD)
#endif
    wasmOffsetConverter = new WasmOffsetConverter(Module['wasm'], output.module);
#endif

#if !DECLARE_ASM_MODULE_EXPORTS
  exportWasmSymbols(wasmExports);
#else
  assignWasmExports(wasmExports);
#endif
#if '$wasmTable' in addedLibraryItems
  wasmTable = wasmExports['__indirect_function_table'];
#if ASSERTIONS
  assert(wasmTable);
#endif
#endif

#if AUDIO_WORKLET
  // If we are in the audio worklet environment, we can only access the Module object
  // and not the global scope of the main JS script. Therefore we need to export
  // all symbols that the audio worklet scope needs onto the Module object.
#if ASSERTIONS
  // In ASSERTIONS-enabled builds, the needed symbols have gotten read-only getters
  // saved to the Module. Remove the getters so we can manually export them here.
  delete Module['stackSave'];
  delete Module['stackAlloc'];
  delete Module['stackRestore'];
  delete Module['wasmTable'];
#endif
  Module['stackSave'] = stackSave;
  Module['stackAlloc'] = stackAlloc;
  Module['stackRestore'] = stackRestore;
  Module['wasmTable'] = wasmTable;
#endif

#if !IMPORTED_MEMORY
  wasmMemory = wasmExports['memory'];
#if ASSERTIONS
  assert(wasmMemory);
#endif
  updateMemoryViews();
#endif
  <<< ATPRERUNS >>>

  initRuntime(wasmExports);
#if PTHREADS
  // Export Wasm module for pthread creation to access.
  wasmModule = output.module || Module['wasm'];
  PThread.loadWasmModuleToAllWorkers(ready);
#else
  ready();
#endif
}

#if WASM == 2
, (error) => {
#if ASSERTIONS
  console.error(error);
#endif

#if ENVIRONMENT_MAY_BE_NODE || ENVIRONMENT_MAY_BE_SHELL
  if (typeof location != 'undefined') {
#endif
    // WebAssembly compilation failed, try running the JS fallback instead.
    var search = location.search;
    if (search.indexOf('_rwasm=0') < 0) {
      location.href += (search ? search + '&' : '?') + '_rwasm=0';
    }
#if ENVIRONMENT_MAY_BE_NODE || ENVIRONMENT_MAY_BE_SHELL
  }
#endif
}
#endif // WASM == 2
);

#if PTHREADS || WASM_WORKERS
}

// When running in a background thread we delay module loading until we have
{{{ runIfMainThread('loadModule();') }}}
#endif
