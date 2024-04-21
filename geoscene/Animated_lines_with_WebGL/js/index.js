import Map from 'https://js.geoscene.cn/4.23/@geoscene/core/Map.js';
import esriRequest from 'https://js.geoscene.cn/4.23/@geoscene/core/request.js';
import MapView from 'https://js.geoscene.cn/4.23/@geoscene/core/views/MapView.js';
import Point from 'https://js.geoscene.cn/4.23/@geoscene/core/geometry/Point.js';
import WebTileLayer from 'https://js.geoscene.cn/4.23/@geoscene/core/layers/WebTileLayer.js';
import TileInfo from 'https://js.geoscene.cn/4.23/@geoscene/core/layers/support/TileInfo.js';
import FlowlineLayer from './FlowlineLayer.js';

// Now we can create the map, the view, load the data and finally
// create an instance of the custom layer and add it to the map.
var tileInfo = new TileInfo({
  dpi: 96,
  rows: 256,
  cols: 256,
  compressionQuality: 0,
  format: 'PNG8',
  origin: {
    spatialReference: { latestWkid: 3857, wkid: 102100 },
    x: -20037508.342787,
    y: 20037508.342787
  },
  spatialReference: { latestWkid: 3857, wkid: 102100 },
  lods: [
    { level: 0, resolution: 156543.033928, scale: 591657527.591555 },
    { level: 1, resolution: 78271.5169639999, scale: 295828763.795777 },
    { level: 2, resolution: 39135.7584820001, scale: 147914381.897889 },
    { level: 3, resolution: 19567.8792409999, scale: 73957190.948944 },
    { level: 4, resolution: 9783.93962049996, scale: 36978595.474472 },
    { level: 5, resolution: 4891.96981024998, scale: 18489297.737236 },
    { level: 6, resolution: 2445.98490512499, scale: 9244648.868618 },
    { level: 7, resolution: 1222.99245256249, scale: 4622324.434309 },
    { level: 8, resolution: 611.49622628138, scale: 2311162.217155 },
    { level: 9, resolution: 305.748113140558, scale: 1155581.108577 },
    { level: 10, resolution: 152.874056570411, scale: 577790.554289 },
    { level: 11, resolution: 76.4370282850732, scale: 288895.277144 },
    { level: 12, resolution: 38.2185141425366, scale: 144447.638572 },
    { level: 13, resolution: 19.1092570712683, scale: 72223.819286 },
    { level: 14, resolution: 9.55462853563415, scale: 36111.909643 },
    { level: 15, resolution: 4.77731426794937, scale: 18055.954822 },
    { level: 16, resolution: 2.38865713397468, scale: 9027.977411 },
    { level: 17, resolution: 1.19432856685505, scale: 4513.988705 },
    { level: 18, resolution: 0.597164283559817, scale: 2256.994353 },
    { level: 19, resolution: 0.298582141647617, scale: 1128.497176 },
    { level: 20, resolution: 0.14929107082380833, scale: 564.248588 },
    { level: 21, resolution: 0.07464553541190416, scale: 282.124294 }
  ]
});
const tiandituVec = new WebTileLayer({
  urlTemplate:
    'http://{subDomain}.tianditu.gov.cn/vec_w/wmts?service=wmts&request=GetTile&version=1.0.0&layer=vec&tileMatrixSet=w&TileMatrix={level}&TileRow={row}&TileCol={col}&style=default&tk=67d83ca377e94348436f45b3c9a2662a',
  subDomains: ['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7'],
  tileInfo
});
const tiandituCva = new WebTileLayer({
  urlTemplate:
    'http://{subDomain}.tianditu.gov.cn/cva_w/wmts?service=wmts&request=GetTile&version=1.0.0&layer=cva&tileMatrixSet=w&TileMatrix={level}&TileRow={row}&TileCol={col}&style=default&tk=67d83ca377e94348436f45b3c9a2662a',
  subDomains: ['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7'],
  tileInfo
});

const map = new Map({
  basemap: {
    baseLayers: [tiandituVec, tiandituCva]
  },
  spatialReference: {
    wkid: 3857
  }
});

const point = new Point({
  x: -74.006,
  y: 40.7128,
  spatialReference: {
    wkid: 4326
  }
});
const view = new MapView({
  container: 'viewDiv',
  map: map,
  center: point,
  zoom: 15
});

esriRequest(
  'https://arcgis.github.io/arcgis-samples-javascript/sample-data/custom-gl-animated-lines/lines.json',
  {
    responseType: 'json'
  }
).then((response) => {
  const graphics = response.data.map((trip) => {
    return {
      attributes: {
        color: trip.color
      },
      geometry: {
        paths: [trip.path],
        type: 'polyline',
        spatialReference: {
          wkid: 4326
        }
      }
    };
  });

  const layer = new FlowlineLayer({
    graphics: graphics,
    uniforms: {
      u_tail_alpha: 0.4,
      u_speed: 20.0,
      u_length: 15.0,
      u_cycle: 20.0,
      u_width: 4
    }
  });

  map.layers.add(layer);
});
