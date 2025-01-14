import {arrayXPointerFloat, arrayXPointerInt} from './utils/utils.js';
import WbGeometry from './WbGeometry.js';
import WbMatrix4 from './utils/WbMatrix4.js';
import WbTriangleMesh from './utils/WbTriangleMesh.js';
import WbWrenMeshBuffers from './utils/WbWrenMeshBuffers.js';
import WbWrenRenderingContext from '../wren/WbWrenRenderingContext.js';
import WbWrenShaders from '../wren/WbWrenShaders.js';

export default class WbTriangleMeshGeometry extends WbGeometry {
  #normalsMaterial;
  #normalsRenderable;
  createWrenObjects() {
    if (this.wrenObjectsCreatedCalled)
      return;

    super.createWrenObjects();

    this.#buildWrenMesh(false);
  }

  delete() {
    _wr_static_mesh_delete(this._wrenMesh);

    this._deleteWrenRenderable();

    super.delete();
  }

  preFinalize() {
    if (this.isPreFinalizeCalled)
      return;

    super.preFinalize();

    this.#createTriangleMesh();
  }

  // Private functions

  _buildGeomIntoBuffers(buffers, m) {
    if (!this._triangleMesh.isValid)
      return;

    const rm = m.extracted3x3Matrix();
    const n = this._triangleMesh.numberOfTriangles;

    let start = buffers.vertexIndex / 3;
    const vBuf = buffers.vertexBuffer;
    if (typeof vBuf !== 'undefined') {
      let i = buffers.vertexIndex;
      for (let t = 0; t < n; ++t) { // foreach triangle
        for (let v = 0; v < 3; ++v) { // foreach vertex
          WbWrenMeshBuffers.writeCoordinates(this._triangleMesh.vertex(t, v, 0), this._triangleMesh.vertex(t, v, 1),
            this._triangleMesh.vertex(t, v, 2), m, vBuf, i);
          i += 3;
        }
      }
    }

    const nBuf = buffers.normalBuffer;
    if (typeof nBuf !== 'undefined') {
      let i = buffers.vertexIndex;
      for (let t = 0; t < n; ++t) { // foreach triangle
        for (let v = 0; v < 3; ++v) { // foreach vertex
          WbWrenMeshBuffers.writeNormal(this._triangleMesh.normal(t, v, 0), this._triangleMesh.normal(t, v, 1),
            this._triangleMesh.normal(t, v, 2), rm, nBuf, i);
          i += 3;
        }
      }
    }

    const tBuf = buffers.texCoordBuffer;
    const utBuf = buffers.unwrappedTexCoordsBuffer;
    if (typeof tBuf !== 'undefined') {
      let i = start * buffers.texCoordSetsCount * 2;
      for (let t = 0; t < n; ++t) { // foreach triangle
        for (let v = 0; v < 3; ++v) { // foreach vertex
          tBuf[i] = this._triangleMesh.textureCoordinate(t, v, 0);
          tBuf[i + 1] = this._triangleMesh.textureCoordinate(t, v, 1);

          utBuf[i] = this._triangleMesh.textureCoordinate(t, v, 0);
          utBuf[i + 1] = this._triangleMesh.textureCoordinate(t, v, 1);

          i += 2;
        }
      }
    }

    const iBuf = buffers.indexBuffer;
    if (typeof iBuf !== 'undefined') {
      start = buffers.vertexIndex / 3;
      let i = buffers.index;
      for (let t = 0; t < n; ++t) { // foreach triangle
        for (let v = 0; v < 3; ++v) // foreach vertex
          iBuf[i++] = start + this._triangleMesh.index(t, v);
      }
      buffers.index = i;
    }

    buffers.vertexIndex = buffers.vertexIndex + this.#estimateVertexCount() * 3;
  }

  #buildWrenMesh() {
    this._deleteWrenRenderable();

    if (typeof this._wrenMesh !== 'undefined') {
      _wr_static_mesh_delete(this._wrenMesh);
      this._wrenMesh = undefined;
    }

    if (!this._triangleMesh.isValid)
      return;

    const createOutlineMesh = this.isInBoundingObject();

    this._computeWrenRenderable();

    if (!this.ccw)
      _wr_renderable_invert_front_face(this._wrenRenderable, true);

    // normals representation
    this.#normalsMaterial = _wr_phong_material_new();
    _wr_material_set_default_program(this.#normalsMaterial, WbWrenShaders.lineSetShader());
    _wr_phong_material_set_color_per_vertex(this.#normalsMaterial, true);
    _wr_phong_material_set_transparency(this.#normalsMaterial, 0.4);

    this.#normalsRenderable = _wr_renderable_new();
    _wr_renderable_set_cast_shadows(this.#normalsRenderable, false);
    _wr_renderable_set_receive_shadows(this.#normalsRenderable, false);
    _wr_renderable_set_material(this.#normalsRenderable, this.#normalsMaterial, null);
    _wr_renderable_set_visibility_flags(this.#normalsRenderable, WbWrenRenderingContext.VF_NORMALS);
    _wr_renderable_set_drawing_mode(this.#normalsRenderable, Enum.WR_RENDERABLE_DRAWING_MODE_LINES);
    _wr_transform_attach_child(this.wrenNode, this.#normalsRenderable);

    // Restore pickable state
    super.setPickable(this.isPickable);

    const buffers = super._createMeshBuffers(this.#estimateVertexCount(), this._estimateIndexCount());
    this._buildGeomIntoBuffers(buffers, new WbMatrix4());
    const vertexBufferPointer = arrayXPointerFloat(buffers.vertexBuffer);
    const normalBufferPointer = arrayXPointerFloat(buffers.normalBuffer);
    const texCoordBufferPointer = arrayXPointerFloat(buffers.texCoordBuffer);
    const unwrappedTexCoordsBufferPointer = arrayXPointerFloat(buffers.unwrappedTexCoordsBuffer);
    const indexBufferPointer = arrayXPointerInt(buffers.indexBuffer);
    this._wrenMesh = _wr_static_mesh_new(buffers.verticesCount, buffers.indicesCount, vertexBufferPointer, normalBufferPointer,
      texCoordBufferPointer, unwrappedTexCoordsBufferPointer, indexBufferPointer, createOutlineMesh);

    _free(vertexBufferPointer);
    _free(normalBufferPointer);
    _free(texCoordBufferPointer);
    _free(unwrappedTexCoordsBufferPointer);
    _free(indexBufferPointer);

    buffers.clear();

    _wr_renderable_set_mesh(this._wrenRenderable, this._wrenMesh);
  }

  #createTriangleMesh() {
    this._triangleMesh = new WbTriangleMesh();
    this._updateTriangleMesh();
  }

  _deleteWrenRenderable() {
    if (typeof this.#normalsMaterial !== 'undefined') {
      _wr_material_delete(this.#normalsMaterial);
      this.#normalsMaterial = undefined;
    }

    if (typeof this.#normalsRenderable !== 'undefined') {
      _wr_node_delete(this.#normalsRenderable);
      this.#normalsRenderable = undefined;
    }

    super._deleteWrenRenderable();
  }

  _estimateIndexCount() {
    if (!this._triangleMesh.isValid)
      return;

    return 3 * this._triangleMesh.numberOfTriangles;
  }

  #estimateVertexCount() {
    if (!this._triangleMesh.isValid)
      return;

    return 3 * this._triangleMesh.numberOfTriangles;
  }

  _updateTriangleMesh() {}
}
