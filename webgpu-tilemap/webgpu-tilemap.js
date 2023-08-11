const tilemapShader = `
  const pos = array<vec2f, 3>(
    vec2f(-1, -1), vec2f(-1, 3), vec2f(3, -1));

  struct VertexOut {
    @builtin(position) pos: vec4f,
    @location(0) texcoord: vec2f,
  };

  @vertex
  fn vertexMain(@builtin(vertex_index) i: u32) -> VertexOut {
    let p = pos[i];
    return VertexOut(
      vec4f(p, 0, 1),
      (vec2f(p.x, -p.y) * 0.5 + 0.5),
    );
  }

  @group(0) @binding(0) var tileTexture: texture_2d<f32>;
  @group(0) @binding(1) var spriteTexture: texture_2d<f32>;
  @group(0) @binding(2) var spriteSampler: sampler;

  @fragment
  fn fragmentMain(input: VertexOut) -> @location(0) vec4f {
    let tile = textureLoad(tileTexture, input.texcoord, 0).xy;
    let 
    return 
  }
`;

export class TileMap {
  constructor(device) {
    this.device = device;
  }
}

/*define([
    "util/gl-util",
    "util/gl-matrix-min"
], function (GLUtil) {

    // Shader
    var tilemapVS = [
        "precision mediump float;",

        "attribute vec2 position;",
        "attribute vec2 texture;",
        
        "varying vec2 pixelCoord;",
        "varying vec2 texCoord;",

        "uniform vec2 viewOffset;",
        "uniform vec2 viewportSize;",
        "uniform vec2 inverseTileTextureSize;",
        "uniform float inverseTileSize;",

        "void main(void) {",
        "   pixelCoord = (texture * viewportSize) + viewOffset;",
        "   texCoord = pixelCoord * inverseTileTextureSize * inverseTileSize;",
        "   gl_Position = vec4(position, 0.0, 1.0);",
        "}"
    ].join("\n");

    var tilemapFS = [
        "precision mediump float;",

        "varying vec2 pixelCoord;",
        "varying vec2 texCoord;",

        "uniform sampler2D tiles;",
        "uniform sampler2D sprites;",

        "uniform vec2 inverseTileTextureSize;",
        "uniform vec2 inverseSpriteTextureSize;",
        "uniform float tileSize;",

        "void main(void) {",
        "   vec4 tile = texture2D(tiles, texCoord);",
        "   if(tile.x == 1.0 && tile.y == 1.0) { discard; }",
        "   vec2 spriteOffset = floor(tile.xy * 256.0) * tileSize;",
        "   vec2 spriteCoord = mod(pixelCoord, tileSize);",
        "   gl_FragColor = texture2D(sprites, (spriteOffset + spriteCoord) * inverseSpriteTextureSize);",
        "}"
    ].join("\n");

    var TileMapLayer = function(gl) {
        this.scrollScaleX = 1;
        this.scrollScaleY = 1;
        this.tileTexture = gl.createTexture();
        this.inverseTextureSize = vec2.create();
    };

    TileMapLayer.prototype.setTexture = function(gl, src, repeat) {
        var self = this;
        var image = new Image();
        image.addEventListener("load", function() {
            gl.bindTexture(gl.TEXTURE_2D, self.tileTexture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

            // MUST be filtered with NEAREST or tile lookup fails
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

            if(repeat) {
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
            } else {
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            }

            self.inverseTextureSize[0] = 1/image.width;
            self.inverseTextureSize[1] = 1/image.height;
        });
        image.src = src;
    };

    var TileMap = function(gl) {
        this.gl = gl;
        this.viewportSize = vec2.create();
        this.scaledViewportSize = vec2.create();
        this.inverseTileTextureSize = vec2.create();
        this.inverseSpriteTextureSize = vec2.create();

        this.tileScale = 1.0;
        this.tileSize = 16;

        this.filtered = false;

        this.spriteSheet = gl.createTexture();
        this.layers = [];

        var quadVerts = [
            //x  y  u  v
            -1, -1, 0, 1,
             1, -1, 1, 1,
             1,  1, 1, 0,

            -1, -1, 0, 1,
             1,  1, 1, 0,
            -1,  1, 0, 0
        ];

        this.quadVertBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVertBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(quadVerts), gl.STATIC_DRAW);

        this.tilemapShader = GLUtil.createProgram(gl, tilemapVS, tilemapFS);
    };

    TileMap.prototype.resizeViewport = function(width, height) {
        this.viewportSize[0] = width;
        this.viewportSize[1] = height;

        this.scaledViewportSize[0] = width / this.tileScale;
        this.scaledViewportSize[1] = height / this.tileScale;
    };

    TileMap.prototype.setTileScale = function(scale) {
        this.tileScale = scale;

        this.scaledViewportSize[0] = this.viewportSize[0] / scale;
        this.scaledViewportSize[1] = this.viewportSize[1] / scale;
    };

    TileMap.prototype.setFiltered = function(filtered) {
        this.filtered = filtered;

        // TODO: Cache currently bound texture?
        gl.bindTexture(gl.TEXTURE_2D, this.spriteSheet);

        if(filtered) {
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        } else {
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); // Worth it to mipmap here?
        }
    };

    TileMap.prototype.setSpriteSheet = function(src) {
        var self = this;
        var gl = this.gl;
        var image = new Image();
        image.addEventListener("load", function() {
            gl.bindTexture(gl.TEXTURE_2D, self.spriteSheet);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
            if(!self.filtered) {
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            } else {
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); // Worth it to mipmap here?
            }

            self.inverseSpriteTextureSize[0] = 1/image.width;
            self.inverseSpriteTextureSize[1] = 1/image.height;
        });
        image.src = src;
    };

    TileMap.prototype.setTileLayer = function(src, layerId, scrollScaleX, scrollScaleY) {
        var layer = new TileMapLayer(this.gl);
        layer.setTexture(this.gl, src);
        if(scrollScaleX) {
            layer.scrollScaleX = scrollScaleX;
        }
        if(scrollScaleY) {
            layer.scrollScaleY = scrollScaleY;
        }

        this.layers[layerId] = layer;
    };

    TileMap.prototype.draw = function(x, y) {
        var gl = this.gl;

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        var shader = this.tilemapShader;
        gl.useProgram(shader.program);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVertBuffer);

        gl.enableVertexAttribArray(shader.attribute.position);
        gl.enableVertexAttribArray(shader.attribute.texture);
        gl.vertexAttribPointer(shader.attribute.position, 2, gl.FLOAT, false, 16, 0);
        gl.vertexAttribPointer(shader.attribute.texture, 2, gl.FLOAT, false, 16, 8);

        gl.uniform2fv(shader.uniform.viewportSize, this.scaledViewportSize);
        gl.uniform2fv(shader.uniform.inverseSpriteTextureSize, this.inverseSpriteTextureSize);
        gl.uniform1f(shader.uniform.tileSize, this.tileSize);
        gl.uniform1f(shader.uniform.inverseTileSize, 1/this.tileSize);

        gl.activeTexture(gl.TEXTURE0);
        gl.uniform1i(shader.uniform.sprites, 0);
        gl.bindTexture(gl.TEXTURE_2D, this.spriteSheet);

        gl.activeTexture(gl.TEXTURE1);
        gl.uniform1i(shader.uniform.tiles, 1);

        // Draw each layer of the map
        var i, layer;
        for(i = this.layers.length; i >= 0; --i) {
            layer = this.layers[i];
            if(layer) {
                gl.uniform2f(shader.uniform.viewOffset, Math.floor(x * this.tileScale * layer.scrollScaleX), Math.floor(y * this.tileScale * layer.scrollScaleY));
                gl.uniform2fv(shader.uniform.inverseTileTextureSize, layer.inverseTextureSize);

                gl.bindTexture(gl.TEXTURE_2D, layer.tileTexture);

                gl.drawArrays(gl.TRIANGLES, 0, 6);
            }
        }
    };

    return TileMap;
});*/