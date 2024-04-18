import Map from 'https://js.geoscene.cn/4.23/@geoscene/core/Map.js';
import MapView from 'https://js.geoscene.cn/4.23/@geoscene/core/views/MapView.js';
import FeatureLayer from 'https://js.geoscene.cn/4.23/@geoscene/core/layers/FeatureLayer.js';
import HeatmapRenderer from 'https://js.geoscene.cn/4.23/@geoscene/core/renderers/HeatmapRenderer.js';
import Graphic from 'https://js.geoscene.cn/4.23/@geoscene/core/Graphic.js';
import Point from 'https://js.geoscene.cn/4.23/@geoscene/core/geometry/Point.js';
import * as reactiveUtils from 'https://js.geoscene.cn/4.23/@geoscene/core/core/reactiveUtils.js';

const map = new Map({
  basemap: 'tianditu-vector'
});

const view = new MapView({
  container: 'viewDiv',
  map: map,
  center: [10.12, 50.72],
  zoom: 8
});

const colorStops = [
  { ratio: 0 / 12, color: 'rgba(25, 43, 51, 0.6)' },
  { ratio: 2 / 12, color: 'rgba(30, 140, 160, 1)' },
  { ratio: 3 / 12, color: 'rgba(58, 165, 140, 1)' },
  { ratio: 4 / 12, color: 'rgba(64, 184, 156, 1)' },
  { ratio: 5 / 12, color: 'rgba(68, 199, 168, 1)' },
  { ratio: 6 / 12, color: 'rgba(73, 214, 181, 1)' },
  { ratio: 7 / 12, color: 'rgba(78, 230, 194, 1)' },
  { ratio: 8 / 12, color: 'rgba(83, 245, 207, 1)' },
  { ratio: 9 / 12, color: 'rgba(85, 250, 211, 1)' },
  { ratio: 10 / 12, color: 'rgba(102, 255, 219, 1)' },
  { ratio: 11 / 12, color: 'rgba(121, 237, 210, 1)' },
  { ratio: 12 / 12, color: 'rgba(158, 255, 233, 1)' }
];

const heatmapRenderer = new HeatmapRenderer({
  legendOptions: {
    minLabel: 'Few',
    maxLabel: 'Frequent'
  },
  colorStops: colorStops,
  referenceScale: null,
  maxDensity: 0.0035,
  radius: 35,
  minDensity: 0
});

const popupTemplate = {
  // autocasts as new PopupTemplate()
  title: 'Traffic incident #{OBJECTID}',
  content: '<p> {UJAHR} / {UMONAT} </p>' // Show year and month
};

/**
 * Function that upload as many features as possible to a
 * client-side FeatureLayer without blocking the UI thread.
 *
 * @param layer - The layer to upload the features to
 * @param iterator - The iterator to consume features
 * @param batchTime - The amount of time during which the iterator can be consumed. By default 4ms
 */
async function uploadFeatures(layer, iterator, batchTime = 20) {
  let result = iterator.next();
  while (!result.done) {
    const start = performance.now();
    const features = [];
    // consume for batchTime milliseconds.
    while (performance.now() - start < batchTime && !result.done) {
      features.push(result.value);
      result = iterator.next();
    }
    if (features.length) {
      console.log(`uploading ${features.length} features`);
      await layer.applyEdits({
        addFeatures: features
      });
    }
  }
}

function* graphicsIterator(features, spatialReference) {
  for (let i = 0, len = features.length; i < len; i++) {
    const t = features[i].geometry;
    yield new Graphic({
      geometry: new Point({
        ...t,
        spatialReference
      })
    });
  }
}

console.time('getAllProblems');

// create an empty client-side feature layer
const layer = new FeatureLayer({
  // url: 'https://services.arcgis.com/V6ZHFr6zdgNZuVG0/arcgis/rest/services/TrafficAccidentsGermany2019/FeatureServer',
  popupTemplate: popupTemplate,
  objectIdField: 'OBJECTID', //! important
  geometryType: 'point',
  source: [],
  spatialReference: {
    wkid: 3857
  },
  opacity: 0.75,
  renderer: heatmapRenderer
});

// 由于 Server 限制，最大只能返回 2000 条数据
fetch(
  'https://services.arcgis.com/V6ZHFr6zdgNZuVG0/ArcGIS/rest/services/TrafficAccidentsGermany2019/FeatureServer/0/query?where=1%3D1&returnCountOnly=true&f=pjson'
)
  .then((res) => res.json())
  .then(async ({ count }) => {
    const pages = Math.ceil(count / 2000);
    const requests = [];
    for (let i = 0; i < pages; i++) {
      requests.push(
        fetch(
          `https://services.arcgis.com/V6ZHFr6zdgNZuVG0/ArcGIS/rest/services/TrafficAccidentsGermany2019/FeatureServer/0/query?where=1%3D1&resultOffset=${
            i * 2000
          }&f=pjson`
        ).then((res) => res.json())
      );
    }
    Promise.all(requests).then(async (data) => {
      const spatialReference = data[0].spatialReference;
      const features = data.map((d) => d.features).flat();
      // upload all features
      await uploadFeatures(layer, graphicsIterator(features, spatialReference));
      // wait for the view to catch up
      await reactiveUtils.whenOnce(() => !view.updating);
    });
  });

map.add(layer);

layer.on('layerview-create', () => {
  console.timeEnd('getAllProblems');
});
view.when().then(() => {
  // The following simple renderer will render all points as simple
  // markers at certain scales
  const simpleRenderer = {
    type: 'simple',
    symbol: {
      type: 'simple-marker',
      color: '#c80000',
      size: 5
    }
  };

  // When the scale is larger than 1:72,224 (zoomed in passed that scale),
  // then switch from a heatmap renderer to a simple renderer. When zoomed
  // out beyond that scale, switch back to the heatmap renderer
  reactiveUtils.watch(
    () => view.scale,
    (scale) => {
      layer.renderer = scale <= 72224 ? simpleRenderer : heatmapRenderer;
    }
  );
});
