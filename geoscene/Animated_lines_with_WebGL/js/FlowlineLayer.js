import * as reactiveUtils from 'https://js.geoscene.cn/4.23/@geoscene/core/core/reactiveUtils.js';
import GraphicsLayer from 'https://js.geoscene.cn/4.23/@geoscene/core/layers/GraphicsLayer.js';
import BaseLayerViewGL2D from 'https://js.geoscene.cn/4.23/@geoscene/core/views/2d/layers/BaseLayerViewGL2D.js';
import * as projection from "https://js.geoscene.cn/4.23/@geoscene/core/geometry/projection.js";

// Subclass the custom layer view from BaseLayerViewGL2D.
const FlowlineLayerView2D = BaseLayerViewGL2D.createSubclass({
  // Locations of the two vertex attributes that we use. They
  // will be bound to the shader program before linking.
  aPosition: 0,
  aOffset: 1,
  aDistance: 2,
  aSide: 3,
  aColor: 4,

  constructor: function () {
    // Geometrical transformations that must be recomputed
    // from scratch at every frame.
    this.transform = mat3.create();
    this.extrude = mat3.create();
    this.translationToCenter = vec2.create();
    this.screenTranslation = vec2.create();

    // Geometrical transformations whose only a few elements
    // must be updated per frame. Those elements are marked
    // with NaN.
    this.display = mat3.fromValues(NaN, 0, 0, 0, NaN, 0, -1, 1, 1);
    this.screenScaling = vec3.fromValues(NaN, NaN, 1);

    // Whether the vertex and index buffers need to be updated
    // due to a change in the layer data.
    this.needsUpdate = false;
  },

  // Called once a custom layer is added to the map.layers collection and this layer view is instantiated.
  attach: function () {
    const gl = this.context;

    // We listen for changes to the graphics collection of the layer
    // and trigger the generation of new frames. A frame rendered while
    // `needsUpdate` is true may cause an update of the vertex and
    // index buffers.
    this.updateGeometry();
    const requestUpdate = () => {
      this.needsUpdate = true;
      this.requestRender();
    };
    this.watcher = reactiveUtils.on(
      () => this.layer.graphics,
      'change',
      requestUpdate
    );

    // Updated when first loaded
    this.needsUpdate = true;

    const vertexSource = `
      precision highp float;

      uniform mat3 u_transform;
      uniform mat3 u_extrude;
      uniform mat3 u_display;

      attribute vec2 a_position;
      attribute vec2 a_offset;
      attribute float a_distance;
      attribute float a_side;
      attribute vec4 a_color;

      varying float v_distance;
      varying float v_side;
      varying vec4 v_color;

      void main(void) {
        gl_Position.xy = (u_display * (u_transform * vec3(a_position, 1.0) + u_extrude * vec3(a_offset, 0.0))).xy;
        gl_Position.zw = vec2(0.0, 1.0);
        v_distance = a_distance;
        v_side = a_side;
        v_color = a_color;
      }`;

    const fragmentSource = `
      precision highp float;

      uniform float u_current_time;
      uniform float u_tail_alpha;
      uniform float u_trail_speed;
      uniform float u_trail_length;
      uniform float u_trail_cycle;

      varying float v_distance;
      varying float v_side;
      varying vec4 v_color;

      void main(void) {
        float d = mod(v_distance - u_current_time * u_trail_speed, u_trail_cycle);
        float bg_a = min(u_tail_alpha, 0.5);
        float a = d < u_trail_length ? mix(bg_a, 1.0, d / u_trail_length) : bg_a;
        gl_FragColor = v_color * a;
      }`;

    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, vertexSource);
    gl.compileShader(vertexShader);
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, fragmentSource);
    gl.compileShader(fragmentShader);

    // Create the shader program.
    this.program = gl.createProgram();
    gl.attachShader(this.program, vertexShader);
    gl.attachShader(this.program, fragmentShader);

    // Bind attributes.
    gl.bindAttribLocation(this.program, this.aPosition, 'a_position');
    gl.bindAttribLocation(this.program, this.aOffset, 'a_offset');
    gl.bindAttribLocation(this.program, this.aDistance, 'a_distance');
    gl.bindAttribLocation(this.program, this.aSide, 'a_side');
    gl.bindAttribLocation(this.program, this.aColor, 'a_color');

    // Link.
    gl.linkProgram(this.program);

    // Shader objects are not needed anymore.
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    // Retrieve uniform locations once and for all.
    this.uTransform = gl.getUniformLocation(this.program, 'u_transform');
    this.uExtrude = gl.getUniformLocation(this.program, 'u_extrude');
    this.uDisplay = gl.getUniformLocation(this.program, 'u_display');
    this.uCurrentTime = gl.getUniformLocation(this.program, 'u_current_time');
    this.uTailAlpha = gl.getUniformLocation(this.program, 'u_tail_alpha');
    this.uTrailSpeed = gl.getUniformLocation(this.program, 'u_trail_speed');
    this.uTrailLength = gl.getUniformLocation(this.program, 'u_trail_length');
    this.uTrailCycle = gl.getUniformLocation(this.program, 'u_trail_cycle');

    // Create the vertex and index buffer. They are initially empty. We need to track the
    // size of the index buffer because we use indexed drawing.
    this.vertexBuffer = gl.createBuffer();
    this.indexBuffer = gl.createBuffer();

    // Number of indices in the index buffer.
    this.indexBufferSize = 0;

    // Create a VAO for easier binding. Make sure to handle WebGL 1 and 2!
    if (gl.getParameter(gl.VERSION).startsWith('WebGL 2.0')) {
      this.vao = gl.createVertexArray();
      this.bindVertexArray = (vao) => gl.bindVertexArray(vao);
      this.deleteVertexArray = (vao) => gl.deleteVertexArray(vao);
    } else {
      const vaoExt = gl.getExtension('OES_vertex_array_object');
      this.vao = vaoExt.createVertexArrayOES();
      this.bindVertexArray = (vao) => vaoExt.bindVertexArrayOES(vao);
      this.deleteVertexArray = (vao) => vaoExt.deleteVertexArrayOES(vao);
    }

    // Set up vertex attributes
    // | Position | Offset   | Distance | Side   | Color  |
    // |----------|----------|----------|--------|--------|
    // | x,y      | x,y      | d        | +/-    | rgba   |
    // | 2        | 2        | 1        | 1      | 4      |
    // | 2*4bytes | 2*4bytes | 4bytes   | 4bytes | 4bytes |
    this.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.enableVertexAttribArray(this.aPosition);
    gl.enableVertexAttribArray(this.aOffset);
    gl.enableVertexAttribArray(this.aDistance);
    gl.enableVertexAttribArray(this.aSide);
    gl.enableVertexAttribArray(this.aColor);
    gl.vertexAttribPointer(this.aPosition, 2, gl.FLOAT, false, 28, 0);
    gl.vertexAttribPointer(this.aOffset, 2, gl.FLOAT, false, 28, 8);
    gl.vertexAttribPointer(this.aDistance, 1, gl.FLOAT, false, 28, 16);
    gl.vertexAttribPointer(this.aSide, 1, gl.FLOAT, false, 28, 20);
    gl.vertexAttribPointer(this.aColor, 4, gl.UNSIGNED_BYTE, true, 28, 24);
    this.bindVertexArray(null);

    // When certain conditions occur, we update the buffers and re-compute and re-encode
    // all the attributes. When buffer update occurs, we also take note of the current center
    // of the view state, and we reset a vector called `translationToCenter` to [0, 0], meaning that the
    // current center is the same as it was when the attributes were recomputed.
    this.centerAtLastUpdate = vec2.fromValues(
      this.view.state.center[0],
      this.view.state.center[1]
    );
  },

  // Called once a custom layer is removed from the map.layers collection and this layer view is destroyed.
  detach: function () {
    // Stop watching the `layer.graphics` collection.
    this.watcher.remove();

    const gl = this.context;

    // Delete buffers and programs.
    gl.deleteBuffer(this.vertexBuffer);
    gl.deleteBuffer(this.indexBuffer);
    this.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
  },

  // 投影每个图形到当前视图坐标系
  updateGeometry() {
    this.layer.graphics.forEach(g => {
      g.geometry = projection.project(g.geometry, this.view.spatialReference);
    });
  },

  // Called every time a frame is rendered.
  render: function (renderParameters) {
    const gl = renderParameters.context;
    const state = renderParameters.state;

    // Update vertex positions. This may trigger an update of
    // the vertex coordinates contained in the vertex buffer.
    // There are three kinds of updates:
    //  - Modification of the layer.graphics collection ==> Buffer update
    //  - The view state becomes non-stationary ==> Only view update, no buffer update
    //  - The view state becomes stationary ==> Buffer update
    this.updatePositions(renderParameters);

    // If there is nothing to render we return.
    if (this.indexBufferSize === 0) {
      return;
    }

    // Update view `transform` matrix; it converts from map units to pixels.
    mat3.identity(this.transform);
    this.screenTranslation[0] = (state.pixelRatio * state.size[0]) / 2;
    this.screenTranslation[1] = (state.pixelRatio * state.size[1]) / 2;
    mat3.translate(this.transform, this.transform, this.screenTranslation);
    mat3.rotate(
      this.transform,
      this.transform,
      (Math.PI * state.rotation) / 180
    );
    this.screenScaling[0] = state.pixelRatio / state.resolution;
    this.screenScaling[1] = -state.pixelRatio / state.resolution;
    mat3.scale(this.transform, this.transform, this.screenScaling);
    mat3.translate(this.transform, this.transform, this.translationToCenter);

    // Update view `extrude` matrix; it causes offset vectors to rotate and scale
    // with the view, but caps the maximum width a polyline is allowed to be.
    mat3.identity(this.extrude);
    mat3.rotate(this.extrude, this.extrude, (Math.PI * state.rotation) / 180);
    const HALF_WIDTH = (this.uniforms.u_trail_width ?? 4) / 2;
    mat3.scale(this.extrude, this.extrude, [HALF_WIDTH, -HALF_WIDTH, 1]);

    // Update view `display` matrix; it converts from pixels to normalized device coordinates.
    this.display[0] = 2 / (state.pixelRatio * state.size[0]);
    this.display[4] = -2 / (state.pixelRatio * state.size[1]);

    // Draw.
    gl.useProgram(this.program);
    gl.uniformMatrix3fv(this.uTransform, false, this.transform);
    gl.uniformMatrix3fv(this.uExtrude, false, this.extrude);
    gl.uniformMatrix3fv(this.uDisplay, false, this.display);
    gl.uniform1f(this.uCurrentTime, performance.now() / 1000.0);
    gl.uniform1f(this.uTailAlpha, this.uniforms.u_tail_alpha);
    gl.uniform1f(this.uTrailSpeed, this.uniforms.u_trail_speed);
    gl.uniform1f(this.uTrailLength, this.uniforms.u_trail_length);
    gl.uniform1f(this.uTrailCycle, this.uniforms.u_trail_cycle);
    this.bindVertexArray(this.vao);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawElements(gl.TRIANGLES, this.indexBufferSize, gl.UNSIGNED_SHORT, 0);

    // Request new render because markers are animated.
    this.requestRender();
  },

  hexToRgb: function (hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? [
          parseInt(result[1], 16),
          parseInt(result[2], 16),
          parseInt(result[3], 16)
        ]
      : null;
  },

  // Called internally from render().
  updatePositions: function (renderParameters) {
    const gl = renderParameters.context;
    const stationary = renderParameters.stationary;
    const state = renderParameters.state;

    if (!this.needsUpdate) {
      // If we are not stationary we simply update the `translationToCenter` vector.
      if (!stationary) {
        vec2.sub(this.translationToCenter, this.centerAtLastUpdate, state.center);
        this.requestRender();
        return;
      }

      // If we are stationary, the `layer.graphics` collection has not changed, and
      // we are centered on the `centerAtLastUpdate`, we do nothing.
      if (
        !this.needsUpdate &&
        this.translationToCenter[0] === 0 &&
        this.translationToCenter[1] === 0
      ) {
        return;
      }
    }

    // Otherwise, we record the new encoded center, which imply a reset of the `translationToCenter` vector,
    // we record the update time, and we proceed to update the buffers.
    this.centerAtLastUpdate.set(state.center);
    this.translationToCenter[0] = 0;
    this.translationToCenter[1] = 0;
    this.needsUpdate = false;

    const graphics = this.layer.graphics;

    // Allocate memory.
    let vtxCount = 0;
    let idxCount = 0;

    for (let i = 0; i < graphics.items.length; ++i) {
      const graphic = graphics.items[i];
      const path = graphic.geometry.paths[0];

      vtxCount += path.length * 2;
      idxCount += (path.length - 1) * 6;
    }

    const vertexData = new ArrayBuffer(7 * vtxCount * 4);
    const floatData = new Float32Array(vertexData);
    const colorData = new Uint8Array(vertexData);
    const indexData = new Uint16Array(idxCount);

    // Generate attribute and index data. These cursors count the number
    // of GPU vertices and indices emitted by the triangulator; writes to
    // vertex and index memory occur at the positions pointed by the cursors.
    let vtxCursor = 0;
    let idxCursor = 0;

    for (let i = 0; i < graphics.items.length; ++i) {
      const graphic = graphics.items[i];
      const path = graphic.geometry.paths[0];
      let color = graphic.attributes['color'];
      if (typeof color === 'string') {
        color = this.hexToRgb(color);
      }

      // Initialize new triangulation state.
      let s = {};

      // Process each vertex.
      for (let j = 0; j < path.length; ++j) {
        // Point p is an original vertex of the polyline; we need to produce two extruded
        // GPU vertices, for each original vertex.
        const p = path[j];

        if (s.current) {
          // If this is not the first point, we compute the vector between the previous
          // and the next vertex.
          s.delta = [p[0] - s.current[0], p[1] - s.current[1]];

          // And we normalize it. This is the direction of the current line segment
          // that we are processing.
          const deltaLength = Math.sqrt(
            s.delta[0] * s.delta[0] + s.delta[1] * s.delta[1]
          );
          s.direction = [s.delta[0] / deltaLength, s.delta[1] / deltaLength];

          // We want to compute the normal to that segment. The normal of a
          // vector (x, y) can be computed by rotating it by 90 degrees; this yields (-y, x).
          const normal = [-s.direction[1], s.direction[0]];

          if (s.normal) {
            // If there is already a normal vector in the state, then the offset is the
            // average of that normal and the next normal, i.e. the bisector of the turn.
            s.offset = [s.normal[0] + normal[0], s.normal[1] + normal[1]];

            // We first normalize it.
            const offsetLength = Math.sqrt(
              s.offset[0] * s.offset[0] + s.offset[1] * s.offset[1]
            );
            s.offset[0] /= offsetLength;
            s.offset[1] /= offsetLength;

            // Then we scale it like the cosine of the half turn angle. This can
            // be computed as the dot product between the previous normal and the
            // normalized bisector.
            const d = s.normal[0] * s.offset[0] + s.normal[1] * s.offset[1];
            s.offset[0] /= d;
            s.offset[1] /= d;
          } else {
            // Otherwise, this is the offset of the first vertex; it is equal to the
            // normal we just computed.
            s.offset = [normal[0], normal[1]];
          }

          // All the values that we computed are written to the first GPU vertex.
          floatData[vtxCursor * 7 + 0] =
            s.current[0] - this.centerAtLastUpdate[0];
          floatData[vtxCursor * 7 + 1] =
            s.current[1] - this.centerAtLastUpdate[1];
          floatData[vtxCursor * 7 + 2] = s.offset[0];
          floatData[vtxCursor * 7 + 3] = s.offset[1];
          floatData[vtxCursor * 7 + 4] = s.distance;
          floatData[vtxCursor * 7 + 5] = +1;
          colorData[4 * (vtxCursor * 7 + 6) + 0] = color[0];
          colorData[4 * (vtxCursor * 7 + 6) + 1] = color[1];
          colorData[4 * (vtxCursor * 7 + 6) + 2] = color[2];
          colorData[4 * (vtxCursor * 7 + 6) + 3] = 255;

          // We also write the same values to the second vertex, but we negate the
          // offset and the side (these are the attributes at positions +9, +10 and +12).
          floatData[vtxCursor * 7 + 7] =
            s.current[0] - this.centerAtLastUpdate[0];
          floatData[vtxCursor * 7 + 8] =
            s.current[1] - this.centerAtLastUpdate[1];
          floatData[vtxCursor * 7 + 9] = -s.offset[0];
          floatData[vtxCursor * 7 + 10] = -s.offset[1];
          floatData[vtxCursor * 7 + 11] = s.distance;
          floatData[vtxCursor * 7 + 12] = -1;
          colorData[4 * (vtxCursor * 7 + 13) + 0] = color[0];
          colorData[4 * (vtxCursor * 7 + 13) + 1] = color[1];
          colorData[4 * (vtxCursor * 7 + 13) + 2] = color[2];
          colorData[4 * (vtxCursor * 7 + 13) + 3] = 255;
          vtxCursor += 2;

          if (j >= 2) {
            // If this is the third iteration then it means that we have emitted
            // four GPU vertices already; we can form a triangle with them.
            indexData[idxCursor + 0] = vtxCursor - 4;
            indexData[idxCursor + 1] = vtxCursor - 3;
            indexData[idxCursor + 2] = vtxCursor - 2;
            indexData[idxCursor + 3] = vtxCursor - 3;
            indexData[idxCursor + 4] = vtxCursor - 1;
            indexData[idxCursor + 5] = vtxCursor - 2;
            idxCursor += 6;
          }

          // The next normal becomes the current normal at the next iteration.
          s.normal = normal;

          // We increment the distance along the line by the length of the segment
          // that we just processed.
          s.distance += deltaLength;
        } else {
          s.distance = 0;
        }

        // We move to the next point.
        s.current = p;
      }

      // Finishing up (last 2 extruded vertices and 6 indices).
      s.offset = [s.normal[0], s.normal[1]];
      floatData[vtxCursor * 7 + 0] = s.current[0] - this.centerAtLastUpdate[0];
      floatData[vtxCursor * 7 + 1] = s.current[1] - this.centerAtLastUpdate[1];
      floatData[vtxCursor * 7 + 2] = s.offset[0];
      floatData[vtxCursor * 7 + 3] = s.offset[1];
      floatData[vtxCursor * 7 + 4] = s.distance;
      floatData[vtxCursor * 7 + 5] = +1;
      colorData[4 * (vtxCursor * 7 + 6) + 0] = color[0];
      colorData[4 * (vtxCursor * 7 + 6) + 1] = color[1];
      colorData[4 * (vtxCursor * 7 + 6) + 2] = color[2];
      colorData[4 * (vtxCursor * 7 + 6) + 3] = 255;
      floatData[vtxCursor * 7 + 7] = s.current[0] - this.centerAtLastUpdate[0];
      floatData[vtxCursor * 7 + 8] = s.current[1] - this.centerAtLastUpdate[1];
      floatData[vtxCursor * 7 + 9] = -s.offset[0];
      floatData[vtxCursor * 7 + 10] = -s.offset[1];
      floatData[vtxCursor * 7 + 11] = s.distance;
      floatData[vtxCursor * 7 + 12] = -1;
      colorData[4 * (vtxCursor * 7 + 13) + 0] = color[0];
      colorData[4 * (vtxCursor * 7 + 13) + 1] = color[1];
      colorData[4 * (vtxCursor * 7 + 13) + 2] = color[2];
      colorData[4 * (vtxCursor * 7 + 13) + 3] = 255;
      vtxCursor += 2;

      indexData[idxCursor + 0] = vtxCursor - 4;
      indexData[idxCursor + 1] = vtxCursor - 3;
      indexData[idxCursor + 2] = vtxCursor - 2;
      indexData[idxCursor + 3] = vtxCursor - 3;
      indexData[idxCursor + 4] = vtxCursor - 1;
      indexData[idxCursor + 5] = vtxCursor - 2;
      idxCursor += 6;

      // There is no next vertex.
      s.current = null;
    }

    // Upload data to the GPU.
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexData, gl.STATIC_DRAW);

    // Record number of indices.
    this.indexBufferSize = indexData.length;
  }
});

// Subclass the layer view from GraphicsLayer, to take advantage of its
// watchable graphics property.
const FlowlineLayer = GraphicsLayer.createSubclass({
  createLayerView: function (view) {
    if (view.type === '2d') {
      return new FlowlineLayerView2D({
        view: view,
        layer: this,
        uniforms: {
          u_tail_alpha: this.uniforms?.u_tail_alpha ?? 0.5, //! 尾巴透明度
          u_trail_width: this.uniforms?.u_width ?? 6, //! 流向线缓冲半径
          u_trail_speed: this.uniforms?.u_speed ?? 20.0, //! 流速
          u_trail_length: this.uniforms?.u_length ?? 10.0, //! 流光长度
          u_trail_cycle: this.uniforms?.u_cycle ?? 20.0 //! 循环时间
        }
      });
    }
  }
});

export default FlowlineLayer;
