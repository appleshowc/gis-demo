function ArcMapCoordSys(arcmap, api) {
  this._arcmap = arcmap;
  this.dimensions = ['lng', 'lat'];
  this._mapOffset = [0, 0];
  this.dataWkid = 3857;
  this._api = api;
}

ArcMapCoordSys.prototype.type = 'arcmap';

ArcMapCoordSys.prototype.dimensions = ['lng', 'lat'];

ArcMapCoordSys.prototype.dataWkid = 3857;

ArcMapCoordSys.prototype.setZoom = function (zoom) {
  this._zoom = zoom;
};

ArcMapCoordSys.prototype.setCenter = function (center) {
  this._center = this._arcmap.toScreen({
    x: center[0],
    y: center[1],
    spatialReference: {
      wkid: 4326
    }
  });
};

ArcMapCoordSys.prototype.setMapOffset = function (mapOffset) {
  this._mapOffset = mapOffset;
};

ArcMapCoordSys.prototype.dataToPoint = function (data) {
  const px = this._arcmap.toScreen({
    x: data[0],
    y: data[1],
    spatialReference: {
      wkid: this.dataWkid //! 使用地图默认坐标系能大大提高速率
    }
  });
  const mapOffset = this._mapOffset;
  return [px.x - mapOffset[0], px.y - mapOffset[1]];
};

ArcMapCoordSys.prototype.pointToData = function (pt) {
  const mapOffset = this._mapOffset;
  pt = this._arcmap.toMap({
    x: pt[0] + mapOffset[0],
    y: pt[1] + mapOffset[1]
  });
  return [pt.longitude, pt.latitude];
};

ArcMapCoordSys.prototype.getViewRect = function () {
  const api = this._api;
  return new echarts.graphic.BoundingRect(
    0,
    0,
    api.getWidth(),
    api.getHeight()
  );
};

ArcMapCoordSys.prototype.getRoamTransform = function () {
  return echarts.matrix.create();
};

ArcMapCoordSys.prototype.prepareCustoms = function () {
  const rect = this.getViewRect();
  return {
    coordSys: {
      // The name exposed to user is always 'cartesian2d' but not 'grid'.
      type: 'arcmap',
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    },
    api: {
      coord: echarts.util.bind(this.dataToPoint, this),
      size: echarts.util.bind(dataToCoordSize, this)
    }
  };
};

ArcMapCoordSys.prototype.convertToPixel = function (ecModel, finder, value) {
  // here we ignore finder as only one arcmap component is allowed
  return this.dataToPoint(value);
};

ArcMapCoordSys.prototype.convertFromPixel = function (ecModel, finder, value) {
  return this.pointToData(value);
};

function dataToCoordSize(dataSize, dataItem) {
  dataItem = dataItem || [0, 0];
  return echarts.util.map(
    [0, 1],
    function (dimIdx) {
      const val = dataItem[dimIdx];
      const halfSize = dataSize[dimIdx] / 2;
      const p1 = [];
      const p2 = [];
      p1[dimIdx] = val - halfSize;
      p2[dimIdx] = val + halfSize;
      p1[1 - dimIdx] = p2[1 - dimIdx] = dataItem[1 - dimIdx];
      return Math.abs(
        this.dataToPoint(p1)[dimIdx] - this.dataToPoint(p2)[dimIdx]
      );
    },
    this
  );
}

// For deciding which dimensions to use when creating list data
ArcMapCoordSys.dimensions = ArcMapCoordSys.prototype.dimensions;

ArcMapCoordSys.setArcMap = function (arcmap) {
  this._arcmap = arcmap;
};

ArcMapCoordSys.getArcMap = function () {
  return this._arcmap;
};

ArcMapCoordSys.setEchartsContainer = function (echartsContainer) {
  this._echartsContainer = echartsContainer;
};

ArcMapCoordSys.getEchartsContainer = function () {
  return this._echartsContainer;
};

ArcMapCoordSys.create = function (ecModel, api) {
  let arcmapCoordSys;
  const root = api.getDom();

  ecModel.eachComponent('arcmap', function (arcmapModel) {
    const painter = api.getZr().painter;
    // const viewportRoot = painter.getViewportRoot();
    if (arcmapCoordSys) {
      throw new Error('Only one arcmap component can exist');
    }
    let arcmap = arcmapModel.__arcmap;
    if (!arcmap) {
      arcmap = arcmapModel.__arcmap = ArcMapCoordSys.getArcMap();
      arcmapModel.__echartsContainer = ArcMapCoordSys.getEchartsContainer();

      // Override
      painter.getViewportRootOffset = function () {
        return { offsetLeft: 0, offsetTop: 0 };
      };
    }

    // Set arcmap options
    // centerAndZoom before layout and render
    const center = arcmapModel.get('center');
    const zoom = arcmapModel.get('zoom');
    if (center && zoom) {
      const arcmapCenter = arcmap.center;
      const arcmapZoom = arcmap.zoom;
      const centerOrZoomChanged = arcmapModel.centerOrZoomChanged(
        [arcmapCenter.longitude, arcmapCenter.latitude],
        arcmapZoom
      );
      if (centerOrZoomChanged) {
        arcmap.goTo({
          center,
          zoom
        });
      }
    }
    arcmapCoordSys = arcmapModel.coordinateSystem;
    if (!arcmapCoordSys) {
      arcmapCoordSys = new ArcMapCoordSys(arcmap, api);
      arcmapCoordSys.dataWkid = arcmapModel.get('dataWkid') || arcmap.spatialReference.latestWkid;
      arcmapModel.coordinateSystem = arcmapCoordSys;
    }
    arcmapCoordSys.setMapOffset(arcmapModel.__mapOffset || [0, 0]);
    arcmapCoordSys.setZoom(zoom);
    arcmapCoordSys.setCenter(center);
  });

  ecModel.eachSeries(function (seriesModel) {
    if (seriesModel.get('coordinateSystem') === 'arcmap') {
      seriesModel.coordinateSystem = arcmapCoordSys;
    }
  });

  // return created coordinate systems
  return arcmapCoordSys && [arcmapCoordSys];
};

export default ArcMapCoordSys;
