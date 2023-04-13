const SKYBOX_SHADER = /*wgsl*/`
  struct Camera {
    projection: mat4x4f,
    view: mat4x4f,
  };
  @group(0) @binding(0) var<uniform> camera : Camera;

  struct VertexOutput {
    @builtin(position) position : vec4f,
    @location(0) texcoord : vec3f,
  };

  @vertex
  fn vertexMain(@location(0) position : vec4f) -> VertexOutput {
    var output : VertexOutput;

    var modelView = camera.view;
    // Drop the translation portion of the modelView matrix
    modelView[3] = vec4(0, 0, 0, modelView[3].w);
    output.position = camera.projection * modelView * position;
    // Returning the W component for both Z and W forces the geometry depth to
    // the far plane. When combined with a depth func of "less-equal" this makes
    // the sky write to any depth fragment that has not been written to yet.
    output.position = output.position.xyww;
    output.texcoord = position.xyz;

    return output;
  }

  @group(0) @binding(2) var environmentSampler : sampler;
  @group(0) @binding(3) var environmentTexture : texture_cube<f32>;

  @fragment
  fn fragmentMain(@location(0) texcoord : vec3f) -> @location(0) vec4f {
    return vec4f(texcoord + 1 * 0.5, 1);
  }
`;

const SKYBOX_VERTS = new Float32Array([
  1.0,  1.0,  1.0, // 0
 -1.0,  1.0,  1.0, // 1
  1.0, -1.0,  1.0, // 2
 -1.0, -1.0,  1.0, // 3
  1.0,  1.0, -1.0, // 4
 -1.0,  1.0, -1.0, // 5
  1.0, -1.0, -1.0, // 6
 -1.0, -1.0, -1.0, // 7
]);

const SKYBOX_INDICES = new Uint16Array([
  // PosX (Right)
  0, 2, 4,
  6, 4, 2,

  // NegX (Left)
  5, 3, 1,
  3, 5, 7,

  // PosY (Top)
  4, 1, 0,
  1, 4, 5,

  // NegY (Bottom)
  2, 3, 6,
  7, 6, 3,

  // PosZ (Front)
  0, 1, 2,
  3, 2, 1,

  // NegZ (Back)
  6, 5, 4,
  5, 6, 7,
]);

export class SkyboxRenderer {
  device;
  pipeline;

  skyboxVertexBuffer;
  skyboxIndexBuffer;

  constructor(device, frameBindGroupLayout, colorFormat, depthFormat) {
    this.device = device;

    const shaderModule = device.createShaderModule({
      label: 'skybox shader',
      code: SKYBOX_SHADER,
    });

    // Setup a render pipeline for drawing the skybox
    this.pipeline = device.createRenderPipeline({
      label: `skybox pipeline`,
      layout: device.createPipelineLayout({
        bindGroupLayouts: [
          frameBindGroupLayout,
        ]
      }),
      vertex: {
        module: shaderModule,
        entryPoint: 'vertexMain',
        buffers: [{
          arrayStride: 3 * Float32Array.BYTES_PER_ELEMENT,
          attributes: [{
            shaderLocation: 0,
            format: 'float32x3',
            offset: 0,
          }]
        }]
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fragmentMain',
        targets: [{
          format: colorFormat,
        }],
      },
      depthStencil: {
        depthWriteEnabled: false,
        depthCompare: 'less-equal',
        format: depthFormat,
      }
    });

    this.skyboxVertexBuffer = device.createBuffer({
      label: 'skybox vertex buffer',
      size: SKYBOX_VERTS.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.skyboxVertexBuffer, 0, SKYBOX_VERTS);

    this.skyboxIndexBuffer = device.createBuffer({
      label: 'skybox index buffer',
      size: SKYBOX_INDICES.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.skyboxIndexBuffer, 0, SKYBOX_INDICES);
  }

  render(renderPass) {
    // Skybox is part of the frame bind group, which should already be bound prior to calling this method.
    renderPass.setPipeline(this.pipeline);
    renderPass.setVertexBuffer(0, this.skyboxVertexBuffer);
    renderPass.setIndexBuffer(this.skyboxIndexBuffer, 'uint16');
    renderPass.drawIndexed(SKYBOX_INDICES.length);
  }
}
