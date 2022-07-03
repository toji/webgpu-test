// Copyright 2020 Brandon Jones
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

export class GPUTextureHelper {
  constructor(device) {
    this.device = device;

    const mipmapShaderModule = this.device.createShaderModule({
      code: `
        var<private> pos : array<vec2<f32>, 3> = array<vec2<f32>, 3>(
          vec2<f32>(-1.0, -1.0), vec2<f32>(-1.0, 3.0), vec2<f32>(3.0, -1.0));

        struct VertexOutput {
          @builtin(position) position : vec4<f32>,
          @location(0) texCoord : vec2<f32>,
        };

        @vertex
        fn vertexMain(@builtin(vertex_index) vertexIndex : u32) -> VertexOutput {
          var output : VertexOutput;
          output.texCoord = pos[vertexIndex] * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5);
          output.position = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
          return output;
        }

        @binding(0) @group(0) var imgSampler : sampler;
        @binding(1) @group(0) var img : texture_2d<f32>;

        @fragment
        fn fragmentMain(@location(0) texCoord : vec2<f32>) -> @location(0) vec4<f32> {
          return textureSample(img, imgSampler, texCoord);
        }
      `,
    });

    this.mipmapSampler = device.createSampler({ minFilter: 'linear' });

    this.mipmapPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: mipmapShaderModule,
        entryPoint: 'vertexMain',
      },
      fragment: {
        module: mipmapShaderModule,
        entryPoint: 'fragmentMain',
        targets: [{
          format: 'rgba8unorm',
        }],
      }
    });
  }

  // TODO: Everything about this is awful.
  generateMipmappedTexture(imageBitmap) {
    let textureSize = {
      width: imageBitmap.width,
      height: imageBitmap.height,
    }
    const mipLevelCount = Math.floor(Math.log2(Math.max(imageBitmap.width, imageBitmap.height))) + 1;

    // Populate the top level of the srcTexture with the imageBitmap.
    const srcTexture = this.device.createTexture({
      size: textureSize,
      format: 'rgba8unorm',
      // TO COMPLAIN ABOUT: Kind of worrying that this style of mipmap generation implies that almost every texture
      // generated will be an output attachment. There's gotta be a performance penalty for that.
      usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
      mipLevelCount
    });
    this.device.queue.copyExternalImageToTexture({ source: imageBitmap }, { texture: srcTexture }, textureSize);

    const commandEncoder = this.device.createCommandEncoder({});

    const bindGroupLayout = this.mipmapPipeline.getBindGroupLayout(0);

    for (let i = 1; i < mipLevelCount; ++i) {
      const bindGroup = this.device.createBindGroup({
        layout: bindGroupLayout,
        entries: [{
          binding: 0,
          resource: this.mipmapSampler,
        }, {
          binding: 1,
          resource: srcTexture.createView({
            baseMipLevel: i-1,
            mipLevelCount: 1
          }),
        }],
      });

      const passEncoder = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: srcTexture.createView({
            baseMipLevel: i,
            mipLevelCount: 1
          }),
          loadOp: 'load',
          storeOp: 'store',
        }],
      });
      passEncoder.setPipeline(this.mipmapPipeline);
      passEncoder.setBindGroup(0, bindGroup);
      passEncoder.draw(3);
      passEncoder.end();

      textureSize.width = Math.ceil(textureSize.width / 2);
      textureSize.height = Math.ceil(textureSize.height / 2);
    }
    this.device.queue.submit([commandEncoder.finish()]);

    return srcTexture;
  }

  generateTexture(imageBitmap) {
    const textureSize = {
      width: imageBitmap.width,
      height: imageBitmap.height,
    };

    const texture = this.device.createTexture({
      size: textureSize,
      format: 'rgba8unorm',
      usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.device.queue.copyImageBitmapToTexture({ imageBitmap }, { texture }, textureSize);

    return texture;
  }

  generateColorTexture(r, g, b, a) {
    const imageData = new Uint8Array([r * 255, g * 255, b * 255, a * 255]);

    const imageSize = { width: 1, height: 1 };
    const texture = this.device.createTexture({
      size: imageSize,
      format: 'rgba8unorm',
      usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
    });

    const textureDataBuffer = this.device.createBuffer({
      // BUG? WTF is up with this?!? bytesPerRow has to be a multiple of 256?
      size: 256,
      usage: GPUBufferUsage.COPY_SRC,
      mappedAtCreation: true,
    });
    const textureDataArray = new Uint8Array(textureDataBuffer.getMappedRange());
    textureDataArray.set(imageData);
    textureDataBuffer.unmap();

    const commandEncoder = this.device.createCommandEncoder({});
    commandEncoder.copyBufferToTexture({
      buffer: textureDataBuffer,
      bytesPerRow: 256,
      rowsPerImage: 0, // What is this for?
    }, { texture: texture }, imageSize);
    this.device.queue.submit([commandEncoder.finish()]);

    return texture;
  }
}