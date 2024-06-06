import ArcMapCoordSys from './ArcMapCoordSys.js';

import './ArcMapModel.js';
import './ArcMapView.js';

// Action
echarts.registerAction(
  {
    type: 'arcmapRoam',
    event: 'arcmapRoam',
    update: 'updateLayout'
  },
  function (payload, ecModel) {
    ecModel.eachComponent('arcmap', function (arcmapModel) {
      const arcmap = arcmapModel.getArcMap();
      const center = arcmap.center;
      arcmapModel.setCenterAndZoom(
        [center.longitude, center.latitude],
        arcmap.zoom
      );
    });
  }
);

export function registerArcMap(arcmap) {
  ArcMapCoordSys.setArcMap(arcmap);
  echarts.registerCoordinateSystem('arcmap', ArcMapCoordSys);
}

export function initECharts(options) {
  const arcmap = ArcMapCoordSys.getArcMap()
  if (!arcmap) {
    throw new Error('Unregistered arcmap');
  }
  const overlay = arcmap.overlay.surface;
  let echartsContainer =
  overlay.querySelector('.echarts_container');
  if (!echartsContainer) {
    echartsContainer = document.createElement('div');
    echartsContainer.setAttribute('class', 'echarts_container');
    overlay.appendChild(echartsContainer);
  }
  echartsContainer.style.width = '100%';
  echartsContainer.style.height = '100%';
  ArcMapCoordSys.setEchartsContainer(echartsContainer);
  return echarts.init(echartsContainer, options.theme, options);
}

export const version = '1.0.0';
