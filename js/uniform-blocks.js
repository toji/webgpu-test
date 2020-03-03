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

// A utility that builds objects which make it easy to manage blocks of uniforms
// in WebGL, WebGL2, and eventually WebGPU.

// Example:
/*

const FrameUniformBlock = UniformBlockBuilder.defineBlock('FrameUniforms', [
  { mat4: 'projectionMatrix' },
  { mat4: 'viewMatrix' },
  { vec3: 'cameraPosition' },
  { vec3: 'lightPositions[8]' },
  { vec4: 'lightColors[8]' },
])

*/

const VALID_TYPES = {
  bool: { elements: 1, arrayType: Uint32Array },
  int: { elements: 1, arrayType: Int32Array },
  uint: { elements: 1, arrayType: Uint32Array },
  float: { elements: 1, arrayType: Float32Array },
  vec2: { elements: 2, arrayType: Float32Array },
  vec3: { elements: 3, arrayType: Float32Array },
  vec4: { elements: 4, arrayType: Float32Array },
  mat2: { elements: 4, arrayType: Float32Array },
  mat3: { elements: 9, arrayType: Float32Array },
  mat4: { elements: 16, arrayType: Float32Array },
};

const VAR_REGEX = new RegExp('^([a-zA-Z][a-zA-Z0-9_\-]+)(\[[0-9]+\])*$');
const ARRAY_REGEX = new RegExp('([0-9]+)');

class UniformBlockMember {
  constructor(definition, offset) {
    this.type = null;
    this.typeDef = null;
    this.name = null;
    this.offset = offset;
    this.arrayLength = 0;

    for (const typeName in VALID_TYPES) {
      if (typeName in definition) {
        this.type = typeName;
        this.typeDef = VALID_TYPES[typeName];
        const varName = definition[typeName];
        const varComponents = varName.match(VAR_REGEX);
        if (!varComponents || !varComponents[1].length) {
          throw new Error(`Invalid variable name in block member '${typeName} ${varName}'`);
        }
        this.name = varComponents[1];
        if (varComponents[2]) {
          const arrayComponents = varComponents[2].match(ARRAY_REGEX);
          if (!arrayComponents || !arrayComponents[1].length) {
            throw new Error(`Invalid array declaration '${varComponents[2]} in block member '${typeName} ${varName}'`);
          }
          this.arrayLength = parseInt(arrayComponents[1], 10);
          if (!this.arrayLength) {
            throw new Error(`Invalid array length ${arrayComponents[1]} in block member '${typeName} ${varName}'`);
          }
        }
        break;
      }
    }

    if (!this.type) {
      for (const typeName in definition) {
        throw new Error(`Unrecognized block member type '${typeName}'`);
      }

      throw new Error(`No block member type found`);
    }
  }
}

class UniformBlock {
  constructor() {

  }
}

export class UniformBlockBuilder {
  static defineBlock(name, members) {

    const blockMembers = [];
    for (let index in members) {
      const definition = members[index];
      try {
        blockMembers.push(new UniformBlockMember(definition));
      } catch(err) {
        throw new Error(`Error defining uniform block '${name}', member[${index}]: ${err.message}`);
      }
    }

    if (!blockMembers.length) {
      throw new Error(`Uniform block must have members`);
    }

    return UniformBlock;
  }
}