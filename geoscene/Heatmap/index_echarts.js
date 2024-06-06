import Map from 'https://js.geoscene.cn/4.23/@geoscene/core/Map.js';
import MapView from 'https://js.geoscene.cn/4.23/@geoscene/core/views/MapView.js';
import { registerArcMap, initECharts } from './echarts_extend/arcmap.js';

const map = new Map({
  basemap: 'tianditu-vector'
});

const view = new MapView({
  container: 'viewDiv',
  map: map,
  center: [10.12, 50.72],
  zoom: 8
});

function initChartOption(data, wkid) {
  //! 注册 arcgis 地图扩展
  registerArcMap(view);

  //! 初始化 echarts
  const myChart = initECharts({
    renderer: 'canvas',
    useDirtyRect: false
  })

  view.when(() => {
    myChart.setOption({
      animation: false,
      arcmap: { //! 地图参数
        center: view.center,
        zoom: view.zoom,
        roam: true,
        dataWkid: wkid // 设置传入的坐标点的参考系
      },
      visualMap: {
        type: 'continuous',
        show: false,
        top: 'top',
        min: 0,
        max: 8,
        seriesIndex: 0,
        calculable: true,
        inRange: {
          color: ['blue', 'blue', 'green', 'yellow', 'red']
        }
      },
      series: [
        {
          type: 'heatmap',
          coordinateSystem: 'arcmap', //! 地图坐标系
          data: data,
          pointSize: 5,
          blurSize: 10
        }
      ]
    });
  })

  window.addEventListener('resize', myChart.resize);
}

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
      const points = features.map((d) => [d.geometry.x, d.geometry.y, 1]);
      initChartOption(points, spatialReference.wkid)
    });
  });
