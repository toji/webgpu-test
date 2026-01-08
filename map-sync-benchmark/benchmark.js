let log;
let logNewCol;
let clearLog;
let worker;

// Detect if we're in a worker or not, initilize logging functions accordingly.
const inWorker = typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope
if (inWorker) {
  // In a worker
  clearLog = function() {
    postMessage({
      type: 'clearLog',
      message: string
    });
  }

  log = function(string) {
    postMessage({
      type: 'log',
      message: string
    });
  }

  logNewCol = function() {
    postMessage({
      type: 'logNewCol'
    });
  }

  self.addEventListener('message', async (ev) => {
      switch(ev.data.type) {
        case 'beginBenchmark': beginBenchmark(ev.data); break;
        default: log(`Unknown worker message type ${ev.data.type}`); break;
      }
    });
} else {
  // Not in a worker
  const logContainer = document.getElementById('log');
  let logCol = null;
  clearLog = function() {
    logContainer.innerText = '';
    logCol = null;
  }

  log = function(string) {
    if (!logCol) {
      logCol = document.createElement('pre');
      logContainer.appendChild(logCol);
    }
    console.log(string);
    logCol.innerText += string + '\n';
  }

  logNewCol = function() {
    logCol = null;
  }

  worker = new Worker('./benchmark.js');
  worker.addEventListener('message', (ev) => {
    switch (ev.data.type) {
      case 'clearLog': clearLog(); break;
      case 'log': log(ev.data.message); break;
      case 'logNewCol': logNewCol(); break;
      default: log(`Unknown message type ${ev.data.type}`); break;
    }
  });
}

// Initialize WebGPU
let adapter;
let device;
let srcBuffer;
let readbackBuffer;
let computePipeline;
let computeBindGroup;

async function initWebGPU() {
  adapter = await navigator.gpu.requestAdapter();
  device = await adapter.requestDevice();

  computePipeline = device.createComputePipeline({
    layout: 'auto',
    compute: {
      module: device.createShaderModule({ code: `
        struct OutputBuffer {
          entries: array<vec4u>,
        };
        @group(0) @binding(0) var<storage, read_write> output : OutputBuffer;

        @compute @workgroup_size(64)
        fn computeMain(
          @builtin(global_invocation_id) global_id : vec3u,
          @builtin(local_invocation_index) local_id : u32) {
          output.entries[global_id.x] = vec4u(global_id, local_id);
        }
      `})
    }
  });
}
initWebGPU();

function fillBuffer() {
  const commandEncoder = device.createCommandEncoder();

  const passEncoder = commandEncoder.beginComputePass();
  passEncoder.setPipeline(computePipeline);
  passEncoder.setBindGroup(0, computeBindGroup);
  passEncoder.dispatchWorkgroups(readbackBuffer.size / 64);
  passEncoder.end();

  commandEncoder.copyBufferToBuffer(srcBuffer, 0, readbackBuffer, 0, readbackBuffer.size);

  device.queue.submit([commandEncoder.finish()]);
}

async function runMapAsyncTest(size, iterationsPerRun=100, runs=10) {
  srcBuffer = device.createBuffer({
    label: `Destination Buffer`,
    usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.STORAGE,
    size,
  });

  readbackBuffer = device.createBuffer({
    label: `Readback Buffer`,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    size,
  });

  computeBindGroup = device.createBindGroup({
    layout: computePipeline.getBindGroupLayout(0),
    entries: [{
      binding: 0,
      resource: {
        buffer: srcBuffer,
      },
    }],
  });

  let kbSize = size / 1024;
  let mbSize = kbSize / 1024;
  let label = mbSize > 1 ? mbSize + 'Mb' : kbSize + 'Kb';
  log(`=== mapAsync(${inWorker ? 'worker' : 'main thread'}, ${label}) ===`);

  let totalDuration = 0;

  for (let j = 0; j < runs+1; ++j) {
    const start = performance.now();
    for (let i = 0; i < iterationsPerRun; ++i) {
      fillBuffer();

      await readbackBuffer.mapAsync(GPUMapMode.READ);
      const readbackArray = readbackBuffer.getMappedRange();
      readbackBuffer.unmap();
    }
    const duration = performance.now()-start;
    log(`Run ${j}: ${duration.toFixed(2)}ms/${iterationsPerRun} fill+readback${j == 0 ? ' (discarded)' : ''}`);
    if (j != 0) { // Always discard the 0th run.
      totalDuration += duration;
    }
  }

  const avgDuration = totalDuration / runs;
  log(`Average: ${avgDuration.toFixed(2)}ms/${iterationsPerRun} fill+readback.`);
}

function runMapSyncTest(size, iterationsPerRun=100, runs=10) {
  srcBuffer = device.createBuffer({
    label: `Destination Buffer`,
    usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.STORAGE,
    size,
  });

  readbackBuffer = device.createBuffer({
    label: `Readback Buffer`,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    size,
  });

  computeBindGroup = device.createBindGroup({
    layout: computePipeline.getBindGroupLayout(0),
    entries: [{
      binding: 0,
      resource: {
        buffer: srcBuffer,
      },
    }],
  });

  let kbSize = size / 1024;
  let mbSize = kbSize / 1024;
  let label = mbSize > 1 ? mbSize + 'Mb' : kbSize + 'Kb';
  log(`=== mapSync(${label}) ===`);

  if (!('mapSync' in readbackBuffer)) {
    log('⚠️ mapSync not supported');
    return;
  }

  let totalDuration = 0;

  for (let j = 0; j < runs+1; ++j) {
    const start = performance.now();
    for (let i = 0; i < iterationsPerRun; ++i) {
      fillBuffer();

      readbackBuffer.mapSync(GPUMapMode.READ);
      const readbackArray = readbackBuffer.getMappedRange();
      readbackBuffer.unmap();
    }
    const duration = performance.now()-start;
    log(`Run ${j}: ${duration.toFixed(2)}ms/${iterationsPerRun} fill+readback${j == 0 ? ' (discarded)' : ''}`);
    if (j != 0) { // Always discard the 0th run.
      totalDuration += duration;
    }
  }

  const avgDuration = totalDuration / runs;
  log(`Average: ${avgDuration.toFixed(2)}ms/${iterationsPerRun} fill+readback.`);
}

async function beginBenchmark(options) {
  if (inWorker) {
    if (options.mapAsyncWorker) {
      logNewCol();
      await runMapAsyncTest(options.byteSize, options.iterations);
    }
    if (options.mapSync) {
      logNewCol();
      runMapSyncTest(options.byteSize, options.iterations);
    }
  } else {
    clearLog();
    if (options.mapAsyncMain) {
      logNewCol();
      await runMapAsyncTest(options.byteSize, options.iterations);
    }
    if (options.mapAsyncWorker || options.mapSync) {
      worker.postMessage({
        type: 'beginBenchmark',
        ...options
      });
    }
  }
}