

async function initWebGPU() {
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter.requestDevice();

    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;

    const context = canvas.getContext('webgpu');
    context.configure({
        format: navigator.gpu.getPreferredCanvasFormat(),
        device
    });

    // Place a counter of the page that shows the FPS of the rAF callback
    const fpsOutput = document.createElement('div');
    document.body.appendChild(fpsOutput);
    document.body.appendChild(canvas);

    let lastTimestamp = performance.now();
    let frameCount = 0;

    let clearCounter = 0;

    const rafCallback = (time) => {
        requestAnimationFrame(rafCallback);
        frameCount++;
        // Every second update the FPS counter
        if(time - lastTimestamp > 1000) {
            fpsOutput.innerText = `rAF FPS: ${frameCount}`;
            frameCount = 0;
            lastTimestamp = time;
            clearCounter++;
        }

        const encoder = device.createCommandEncoder();
        
        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                clearValue: clearCounter % 2 ? [0, 0, 1, 1] : [1, 0, 0, 1],
                loadOp: 'clear',
                storeOp: 'store',
            }]
        });
        pass.end();

        device.queue.submit([encoder.finish()]);
    }

    requestAnimationFrame(rafCallback);
}

window.addEventListener('load', initWebGPU);