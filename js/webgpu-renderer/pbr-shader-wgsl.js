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

export const ATTRIB_MAP = {
  POSITION: 1,
  NORMAL: 2,
  TANGENT: 3,
  TEXCOORD_0: 4,
  COLOR_0: 5,
};

export const UNIFORM_BLOCKS = {
  FrameUniforms: 0,
  MaterialUniforms: 1,
  PrimitiveUniforms: 2,
  LightUniforms: 3
};

function PBR_VARYINGS(defines) { return `
  @location(0) vWorldPos : vec3f,
  @location(1) vView : vec3f, // Vector from vertex to camera.
  @location(2) vTex : vec2f,
  @location(3) vCol : vec4f,
  @location(4) vNorm : vec3f,

  ${defines.USE_NORMAL_MAP ? `
  @location(5) vTangent : vec3f,
  @location(6) vBitangent : vec3f,
  ` : ``}
`;
}

export function WEBGPU_VERTEX_SOURCE(defines) { return `
struct VertexInput {
  @location(${ATTRIB_MAP.POSITION}) POSITION : vec3f,
  @location(${ATTRIB_MAP.NORMAL}) NORMAL : vec3f,
  ${defines.USE_NORMAL_MAP ? `
  @location(${ATTRIB_MAP.TANGENT}) TANGENT : vec4f,
  ` : ``}
  @location(${ATTRIB_MAP.TEXCOORD_0}) TEXCOORD_0 : vec2f,
  ${defines.USE_VERTEX_COLOR ? `
  @location(${ATTRIB_MAP.COLOR_0}) COLOR_0 : vec4f,
  ` : ``}
};

struct FrameUniforms {
  projectionMatrix : mat4x4f,
  viewMatrix : mat4x4f,
  cameraPosition : vec3f,
};
@binding(0) @group(${UNIFORM_BLOCKS.FrameUniforms}) var<uniform> frame : FrameUniforms;

struct PrimitiveUniforms {
  modelMatrix : mat4x4f
};
@binding(0) @group(${UNIFORM_BLOCKS.PrimitiveUniforms}) var<uniform> primitive : PrimitiveUniforms;

struct VertexOutput {
  @builtin(position) position : vec4f,
  ${PBR_VARYINGS(defines)}
};

@vertex
fn main(input : VertexInput) -> VertexOutput {
  var output : VertexOutput;
  output.vNorm = normalize((primitive.modelMatrix * vec4(input.NORMAL, 0.0)).xyz);
${defines.USE_NORMAL_MAP ? `
  output.vTangent = normalize((primitive.modelMatrix * vec4(input.TANGENT.xyz, 0.0)).xyz);
  output.vBitangent = cross(output.vNorm, output.vTangent) * input.TANGENT.w;
` : ``}

${defines.USE_VERTEX_COLOR ? `
  output.vCol = input.COLOR_0;
` : `` }

  output.vTex = input.TEXCOORD_0;
  var mPos = primitive.modelMatrix * vec4(input.POSITION, 1.0);
  output.vWorldPos = mPos.xyz;
  output.vView = frame.cameraPosition - mPos.xyz;
  output.position = frame.projectionMatrix * frame.viewMatrix * mPos;
  return output;
}`;
}

// Much of the shader used here was pulled from https://learnopengl.com/PBR/Lighting
// Thanks!
const PBR_FUNCTIONS = `
const PI : f32 = ${Math.PI};

fn FresnelSchlick(cosTheta : f32, F0 : vec3f) -> vec3f {
  return F0 + (vec3(1.0) - F0) * pow(1.0 - cosTheta, 5.0);
}

fn DistributionGGX(N : vec3f, H : vec3f, roughness : f32) -> f32 {
  var a : f32      = roughness*roughness;
  var a2 : f32     = a*a;
  var NdotH : f32  = max(dot(N, H), 0.0);
  var NdotH2 : f32 = NdotH*NdotH;

  var num : f32    = a2;
  var denom : f32  = (NdotH2 * (a2 - 1.0) + 1.0);
  denom = PI * denom * denom;

  return num / denom;
}

fn GeometrySchlickGGX(NdotV : f32, roughness : f32) -> f32 {
  var r : f32 = (roughness + 1.0);
  var k : f32 = (r*r) / 8.0;

  var num : f32   = NdotV;
  var denom : f32 = NdotV * (1.0 - k) + k;

  return num / denom;
}

fn GeometrySmith(N : vec3f, V : vec3f, L : vec3f, roughness : f32) -> f32 {
  var NdotV : f32 = max(dot(N, V), 0.0);
  var NdotL : f32 = max(dot(N, L), 0.0);
  var ggx2 : f32  = GeometrySchlickGGX(NdotV, roughness);
  var ggx1 : f32  = GeometrySchlickGGX(NdotL, roughness);

  return ggx1 * ggx2;
}`;

export function WEBGPU_FRAGMENT_SOURCE(defines) { return `
${PBR_FUNCTIONS}

struct MaterialUniforms {
  baseColorFactor : vec4f,
  metallicRoughnessFactor : vec2f,
  emissiveFactor : vec3f,
  occlusionStrength : f32,
};
@binding(0) @group(${UNIFORM_BLOCKS.MaterialUniforms}) var<uniform> material : MaterialUniforms;

@group(1) @binding(1) var defaultSampler : sampler;
@group(1) @binding(2) var baseColorTexture : texture_2d<f32>;
@group(1) @binding(3) var normalTexture : texture_2d<f32>;
@group(1) @binding(4) var metallicRoughnessTexture : texture_2d<f32>;
@group(1) @binding(5) var occlusionTexture : texture_2d<f32>;
@group(1) @binding(6) var emissiveTexture : texture_2d<f32>;

struct Light {
  position : vec3f,
  color : vec3f,
};

struct LightUniforms {
  lights : array<Light, ${defines.LIGHT_COUNT}>,
  lightAmbient : f32,
};
@binding(0) @group(${UNIFORM_BLOCKS.LightUniforms}) var<uniform> light : LightUniforms;

struct VertexOutput {
  ${PBR_VARYINGS(defines)}
};

const dielectricSpec = vec3(0.04);
const black = vec3(0.0);

@fragment
fn main(input : VertexOutput) -> @location(0) vec4f {
  var baseColor = material.baseColorFactor;
${defines.USE_BASE_COLOR_MAP ? `
  var baseColorMap = textureSample(baseColorTexture, defaultSampler, input.vTex);
  baseColor = baseColor * baseColorMap;
` : ``}
${defines.USE_VERTEX_COLOR ? `
  baseColor = baseColor * vCol;
` : ``}

  var albedo = baseColor.rgb;

  var metallic : f32 = material.metallicRoughnessFactor.x;
  var roughness : f32 = material.metallicRoughnessFactor.y;

${defines.USE_METAL_ROUGH_MAP ? `
  var metallicRoughness = textureSample(metallicRoughnessTexture, defaultSampler, input.vTex);
  metallic = metallic * metallicRoughness.b;
  roughness = roughness * metallicRoughness.g;
` : ``}

${defines.USE_NORMAL_MAP ? `
  let tbn = mat3x3<f32>(input.vTangent, input.vBitangent, input.vNorm);
  var N = textureSample(normalTexture, defaultSampler, input.vTex).rgb;
  N = normalize(tbn * (2.0 * N - vec3(1.0)));
` : `
  var N = normalize(input.vNorm);
`}

${defines.USE_OCCLUSION ? `
  var ao : f32 = textureSample(occlusionTexture, defaultSampler, input.vTex).r * material.occlusionStrength;
` : `
  var ao : f32 = 1.0;
`}

  var emissive = material.emissiveFactor;
${defines.USE_EMISSIVE_TEXTURE ? `
  emissive = emissive * textureSample(emissiveTexture, defaultSampler, input.vTex).rgb;
` : ``}

  if (baseColorMap.a < 0.05) {
    discard;
  }

  var V = normalize(input.vView);

  var F0 = mix(dielectricSpec, albedo, vec3(metallic));

  // reflectance equation
  var Lo = vec3(0.0);

  for (var i : i32 = 0; i < ${defines.LIGHT_COUNT}; i = i + 1) {
    // calculate per-light radiance
    var L = normalize(light.lights[i].position.xyz - input.vWorldPos);
    var H = normalize(V + L);
    var distance = length(light.lights[i].position.xyz - input.vWorldPos);
    var attenuation = 1.0 / (1.0 + distance * distance);
    var radiance = light.lights[i].color.rgb * attenuation;

    // cook-torrance brdf
    var NDF = DistributionGGX(N, H, roughness);
    var G = GeometrySmith(N, V, L, roughness);
    var F = FresnelSchlick(max(dot(H, V), 0.0), F0);

    var kD = vec3(1.0) - F;
    kD = kD * (1.0 - metallic);

    var numerator = NDF * G * F;
    var denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0);
    denominator = max(denominator, 0.001);
    var specular = numerator / vec3(denominator);

    // add to outgoing radiance Lo
    var NdotL = max(dot(N, L), 0.0);
    Lo = Lo + (kD * albedo / vec3(PI) + specular) * radiance * NdotL;
  }

  var ambient = light.lightAmbient * albedo * ao;
  var color = ambient + Lo;

  color = color + emissive;

  color = color / (color + vec3(1.0));
  color = pow(color, vec3(1.0/2.2));

  return vec4(color, baseColor.a);
}
`;
}

export function GetDefinesForPrimitive(primitive) {
  const attributes = primitive.enabledAttributes;
  const material = primitive.material;
  const programDefines = {};

  if (attributes.has('COLOR_0')) {
    programDefines['USE_VERTEX_COLOR'] = 1;
  }

  if (attributes.has('TEXCOORD_0')) {
    if (material.baseColorTexture) {
      programDefines['USE_BASE_COLOR_MAP'] = 1;
    }

    if (material.normalTexture && (attributes.has('TANGENT'))) {
      programDefines['USE_NORMAL_MAP'] = 1;
    }

    if (material.metallicRoughnessTexture) {
      programDefines['USE_METAL_ROUGH_MAP'] = 1;
    }

    if (material.occlusionTexture) {
      programDefines['USE_OCCLUSION'] = 1;
    }

    if (material.emissiveTexture) {
      programDefines['USE_EMISSIVE_TEXTURE'] = 1;
    }
  }

  if ((!material.metallicRoughnessTexture ||
        !(attributes.has('TEXCOORD_0'))) &&
        material.metallicRoughnessFactor[1] == 1.0) {
    programDefines['FULLY_ROUGH'] = 1;
  }

  return programDefines;
}
