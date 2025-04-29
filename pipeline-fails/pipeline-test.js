const logDiv = document.createElement('div');
logDiv.classList.add('log');
logDiv.innerHTML = '<h4>Log:</h4>';
document.body.appendChild(logDiv);

function LogMessage(message, style = 'info') {
  const messageP = document.createElement('p');
  messageP.classList.add(style);
  messageP.innerText = message;
  logDiv.appendChild(messageP);
}

function LogInfo(message) {
  LogMessage(message, 'info');
}

function LogWarning(message) {
  LogMessage(message, 'warn');
}

function LogError(message) {
  LogMessage(message, 'error');
  document.body.style.backgroundColor = 'red';
}

export async function RunPipelineTest(pipelineType, shaderCode, pipelineDesc) {
  try {
    const adapter = await navigator.gpu?.requestAdapter();
    if (!adapter) {
      LogError('Unable to request adapter. WebGPU may not be supported.');
      return;
    }

    const device = await adapter.requestDevice();
    device.lost.then((lost) => {
      LogError(`WebGPU device lost (Reason - ${lost.reason}): ${lost.message}`);
    });

    const shaderModule = device.createShaderModule({
      code: shaderCode,
    });
    shaderModule.getCompilationInfo().then((info) => {
      if (!info.messages.length) { return; }
      LogMessage('Shader compilation produced messages: ');
      for (message of info.messages) {
        LogMessage(`${message.lineNum}:${message.linePos} - ${message.message}`, message.type);
      }
    });

    const shaderDiv = document.createElement('div');
    shaderDiv.classList.add('shader');
    shaderDiv.innerHTML = `<h4>Shader Code:</h4><pre>${shaderCode}</pre>`;
    document.body.appendChild(shaderDiv);

    let pipelinePromise;
    switch (pipelineType) {
      case 'render':
        if (!pipelineDesc) {
          pipelineDesc = {
            layout: 'auto',
            vertex: {},
            fragment: {
              targets: [{format: 'rgba8unorm'}]
            }
          };
        }

        pipelineDesc.vertex.module = shaderModule;
        if (pipelineDesc.fragment) { pipelineDesc.fragment.module = shaderModule; }
        pipelinePromise = device.createRenderPipelineAsync(pipelineDesc);
        break;
      
      case 'compute':
        if (!pipelineDesc) {
          pipelineDesc = {
            layout: 'auto',
            compute: {},
          };
        }

        pipelineDesc.compute.module = shaderModule;
        pipelinePromise = device.createRenderPipelineAsync(pipelineDesc);
        break;

      default: LogError(`Unknown pipeline type "${pipelineType}"`); return;
    }

    const pipelineDiv = document.createElement('div');
    pipelineDiv.classList.add('shader');
    pipelineDiv.innerHTML = `<h4>Pipeline Desc:</h4><pre>${JSON.stringify(pipelineDesc, null, 2)}</pre>`;
    document.body.appendChild(pipelineDiv);

    pipelinePromise.then((pipeline) => {
      LogInfo(`Pipeline creation succeeded!`);
      document.body.style.backgroundColor = 'green';
    }).catch((error) => {
      LogError(`Pipeline creation failed: ${error.message}`);
    });
  } catch(error) {
    LogError(`An error occurred: ${error.message}`);
  }
}